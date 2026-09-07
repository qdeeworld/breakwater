# AI and reuse disclosure

Breakwater is a new ETHOnline 2026 Classic project. No code, UI, design asset, or
other implementation from an earlier Qdee project is reused.

## AI assistance

OpenAI Codex was used extensively for research, implementation, testing, review,
design assets, deployment tooling, and documentation. This was not limited to
autocomplete: Codex generated and revised substantial project-specific code.
Git commits under the maintainer's identity are not a claim of manual authorship
of every line. AI assistance is a development tool, not a runtime component of
the swap or guard.

The following inventory covers the release through `8757567` and this disclosure
update. Paths with inherited code include AI-assisted changes to that code, not
a claim that the upstream implementation was created by Codex.

| Area | Files / assets | Assistance and provenance |
| --- | --- | --- |
| Guard and position | `contracts/BreakwaterGuard.sol`, `contracts/BreakwaterAMM.sol` | Generated and revised depeg policy, oracle validation and commitment binding, pricing, and SwapVM integration. `BreakwaterAMM.sol` is derived from the official template's `AquaAMM.sol`, not an independent upstream-free implementation. |
| Demo and test contracts | `contracts/DemoFaucetToken.sol`, `contracts/DemoPriceFeed.sol`, `contracts/MockPriceFeed.sol`, `contracts/MockToken.sol` | Generated testnet faucet, fixed demo observations, and local fixtures. |
| Inherited integration | `contracts/AquaAMM.sol`, `contracts/MockTaker.sol`, `deploy/deploy-aqua.ts`, `test/AquaAMM.test.ts`, `test/utils/SwapVMHelpers.ts`, `test/utils/fixtures.ts` | Adapted official template code to the pinned SwapVM API and project tests. `test/utils/ProgramBuilder.ts` remains upstream template code. |
| New validation | `test/BreakwaterAMM.test.ts`, `test/BreakwaterDecimals.test.ts`, `test/BreakwaterMainnetFork.test.ts`, `test/BreakwaterPublicJourney.test.ts`, `test/SwapVMHelpers.test.ts`, `scripts/verify-sepolia-guard.mjs` | Generated and revised regression tests, fork reproduction, and read-only deployed-contract checks. Passing tests are engineering evidence, not an independent security audit. |
| Deployment and build | `deploy/deploy-breakwater-public.ts`, `hardhat.config.ts`, `package.json`, `.env.example`, `.github/workflows/ci.yml`, `web/package.json`, `web/next.config.ts`, `web/vite.config.ts`, `web/tsconfig.json`, `web/.openai/hosting.json`, `web/.oxfmtrc.json`, `web/.oxlintrc.json` | Generated or configured integration, build, deployment, and validation tooling. Lockfiles are package-manager output; the deployment manifest is deployment output. |
| Interface | `web/app/breakwater-console.tsx`, `web/app/globals.css`, `web/app/layout.tsx`, `web/app/page.tsx`, `web/lib/breakwater.ts` | Generated and revised UI, wallet interaction, quote lifecycle, transaction progress, styling, and metadata. |
| Design assets | `DESIGN.md`, `web/public/favicon.svg`, `web/public/og.svg`, `web/public/og.png` | AI-assisted visual system and project graphics. These are not manually authored assets claimed as human artwork. Installed fonts remain third-party dependencies. |
| Documentation and evidence | `README.md`, `DEPENDENCIES.md`, this file, `DEVELOPMENT_HISTORY.md`, and `evidence/` | AI-assisted writing and organization. Receipt/block data come from actual chain queries or explicitly labeled fork/simulation runs; prose is not additional proof. |

## Human contribution

Qdee directed this project's scope and workflow, kept it separate from prior
projects, required a dedicated project wallet, funded testnet deployment, and
tested the public swap journey. Qdee identified the missing wallet-disconnect
action and requested automatic quotes and clearer transaction-confirmation
feedback; those requests resulted in repository changes. Qdee also coordinated
external testing and reviewed the project through iterative product feedback.

This disclosure does not attribute manual Solidity authorship, a line-by-line
security audit, or independently verified user adoption to Qdee. Codex-assisted
review and automated tests do not replace those activities. The organizer
determines whether the documented human contribution meets event eligibility.

## Reused material and development records

The project imported 1inch's official `swap-vm-template` at `ad719fc`, then
migrated to the pinned Aqua and SwapVM releases. The imported contracts,
helpers, configuration, and license material are not original Breakwater work.
Exact sources and dependency pins are in [DEPENDENCIES.md](DEPENDENCIES.md);
upstream licenses and notices remain in `LICENSE`, `LICENSES/`, and
`THIRD_PARTY_NOTICES` without being relicensed by this project.

[DEVELOPMENT_HISTORY.md](DEVELOPMENT_HISTORY.md) records the implementation
timeline and human feedback. [DESIGN.md](DESIGN.md) is the committed design
guidance used for the interface. The workflow was conversational Codex work
with repository docs and tests; no OpenSpec, Kiro, or spec-kit project artifacts
were found in the tracked file inventory. The development history is a dated
retrospective, not a fabricated original prompt transcript or proof that every
development instruction is archived. Any additional required source artifacts
must be identified before final submission under the
[event's AI disclosure rules](https://ethglobal.com/events/ethonline2026/info/details).
