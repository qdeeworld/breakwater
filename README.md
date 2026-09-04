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

## Provenance

Official 1inch dependencies and the official SwapVM template are pinned in
[`DEPENDENCIES.md`](DEPENDENCIES.md). AI assistance and reuse are disclosed in
[`AI_DISCLOSURE.md`](AI_DISCLOSURE.md).
