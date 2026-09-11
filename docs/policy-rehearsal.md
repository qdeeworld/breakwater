# Rehearse a treasury policy before creating it

Position creation includes a wallet-free, read-only historical rehearsal.
Allocation, fee, trigger, exit discount and observation-age settings share one
parser with the `createDemo` transaction. Changing settings hides an old
result. Rehearsal is optional and does not grant permission, move tokens,
refresh a feed or create an order.

## What it tests

Four predeclared March 2023 USDC/USDT checkpoints from the
[matched guard study](guard-benefit.md) each start independently with the
chosen allocation, fully backed and approved. One chosen asset amount is
tested, not a stream of future trades. Activation still creates no-value
bUSD/rUSD on Sepolia with owner-controlled sample observations; it does not
create a real USDC/USDT strategy or connect live USD feeds.

The three arms show the chosen policy, the same fee-bearing curve without its
acquisition guard, and a halt/direct-exit alternative. The unguarded arm still
checks observation validity and reserve safety. Asset inflow counts only when
the historical acquisition quote plus assumed taker gas is covered by the
curve's offered reserve output. This screen is a conditional trade comparison,
not a claim that profitable arbitrage always arrives or that no other buyer
would trade.

The direct alternative is already authorized, immediate and owner-funded. At a
stressed checkpoint it cancels and sells if the historical gross sale quote
meets the same floor; otherwise it cancels. The sale may lose value after gas.
Cancellation alone is explicitly shown as a cheaper available alternative that
retains impaired exposure. The selected sale is **not** claimed to be optimal
or representative of every competent treasury operator. No keeper compensation
or prediction of subsequent market direction is assumed.

## Three different kinds of numbers

- **Contract arithmetic:** BigInt translation of pinned SwapVM pegged-curve and
  fee rounding, plus the maker's policy checks and exact-output stressed floor.
  The supported subset is a new fully backed six-decimal position; existing
  positions with prior fills must use real onchain quotes instead.
- **Historical quotes:** size-specific QuoterV2 calls to the mainnet USDC/USDT
  Uniswap V3 fee-500 route, at a verified archived block hash. Quotes include
  pool fees and price impact. A failed acquisition or sale quote leaves that
  affected outcome unknown; no zero-cost or spot-price substitution is made.
  Quotes that reach the pool's terminal price limit are rejected because an
  exact-input call may consume less than the proposed sale amount. This follows
  the [official QuoterV2 boundary behavior](https://github.com/Uniswap/v3-periphery/blob/main/contracts/lens/QuoterV2.sol)
  and [TickMath limits](https://github.com/Uniswap/v3-core/blob/main/contracts/libraries/TickMath.sol).
- **Estimated costs:** 600,000 gas for taker acquisition plus fill, 450,000 for
  cancel/direct exit, and 100,000 for cancellation alone, each with 20% headroom.
  Historical base fee plus 2 gwei and historical ETH/USD and USDT/USD value gas
  in reserve units. These are explicit assumptions, not measured gas for each
  user-selected allocation. Shared setup costs are excluded.

Fees are already in token inventory, not an additional balance. Changes are
valued at the same checkpoint market mark against holding the starting tokens.
The hypothetical 1:1 recovery column holds post-action balances and the valued
gas cost constant; no later trade is assumed. Neither column is realized P&L,
APY or a forecast. Original depeg exposure remains visible: refusing another
purchase does not undo the treasury's existing impairment.

## Reproduction and bounds

```sh
cd web
npm test
cd ..
npx hardhat test test/RehearsalParity.test.ts
```

The differential test covers 60 actual-order comparisons across equal/unequal
allocations, one-base-unit and larger inputs, three fees, tiny allocations and
the supported one-trillion-token limit. Exact stressed repayment is checked at
the 0.98 trigger and 0.50% discount. Additional pure tests vary triggers,
discounts, USD safety, age boundaries, unavailable quotes and accounting.

Archived inputs live in `web/lib/rehearsal-history.json`, with original source
data in `evidence/guard-benefit-2026-09-10.json`. The four 10,000-USDC acquisition
quotes reproduced the earlier fork study exactly during the feasibility spike:
10,004.468176; 9,416.660903; 8,723.204920; and 9,873.257501 USDT, respectively.
Those verification values are not substituted for new user-sized quotes.

The archive can be unavailable, rate limited or slow. Rehearsal then reports
unknown outcomes; wallet-free configuration and position creation remain
available. This feature makes a policy's assumptions easier to inspect. It
does not establish superior returns, dependable exit availability or willingness
to pay for Breakwater.
