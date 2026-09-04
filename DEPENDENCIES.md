# Dependency snapshot

Snapshot recorded after ETHOnline 2026 kickoff on 2026-09-04.

## Baseline used by the spike

| Dependency | Source | Pin |
| --- | --- | --- |
| 1inch SwapVM template | https://github.com/1inch/swap-vm-template | `e9f8def43c7e8fbe5d8453df2e0a83e2be17c38b` |
| Aqua, as pinned by the template | https://github.com/1inch/aqua | `6f05aa1ac2dcf701b0e086ad5e7606515f1fa454` |
| SwapVM, as pinned by the template | https://github.com/1inch/swap-vm | `b44977a1c7744c9caa6b7974d9b638ed4983cfd3` |
| Solidity | Hardhat configuration | `0.8.30` |

The template pins are kept together for the baseline reproduction. They must not
be mixed with current `main`, whose opcode dispatch differs from the deployed
and SDK-compatible release surface.

## Current stable references

These are recorded for comparison and are not silently substituted into the
template baseline:

| Dependency | Release | Commit |
| --- | --- | --- |
| Aqua | `v1.0.0` | `81c26e4619ce21556ab02b3284ee2685de21fb18` |
| SwapVM | `v1.0.2` | `32c687c2b73101fc26549e48fa1ff8a4d73afbac` |

## License note

Aqua and SwapVM use Degensoft source licenses rather than a standard permissive
license. Their license files and third-party notices must remain intact. New
Breakwater code must not imply that the upstream components are relicensed.
