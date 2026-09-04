# Pinned mainnet-fork evidence — 2026-09-04

## Scope

This is an event-window E2 replay, not a Breakwater public-network deployment
or a mainnet transaction. It proves that Breakwater can ship and swap the real
6-decimal USDC and USDT contracts while reading real Chainlink feed proxies at
a fixed post-kickoff Ethereum state. The same trade runs against both an
exact-tag local deployment and 1inch's canonical Ethereum Aqua/SwapVM v1.0.2
contracts.

- Breakwater commit under test: `999d992`
- Aqua dependency: v1.0.0 commit `81c26e4619ce21556ab02b3284ee2685de21fb18`
- SwapVM dependency: v1.0.2 commit `32c687c2b73101fc26549e48fa1ff8a4d73afbac`
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

Result on 2026-09-04 after the v1.0.2 migration: `2 passing (4s)`.

## Fixed external state

| Component | Address | Observed value |
| --- | --- | --- |
| Canonical Aqua | `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` | contract code present and used |
| Canonical AquaSwapVMRouter v1.0.2 | `0x111111338c5091e8440b67b168bae16a668ac0de` | contract code present and used |
| USDC | `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` | 6 decimals |
| USDT | `0xdac17f958d2ee523a2206206994597c13d831ec7` | 6 decimals |
| USDC/USD feed | `0x8fffffd4afb6115b954bd326cbe7b4ba576818f6` | 8 decimals; answer `99979000`; round `55340232221128656020`; updated `1788508823` |
| USDT/USD feed | `0x3e7d1eab13ad0104d2750b8863b489d65364e32d` | 8 decimals; answer `100000549`; round `55340232221128655637`; updated `1788463943` |

At the pinned block, the USDC and USDT observations were respectively 34,284
seconds and 79,164 seconds old. The fixture therefore uses a 172,800-second
maximum age. This is a measured configuration constraint: a production market
must set its freshness bound from the selected feed heartbeat instead of
assuming a one-hour update cadence.

## Execution receipts

- Input: `10,000,000` USDT units (10 USDT)
- Quote/output: `9,997,505` USDC units (9.997505 USDC)
- Exact-tag self-deployed router fork transaction: `0xdecc55847b1b9b202fcbb4fb91c88cb1eb5f6c869ea2038e0270774968d77208`
- Canonical v1.0.2 router fork transaction: `0x2e62df16fcc643de75d384350e24e3757e3d6492bd2c9bbfe6578a46e2ae3ec2`
- Aqua USDC virtual balance: `100,000,000` -> `90,002,495`
- Aqua USDT virtual balance: `100,000,000` -> `110,000,000`

Both transaction hashes identify ephemeral Hardhat-fork transactions and are
not discoverable on a mainnet explorer. The canonical run calls the deployed
Aqua and router bytecode, but the Breakwater contracts, shipped position, and
transaction exist only in fork state. The test impersonates an existing holder
only inside the fork; no real holder approved Breakwater and no real assets
moved.

## What remains simulated

The fixed block was a healthy market. Depeg activation, toxic-direction
rejection, oracle-priced unwind, invalid-feed failures, and quote-to-execution
rechecks remain deterministic local tests using the explicitly test-only
`MockPriceFeed`. A historical depeg replay or supported-network deployment is
still required before claiming public economic proof (E3).
