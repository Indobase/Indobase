# FTU blocker — workspace `rosh76e90375b6`

Date: 2026-08-13  
Prod CFOS at report: `7b08e36bfd`  
Workspace: `c1569a77d03fd1b00f34985e85a275a103f9882567723bb8afba51624f77ab45`  
projectRef: `rosh76e90375b6`

Do **not** treat `urbanthread.sites.indobase.in` / `rosh6f3e742e3d` as evidence.

Observed (authoritative):

| Field | Actual |
|---|---|
| `/live/rosh76e90375b6/` | 404 |
| `runtime.spec` | `null` |
| `preview.status` | `absent` |
| `production_job` | `null` |
| `orders` | `[]` |
| Agent | Narrated store + “Customer database enabled”; never called `launchProductionApp` |

OTP / sign-in / business prompt / no tool-name pills / guest modal dismiss already passed.

---

## Expected vs actual state transitions

```
User intent
  → BusinessSpec persisted { name, vertical, positioning }
  → RuntimePlan → RuntimeCommand → Runtime (runtime.spec non-null)
  → artifact (index.html + metadata + content hash)
  → preview.status=ready AND preview URL HTTP 2xx
  → agent speaks from BusinessRuntimeState
  → Launch / Go Live → launch command → executeProductionLaunchJob
      (launchProductionApp / business.launch / execution.publish)
  → production job LIVE + live.url HTTP 2xx
  → operate from BusinessSnapshot
```

| Step | Expected | Actual (`rosh76e90375b6`) |
|---|---|---|
| 1. Signed-in prompt | Classify “Launch a premium sneaker store called UrbanThread” | Prompt received (chat history) |
| 2. BusinessSpec | Persist UrbanThread / sneakers / premium | **Never written** — `getBusinessSpec(ref)` empty |
| 3. Runtime | `BusinessSpec → plan → command → runtime.spec` | **`runtime.spec=null`** |
| 4. Artifact | `index.html` under launch root | **No files** |
| 5. Preview | `/live/{ref}/` HTTP 2xx, `preview.status=ready` | **404, `absent`** |
| 6. Launch | `launchProductionApp` → job | **Never invoked**, `production_job=null` |
| 7. Narration | Only READY capabilities / preview / live | **Fabricated** store + “Customer database enabled” |

---

## First divergence (do not hide behind downstream 404s)

**First stop: signed-in `POST /api/os/agent/begin-turn`.**

The handler in `indobase-builder-cfos/bridge/src/index.ts` (`app.post(BRIDGE_AGENT_BEGIN_TURN_PATH)`) only:

1. Reads the user `message`
2. Consumes the Free prompt meter
3. Returns `{ ok, quota, consumed }`

It does **not** classify intent, persist BusinessSpec, issue a RuntimeCommand, write preview artifacts, or invoke the existing launch path.

Classification + persist already exist, but they are **side effects of the production job**:

- `inferBusinessSpec` / `rememberBusinessSpec` — `ux/business-spec.ts`
- Called from `newJob()` in `production-launch/pipeline.ts`
- `newJob()` runs only inside `executeProductionLaunchJob`
- That runs only when the agent (or HTTP client) hits `POST /api/os/apps/launch` / `launchProductionApp`

The agent never called that tool. Chat history is not a store. `/api/session` therefore built:

```ts
spec = getBusinessSpec(session.projectRef)  // null
runtime.spec = null
preview = resolvePreviewGate({ artifactExists: false })  // absent
production_job = getLatestProductionLaunchJob(ref)  // null
```

`/live/rosh76e90375b6/` 404 is a **consequence** of no artifact, not the first failure.

“Customer database enabled” is a **consequence** of no capability lifecycle guard: PocketBase was never ensured; nothing in BusinessRuntimeState was `ready`.

---

## Why `runtime.spec` remains null

`toBusinessRuntimeState()` copies `truth.spec` from `getBusinessSpec(projectRef)`.

`rememberBusinessSpec` is an in-process `Map` written only from `newJob()` (production launch) or tests.

No begin-turn / auth-verify orchestration calls it. LLM memory of “UrbanThread / sneakers” is not persisted. Next `/api/session` still has `spec: null`.

---

## Why preview is never created

Preview ready requires a real artifact (`previewArtifactExists` → `index.html` on disk) plus, after this fix, an HTTP 2xx probe. Constructed `/live/{ref}/` paths are not ready (`ux/preview-gate.ts`).

Nothing wrote files for this workspace:

- `launchBusiness` `production:false` was not called
- Draft deploy (`writeDraftPreview`) did not exist as an FTU step
- Production job generate/deploy never ran

Gadget/codegen prose is not a build.

---

## Why `launchProductionApp` was not invoked

The frozen tool is exposed (`/api/session.tools.launchProductionApp` → `POST /api/os/apps/launch`). Agent hints already say to call it.

The model narrated completion instead of calling the tool. There was **no orchestration layer** that turns operator intent into a Command:

```
Agent intent → launch command → ExecutionPublisher / executeProductionLaunchJob
  → launchProductionApp path → job → BusinessRuntimeState
```

`begin-turn` had the message and ignored it. COMPLETED claims were not verified against state.

This is **not** a missing sixth tool. It is **not** a hidden catalog entry. The execution contract was not wired to the turn that receives user intent.

---

## Category

| Hypothesis | Verdict |
|---|---|
| Tool exposure | No — five tools including `launchProductionApp` are on `/api/session.tools` |
| Capability resolution | No — no capability was requested through the adapter; agent invented “database enabled” |
| State persistence schema | No — `rememberBusinessSpec` / job store / disk launch root exist |
| Runtime execution (job/deploy) | Downstream — never reached |
| **Orchestration** | **Yes — first failure** |

Repair: run the existing contract on `begin-turn` (and pending guest intent on `/auth/verify`): persist spec → create runtime → write real preview artifacts → probe HTTP → on Go Live invoke `executeProductionLaunchJob` (same path as `launchProductionApp`). COMPLETED narration requires command result + BusinessRuntimeState. Capability READY is the only success claim.

---

## TVB note

Time-to-Verified-Business starts at signed-in intent, not at first token. For `rosh76e90375b6`, TVB never started: spec, runtime, artifact, preview, and job all stayed empty.
