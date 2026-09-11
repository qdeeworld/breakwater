import { createPublicClient, fallback, http, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import history from './rehearsal-history.json';
import { completePoolQuote } from './rehearsal-quote';
import {
  calculateRehearsal,
  type Routes,
  type Settings,
} from './rehearsal-math';

// Fixed public archive, chain, contracts and predeclared blocks. No user RPC/URL.
const archive = createPublicClient({
  chain: mainnet,
  transport: fallback([
    http('https://eth-mainnet.public.blastapi.io', {
      timeout: 12000,
      retryCount: 1,
    }),
    http('https://eth.drpc.org', { timeout: 12000, retryCount: 1 }),
  ]),
});
const quoter = '0x61ffe014ba17989e743c5f6cb21bf9697530b21e';
const asset = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const reserve = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const abi = parseAbi([
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
  'function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96) params) returns(uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
]);
export const checkpoints = history;
export type RehearsalResult = Awaited<ReturnType<typeof rehearse>>;
export async function rehearse(s: Settings, size: bigint, index: number) {
  const h = history[index];
  if (!h || !Number.isInteger(index))
    throw new Error('Choose a recorded checkpoint.');
  if (size <= 0n || size > s.assetAllocation)
    throw new Error('Test a trade no larger than the asset allocation.');
  const routes: Routes = {};
  try {
    const header = await archive.getBlock({ blockNumber: BigInt(h.block) });
    if (header.hash.toLowerCase() !== h.blockHash.toLowerCase())
      throw new Error('Historical block mismatch');
    const [buy, sell] = await Promise.allSettled([
      archive.simulateContract({
        address: quoter,
        abi,
        functionName: 'quoteExactOutputSingle',
        args: [
          {
            tokenIn: reserve,
            tokenOut: asset,
            amount: size,
            fee: 500,
            sqrtPriceLimitX96: 0n,
          },
        ],
        blockNumber: BigInt(h.block),
      }),
      archive.simulateContract({
        address: quoter,
        abi,
        functionName: 'quoteExactInputSingle',
        args: [
          {
            tokenIn: asset,
            tokenOut: reserve,
            amountIn: size,
            fee: 500,
            sqrtPriceLimitX96: 0n,
          },
        ],
        blockNumber: BigInt(h.block),
      }),
    ]);
    if (
      buy.status === 'fulfilled' &&
      completePoolQuote(buy.value.result[0], buy.value.result[1])
    )
      routes.acquisitionCost = buy.value.result[0];
    if (
      sell.status === 'fulfilled' &&
      completePoolQuote(sell.value.result[0], sell.value.result[1])
    )
      routes.externalSale = sell.value.result[0];
  } catch {
    /* Unknown stays unknown; no zero-cost or spot-price fallback. */
  }
  const routeError =
    routes.acquisitionCost === undefined || routes.externalSale === undefined
      ? 'One or more archived pool quotes could not be verified. Affected outcomes remain unknown. Retry the rehearsal.'
      : undefined;
  return { index, ...calculateRehearsal(s, size, h, routes), routeError };
}
