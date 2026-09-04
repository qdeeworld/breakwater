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

Breakwater is in its bounded ETHOnline 2026 sponsor spike. Project-specific work
began after the official kickoff at `2026-09-04T16:00:00Z`; this repository was
initialized at `2026-09-04T17:04:11Z`.

The spike must prove:

1. an official Aqua/SwapVM token transfer;
2. a healthy two-way quote and swap;
3. an execution-time depeg guard that rejects impaired-asset accumulation;
4. an oracle-priced exposure-reducing swap;
5. the Aqua virtual-balance invariant across both token orderings; and
6. deterministic stale/invalid-feed and quote-to-execution behavior.

If those claims do not reproduce, Breakwater does not advance to the heavy
build.

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

The current spike has no claimed Breakwater public-network deployment. Local
tests deploy the complete stack. The pinned fork additionally calls canonical
Ethereum Aqua and AquaSwapVMRouter contracts, while Breakwater's contracts and
transactions remain ephemeral fork state. Public-network deployment
instructions will be added with the first supported-network release rather
than implying that fork-only addresses are live contracts.

## Provenance

Official 1inch dependencies and the official SwapVM template are pinned in
[`DEPENDENCIES.md`](DEPENDENCIES.md). AI assistance and reuse are disclosed in
[`AI_DISCLOSURE.md`](AI_DISCLOSURE.md).
