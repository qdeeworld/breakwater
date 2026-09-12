# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Treasury owners creating and managing an Aqua liquidity position, and counterparties finding and trading against existing positions.

## Product Purpose

Let a treasury put liquidity to work with explicitly configured risk limits: earn retained trading fees while conditions are healthy, refuse further impaired-asset accumulation when its guard trips, and permit bounded exposure-reducing trades when eligible.

## Positioning

The same treasury-owned Aqua position changes its permitted trading directions under an observation-based safety policy enforced through SwapVM. Owner control, actual fee accounting and understandable inventory changes are the primary product; atomic clearing is optional.

## Operating Context

The public application is a Sepolia prototype using no-value bUSD/rUSD tokens and owner-controlled sample observations, not live market feeds. Owners choose allocation and immutable policy, approve tokens, activate on Aqua, inspect accounting and cancel. Counterparties can browse without connecting a wallet, then connect to request and execute permitted trades.

The user approved a dedicated product homepage leading into a matching treasury workspace on September 11, 2026. Existing shared-position URLs must remain functional and direct; the homepage must not obstruct those users.

## Capabilities and Constraints

- Creation, approval, activation, healthy fees, stress refusal, bounded exits, reserve/co-depeg halts, cancellation and recent-position discovery exist.
- Quotes refresh automatically. Approval and swap remain separate explicit actions where approval is required.
- Independent USD observations and relative-price checks determine permitted behavior. Observation age is visible; accepted data can lag the market.
- An allowed exit still requires backing, accepted observations and a willing counterparty. Neither exits nor recovery nor earnings are guaranteed.
- Exit discount is not a maximum total-loss guarantee. Historical fees and proceeds are not additional balances to add to remaining allocation.
- Historical policy rehearsal is optional, uses four independent checkpoints and archived quotes, and does not move funds or form a continuous backtest.
- The product is not an audited production system. Visual redesign must not change contracts, transaction arithmetic, wallet authority or existing financial claims.

## Brand Commitments

The product name is Breakwater. The user rejected the incumbent marine-dashboard aesthetics and requested substantially stronger visual craft, benchmarked against reputable venture-backed firms in treasury, liquidity and onchain risk. Research identified Aera, KPK, Gauntlet and Arrakis Finance. Their quality is a reference, not permission to copy brand assets or import their commercial claims.

## Evidence on Hand

README.md and docs/treasury-product.md document product scope and limitations. evidence/separate-party-lifecycle-2026-09-11.json records the same-position distinct-wallet healthy trade and stressed exit, with subsequent halt checks. These were guided tests, not verified demand or unassisted onboarding. Historical comparisons are documented in docs/guard-benefit.md and docs/policy-rehearsal.md.

There is no basis to invent customers, venture backers, TVL, APY, audit credentials, superior trading returns or guaranteed capital protection for Breakwater.

## Product Principles

- Owner decisions and actual asset changes lead; technical receipts remain contextual.
- Preserve truth when simplifying. Make unavailable and unsafe states explicit.
- Distinguish live position state, illustrative permissions and historical counterfactuals.
- Keep self-service creation and public trading usable without private assistance.

## Accessibility & Inclusion

Preserve desktop and mobile flows, native labels and semantics, visible keyboard focus, reduced-motion support, non-color state labels and at least 44px interactive touch targets where applicable. Wallet/network, loading, empty and error states need clear recovery actions.
