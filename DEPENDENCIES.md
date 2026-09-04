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

## License note

Aqua and SwapVM use Degensoft source licenses rather than a standard permissive
license. Their license files and third-party notices must remain intact. New
Breakwater code must not imply that the upstream components are relicensed.
