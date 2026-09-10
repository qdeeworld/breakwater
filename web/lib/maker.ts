import {
  createPublicClient,
  fallback,
  http,
  isAddress,
  parseAbi,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';
import manifest from './maker-deployment.json';
import {
  deployment,
  erc20Abi,
  aquaAbi,
  guardAbi,
  feedAbi,
  scaleFeedAnswer,
} from './breakwater';

export const makerDeployment =
  manifest.chainId === sepolia.id &&
  isAddress(manifest.positions) &&
  manifest.positions !== zeroAddress &&
  isAddress(manifest.builder) &&
  deployment
    ? {
        ...deployment,
        positions: manifest.positions as Address,
        builder: manifest.builder as Address,
      }
    : undefined;
export const makerClient = createPublicClient({
  chain: sepolia,
  batch: { multicall: true },
  transport: fallback([
    http('https://ethereum-sepolia-rpc.publicnode.com'),
    http(),
  ]),
});
export const positionsAbi = parseAbi([
  'function createDemo((uint256 assetAllocation,uint256 reserveAllocation,uint16 feeBps,uint64 trigger,uint16 discountBps,uint32 assetMaxAge,uint32 reserveMaxAge) s) returns (bytes32)',
  'function ownerPositionCount(address owner) view returns (uint256)',
  'function ownerPositionAt(address owner,uint256 index) view returns (bytes32)',
  'function position(bytes32 hash) view returns ((address owner,address policy,address scenario,uint256 assetAllocation,uint256 reserveAllocation,uint16 feeBps,bytes orderData,uint256 orderTraits))',
  'function accounting(bytes32 hash) view returns (uint256 assetFees,uint256 reserveFees,uint256 healthyTrades,uint256 exitTrades,uint256 assetExited,uint256 reserveProceeds)',
  'event PositionCreated(bytes32 indexed orderHash,address indexed owner,address policy,address scenario)',
  'event HealthyFeeEarned(bytes32 indexed orderHash,address indexed token,uint256 amount,uint256 grossInput)',
  'event ExitSettled(bytes32 indexed orderHash,uint256 assetSold,uint256 reserveReceived)',
]);
export const policyAbi = [
  ...guardAbi,
  ...parseAbi([
    'function RESERVE_MAX_AGE() view returns (uint32)',
    'function snapshot() view returns (bool healthy,uint256 assetUsd,uint256 reserveUsd,bytes32 commitment)',
    'error UnsafeReserve(uint256 price)',
    'error UnsupportedAssetPremium(uint256 price)',
    'error StaleFeed(address feed,uint256 updatedAt,uint256 currentTime,uint256 maxStaleness)',
    'error ToxicDirectionBlocked(address badToken)',
    'error OracleCommitmentMismatch(bytes32 supplied,bytes32 current)',
    'error InsufficientBadTokenLiquidity(uint256 requested,uint256 available)',
  ]),
] as const;
export const shipAbi = [
  ...aquaAbi,
  ...parseAbi([
    'function ship(address app,bytes strategy,address[] tokens,uint256[] amounts) returns (bytes32)',
    'function dock(address app,bytes32 strategyHash,address[] tokens)',
  ]),
] as const;
export const scenarioAbi = parseAbi([
  'function setScenario(uint8 state)',
  'function scenario() view returns (uint8)',
]);

export function policyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/UnsafeReserve/.test(message))
    return 'Reserve outside $0.98–$1.02. Both trade directions are halted.';
  if (/UnsupportedAssetPremium/.test(message))
    return 'Asset above $1.02. Both trade directions are halted.';
  if (/StaleFeed/.test(message))
    return 'An observation exceeded its age limit. Trading is halted until fresh data arrives.';
  if (/ToxicDirectionBlocked/.test(message))
    return 'This trade would add impaired inventory. The policy refuses it.';
  if (/InsufficientBadTokenLiquidity/.test(message))
    return 'Not enough impaired inventory remains for this exit. Reduce the amount.';
  return 'Policy data is unavailable or invalid. Trading is halted; retry the onchain read.';
}

export async function readOwnedPositions(owner: Address) {
  if (!makerDeployment) return [];
  const count = await makerClient.readContract({
    address: makerDeployment.positions,
    abi: positionsAbi,
    functionName: 'ownerPositionCount',
    args: [owner],
  });
  // Bounded RPC work; current product shows the 20 most recent positions.
  return Promise.all(
    Array.from({ length: Number(count > 20n ? 20n : count) }, (_, i) =>
      makerClient.readContract({
        address: makerDeployment.positions,
        abi: positionsAbi,
        functionName: 'ownerPositionAt',
        args: [owner, count - 1n - BigInt(i)],
      }),
    ),
  );
}

export async function readMakerPosition(hash: Hex) {
  const d = makerDeployment;
  if (!d) throw new Error('Owner contracts have not been configured.');
  const blockNumber = await makerClient.getBlockNumber({ cacheTime: 0 });
  const p = await makerClient.readContract({
    address: d.positions,
    abi: positionsAbi,
    functionName: 'position',
    args: [hash],
    blockNumber,
  });
  if (p.owner === zeroAddress)
    throw new Error(
      'This position is not registered in the current deployment.',
    );
  const [
    accounting,
    assetBalance,
    reserveBalance,
    assetWallet,
    reserveWallet,
    assetAllowance,
    reserveAllowance,
    assetFeed,
    reserveFeed,
    assetMaxAge,
    reserveMaxAge,
    trigger,
    discount,
  ] = await Promise.all([
    makerClient.readContract({
      address: d.positions,
      abi: positionsAbi,
      functionName: 'accounting',
      args: [hash],
      blockNumber,
    }),
    makerClient.readContract({
      address: d.aqua,
      abi: aquaAbi,
      functionName: 'rawBalances',
      args: [p.owner, d.router, hash, d.badToken],
      blockNumber,
    }),
    makerClient.readContract({
      address: d.aqua,
      abi: aquaAbi,
      functionName: 'rawBalances',
      args: [p.owner, d.router, hash, d.goodToken],
      blockNumber,
    }),
    makerClient.readContract({
      address: d.badToken,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [p.owner],
      blockNumber,
    }),
    makerClient.readContract({
      address: d.goodToken,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [p.owner],
      blockNumber,
    }),
    makerClient.readContract({
      address: d.badToken,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [p.owner, d.aqua],
      blockNumber,
    }),
    makerClient.readContract({
      address: d.goodToken,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [p.owner, d.aqua],
      blockNumber,
    }),
    makerClient.readContract({
      address: p.policy,
      abi: policyAbi,
      functionName: 'BAD_USD_FEED',
      blockNumber,
    }),
    makerClient.readContract({
      address: p.policy,
      abi: policyAbi,
      functionName: 'GOOD_USD_FEED',
      blockNumber,
    }),
    makerClient.readContract({
      address: p.policy,
      abi: policyAbi,
      functionName: 'MAX_STALENESS',
      blockNumber,
    }),
    makerClient.readContract({
      address: p.policy,
      abi: policyAbi,
      functionName: 'RESERVE_MAX_AGE',
      blockNumber,
    }),
    makerClient.readContract({
      address: p.policy,
      abi: policyAbi,
      functionName: 'TRIGGER_RATIO_E18',
      blockNumber,
    }),
    makerClient.readContract({
      address: p.policy,
      abi: policyAbi,
      functionName: 'UNWIND_DISCOUNT_BPS',
      blockNumber,
    }),
  ]);
  const observation = await makerClient
    .readContract({
      address: p.policy,
      abi: policyAbi,
      functionName: 'snapshot',
      blockNumber,
    })
    .then((value) => ({ value, error: '' }))
    .catch((e: unknown) => ({ value: undefined, error: policyError(e) }));
  const [assetRound, reserveRound, assetDecimals, reserveDecimals] =
    await Promise.all([
      makerClient
        .readContract({
          address: assetFeed,
          abi: feedAbi,
          functionName: 'latestRoundData',
          blockNumber,
        })
        .catch(() => undefined),
      makerClient
        .readContract({
          address: reserveFeed,
          abi: feedAbi,
          functionName: 'latestRoundData',
          blockNumber,
        })
        .catch(() => undefined),
      makerClient
        .readContract({
          address: assetFeed,
          abi: feedAbi,
          functionName: 'decimals',
          blockNumber,
        })
        .catch(() => undefined),
      makerClient
        .readContract({
          address: reserveFeed,
          abi: feedAbi,
          functionName: 'decimals',
          blockNumber,
        })
        .catch(() => undefined),
    ]);
  const min = (...n: bigint[]) => n.reduce((a, b) => (a < b ? a : b));
  return {
    ...p,
    hash,
    blockNumber,
    accounting,
    assetBalance: assetBalance[0],
    reserveBalance: reserveBalance[0],
    shipped: assetBalance[1] === 2,
    cancelled: assetBalance[1] === 255,
    assetWallet,
    reserveWallet,
    assetAllowance,
    reserveAllowance,
    assetAvailable: min(assetBalance[0], assetWallet, assetAllowance),
    reserveAvailable: min(reserveBalance[0], reserveWallet, reserveAllowance),
    assetFeed,
    reserveFeed,
    assetMaxAge,
    reserveMaxAge,
    trigger,
    discount,
    observation,
    assetRound,
    reserveRound,
    assetObservedUsd:
      assetRound && assetDecimals !== undefined
        ? scaleFeedAnswer(assetRound[1], assetDecimals) || undefined
        : undefined,
    reserveObservedUsd:
      reserveRound && reserveDecimals !== undefined
        ? scaleFeedAnswer(reserveRound[1], reserveDecimals) || undefined
        : undefined,
    order: { maker: p.owner, traits: p.orderTraits, data: p.orderData },
  };
}
export type MakerPosition = Awaited<ReturnType<typeof readMakerPosition>>;
