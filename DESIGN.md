---
version: alpha
name: Breakwater Marine Instrument
description: A daylight trading console that makes treasury-defense state and the permitted swap direction immediately legible.
colors:
  fog: "#EAF2F5"
  primary: "#072A40"
  foam: "#F8FBFC"
  steel: "#91A8AF"
  tide: "#0D7C77"
  flare: "#C6314A"
typography:
  display:
    fontFamily: Barlow Condensed Variable
    fontSize: 48px
    fontWeight: 650
    lineHeight: 0.95
    letterSpacing: -0.015em
  body:
    fontFamily: Manrope Variable
    fontSize: 16px
    fontWeight: 450
    lineHeight: 1.5
  data:
    fontFamily: IBM Plex Mono
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
rounded:
  base: 4px
spacing:
  unit: 4px
  gutter: 24px
  section: 32px
---

# Breakwater interface system

## Product intent

Breakwater is a single-purpose execution surface for a taker trading against a DAO treasury position protected by the Breakwater Guard. The interface must answer three questions without interpretation: what state is the position in, which direction is permitted now, and what will this wallet sign?

This is an operational instrument, not a protocol landing page. The primary action is quoting and settling the currently permitted trade. Explanatory material stays subordinate to that job.

## Visual thesis

Use the visual language of a daylight marine control panel: pale fogged surfaces, deep harbor ink, thin structural rules, condensed instrument labels, and precise monospaced readings. The signature element is a horizontal **tide gate** joining the two asset reservoirs. It visualizes the actual guard state rather than decorating it.

Avoid the familiar dark crypto-terminal treatment, glass cards, neon gradients, oversized marketing headlines, floating token art, and soft pill-shaped containers. Depth comes from hierarchy, borders, and tonal surface changes, not blur or heavy shadow.

## Typography

- **Display — Barlow Condensed Variable:** position state, asset symbols, and the principal amount. Use sentence case for prose and compact uppercase only for short instrument labels.
- **Body — Manrope Variable:** instructions, transaction explanations, controls, and errors.
- **Data — IBM Plex Mono:** prices, ratios, addresses, deadlines, transaction hashes, and state identifiers. Preserve tabular alignment for changing values.

On narrow screens, scale the display style down rather than allowing state labels or amounts to wrap awkwardly. Body copy should remain at least 16px in interactive contexts.

## Color behavior

- `fog` is the page canvas and low-emphasis control background.
- `foam` is the primary working surface.
- `primary` is deep harbor ink and carries text, primary controls, and strong structural emphasis.
- `steel` is reserved for borders, dividers, secondary labels, and unavailable paths.
- `tide` indicates healthy state, validated inputs, and an open route.
- `flare` indicates stressed state, a closed route, validation failure, or a destructive consequence.

Never communicate route availability by color alone. Pair state color with a plain-language label, directional arrow, and open/closed gate shape. Keep normal text contrast at WCAG AA or better.

## Layout and spacing

The first viewport begins with a compact identity row, network and wallet status, then the live position state. On desktop, use a seven-column live-position region beside a five-column trade ticket. On mobile, stack the status and tide gate above the trade ticket so the permitted direction and next action appear early.

Use the 4px spacing unit. Common gaps are 8px for tightly related readings, 16px inside controls, 24px between component groups, and 32px between major sections. Working surfaces have 4px corners, 1px rules, and little or no drop shadow.

## Components

### Tide gate

Show two labeled asset reservoirs connected by a central guard gate. In healthy state, both directional paths are visually available. In stressed state, the BAD-asset inflow path is visibly closed while the GOOD-in/BAD-out unwind path remains open. Animate only the gate and flow indicator when state changes, and disable that motion under `prefers-reduced-motion`.

### Position state panel

Lead with `Healthy` or `Stressed`, followed by the observed price, configured trigger, and data freshness. Technical identifiers belong in a compact disclosure below the decision-critical readings. Never invent live values; unresolved data is shown as unavailable.

### Trade ticket

Use one amount input, an explicit `You pay` / `You receive` summary, and one active-voice primary button whose label reflects the next real step: `Connect wallet`, `Approve USDT`, `Get fresh quote`, or `Swap USDT for USDC`. Threshold, deadline, fees, and oracle commitment are visible before signing, with technical detail collapsed by default.

### Transaction receipt

After settlement, retain the completed amounts, state used for execution, and linked transaction hash. Failure messages state whether the wallet, allowance, quote freshness, oracle state, deadline, or onchain call caused the stop, and provide the corresponding recovery action.

## Interaction rules

- The UI derives the permitted direction from onchain state; it does not present a disabled direction as a viable quote.
- A changed oracle commitment invalidates the displayed quote and requires a visible requote.
- Wallet and network mismatches are explained before the user reaches a signing prompt.
- Keyboard focus is conspicuous and follows visual order. Touch targets are at least 44px.
- Loading states preserve layout and name the operation in progress. Empty, disconnected, stale-data, rejected-signature, and reverted-transaction states each have a purposeful recovery path.
- The interface never labels a mock or simulated value as live.

## Voice

Use direct, calm language suitable for a consequential transaction. Prefer `Stressed — only treasury unwind is open` over protocol jargon. Avoid judge-facing labels, hype, fabricated impact claims, and unexplained abbreviations.
