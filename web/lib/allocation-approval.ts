/** Aqua allowances are token-wide, not position-specific. Never lower one here. */
export async function ensureAllocationAllowance(
  required: bigint,
  readAllowance: () => Promise<bigint>,
  approve: (value: bigint) => Promise<unknown>,
): Promise<boolean> {
  if (required <= 0n) throw new Error('Allocation must be positive.');
  // Read at action time, not from the periodically refreshed position view.
  const current = await readAllowance();
  if (current >= required) return false;
  await approve(required);
  return true;
}
