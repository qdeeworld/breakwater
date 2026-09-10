---
version: alpha
name: Breakwater Marine Instrument
description: A daylight treasury console for owner-created liquidity, earned fees and explicit trading limits.
colors:
  fog: "#EAF2F5"
  primary: "#072A40"
  foam: "#F8FBFC"
  steel: "#91A8AF"
  tide: "#0D7C77"
  flare: "#C6314A"
typography:
  display:
    fontFamily: Barlow Condensed
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

## Overview

Breakwater lets a treasury owner create productive Aqua liquidity with explicit risk limits. Ownership, actual fees and understandable policy changes lead the experience; trading against a position is the complementary participant journey.

This is an operational instrument, not a protocol landing page. The owner chooses allocation and policy, approves and ships, observes earnings and remaining exposure, and can cancel. Aqua/SwapVM enforce ordinary trades and bounded stressed exits. Atomic clearing is optional rather than the primary product promise.

### Visual thesis

Use the visual language of a daylight marine control panel: pale fogged surfaces, deep harbor ink, thin structural rules, condensed instrument labels, and precise monospaced readings. The signature element is a horizontal **tide gate** joining the two asset reservoirs. It visualizes the actual guard state rather than decorating it.

Avoid the familiar dark crypto-terminal treatment, glass cards, neon gradients, oversized marketing headlines, floating token art, and soft pill-shaped containers. Depth comes from hierarchy, borders, and tonal surface changes, not blur or heavy shadow.

## Colors

- `fog` is the page canvas and low-emphasis control background.
- `foam` is the primary working surface.
- `primary` is deep harbor ink and carries text, primary controls, and strong structural emphasis.
- `steel` is reserved for borders, dividers, secondary labels, and unavailable paths.
- `tide` indicates healthy state, validated inputs, and an open route.
- `flare` indicates stressed state, a closed route, validation failure, or a destructive consequence.

Never communicate route availability by color alone. Pair state color with a plain-language label, directional arrow, and open/closed gate shape. Keep normal text contrast at WCAG AA or better.

## Typography

Use the display face for position states, asset symbols and principal amounts; body type for instructions, controls and errors; data type for prices, addresses and transaction details. Keep changing figures tabular. Use sentence case for prose and compact uppercase only for short instrument labels. Scale display type down on narrow screens before amounts wrap.

## Layout

The first viewport begins with a compact identity row, network and wallet status, then the owner's positions and a clear creation action. Place allocation and policy together during creation. A selected position places inventory, actual earnings and policy state beside the next owner action or trade ticket. On mobile, put that next action immediately after the state summary, ahead of secondary telemetry.

Use the shared spacing unit and grouped gaps. Keep related readings tighter than independent component groups and major sections.

## Elevation & Depth

Establish hierarchy with thin structural rules and tonal working surfaces rather than blur or heavy shadow.

## Shapes

Keep the shared restrained corner shape for working surfaces, buttons and inputs. Do not introduce soft pill-shaped containers.

## Components

### Tide gate

Show two labeled asset reservoirs connected by a central guard gate. Healthy permits two-way trading; stressed closes impaired-asset inflow and permits exposure-reducing trades; an unsafe reserve or invalid observations halt both. An allowed direction is not a guaranteed available exit: insufficient inventory, allowance or liquidity must remain visible. Animate only actual state changes and disable motion under reduced-motion preferences.

### Position state panel

Lead with the actual state, including draft, healthy, stressed, halted and cancelled. Show independent asset prices, configured trigger, each feed's observation age and limits. Technical identifiers belong in a disclosure below these readings. Unresolved data is unavailable, not a healthy default.

### Owner controls and earnings

Separate creation from token approval and Aqua shipment; explain what each signature authorizes. Cancelling removes the Aqua allocation without implying a custodial withdrawal. Show settled healthy fees separately from exit proceeds, remaining token exposure and price gains or losses. Keep policy choices immutable for an existing order and explain that changes require cancellation and a new position.

### Trade ticket

Use one amount input, an explicit `You pay` / `You receive` summary, and an active-voice primary button naming the next real step. Quotes update automatically after input settles; manual refresh is a recovery action. Show minimum received and fees before signing, with deadline and oracle commitment in technical detail.

### Transaction receipt

After settlement, retain the completed amounts, state used for execution, and linked transaction hash. Failure messages state whether the wallet, allowance, quote freshness, oracle state, deadline, or onchain call caused the stop, and provide the corresponding recovery action.

## Do's and Don'ts

- The UI derives the permitted direction from onchain state; it does not present a disabled direction as a viable quote.
- A changed oracle commitment invalidates the displayed quote and requires a visible requote.
- Wallet and network mismatches are explained before the user reaches a signing prompt.
- Keyboard focus is conspicuous and follows visual order. Native labeled controls and generous touch targets are required.
- Loading states preserve layout and name the operation in progress. Empty, disconnected, stale-data, rejected-signature, and reverted-transaction states each have a purposeful recovery path.
- The interface never labels a mock or simulated value as live.

### Voice

Use direct, calm language suitable for a consequential transaction. Prefer `Stressed — only treasury unwind is open` over protocol jargon. Avoid judge-facing labels, hype, fabricated impact claims, and unexplained abbreviations.
