# Guard benefit and its limits

Local-fork counterfactual, 10 September 2026. This is not realized savings,
continuous order-flow reconstruction, investment advice, or evidence of demand.
The public Sepolia product still uses owner-controlled no-value samples.

## Reproduce

Build with the repository's pinned dependencies, then run:

```sh
npm run build
GUARD_BENEFIT_RPC=<archive-ethereum-rpc> \
UNWIND_RPC_URL=<archive-ethereum-rpc> \
npx hardhat test --no-compile test/GuardBenefitFork.test.ts
```

No broadcasts or wallet keys are required. Default CI skips these optional
archive-dependent cases. The four original checkpoints are retained, not selected
for favorable outcomes. [Raw results](../evidence/guard-benefit-2026-09-10.json)
include block hashes, authentic feed rounds/ages, executed gas and physical/virtual
balances. Controlled delayed-feed results are labelled separately.

## Matched setup

Each independent checkpoint starts with 100,000 USDC + 100,000 USDT, a 10,000-USDC
input opportunity, 30-bps fee, 0.98 USD/relative trigger and 50-bps exit discount.
Asset/reserve maximum ages are 24h/25h. The same Aqua/SwapVM maker curve and fee
apply. The unguarded branch changes only the local policy runtime to always use
the healthy curve while retaining feed validity and age checks. Its helper is
**test-only and unsafe for real positions**.

The taker actually acquires USDC from the historical Uniswap V3 USDC/USDT
500-fee pool and fills the Aqua order on the local fork. Count the flow only if
the round trip covers acquisition and measured gas at historical basefee + 2 gwei,
with 20% gas headroom. Unprofitable trials are reverted before recording modeled
balances. No organic trading volume, subsidized buyer, or healthy yield is assumed.
This tests one rational arbitrage direction, not every possible source of demand.

All branches use the same checkpoint's pre-trade pool spot USDT/USDC mark. This
is not an executable full-inventory liquidation value. Fees already reside in
token balances and are not added again. Gas is valued through the recorded ETH/USD
and USDT/USD rounds. Common setup costs are excluded; arm gas is recorded, not a
complete setup/authorization cost comparison.

## Results

USDT-equivalent change from equal starting inventory at each checkpoint's mark:

| UTC checkpoint / block | Guarded | Unguarded | Owner-funded direct exit | Immediate cancellation / compensated-keeper path |
|---|---|---|---|---|
| Mar 9 23:59:59 / 16794061 | No gas-covering inflow; 0 | Same; 0 | Same healthy policy; 0 | Same healthy policy; 0 |
| Mar 11 03:59:59 / 16802331 | Refuses input; 0 | −555.907909 | Sells 10,000 USDC; −131.067674 after gas budget | Cancels; −33.472068 gas budget |
| Mar 11 07:59:59 / 16803515 | Refuses input; 0 | −1,254.148430 | Bounded exit unavailable; cancels, −46.826880 | Cancels; −46.826880 gas budget |
| Mar 13 11:59:59 / 16818931 | Allows input; −99.211972 | Same; −99.211972 | Independent healthy checkpoint; same trade | Independent healthy checkpoint; same trade |

Each stressed unguarded fill acquires 10,000 USDC and pays 9,967.520284 USDT;
accounted fees are 30 USDC, included in balances. Counterparty profits after gas
headroom are 349.249765 and 962.257685 USDT. The guard prevents that *additional*
acquisition but does not rescue original inventory: the original 100,000 USDC is
already marked 5,883.88 and 12,866.28 USDT below parity at those stress checkpoints.

Immediate cancellation also prevents acquisition. A keeper funded solely from sale
proceeds cannot meet the treasury floor plus compensation at either stress point.
However, the owner can fund gas separately at the first stress checkpoint and
execute the same bounded direct sale: receive 9,406.566736 USDT, reduce USDC to
90,000, and pay a 126.022035-USDT gas budget (339,156 gas). Its gross treasury
floor is met, even though the after-gas value is lower. This owner-funded route
is retained as `ownerDirect` in the raw data; `direct` records the compensated
keeper/cancellation branch. Neither gas nor token proceeds are counted twice.

Cancellation consumes 90,081 gas. The fallback cancel in this
harness is owner-authorized; it is granted zero delay and no extra authorization
cost as a strong economic control, not presented as a fully implemented autonomous
keeper-cancel workflow. Its modeled cost is not a universal Breakwater saving.

The existing optional atomic route is unavailable after gas at both stressed
checkpoints, unlike the feasible owner-funded direct sale at the first checkpoint.
This is one route/size, not an estimate of all exit liquidity.
No better-proceeds, guaranteed-exit or unique-continuity claim follows.

## Recovery and delayed observations

Holding either stressed unguarded fill's additional inventory to the recorded
recovery mark (0.986830831177507391 USDT/USDC) leaves its incremental value at
−99.211972 USDT. At hypothetical full 1:1 recovery it becomes **+32.479716 USDT**:
refusal forgoes that upside. This includes curve effects and fees, not just fees.
Break-even mark is 0.9967520284 before further transaction costs. These are
held-inventory valuation sensitivities, not executed future sales. The independent
recovery row does not assume a previously cancelled position restarts for free.

The first-stress **owner-funded exit** has the opposite exposure tradeoff. Holding
its resulting balances and already-incurred gas cost, at the deeper trough mark
its incremental value relative to unchanged starting inventory is +567.172847
USDT. At the recorded recovery mark it is −587.763610 USDT; at hypothetical parity,
−719.455299 USDT. Cancellation retains the original exposure and costs 33.472068
USDT at the first checkpoint. These are comparable held-balance sensitivities,
not extra executed future trades or a retrospective choice of the best action.

At recovery, the accepted asset observation passes the 0.98 policy, so a trade
earns 30 USDC in fees while reducing marked treasury value by 99.21 USDT.
**A permitted trade is not necessarily profitable for the owner.**

Authentic stress asset feeds are 72s/396s old; reserve feeds are 2760s/3504s old
at the historical blocks. Local fixture setup adds 19s before execution. A strict
one-hour eligibility sensitivity accepts the two stress points but rejects
pre-shock/recovery; it does not establish the right release freshness setting.

A separate **synthetic** lag sensitivity supplies approximately five-minute-old
$1/$1 observations against the same real stressed pools. The production guard
accepts these observations and permits the same harmful acquisitions. They are
inside even a one-hour age limit. Mock-feed gas is not a live-oracle estimate.
This demonstrates the pre-trigger limitation, not actual historical trigger
latency, feed reliability or event frequency.

The current maker lifecycle suite separately verifies stale-data, unsafe-reserve
and co-depeg refusal in both directions. Those are controlled safety tests, not
historical incidents. No safety policy was weakened for this experiment.

## Reproduction boundaries

The fixture locally impersonates existing non-pool funders and the treasury
contract for setup. Existing token balances are transferred; pool liquidity and
token storage are not fabricated. The reserve funder differs from the USDC funder
because the latter held zero USDT at recovery. Treasury impersonation creates a
matching directory entry; it is not a shipped contract-wallet onboarding method.
Policy bytecode replacement is local instrumentation, never a production upgrade.

The study isolates the guard's effect versus the identical pegged curve. It does
not compare all dynamic AMMs, establish representative returns or availability,
or price a complete operational alternative. Its defensible result is narrower:
**after accepted observations breach the configured limit, the position refuses
further impaired acquisition; original inventory, observation delay, exit demand
and recovery opportunity cost remain the owner's risks.**
