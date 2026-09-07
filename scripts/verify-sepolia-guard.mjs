// Read-only deployed-contract check. No signer, private key, or transaction send.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JsonRpcProvider, Interface, toQuantity, keccak256 } from 'ethers';
import { createRequire } from 'node:module';
const { HexString, TakerTraits } = createRequire(import.meta.url)('@1inch/swap-vm-sdk');

const manifest = JSON.parse(await readFile(new URL('../web/lib/breakwater-deployment.json', import.meta.url), 'utf8'));
const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com');
assert.equal(Number((await provider.getNetwork()).chainId), manifest.chainId);
const block = await provider.getBlock(process.argv[2] ? Number(process.argv[2]) : 'latest');
assert(block);
const blockTag = toQuantity(block.number);
const router = new Interface([
  'function hash((address maker,uint256 traits,bytes data) order) view returns (bytes32)',
  'function quote((address maker,uint256 traits,bytes data) order,address tokenIn,address tokenOut,uint256 amount,bytes takerTraitsAndData) returns (uint256 amountIn,uint256 amountOut,bytes32 orderHash)',
  'function swap((address maker,uint256 traits,bytes data) order,address tokenIn,address tokenOut,uint256 amount,bytes takerTraitsAndData) returns (uint256 amountIn,uint256 amountOut,bytes32 orderHash)',
]);
const guard = new Interface([
  'function currentOracleCommitment() view returns (bytes32)',
  'function TRIGGER_RATIO_E18() view returns (uint256)',
  'error ToxicDirectionBlocked(address token)',
]);
const feed = new Interface([
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
]);
const call = (address, abi, name, args = []) => provider.send('eth_call', [
  { to: address, data: abi.encodeFunctionData(name, args) }, blockTag,
]).then(data => abi.decodeFunctionResult(name, data));
const [commitment] = await call(manifest.guard, guard, 'currentOracleCommitment');
const [orderHash] = await call(manifest.router, router, 'hash', [manifest.order]);
assert.equal(orderHash.toLowerCase(), manifest.orderHash.toLowerCase());
const [trigger] = await call(manifest.guard, guard, 'TRIGGER_RATIO_E18');
const prices = await Promise.all([manifest.badFeed, manifest.goodFeed].map(async address => {
  const [decimals] = await call(address, feed, 'decimals');
  const round = await call(address, feed, 'latestRoundData');
  assert(round[1] > 0n && decimals <= 18n);
  return round[1] * 10n ** (18n - decimals);
}));
const ratio = prices[0] * 10n ** 18n / prices[1];
assert(ratio < trigger, 'The pinned block must be stressed to test toxic-direction refusal.');
const traits = TakerTraits.new({ exactIn: true, strictThreshold: false,
  useTransferFromAndAquaPush: true, threshold: 1n,
  deadline: BigInt(block.timestamp + 600),
  instructionsArgs: new HexString(commitment, 'instructionsArgs'),
}).encode().toString();
// Public taker from the already-verified UI swaps; impersonation is eth_call only.
const taker = '0xbad35FA6e368e90fC4faf63507F2D0A2Fdf94BAF';
const amount = 10_000_000n;
const results = [];
for (const method of ['quote', 'swap']) {
  const data = router.encodeFunctionData(method, [manifest.order, manifest.badToken,
    manifest.goodToken, amount, traits]);
  let revertData;
  try {
    await provider.send('eth_call', [{ from: taker, to: manifest.router, data }, blockTag]);
  } catch (error) {
    revertData = error.data;
  }
  assert(revertData, `${method}: expected a contract revert, not success or a transport failure`);
  const decoded = guard.parseError(revertData);
  assert.equal(decoded?.name, 'ToxicDirectionBlocked');
  assert.equal(decoded.args[0].toLowerCase(), manifest.badToken.toLowerCase());
  results.push({ method, tokenIn: manifest.badToken, tokenOut: manifest.goodToken,
    amountIn: amount.toString(), error: decoded.name, errorToken: decoded.args[0], revertData });
}
const permittedData = await provider.send('eth_call', [{ from: taker, to: manifest.router,
  data: router.encodeFunctionData('quote', [manifest.order, manifest.goodToken,
    manifest.badToken, amount, traits]),
}, blockTag]);
const permitted = router.decodeFunctionResult('quote', permittedData);
assert.equal(permitted[0], amount);
assert(permitted[1] > 0n);
assert.equal(permitted[2].toLowerCase(), manifest.orderHash.toLowerCase());
const codeHashes = {};
for (const name of ['aqua', 'router', 'guard']) {
  const code = await provider.send('eth_getCode', [manifest[name], blockTag]);
  assert.notEqual(code, '0x');
  codeHashes[name] = keccak256(code);
}
console.log(JSON.stringify({ chainId: manifest.chainId, blockNumber: block.number,
  blockHash: block.hash, blockTimestamp: block.timestamp,
  checkedAt: new Date().toISOString(), router: manifest.router, guard: manifest.guard,
  orderHash, taker, oracleCommitment: commitment, ratioE18: ratio.toString(),
  triggerE18: trigger.toString(), codeHashes, blocked: results,
  permittedQuote: { amountIn: permitted[0].toString(), amountOut: permitted[1].toString(),
    tokenIn: manifest.goodToken, tokenOut: manifest.badToken },
  scope: 'Read-only eth_call on deployed Sepolia contracts at one pinned block. Fixed demo feeds and no-value test tokens. No transaction broadcast; no mined negative-path receipt.',
}, null, 2));
provider.destroy();
