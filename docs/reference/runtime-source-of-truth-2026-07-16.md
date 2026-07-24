# StarCanvas Runtime Source of Truth (2026-07-16)

## Canonical Write Target

| Field | Fact |
| --- | --- |
| Source root | `/Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas` |
| Git | `codex/starcanvas-staged-split` / `a41305aa0662b40e919786d0bdbfd0b6b6f2e35f` |
| Remote | `git@github.com:732642856/starcanvas.git` |
| Worktree | 207 changed/untracked paths; shared in-progress work, never reset or copied over |
| Runtime | `next-server` PID 9833, cwd `apps/web`, listening on `http://127.0.0.1:3000` |

`/Users/wuyongnaren/Desktop/StarCanvas-v2` is a symlink to the canonical root, not a
second checkout.

## Mandatory Read Order

1. Read `docs/reference/error-ledger.md`, this file, and
   `docs/reference/current-capability-map.md`.
2. Confirm canonical root, branch, and dirty state with `git worktree list`,
   `git branch --show-current`, and `git status --short`.
3. Confirm the live listener with `lsof`; pass that exact address to browser tests as
   `STARCANVAS_E2E_BASE_URL`.
4. Treat all other paths below as evidence-only until file-level comparison, test, and an
   explicit integration decision exist.

Never start another Next dev process while the canonical process owns `.next`.

## Local Copies and Fragments

| Location | Evidence | Classification |
| --- | --- | --- |
| `01_MAIN_主干/starcanvas-opendraft-screenwriter` | `codex/opendraft-screenwriter` / `9672c58` | Dedicated worktree; do not write during canvas work. |
| `02_WORKTREES/skill-workbench-kernel*` | `be04a5d`, `cbec72d` | Historical integration worktrees; evidence-only. |
| `Documents/Codex/.../2026-06-18/.../work/starcanvas` | `main` / `026f950`, clean | Same-remote ancestor; no wholesale import. |
| `Documents/Codex/.../work/starcanvas-active` | `feat/agent-asset-mentions` / `9672c58`, 19 dirty | Ancestor checkout with local edits; review individually only. |
| `Documents/Codex/.../2026-06-21/.../work/starcanvas` | `aeb5c46`, 261 dirty | Historical dirty snapshot; never copy wholesale. |
| `01_MAIN_开发版/starcanvas` | `master` / `b747129`, remote `git@github.com:732642856/-ai-.git` | Different repository; archaeology only. |
| `Desktop/星轨画布文件库/star-canvas-files` | No package manager/Git metadata | Static May-era fragment; not buildable. |
| `GitRepoQuarantine`, `ProjectShelf`, `02_ARCHIVE_*`, `03_REFERENCES_*` | Archives and upstream clones | Non-runtime; never build/deploy. |
| `Documents/星轨画布` | Notes and patches only | Not the application root. |

The 2026-05-24 `00_INDEX_总索引` records name a removed path, old remote, old branch, and
obsolete port. Historical evidence only. Do not use `CURRENT_MAIN_PROJECT.md` to run,
deploy, or locate StarCanvas.

## Runtime, Config, and Skills

- Canonical `/api/ai/health`, `/api/ai/config`, and `/api/ai/local-skills` returned HTTP 200.
  This proves local routes are running, not that paid providers are healthy.
- No repo-root `.env*` was found. Provider settings may still be process environment or
  browser-session overrides. Keys were not read or logged.
- Paid story runners now use `scripts/local-api-base.mjs`: explicit
  `STARCANVAS_LOCAL_API_BASE` wins; default is `http://127.0.0.1:3000`; no legacy-port
  auto-probing.
- LocalSkillRegistry currently exposes 166 metadata records from the three approved home
  directories; 29 have risk flags. Content injection is `false`. A model receives SKILL.md
  body only after explicit content enablement and selection; audit records store metadata,
  hash, source, mode, truncation, and risk flags, never the full body.
- `03_REFERENCES_参考资料` is not a LocalSkillRegistry source, so reference-project skills
  cannot be silently injected into Crew runs.

## "太子替我背黑锅" Delivery Facts

| Evidence | Fact |
| --- | --- |
| `artifacts/太子替我背黑锅-delivery-package-r2v-final.zip` | `unzip -t` reports no errors. |
| Delivery `manifest.json` | `delivery_ready_reference_video`; 24.71 s, 720x1280, 24 fps master. |
| R2V v2 manifest | Eight Vidu reference-to-video clips; old shot-05/R2V material remains archived for rollback. |
| R2V v2 master | 24.71 s, 720x1280, 24 fps; shot 05 now visibly shows dagger-to-wok contact and a small spark. |
| Batch A summary | Six image requests planned; recorded production request failed, then batch stopped. |
| Known limitation | Temporary local single-voice narration; no character voices, foley, or music. |

A watchable all-R2V reference delivery exists, but it is not picture-locked final film. Copse
image production at target dimensions remains blocked by upstream `524`; do not spend another
image batch before a different provider path passes a target-size single-request proof.

## Remaining Gates

1. Establish one stable image production path supporting required references, or explicitly
   accept a lower-consistency text-only fallback. Prove it with one target-size request.
2. Replace temporary narration and add sound design after picture lock.
3. Re-run queue, export, and playback from canonical runtime; paid calls remain explicit.

## Tooling Limits

- `jq` and `ffprobe` are absent. Audit used Node JSON parsing and macOS media metadata.
- Scan scope is user project locations and known archives, not unrelated system folders.
