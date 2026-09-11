// QuoterV2 with sqrtPriceLimitX96=0 stops at TickMath's boundary +/- one.
// An exact-input quote reaching that boundary may not consume the whole input.
// Reject it rather than modeling a full treasury inventory reduction.
export function completePoolQuote(amount: bigint, sqrtPriceAfter: bigint) {
  return (
    amount > 0n &&
    sqrtPriceAfter > 4295128740n &&
    sqrtPriceAfter < 1461446703485210103287273052203988822378723970341n
  );
}
