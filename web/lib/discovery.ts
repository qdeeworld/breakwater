import { createPublicClient, http, zeroAddress, type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import manifest from './maker-deployment.json';
import {
  makerClient,
  makerDeployment,
  positionsAbi,
  readMakerPosition,
  type MakerPosition,
} from './maker';
import { discoveryRanges } from './position-status';

// Publicnode returned an empty history for a verified PositionCreated receipt.
// Do not silently fall back to that log index on errors from the verified provider.
const eventClient = createPublicClient({
  chain: sepolia,
  transport: http(undefined, { timeout: 10000, retryCount: 1 }),
});

export type DiscoveredPosition = {
  hash: Hex;
  position?: MakerPosition;
  error?: string;
};

export async function discoverPositions() {
  const d = makerDeployment;
  if (!d) throw new Error('Position discovery is not configured.');
  const head = await eventClient.getBlockNumber({ cacheTime: 0 });
  const ranges = discoveryRanges(head, BigInt(manifest.deployedAtBlock));
  const hashes: Hex[] = [];
  let scannedFrom = head;
  // Scan only the configured directory; stop after the latest eight registrations.
  for (const range of ranges) {
    const logs = await eventClient.getContractEvents({
      address: d.positions,
      abi: positionsAbi,
      eventName: 'PositionCreated',
      ...range,
      strict: true,
    });
    scannedFrom = range.fromBlock;
    for (const log of [...logs].reverse()) {
      if (!hashes.includes(log.args.orderHash)) hashes.push(log.args.orderHash);
      if (hashes.length === 8) break;
    }
    if (hashes.length === 8) break;
  }
  const entries: DiscoveredPosition[] = [];
  // Sequential reads bound concurrency. Never call arbitrary custom feeds during discovery.
  for (const hash of hashes) {
    try {
      const registered = await makerClient.readContract({
        address: d.positions,
        abi: positionsAbi,
        functionName: 'position',
        args: [hash],
        blockNumber: head,
      });
      if (registered.scenario === zeroAddress) {
        entries.push({
          hash,
          error:
            'Custom-feed position. Not included in this sample market; registration is not feed endorsement.',
        });
        continue;
      }
      entries.push({ hash, position: await readMakerPosition(hash) });
    } catch {
      entries.push({
        hash,
        error:
          'State could not be read. Refresh to retry; no trading availability is assumed.',
      });
    }
  }
  return { entries, head, scannedFrom };
}
