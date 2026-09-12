---
name: Breakwater Selective Aperture
description: Sculptural petrol-and-pewter identity for treasury liquidity with explicit trading permissions.
colors:
  primary: "#0C282C"
  fog: "#E5EFEE"
  foam: "#F7FAF9"
  steel: "#ADCAC2"
  tide: "#276B5F"
  flare: "#A02D46"
  muted: "#486761"
  field: "#EAF2EF"
  field-border: "#C1D4CB"
typography:
  display:
    fontFamily: "Geist Variable"
    fontSize: "132px"
    fontWeight: 650
    lineHeight: 0.89
    letterSpacing: "-0.04em"
  display-mobile:
    fontFamily: "Geist Variable"
    fontSize: "76px"
    fontWeight: 650
    lineHeight: 0.96
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Geist Variable"
    fontSize: "80px"
    fontWeight: 620
    lineHeight: 1.05
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Geist Variable"
    fontSize: "42px"
    fontWeight: 550
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  panel-title:
    fontFamily: "Geist Variable"
    fontSize: "25px"
    fontWeight: 550
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Geist Variable"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "IBM Plex Mono"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.6
rounded:
  panel: "18px"
  card: "16px"
  panel-mobile: "14px"
  field: "12px"
  pill: "100px"
spacing:
  compact: "8px"
  control-gap: "16px"
  gutter: "24px"
  panel: "34px"
  panel-mobile: "22px"
components:
  button-light:
    backgroundColor: "{colors.fog}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "15px 34px"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.foam}"
    rounded: "{rounded.pill}"
    width: "100%"
  button-primary-disabled:
    backgroundColor: "{colors.steel}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "10px 12px"
  input-allocation:
    backgroundColor: "{colors.field}"
    textColor: "{colors.primary}"
    rounded: "{rounded.field}"
  navigation-active:
    backgroundColor: "{colors.foam}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  condition-selected:
    backgroundColor: "{colors.foam}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "8px"
  card-setup:
    backgroundColor: "{colors.foam}"
    textColor: "{colors.primary}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
---

# Design System: Breakwater

## Overview

**Creative North Star: "Selective Aperture"**

Breakwater joins deep petrol, brushed pewter and mineral light. A monumental aperture expresses selective trading permission, while broad, closely set typography states the owner's outcome. The original rendered artwork supplies the homepage's material character; a small two-part aperture mark carries that identity into navigation and the working product.

The treasury workspace uses the same palette and type on quieter, rounded surfaces. Clear amounts, labelled trading directions and deliberate actions take priority over decorative telemetry. The finished implementation preserves the user-selected middle aperture direction, seed `dad3d530`; the page-specific composition contract remains in `.impeccable/aperture-build-brief.md`.

**Key Characteristics:**

- Deep petrol fields, pale mineral surfaces and restrained green or rose state accents.
- Large, tightly led display type paired with compact, readable operational type.
- Sculptural imagery, exact direction diagrams and softly rounded controls.
- Explicit permission words and contextual disclosure of supporting details.

## Colors

Petrol and mineral neutrals establish the identity; state colors explain permission and require accompanying words or symbols.

### Primary

- **Petrol** (`primary`) anchors the homepage and navigation and fills primary actions on light surfaces.
- **Tide** (`tide`) marks active setup steps, permitted direction graphics on light surfaces and form focus.
- **Flare** (`flare`) supplies the core warning/error accent. Dark preview surfaces use lighter mint and rose foregrounds for readable state labels.

### Neutral

- **Mineral Fog** (`fog`) is the page field and light homepage action surface.
- **Foam** (`foam`) separates working panels and selected controls from the surrounding field.
- **Mineral Steel** (`steel`) emphasizes the brand mark and selected display wording and supports restrained borders.
- **Muted Green** (`muted`) carries explanatory copy on light surfaces.
- **Field Mist** (`field`) and **Field Edge** (`field-border`) define editable amounts with tonal fill and a fine boundary.

**The Labelled Permission Rule.** Healthy, stressed, halted and unavailable states must be named. Color alone never establishes permission, and unavailable observations never inherit a healthy appearance.

## Typography

**Display and body font:** Geist Variable with a sans-serif fallback. **Data font:** IBM Plex Mono with a monospace fallback. Both are self-hosted by the application.

The type ramp moves from a broad, tightly packed homepage promise to compact workspace headings and open explanatory copy. Display uses the desktop role above, then the mobile role at the homepage breakpoint; desktop leading is intentionally tighter than mobile leading. Marketing section headings use `headline`, workspace page headings use `title`, and setup/preview headings use `panel-title`.

The four responsive font-size tokens record the actual maximum pixel dimensions for portable token export. Preserve the built fluid sizing when applying them: `display` uses `clamp(64px, 7.22vw, 132px)`, `display-mobile` uses `clamp(48px, 10.3vw, 76px)`, `headline` uses `clamp(40px, 4.69vw, 80px)`, and `title` uses `clamp(28px, 3vw, 42px)`. Between 761px and 1100px the hero uses `7.2vw`; at 760px and below marketing section headings use `clamp(36px, 8.5vw, 58px)`. Token font families contain the family name alone; the CSS fallback stacks remain those stated above.

Ordinary labels, action text, field entry and footer copy remain Geist. Supporting copy generally sits between 14px and 18px with comfortable leading; workspace summaries use 16px with 1.6 leading. Main allocation entry is 32px on desktop and 28px on small screens, with tabular figures despite using the body face. Data tables, inventory measurements and addresses use mono where alignment or precision helps. Long values wrap rather than losing digits.

**The Purposeful Mono Rule.** Reserve monospaced type for amounts, measurements and identifiers that benefit from it; ordinary explanation and navigation use the body face.

## Layout

The homepage uses broad paired regions and horizontal section changes. Its desktop promise sits left of the aperture artwork, with direct app and discovery actions below. Shared outer alignment uses 4.4% gutters. At 760px and below, the promise and actions precede the recognizable artwork, navigation wraps visibly, and permission choices become stacked rows. Mobile homepage gutters are 22px. The artwork remains free of body-copy overlays.

The workspace has a horizontal petrol navigation bar and a separate wallet/network row. Content is centered within a 1360px maximum width. Creation pairs an editable setup panel with a quieter permission preview in a 1.2:1 grid with the `gutter` gap; the grid becomes one column by 860px. Panel padding contracts from `panel` to 28px and then `panel-mobile`; at 600px and below the main workspace gutter is 18px. Discovery rows use a three-region desktop layout and stack by 700px.

Creation presents allocation, limits and review one stage at a time. Backward navigation retains edits, the next action stays beside the task, and the preview follows the form on narrow screens. Historical rehearsal is optional in review, after the activation action. Selected positions place inventory and actual policy state near the owner action or trade ticket, with secondary details in disclosures. Shared-position URLs continue to open the position directly.

## Elevation & Depth

Depth comes primarily from the rendered aperture and tonal surface changes. Working panels are flat, with restrained borders and no general card-shadow system. The homepage action's small hover lift is an interaction cue; it does not establish floating panels. Native status indicators may carry their existing small ring, without becoming a general glow treatment.

**The Material Depth Rule.** Let the original aperture image provide sculptural light and texture; use tonal grouping and fine boundaries for working surfaces.

Homepage action background and vertical position transition over 200ms; permission arrows transition opacity over 250ms. Reduced-motion mode removes homepage transitions and the hover lift, while the application's global reduced-motion rules suppress other nonessential motion.

## Shapes

The two asymmetric aperture plates form the reusable brand mark. Keep the metal sculpture as the original raster artwork and use inline SVG for marks, direction arrows and locks.

Working surfaces use the `panel` radius for setup, preview, trade ticket, rehearsal and sample-token tools. Position and discovery cards use `card`; setup and preview move to `panel-mobile` on small screens. Amount fields use `field`; select and notice corners are slightly tighter at 10px. Actions, selected routes, condition switches and state labels use `pill`. Numbered setup steps remain circles. Permission rows use straight dividers rather than individual decorative cards.

## Components

### Buttons

Homepage actions are pale pills with petrol text, 62px minimum height and the `button-light` padding. Hover brightens the surface and lifts it by 2px; keyboard focus is a 3px current-color outline with 5px offset. Mobile homepage actions reduce to 54px minimum height with 12px by 26px padding; the header action remains a compact 44px target.

Workspace primary actions are full-width petrol pills with foam text and at least 52px height. Hover changes the fill and border to the existing deeper green; disabled actions use steel and retain readable petrol text. Secondary actions are transparent pills with a fog hover surface. Guided-workspace focus uses a 3px tide outline with 3px offset; dark preview controls use foam instead. Signing remains deliberate, and creation, token approval and Aqua activation remain distinct actions.

### Inputs / Fields

Allocation inputs combine a prominent editable amount with a persistent token suffix in one mist-filled field. They are at least 76px tall on desktop and 68px on small screens. The boundary turns tide on focus-within, with a visible outline on the focused input. Trade and rehearsal inputs reuse the field fill and rounded boundary at a more compact 54px minimum height. Native labels, help text and errors stay adjacent to their field.

### Navigation

The horizontal workspace bar pairs the aperture mark and name with Treasury, Find liquidity and Documentation. Active routes are foam pills on petrol; inactive hover uses a lighter petrol fill. Keyboard focus uses a foam outline. On small screens the brand and navigation occupy separate rows, with labels preserved as space tightens. The wallet/network row remains visible underneath.

### Chips / State Labels

Discovery states are compact text pills. Healthy uses a pale green fill; stressed and halted use pale rose. Labels distinguish the states even when they share a color family. These are status text, not controls: do not invent hover, focus or click behavior for them. Network context remains a simple text label in the wallet row.

### Cards / Containers

Setup, preview, trade and discovery panels use large contiguous surfaces with clear internal grouping. Setup and trade surfaces are foam; the permission preview is deep petrol with lighter text. Panels retain their flat material treatment. Real controls inside panels carry interaction states; the panel itself does not lift or become focusable.

### Selective Permission Preview

The preview uses a pill switch for Healthy, Stressed and Halted, explicit illustrative context, and paired labelled direction rows. The selected condition is foam on petrol; inactive hover lightens the switch segment. Arrows signal a permitted direction, locks signal a blocked direction, and state text remains visible. Explanations and fixed safety boundaries sit immediately below the diagram.

The homepage artwork depicts healthy illustrative permission, not live observations. Healthy allows both directions; asset stress blocks further asset inflow while allowing eligible bounded sales; unsafe reserve or unacceptable observations halt trading. Permission does not guarantee execution.

The selected-position view preserves pay/receive labels, refreshed quotes, minimum received, healthy fee, the actual next action and settled transaction receipts. Existing policy is immutable: changing the settings requires a new position; cancellation of the old position is a separate owner decision. Cancellation removes its allocation and does not imply a custodial withdrawal. Historical fees and exit proceeds remain distinct from remaining inventory, and shared wallet backing is not reserved liquidity.

The trade ticket gives the received amount one prominent display, with minimum received and fees below; a visually hidden live announcement preserves quote feedback without duplicating the figure on screen. Transaction feedback sits with the initiating action, distinguishes wallet review, pending confirmation and verified completion, and retains uncertainty after a failed follow-up read. A settled trade shows exact paid/received amounts and its own receipt. Feedback from another position or wallet returns to the page-level area with its original context.

Position sharing belongs near the main actions: a labelled copy button confirms success, with a manual link disclosure if copying is unavailable. Compact mobile state headings retain a 44px labelled refresh control. The social cover uses the same aperture artwork, product promise and explicit no-value Sepolia qualification.

## Do's and Don'ts

### Do:

- Do keep owner and counterparty actions primary, with technical receipts and historical rehearsal in context.
- Do distinguish live position state, illustrative permissions and independent historical checkpoints.
- Do preserve precise amounts, shared-position links and the existing wallet authority throughout visual changes.
- Do retain native labels, visible keyboard focus, reduced-motion support and at least 44px interactive targets where applicable.
- Do show loading, empty, error, wallet/network and unavailable states with an appropriate recovery action.

### Don't:

- Don't turn illustrative art or historical comparisons into live financial evidence.
- Don't imply guaranteed execution, exits, returns or a maximum total-loss cap.
- Don't invent customers, backers, audits, TVL or APY.
- Don't spread monospaced type into ordinary explanations, navigation or footer copy.
- Don't replace the selected aperture artwork with generic dashboard imagery or decorative card stacks.
