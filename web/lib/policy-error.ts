import { decodeErrorResult, parseAbi, type Hex } from 'viem';

export const policyErrorAbi = parseAbi([
  'error UnsafeReserve(uint256 price)',
  'error UnsupportedAssetPremium(uint256 price)',
  'error StaleFeed(address feed,uint256 updatedAt,uint256 currentTime,uint256 maxStaleness)',
  'error ToxicDirectionBlocked(address badToken)',
  'error OracleCommitmentMismatch(bytes32 supplied,bytes32 current)',
  'error InsufficientBadTokenLiquidity(uint256 requested,uint256 available)',
]);

const messages: Record<string, string> = {
  UnsafeReserve:
    'Reserve outside $0.98–$1.02. Both trade directions are halted.',
  UnsupportedAssetPremium:
    'Asset above $1.02. Both trade directions are halted.',
  StaleFeed:
    'An observation exceeded its age limit. Trading is halted until fresh data arrives.',
  ToxicDirectionBlocked:
    'This trade would add impaired inventory. The policy refuses it.',
  OracleCommitmentMismatch:
    'Price observations changed. Refresh the quote before trading.',
  InsufficientBadTokenLiquidity:
    'Not enough impaired inventory remains for this exit. Reduce the amount.',
};

/** Read viem/RPC causes, including cross-realm errors and raw revert data.
 * This is presentation only: unknown errors still halt, never infer permission.
 */
export function policyError(error: unknown): string {
  const seen = new Set<object>();
  const known = (name: string) =>
    Object.hasOwn(messages, name) ? messages[name] : undefined;
  function read(value: unknown, depth = 0): string | undefined {
    if (depth > 8) return;
    if (typeof value === 'string') {
      if (/^0x[0-9a-fA-F]+$/.test(value)) {
        try {
          return known(
            decodeErrorResult({ abi: policyErrorAbi, data: value as Hex })
              .errorName,
          );
        } catch {
          return;
        }
      }
      const name = Object.keys(messages).find((name) =>
        new RegExp(`\\b${name}\\b`).test(value),
      );
      return name ? messages[name] : undefined;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const e = value as Record<string, unknown>;
    // Structured contract data takes precedence over transport wrapper text.
    if (typeof e.errorName === 'string' && known(e.errorName))
      return known(e.errorName);
    for (const field of [
      'data',
      'cause',
      'originalError',
      'error',
      'message',
      'shortMessage',
      'details',
    ]) {
      const result = read(e[field], depth + 1);
      if (result) return result;
    }
  }
  return (
    read(error) ??
    'Policy data is unavailable or invalid. Trading is halted; retry the onchain read.'
  );
}
