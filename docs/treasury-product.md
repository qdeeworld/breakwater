# Treasury-owned liquidity

The maker lifecycle is implemented by `BreakwaterPositions`, `BreakwaterMakerAMM`
and `BreakwaterPolicy`. The owner console is publicly deployed at
https://breakwater.dolepee.com on Sepolia with no-value sample tokens and
owner-controlled sample observations. Builder-assisted lifecycle checks are not
evidence of independent use, profitable liquidity provision, or an audited
production system.

## Ownership and settlement

Before creating, an owner can [rehearse the selected allocation and limits](policy-rehearsal.md)
without a wallet. This is a historical numeric counterfactual, not a current quote
or an automated recommendation. It does not change the Sepolia sample feeds.

1. A wallet creates an immutable policy and order with its chosen allocation,
   healthy fee (0–100 conventional basis points), trigger (0.98–1.00) and exit
   discount (0–100 basis points). The directory records the caller as maker.
2. The maker approves the relevant token amounts to Aqua and calls `Aqua.ship`
   directly. The directory cannot ship, cancel or move the maker's tokens.
3. Healthy trading executes the pinned official SwapVM flat-input-fee instruction
   and pegged curve. The entire actual input, including the fee, reaches the maker.
   Assets remain in the wallet; Aqua balances are virtual allocations, not custody
   or segregated reserves. Other allocations can compete for physical backing.
4. Stress skips both healthy fee and curve, refuses impaired-asset inflow, and
   quotes reserve-in/asset-out settlement against accepted USD observations.
5. The owner cancels with `Aqua.dock`. Cancellation leaves wallet tokens and ERC20
   approvals unchanged. Reconfiguration requires a new order; a cancelled hash
   cannot be reshipped.

The UI uses exact-amount approvals. A position can require another backing
approval after inventory changes. Available output is bounded by the minimum of
virtual inventory, physical wallet balance and remaining Aqua allowance. This is
an availability indication, not a guarantee against concurrent transactions.

## Explicit fee and exit accounting

The directory authenticates the pinned router, registered order hash, maker and
pair at both maker pre-transfer boundaries. The first boundary records accounting;
the second verifies an unchanged oracle commitment and clears the boundary marker.
Reverted settlement rolls back the records and events. Quotes never earn fees.

For the official input fee with denominator `B=10,000`, healthy fee accounting is
`ceil(actualGrossInput * feeBps / B)`. This is the exact retained fee for both
exact-input and exact-output execution. For exact output the VM uses
`fee = ceil(netInput * f / (B-f))`, and `grossInput = netInput + fee`; substituting
gives the same ceiling expression on gross input. Amounts are recorded in the
input token's native units, independently for each token.

Healthy fees, healthy trade count, exit count, asset exited and reserve proceeds
are separate cumulative fields. Fees are not APY, total profit, direct-sale alpha
or a separate withdrawable balance. A self-trade is not independent fee revenue.
The interface calls this out when the maker uses its own trade ticket.

## Release safety envelope

- Each observation must have valid rounds, a positive answer, supported decimals,
  valid non-future timestamps and age within that feed's immutable limit.
- Reserve USD must be within **$0.98–$1.02**, inclusive. Otherwise both directions
  halt, including reserve-only and correlated depegs.
- An asset premium above **$1.02** halts both directions.
- Healthy requires BOTH asset USD and asset/reserve ratio to meet the owner's
  selected trigger. The asset cannot hide an absolute depeg behind a lower reserve.
- A stressed exit must reduce the position's asset inventory. Its discount is
  relative to accepted observations, **not a maximum total loss**.
- Fresh observations do not imply deep external liquidity, a willing taker,
  gas profitability, or an available exit. Invalid observations halt; there is no
  fallback to a cached quote. A different observation invalidates the commitment.
- The same immutable order can return to healthy trading when observations qualify
  again. No persistent recovery/hysteresis mode is claimed.

### Observation age selection, 2026-09-08

The previous one-hour limit remains an **experimental benchmark policy** in
`BreakwaterUsdGuard`; it is not silently rewritten and its rejected cases stay
rejected in the benchmark.

The current [reference-data directory](https://reference-data-directory.vercel.app/feeds-mainnet.json)
reports USDC/USD proxy `0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6` with an
82,800-second heartbeat and USDT/USD proxy
`0x3E7d1eAB13ad0104d2750B8863b489D65364e32D` with an 86,400-second heartbeat;
both report a 0.25% deviation threshold. These are current directory observations,
not reconstructed 2023 configuration. The [Chainlink timestamp guidance](https://docs.chain.link/data-feeds#check-the-timestamp-of-the-latest-answer)
explains heartbeat/deviation updates and application-owned age checks.

A heartbeat-aligned reference configuration is therefore **86,400 seconds for
USDC and 90,000 seconds for USDT**: each reported heartbeat plus one hour of
operational grace. This chooses fewer routine halts over intrahour data-age
strictness. It does not turn slow updates into real-time protection. An application
requiring subhour information must choose a suitable data source or accept the
resulting halts, not stretch the age limit to manufacture executable exits.

The public Sepolia configuration uses the same 24h/25h *expiry limits* on clearly
labeled **sample feeds**, not those Ethereum market feeds. Sample observations
are set atomically by their position owner's explicit scenario transaction and
never refresh on a read. They have no heartbeat or autonomous operator. Expiry
halts trading until the owner publishes a new sample observation. The scenario
contracts only deploy on Sepolia or the local Hardhat chain. An owner may change
only its own scenarios; other makers are unaffected.

Generic `create` accepts owner-selected feed addresses; registration does not
endorse those feeds. The public interface creates the supported no-value sample
pair, not arbitrary or mainnet positions. Live-money launch requires additional
feed selection, monitoring, risk review and security review; it is not authorized
or claimed by this testnet release.

## Optional atomic clearing

The bounded executor remains an optional integration after the core owner journey.
The cost investigation is closed. Preserve [the complete comparator](safe-direct-comparison.md).
No better proceeds, greater availability or unique continuity is claimed.
Four eligible mutually profitable selected cases under the experimental policy
had approximately **2.04–3.15 USDT** atomic premium per 10,000-USDC exit.
The older approximately 6.73-USDT comparison fails that policy's freshness window.
Avoiding additional direct-sale authorization for an existing compatible Aqua
order is a plausible operational benefit, not verified buyer preference.
