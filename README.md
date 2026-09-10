# Breakwater

> **Powered by SwapVM — © Degensoft Ltd 2025**
>
> **Powered by Aqua — © Degensoft Ltd 2025**

Breakwater lets a treasury create productive liquidity with explicit risk limits.
Aqua/SwapVM enforce those limits through healthy fee-bearing trades and bounded
stressed exits, while the owner retains custody and can cancel its allocation.

During stress, a successful swap may never increase the strategy's virtual
balance of the impaired asset. An exposure-reducing swap is permitted at a bounded
observation-derived price when accepted data, backing and a willing taker are
available. Execution is not guaranteed; the discount is not a total-loss cap.

## Status

The core owner lifecycle is live on [Sepolia](https://breakwater.dolepee.com):
creation, policy/allocation, approvals/shipment, explicit healthy fees,
stress/refusal/halt states, actual exit proceeds and cancellation. See
[`docs/treasury-product.md`](docs/treasury-product.md) for accounting and safety limits.
The public console uses no-value tokens and owner-controlled sample prices,
not live market feeds. This is a testnet prototype, not an audited production system.

Builder-assisted owner creation, activation, healthy self-settlement, stressed
exit, reserve/co-depeg halts and cancellation have been exercised on Sepolia.
Self-trades verify settlement and the fee ledger, not independent revenue or
reduced aggregate wallet exposure. The earlier public taker journey remains at
[/trade](https://breakwater.dolepee.com/trade). Independent-user completion evidence
is pending. Project-specific work began after the
official kickoff at `2026-09-04T16:00:00Z`; this repository was initialized at
`2026-09-04T17:04:11Z`.

The original guard validation covers:

1. an official Aqua/SwapVM token transfer;
2. a healthy two-way quote and swap;
3. an execution-time depeg guard that rejects impaired-asset accumulation;
4. an oracle-priced exposure-reducing swap;
5. the Aqua virtual-balance invariant across both token orderings; and
6. deterministic stale/invalid-feed and quote-to-execution behavior.

Those claims reproduce in the local suite and on the pinned Ethereum fork.
The deployed Sepolia market also rejects toxic-direction quote and swap calls;
the read-only reproduction below does not broadcast a failed transaction.

## Primary target

ETHOnline 2026 Classic — 1inch, **Build an Aqua App**.

## Build and reproduce

Node 24 is used in CI. Yarn 1 is invoked through `npx` so no global install is
required:

```sh
npx -y yarn@1.22.22 install --frozen-lockfile
npx -y yarn@1.22.22 build
npx -y yarn@1.22.22 test
```

An optional pinned Ethereum-fork test exercises real USDC, USDT, and Chainlink
feed contracts without broadcasting a transaction. It runs the same proof
through both an exact-tag local deployment and 1inch's canonical Ethereum
SwapVM v1.0.2 router:

```sh
MAINNET_RPC_URL=<ethereum-rpc-url> \
MAINNET_FORK_BLOCK=25905465 \
npx -y yarn@1.22.22 test:fork
```

The captured block, feed rounds, quote, and Aqua balance deltas are recorded in
[`evidence/mainnet-fork-2026-09-04.md`](evidence/mainnet-fork-2026-09-04.md).

The owner console lives in [`web`](web); its configured release manifest is separate
from the earlier market manifest. Missing configuration disables owner creation.
The previous taker console is retained at `/trade`. Both use automatic
quotes before explicit approval and swap actions. The existing public deployment
is at https://breakwater.dolepee.com. To run locally:

```sh
cd web
npm install
npm run dev
```

Its production dependency audit, lint, and build can be reproduced with:

```sh
cd web
npm audit --omit=dev
npm run lint
npm test
npm run build
```

## Taker safety contract

Reproduce the deployed Sepolia guard check after installing root dependencies:

```sh
node scripts/verify-sepolia-guard.mjs 11655522
```

At that pinned block, both bUSD-in `quote` and `swap` calls revert with
`ToxicDirectionBlocked(bUSD)`, while 10 rUSD quotes 10.691756 bUSD in the permitted
direction. The script uses read-only `eth_call`, requires no key, and spends no
gas. These are fixed demo feeds and no-value tokens, not a live-market safety
claim or a mined rejection receipt. Results and deployed code hashes are in
[`evidence/sepolia-guard-2026-09-07.json`](evidence/sepolia-guard-2026-09-07.json).
Set `SEPOLIA_RPC_URL` to an archive-capable Sepolia endpoint if the default cannot
serve the pinned block; omit the block argument to check current state.

Before requesting the final executable quote, a taker must read
`BreakwaterGuard.currentOracleCommitment()` and place that 32-byte value first
in the official SDK's `TakerTraits.instructionsArgs`. The exact encoded traits
used for that final quote must be reused for execution. If either complete feed
observation changes, execution reverts and the taker must fetch a new
commitment and requote.

The oracle commitment prevents a stale quote from executing against a new
oracle round. It does not replace the SDK's minimum-output/maximum-input
threshold or deadline; production takers should set all three controls.

The constructor rejects one feed address being reused for both assets. Before
deployment, operators must still verify each distinct proxy's network, asset/USD
denomination, heartbeat, and decimals against the oracle publisher's canonical
registry; AggregatorV3 cannot prove those semantics to the guard itself.

The complete demonstration stack was deployed to Ethereum Sepolia on September
5, 2026. All 11 deployment and initialization receipts succeeded; addresses and
transaction hashes are in [`evidence/sepolia-deployment-2026-09-05.json`](evidence/sepolia-deployment-2026-09-05.json).
The market uses no-value test tokens and fixed demonstration prices, not live
Chainlink feeds. Protection applies only to this position, not other strategies
or total wallet exposure. The taker buys impaired inventory; no recovery,
redemption, or capital-preservation guarantee is made.

Local tests reproduce the same immutable stressed market. The separate pinned
fork calls canonical Ethereum Aqua and AquaSwapVMRouter contracts, while
Breakwater's fork transactions remain ephemeral state, not mainnet broadcasts.

The event-only deployer's dedicated public-market script self-deploys the exact
pinned Aqua/SwapVM stack, immutable
testnet-only price observations, two demo tokens, the guard, and a funded Aqua
position. The reserve token faucet permits one 1,000-token claim per address and
has a hard 100,000-token global issuance cap, so public claims cannot exhaust
the 1,000,000-token unwind reserve. The maker retains a 200,000-token buffer;
rerunning the deploy task restores any depleted active Aqua balance with
`Aqua.push` without mutating the strategy.

The task emits `BREAKWATER_PUBLIC_MANIFEST` in the exact JSON shape consumed by
[`web/lib/breakwater-deployment.json`](web/lib/breakwater-deployment.json), plus
a separate transaction-rich evidence record:

```sh
cp .env.example .env
# Fill PRIVATE_KEY and SEPOLIA_RPC_URL locally; never commit .env.
npm run deploy:public:sepolia
```

## Provenance

Official 1inch dependencies and the official SwapVM template are pinned in
[`DEPENDENCIES.md`](DEPENDENCIES.md). AI assistance and reuse are disclosed in
[`AI_DISCLOSURE.md`](AI_DISCLOSURE.md).
