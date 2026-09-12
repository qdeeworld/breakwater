import type { Hex } from 'viem';

/** Parse shared links once, before server rendering; repeated values use the first. */
export function positionRoute(params: { position?: string | string[] }) {
  const first = Array.isArray(params.position)
    ? params.position[0]
    : params.position;
  const hasPosition = params.position !== undefined;
  const initialPosition =
    first && /^0x[0-9a-fA-F]{64}$/.test(first) ? (first as Hex) : undefined;
  return {
    hasPosition,
    key: hasPosition ? `position:${first ?? ''}` : 'create',
    initialPosition,
    initialPositionError:
      hasPosition && !initialPosition
        ? 'This position link is invalid. Ask the owner for the complete link, find another position, or create your own.'
        : '',
  };
}
