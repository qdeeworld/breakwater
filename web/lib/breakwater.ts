import { HexString, TakerTraits } from '@1inch/swap-vm-sdk';
import { parseAbi, type Address, type Hex } from 'viem';

import deploymentManifest from './breakwater-deployment.json';

export const TARGET_CHAIN_ID = 11_155_111;
export const TARGET_NETWORK = 'Sepolia';

export type BreakwaterDeployment = {
  chainId: number;
  deployedAtBlock: bigint;
  explorerUrl: string;
  aqua: Address;
  router: Address;
  amm: Address;
  guard: Address;
  badToken: Address;
  goodToken: Address;
  badFeed: Address;
  goodFeed: Address;
  orderHash: Hex;
  order: { maker: Address; traits: bigint; data: Hex };
};

type SerializedBreakwaterDeployment = Omit<
  BreakwaterDeployment,
  'deployedAtBlock' | 'order'
> & {
  deployedAtBlock: string;
  order: { maker: Address; traits: string; data: Hex };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAddress(value: unknown): value is Address {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isHex(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x(?:[0-9a-fA-F]{2})*$/.test(value);
}

function parseDeployment(value: unknown): BreakwaterDeployment | null {
  if (value === null) return null;
  if (!isRecord(value) || !isRecord(value.order)) {
    throw new Error('The committed Breakwater deployment manifest is invalid.');
  }

  const addresses = [
    value.aqua,
    value.router,
    value.amm,
    value.guard,
    value.badToken,
    value.goodToken,
    value.badFeed,
    value.goodFeed,
    value.order.maker,
  ];
  if (
    value.chainId !== TARGET_CHAIN_ID ||
    typeof value.deployedAtBlock !== 'string' ||
    typeof value.explorerUrl !== 'string' ||
    addresses.some((address) => !isAddress(address)) ||
    !isHex(value.orderHash) ||
    !isHex(value.order.data) ||
    typeof value.order.traits !== 'string'
  ) {
    throw new Error('The committed Breakwater deployment manifest is invalid.');
  }

  const serialized = value as SerializedBreakwaterDeployment;
  return {
    ...serialized,
    deployedAtBlock: BigInt(serialized.deployedAtBlock),
    order: {
      ...serialized.order,
      traits: BigInt(serialized.order.traits),
    },
  };
}

// An explicit null manifest prevents preview data from being mistaken for a
// live market. The Sepolia deploy task emits this file's exact JSON shape.
export const deployment = parseDeployment(deploymentManifest as unknown);

export const guardAbi = parseAbi([
  'function BAD_TOKEN() view returns (address)',
  'function GOOD_TOKEN() view returns (address)',
  'function BAD_USD_FEED() view returns (address)',
  'function GOOD_USD_FEED() view returns (address)',
  'function MAX_STALENESS() view returns (uint32)',
  'function TRIGGER_RATIO_E18() view returns (uint64)',
  'function UNWIND_DISCOUNT_BPS() view returns (uint16)',
  'function currentOracleCommitment() view returns (bytes32)',
]);

export const feedAbi = parseAbi([
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
  'function latestRoundData() view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)',
]);

export const erc20Abi = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function claim()',
]);

export const routerAbi = parseAbi([
  'event Swapped(bytes32 orderHash,address maker,address taker,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)',
  'function hash((address maker,uint256 traits,bytes data) order) view returns (bytes32)',
  'function quote((address maker,uint256 traits,bytes data) order,address tokenIn,address tokenOut,uint256 amount,bytes takerTraitsAndData) returns (uint256 amountIn,uint256 amountOut,bytes32 orderHash)',
  'function swap((address maker,uint256 traits,bytes data) order,address tokenIn,address tokenOut,uint256 amount,bytes takerTraitsAndData) returns (uint256 amountIn,uint256 amountOut,bytes32 orderHash)',
]);

export const aquaAbi = parseAbi([
  'function rawBalances(address maker,address app,bytes32 strategyHash,address token) view returns (uint248 balance,uint8 tokensCount)',
]);

export function buildTakerTraits(
  commitment: Hex,
  threshold: bigint,
  deadline: bigint,
): Hex {
  if (threshold <= 0n) throw new RangeError('Minimum output must be positive.');
  if (deadline <= 0n || deadline >= 1n << 40n) {
    throw new RangeError('Quote deadline must fit into uint40.');
  }
  return TakerTraits.new({
    exactIn: true,
    strictThreshold: false,
    useTransferFromAndAquaPush: true,
    threshold,
    deadline,
    instructionsArgs: new HexString(commitment, 'instructionsArgs'),
  })
    .encode()
    .toString() as Hex;
}

export function scaleFeedAnswer(answer: bigint, decimals: number): bigint {
  if (answer <= 0n || decimals > 18) return 0n;
  return answer * 10n ** BigInt(18 - decimals);
}

export function shortenHex(value: string, head = 6, tail = 4): string {
  return `${value.slice(0, head + 2)}…${value.slice(-tail)}`;
}

export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'The request could not be completed.';
  const message = error.message;
  if (/user rejected|rejected the request|denied transaction/i.test(message)) {
    return 'The wallet request was rejected. Nothing was submitted.';
  }
  if (/insufficient funds/i.test(message)) {
    return 'This wallet needs Sepolia ETH to pay network gas.';
  }
  if (/OracleCommitmentMismatch/i.test(message)) {
    return 'The oracle changed after quoting. Get a fresh quote before signing.';
  }
  if (/ToxicDirectionBlocked/i.test(message)) {
    return 'That direction adds depegged exposure, so Breakwater blocked it.';
  }
  if (/deadline|expired/i.test(message)) {
    return 'The quote expired. Get a fresh quote before signing.';
  }
  const firstLine = message
    .split('\n')[0]
    ?.replace(/^Error:\s*/, '')
    .trim();
  return firstLine && firstLine.length <= 180
    ? firstLine
    : 'The request could not be completed.';
}
