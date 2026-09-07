# Dependency snapshot

Snapshot recorded after ETHOnline 2026 kickoff on 2026-09-04.

## Active sponsor-spike stack

| Dependency | Source | Pin |
| --- | --- | --- |
| 1inch SwapVM template | https://github.com/1inch/swap-vm-template | `e9f8def43c7e8fbe5d8453df2e0a83e2be17c38b` |
| Aqua v1.0.0 | https://github.com/1inch/aqua | `81c26e4619ce21556ab02b3284ee2685de21fb18` |
| SwapVM v1.0.2 | https://github.com/1inch/swap-vm | `32c687c2b73101fc26549e48fa1ff8a4d73afbac` |
| SwapVM SDK | https://www.npmjs.com/package/@1inch/swap-vm-sdk | `0.4.1` |
| Solidity | Hardhat configuration | `0.8.30` |

The template is the provenance baseline; Aqua and SwapVM are deliberately
advanced to their formal stable releases. The migration includes the v1.0.2
pair-at-call-time API and uses the official SDK to encode taker traits.

## Canonical Ethereum contracts exercised on the fork

| Contract | Address |
| --- | --- | --- |
| Aqua | `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` |
| AquaSwapVMRouter v1.0.2 | `0x111111338c5091e8440b67b168bae16a668ac0de` |

The prior template pins (`6f05aa1...` Aqua and `b44977a...` SwapVM) remain
recoverable in repository history for baseline reproduction. Aqua's Solidity
source at the old template pin is identical to v1.0.0; SwapVM required an
explicit API migration.

## Release and package versions

The release tags above differ from package metadata: Aqua v1.0.0 contains
package version `0.1.0`; SwapVM v1.0.2 contains package version `0.0.6`.
The exact commits identify the imported source. `THIRD_PARTY_NOTICES` records
these distinctions, solidity-utils `6.9.7`, and SwapVM SDK `0.4.1`.

## Template changes

The import at `ad719fc` contains 19 files byte-identical to the official template
at the pinned source commit. The project's README and `.gitignore` are local
replacements; the template's developer-preview PDF was not imported.

The following inherited implementation files were modified on September 4, 2026:

| File | Breakwater modification | Commits |
| --- | --- | --- |
| `contracts/AquaAMM.sol` | Pair-at-call-time maker order API | `999d992` |
| `contracts/MockTaker.sol` | Explicit token-in and token-out call parameters | `999d992` |
| `deploy/deploy-aqua.ts` | Router version changed to 1.0.2 | `833ceb9` |
| `test/AquaAMM.test.ts` | New pair API and official SDK trait encoding | `999d992` |
| `test/utils/fixtures.ts` | Router version changed to 1.0.2 | `833ceb9` |
| `test/utils/SwapVMHelpers.ts` | Replace handwritten encoding with official SDK wrapper; validate integer bounds | `999d992`, `833ceb9` |

`test/utils/ProgramBuilder.ts` remains unchanged template code. New
`contracts/BreakwaterAMM.sol` is derived from the template's AquaAMM and marks
that origin/date in its source. Other project-specific files and AI assistance
are catalogued in [AI_DISCLOSURE.md](AI_DISCLOSURE.md).

The inherited `hardhat.config.ts`, `.env.example`, `package.json`, and `yarn.lock`
also have project-specific configuration changes; their exact dates and patches
are available with `git log -p -- <path>`. These include pinned fork setup,
dependency migration, and public Sepolia deployment configuration. Notices were
updated on September 7, 2026; the upstream license texts remain unchanged.

## License preservation

Aqua and SwapVM use Degensoft source licenses rather than a standard permissive
license. Their license files and third-party notices must remain intact. New
Breakwater code must not imply that the upstream components are relicensed.
