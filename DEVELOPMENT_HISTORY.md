# Development history

This retrospective was compiled on September 7, 2026 from the repository history
and recorded project feedback. It distinguishes upstream reuse, AI-assisted
implementation, and human direction; it is not an original spec or complete
prompt transcript. See [AI_DISCLOSURE.md](AI_DISCLOSURE.md).

## Implementation timeline

All times below are UTC. The event's recorded kickoff was September 4 at 16:00 UTC.
Git timestamps document this repository's history, not independent proof of
every prior research activity.

| Date | Commit | Development record |
| --- | --- | --- |
| September 4, 17:05 | `a963dd8` | Initialize Breakwater project docs and disclosure. |
| September 4, 17:05 | `ad719fc` | Import official template pinned in `DEPENDENCIES.md`; do not count imported code as new work. |
| September 4, 17:23 | `cb7df26`, `9ea0969` | Add AI-assisted guard/position and rejection/unwind tests. |
| September 4, 18:04–18:19 | `999d992`, `833ceb9`, `d619e1c` | Migrate to SwapVM v1.0.2, harden oracle-bound execution, and record canonical fork evidence. |
| September 4, 18:28–19:29 | `29018a5`, `e254c72` | Commit design guidance and public taker interface. |
| September 5, 13:14–13:28 | `2bde500`, `8058bbf` | Commission fixed-feed Sepolia market and add wallet disconnect after user feedback. |
| September 7, 15:59 | `a36d121` | Automate quotes and clarify transaction progress after public-swap feedback. |
| September 7, 17:13 | `8757567` | Add reproducible pinned-block deployed guard check. |

## Human feedback that changed the product

- Qdee required a separate project wallet and supplied the testnet funding used
  for the public deployment.
- Qdee reported that there was no way to disconnect the wallet. The resulting
  change added an app disconnect flow while preserving pending-swap tracking.
- After supplying two successful public Sepolia swap receipts, Qdee requested
  automatic quotes instead of a required refresh-button click and clearer
  handling of slow transaction confirmation. The implemented release debounces
  quote input, invalidates obsolete results, and separates wallet approval,
  submitted, and confirmed states. It does not claim to speed up block production.
- Qdee reported a smooth external test and is collecting follow-up evidence.
  That report is not yet independently verified completion or demand evidence.

## Source boundaries

The published `DESIGN.md`, commit history, tests, deployment records, dependency
pins, and this disclosure explain the work that exists. Private operational
checklists are not product code. A retrospective must not be substituted for
original specs/prompts if the organizer requires those source artifacts. No
private wallet keys, authentication material, or unrelated project conversations
belong in the public development record.
