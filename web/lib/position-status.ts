/** Permission is distinct from backing and from a fresh, executable quote. */
export function positionStatus(p: {
  cancelled: boolean;
  shipped: boolean;
  healthy?: boolean;
  policyError: string;
  assetAvailable: bigint;
  reserveAvailable: bigint;
}) {
  if (p.cancelled)
    return {
      label: 'Cancelled',
      tradable: false,
      reason: 'This order can no longer trade.',
    };
  if (!p.shipped)
    return {
      label: 'Not shipped',
      tradable: false,
      reason: 'The owner has not opened this allocation for trading.',
    };
  if (p.healthy === undefined)
    return {
      label: 'Halted',
      tradable: false,
      reason: p.policyError || 'Policy observations are unavailable.',
    };
  const hasBacking =
    p.assetAvailable > 0n || (p.healthy && p.reserveAvailable > 0n);
  if (!hasBacking)
    return {
      label: 'No backed output',
      tradable: false,
      reason:
        'No output inventory is currently backed for a permitted direction.',
    };
  return p.healthy
    ? {
        label: 'Healthy',
        tradable: true,
        reason:
          'Fee-bearing trades permitted, subject to output backing and a fresh quote.',
      }
    : {
        label: 'Exit only',
        tradable: true,
        reason:
          'Pay rUSD to buy impaired bUSD. Adding impaired inventory to the treasury is refused.',
      };
}

/** Inclusive non-overlapping ranges, newest first; bounded even for long-lived deployments. */
export function discoveryRanges(head: bigint, deployment: bigint) {
  const floor = head - 19999n > deployment ? head - 19999n : deployment;
  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  for (let to = head; to >= floor;) {
    const from = to - 999n > floor ? to - 999n : floor;
    ranges.push({ fromBlock: from, toBlock: to });
    to = from - 1n;
  }
  return ranges;
}
