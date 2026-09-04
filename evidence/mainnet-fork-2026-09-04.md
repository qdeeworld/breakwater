# Pinned mainnet-fork evidence — 2026-09-04

## Scope

This is an event-window E2 replay, not a public-network deployment or a
mainnet transaction. It proves that Breakwater's official Aqua/SwapVM path can
ship and swap the real 6-decimal USDC and USDT contracts while reading the real
Chainlink feed proxies at a fixed post-kickoff Ethereum state.

- Breakwater commit under test: `5ebf685`
- Ethereum block: `25905465`
- Block hash: `0xfba89fca6a0f936d0bdee7ae7a0f0ad3676d415119b043ba20f47e5e4cbbff04`
- Block timestamp: `2026-09-04T17:31:47Z`
- Official ETHOnline kickoff: `2026-09-04T16:00:00Z`

## Reproduce

Use an Ethereum RPC that can serve state at block `25905465`:

```sh
npx -y yarn@1.22.22 install --frozen-lockfile
MAINNET_RPC_URL=<ethereum-rpc-url> \
MAINNET_FORK_BLOCK=25905465 \
npx -y yarn@1.22.22 test:fork
```

Result on 2026-09-04: `1 passing (38s)`.

## Fixed external state

| Component | Address | Observed value |
| --- | --- | --- |
| USDC | `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` | 6 decimals |
| USDT | `0xdac17f958d2ee523a2206206994597c13d831ec7` | 6 decimals |
| USDC/USD feed | `0x8fffffd4afb6115b954bd326cbe7b4ba576818f6` | 8 decimals; answer `99979000`; round `55340232221128656020`; updated `1788508823` |
| USDT/USD feed | `0x3e7d1eab13ad0104d2750b8863b489d65364e32d` | 8 decimals; answer `100000549`; round `55340232221128655637`; updated `1788463943` |

At the pinned block, the USDC and USDT observations were respectively 34,284
seconds and 79,164 seconds old. The fixture therefore uses a 172,800-second
maximum age. This is a measured configuration constraint: a production market
must set its freshness bound from the selected feed heartbeat instead of
assuming a one-hour update cadence.

## Execution receipt

- Input: `10,000,000` USDT units (10 USDT)
- Quote/output: `9,997,505` USDC units (9.997505 USDC)
- Local fork transaction: `0xfb599726a46645ce8d5ff5078295efaadb28911657f8d3a46a5b02d706ec4408`
- Aqua USDC virtual balance: `100,000,000` -> `90,002,495`
- Aqua USDT virtual balance: `100,000,000` -> `110,000,000`

The transaction hash identifies an ephemeral Hardhat-fork transaction and is
not discoverable on a mainnet explorer. The test impersonates an existing
holder only inside the fork; no real holder approved Breakwater and no real
assets moved.

## What remains simulated

The fixed block was a healthy market. Depeg activation, toxic-direction
rejection, oracle-priced unwind, invalid-feed failures, and quote-to-execution
rechecks remain deterministic local tests using the explicitly test-only
`MockPriceFeed`. A historical depeg replay or supported-network deployment is
still required before claiming public economic proof (E3).
