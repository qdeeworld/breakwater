# Atomic unwind experiment

This note describes the initial September7 checkpoint. See the subsequent
[safe direct comparator and USD policy](safe-direct-comparison.md) for the expanded
benchmark and safety work; neither experiment is a public release.

Experimental, not deployed or audited. This extends the existing position with one
order-bound executor and one immutable USDC/USDT Uniswap V3 route. It does not add
healthy fees, a maker interface, an independent reserve-health check, or a running solver.

Implementation, test code and this technical note were AI-assisted by Codex under
Qdee's product brief and constraints. Local test signers are not independent users.

The executor receives impaired inventory through pinned SwapVM v1.0.2's output-first
settlement, sells it, pushes the required reserve repayment to Aqua, and pays only
new surplus to its caller. The caller needs native gas but no initial reserve tokens.
Global callback locking, authenticated context, exact approvals and balance-delta
checks prevent unrelated balances from subsidizing a bad sale. These checks are not
a security audit or support for arbitrary tokens/routes.

## Reproduce

```sh
npm run build
npx hardhat test --no-compile test/BreakwaterUnwindExecutor.test.ts
UNWIND_RPC_URL=https://eth-mainnet.public.blastapi.io npx hardhat test --no-compile test/BreakwaterUnwindFork.test.ts
```

The historical suite self-deploys today's pinned Aqua/SwapVM on three historical
Ethereum snapshots. Aqua is **not** claimed to have operated in March 2023.
Native funding and whale impersonation happen only inside Hardhat. No real wallet
or mainnet transaction is used. The fork URL must be archive-capable; authenticated
URLs are redacted from the emitted evidence.

The suite emits `UNWIND_FORK_EVIDENCE` JSON with matched timestamps, oracle rounds,
real pool/venue code hashes, maker wallet and virtual-inventory assertions,
measured transaction gas, estimated costs at each historical base fee plus 2 gwei,
and a second result with 20% gas-unit headroom. Hardhat 2.27.0 uses Prague EVM rules;
this is a counterfactual gas estimate, not a receipt from 2023. Deployments and
standing setup approvals are excluded from both marginal-execution comparisons.

At each block, 100, 1,000 and 10,000 USDC sales use identical starting pool state.
Blocks 16802331 and 16803515 retain the initially selected stressed failures.
Block 16804701 is the first chronologically viable quote in a subsequently
predeclared four-hour sampling grid, not the strongest favorable window. Optional
`UNWIND_LARGE_SIZES=1` adds explicitly exploratory 25,000 and 100,000 sizes.

The direct-sale branch is only a **standalone swap-cost lower bound**. It does not
dock or update the maker's Aqua position, so it is not a complete safe delegated
stop-loss comparison. No operator delay is invented. A complete lifecycle benchmark
must add that account/position management and matched healthy fee-bearing history.

## Interpretation

Positive solver profit establishes conditional execution feasibility, not higher
treasury proceeds. A solver needs enough external proceeds to cover repayment,
gas, and its margin. The configured oracle discount is not a total loss cap.
Unprofitable windows must be reported, not treated as available exits.

Full-call simulation checks the external route; a SwapVM quote alone does not.
Even a passing simulation cannot guarantee transaction inclusion or unchanged
market state. Local mined-refusal checks verify token/Aqua rollback and separately
assert that the caller still pays native gas on failure.

The mock venue and 24 mechanics tests are fixtures only. They do not establish
market demand, independent users, oracle safety across joint depegs, recovery
performance, or superiority over a competent direct stop-loss executor.
