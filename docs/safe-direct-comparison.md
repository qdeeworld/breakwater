# Safe direct stop-loss comparator

Experimental AI-assisted implementation and tests by Codex under Qdee's brief.
Not deployed, audited, a general-purpose wallet, or an observed keeper market.

`BenchmarkTreasury` is a minimal owner-controlled account that holds the position
assets. Its owner authorizes one Aqua order, a maximum keeper payment, and optionally
one replacement order hash. A keeper receives no arbitrary-call, venue, recipient,
withdrawal or order-selection authority. Owner withdrawal requires cancellation.

One `directExit` transaction:

1. Checks the authorized order and allocation, deadline and reward cap.
2. Quotes the same SwapVM program/guard as the atomic executor, enforcing the same
   oracle observation, permitted direction and minimum treasury repayment.
3. Docks both tokens of the old Aqua strategy.
4. Sells the bounded quantity at the same immutable V3 route.
5. Verifies actual token deltas, pays the keeper, and clears route approval.
6. Optionally ships the owner-preauthorized replacement with the remaining impaired
   inventory and actual retained reserve proceeds.

The replacement is not an automatic arbitrary strategy builder. The owner
preauthorizes its hash during setup; the test builds identical policy/curve parameters
with a new salt. Tests execute a subsequent SwapVM fill through that replacement.
Closing, selling and recreating do not require an intervening owner transaction.
Failure rolls the docking and token state back. Setup and contract deployment costs
are excluded from marginal gas comparisons, not claimed free.

Both comparison branches use the same maker account and starting balances, pool,
quantity, observation and explicitly fixed block timestamp. Setup timestamps are
also fixed so slow archive requests cannot artificially age observations.

Keeper compensation is evaluated first at equal gross payment, then at the atomic
keeper's positive after-gas-budget net plus a 0.01 USDT rounding buffer. Budgets use
historical base fee + 2 gwei and 20% gas-unit headroom. This is a transparent scenario,
not a claim about what independent keepers will accept.

## Independent USD boundary

`BreakwaterUsdGuard` adds an experimental absolute USD policy through a small virtual
hook in the legacy guard. The legacy guard remains relative-only for compatibility.
The new guard requires reserve prices in [0.98,1.02], halts impaired-token premiums
above1.02, and treats impaired USD prices below0.98 as stressed even if the relative
ratio appears healthy. Both feeds retain the inherited round/answer/timestamp checks.

The new policy caps observation age at one hour. This is a conservative experimental
choice, not an established correct production threshold or a claim of oracle failure.
Feeds can legitimately update on heartbeat/deviation schedules. A tighter application
limit can reject a feed that is operating normally. See [Chainlink's timestamp guidance](https://docs.chain.link/data-feeds#check-the-timestamp-of-the-latest-answer).
Do not extend freshness simply to preserve a profitable historical result.

## Reproduce

```sh
npm run build
npx hardhat test --no-compile test/UsdSafety.test.ts
UNWIND_RPC_URL=https://eth-mainnet.public.blastapi.io npx hardhat test --no-compile test/SafeStopLossFork.test.ts
UNWIND_RPC_URL=https://eth-mainnet.public.blastapi.io STRICT_USD_POLICY=1 COMPARISON_BLOCKS=16802331,16803515,16804701,16805885,16807070,16808257,16809436,16810616,16811806,16812993,16814181 npx hardhat test --no-compile test/SafeStopLossFork.test.ts
```

`SAFE_DIRECT_EVIDENCE` emits the comparative results. This is today's pinned
Aqua/SwapVM on historical state, using Hardhat2.27/Prague rules, not a2023 transaction.
No live funds or wallet keys are needed. These tests do not implement healthy fees,
prove a complete fee-earning lifecycle, or establish customer demand.

The comparator demonstrates that a competent direct executor can also keep remaining
liquidity operational, at a new strategy hash. Atomic settlement preserves the
original hash and needs no extra direct-sale authorization beyond existing Aqua
permissions. Whether those integration differences justify its measured cost is a
separate product question, not established by positive solver profit.
