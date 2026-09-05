# Breakwater

> **Powered by SwapVM — © Degensoft Ltd 2025**

Breakwater is an Aqua/SwapVM liquidity position for DAO treasuries. It provides
two-way stablecoin liquidity while the pair is healthy, then turns the same
immutable position into a one-way exit market when an authenticated price feed
detects a depeg.

During stress, a successful swap may never increase the strategy's virtual
balance of the impaired asset. An exposure-reducing swap must remain executable
at a bounded oracle-derived price.

## Status

Breakwater passed its bounded ETHOnline 2026 sponsor spike and is now
commissioning the public taker journey. Project-specific work began after the
official kickoff at `2026-09-04T16:00:00Z`; this repository was initialized at
`2026-09-04T17:04:11Z`.

The spike must prove:

1. an official Aqua/SwapVM token transfer;
2. a healthy two-way quote and swap;
3. an execution-time depeg guard that rejects impaired-asset accumulation;
4. an oracle-priced exposure-reducing swap;
5. the Aqua virtual-balance invariant across both token orderings; and
6. deterministic stale/invalid-feed and quote-to-execution behavior.

Those claims reproduce in the local suite and on the pinned Ethereum fork. The
remaining launch gate is a cold completion of the public quote → approve → swap
journey.

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

The taker console lives in [`web`](web) and reads the committed Sepolia market
manifest. The intended public hostname is `https://breakwater.dolepee.com`;
website access and an independent wallet completion remain launch checks:

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
npm run build
```

## Taker safety contract

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
