# Indobase Design — Architecture Specification

**Status:** Binding engineering spec for Gen 2+ evolution  
**Audience:** Anyone changing the Design editor, document persistence, AI draft path, or renderers  
**Source today:** `indobase-design-v2/` (Gen 1 — Fabric.js as canonical canvas JSON)  
**Product framing:** [INDOBASE-DESIGN.md](./INDOBASE-DESIGN.md) (features / parity / deploy)  
**Hosts:** `design.indobase.in` · `design.indobase.fun` (Vyom `.249`)

This is **not** a marketing document. It freezes decisions that are expensive to reverse.
Read this before touching the editor core.

---

## 1. Core principles

1. **Document is source of truth.** The `DesignDocument` graph owns identity, geometry, style, hierarchy, variables, and metadata. Renderers are projections.
2. **Fabric is a renderer, not a database.** User gestures never mutate Fabric as authoritative state. Gestures emit **document commands**; the document updates; the renderer reflects.
3. **One-way render first.** `Document → Fabric` is required. `Fabric → Document` is forbidden as a sync path. (Migration importers that convert legacy Fabric JSON *once* into a document are allowed and must be explicit, versioned, and offline from the live edit loop.)
4. **AI must never emit Fabric JSON.** AI plans and emits **document commands** (or a document graph that compiles to commands). The renderer is not an AI I/O format.
5. **Stable node IDs forever.** Every node has an immutable ID (`node_<ulid>`). Comments, variables, assets, AI, collab, plugins, and animations reference IDs—never ephemeral Fabric object names.
6. **Commands over mutations.** Editing is expressed as an explicit command API. Undo/redo is command history (or inverse commands), not canvas snapshots of every pointer move.
7. **Latency-sensitive editor ≠ Builder event sourcing.** Share *concepts* (commands, IDs, canonical models) with Builder. Do **not** event-source every mousemove or snapshot every frame unless collaboration / offline conflict resolution demands it.
8. **Shared platform services, distinct product models.** Auth, assets, AI orchestration, jobs, and publish pipelines should converge with Studio / Builder / Marketing. The Design document model stays Design-owned.
9. **Evolve by generation, not feature pile-on.** Gen 2 (document model) before CRDT, WebGL, or plugin marketplaces.
10. **Indobase branding only.** Zero user-visible Canva / Penpot / Fabric naming in product UI.

---

## 2. Architectural generations

| Gen | Name | Source of truth | Key unlock |
|-----|------|-----------------|------------|
| **1** | Current product *(shipped)* | Fabric JSON in Postgres | Templates, brand, AI draft→Fabric, export, comments, share |
| **2** | Document platform | `DesignDocument` graph | Renderer swap, AI commands, components/tokens foundation |
| **3** | Collaborative editor | Document + CRDT/OT | Presence, live selection, conflict resolution |
| **4** | Design platform | Workspace graph + shared assets | Brand/asset propagation across docs |
| **5** | AI-native design system | Intent → planner → commands | Layout/brand reasoning without redrawing JSON |

**We are Gen 1.** Gen 2 is the hinge. Do not start Gen 3–5 work that assumes Fabric remains canonical.

---

## 3. Ownership boundaries

### Design owns

- `DesignDocument` schema + versioning
- Command API + command history (editor)
- Interaction layer (gesture → command)
- Renderer adapters (`Document → Canvas` / later SVG / PDF / WebGL)
- Editor UX (home, tools rail, canvas chrome)
- Design-specific persistence tables for documents / pages / revisions

### Indobase platform owns (share; do not fork per product)

| Service | Today | Target |
|---------|--------|--------|
| Auth / roles | Studio SSO JWT (`aud=indobase-design`) | Keep; same secret contract |
| AI orchestration | Studio OpenRouter + `design_ai_used` quota | Planner emits **commands**, still via Studio |
| Assets | Design-local uploads + Openverse | Shared asset platform (Design, Builder, Marketing) |
| Jobs | Inline export / thumbs | Shared job queue (export, AI, thumbs, import) |
| Publish | Suite handoffs | Shared deployment / marketing publish paths |
| Billing / orgs | Studio `saas.*` | Unchanged |

### Explicit non-goals (near term)

- Replacing Fabric in Gen 2 (adapter only)
- Full CRDT / multiplayer before Gen 2 is stable
- Event sourcing every interaction
- Cloning Canva's internal org structure feature-for-feature
- AI writing Fabric object trees

---

## 4. Domain model (Gen 2 target)

### 4.1 Hierarchy

```text
DesignDocument
  └── Page[]
        └── Frame[]          # artboard / page root container
              └── Node[]     # tree: Group | Object | ComponentInstance | …
```

Conceptual tree:

```text
Document → Pages → Frames → Groups → Nodes → Properties
```

### 4.2 Identity

| Entity | ID format | Mutability |
|--------|-----------|------------|
| Document | `dsn_<ulid>` | Immutable |
| Page | `page_<ulid>` | Immutable |
| Frame | `frm_<ulid>` | Immutable |
| Node | `node_<ulid>` | Immutable |
| Asset ref | `ast_<ulid>` (platform) or design-local until shared | Immutable |
| Revision | `rev_<ulid>` | Immutable |
| Variable | `var_<ulid>` | Immutable |
| Token | `tok_<ulid>` | Immutable |
| Component | `cmp_<ulid>` | Immutable |
| Instance | `ins_<ulid>` | Immutable |

**Rules**

- IDs are assigned at create time and **never reused or rewritten**.
- Soft-delete sets `deletedAt`; IDs remain addressable for history / comments.
- Fabric `name` / object `id` fields are **renderer-local** and must not be persisted as canonical identity.

### 4.3 `DesignDocument` (canonical schema sketch)

Versioned JSON (Postgres `jsonb` or normalized tables + jsonb blob). Schema version integer on the document root.

```ts
/** Engineering sketch — freeze via ADR before coding. */
type Ulid = string;

interface DesignDocument {
  schemaVersion: number;          // bump on breaking graph changes
  id: Ulid;                       // dsn_…
  projectRef: string;             // Studio project scope
  name: string;
  createdAt: string;              // ISO-8601
  updatedAt: string;
  revision: number;               // monotonic doc revision (not every mouse tick)
  pages: Page[];
  variables?: Variable[];         // Gen 2.5+
  tokens?: TokenRef[];            // Gen 2.5+
  components?: ComponentDef[];    // after assets
  meta?: Record<string, unknown>;
}

interface Page {
  id: Ulid;                       // page_…
  name: string;
  sortOrder: number;
  width: number;                  // px at 1x
  height: number;
  frames: Frame[];                // usually one primary frame early on
}

interface Frame {
  id: Ulid;                       // frm_…
  name?: string;
  /** Children are ordered back→front (paint order). */
  children: NodeId[];
  background?: Paint;
}

type NodeId = Ulid;

type Node =
  | GroupNode
  | TextNode
  | ShapeNode
  | ImageNode
  | PathNode
  | ComponentInstanceNode;

interface NodeBase {
  id: NodeId;                     // node_…
  type: string;
  name?: string;
  parentId: Ulid | null;          // frame or group
  /** Affine transform in parent space. */
  transform: Transform2D;
  locked?: boolean;
  visible?: boolean;
  opacity?: number;               // 0..1
  blendMode?: string;
  constraints?: Constraints;      // pin / scale behavior within frame
  meta?: Record<string, unknown>;
}

interface Transform2D {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;               // degrees
  scaleX?: number;                // default 1
  scaleY?: number;
}

interface Constraints {
  horizontal: 'min' | 'max' | 'center' | 'stretch' | 'scale';
  vertical: 'min' | 'max' | 'center' | 'stretch' | 'scale';
}

interface GroupNode extends NodeBase {
  type: 'group';
  children: NodeId[];
}

interface TextNode extends NodeBase {
  type: 'text';
  characters: string;             // may contain {{var}} placeholders
  textStyle: TextStyle;
}

interface ShapeNode extends NodeBase {
  type: 'rect' | 'ellipse' | 'line' | 'polygon';
  fills: Paint[];
  strokes: Stroke[];
  cornerRadius?: number | number[];
}

interface ImageNode extends NodeBase {
  type: 'image';
  assetId: Ulid;                  // reference — never embed binary in graph
  crop?: { x: number; y: number; w: number; h: number };
  filters?: ImageFilters;
}

interface PathNode extends NodeBase {
  type: 'path';
  pathData: string;               // SVG path in local space
  fills: Paint[];
  strokes: Stroke[];
}

interface ComponentInstanceNode extends NodeBase {
  type: 'componentInstance';
  componentId: Ulid;
  overrides?: Record<string, unknown>;
}

interface ComponentDef {
  id: Ulid;                       // cmp_…
  name: string;
  /** Root node tree for the component definition. */
  root: NodeId;
  nodes: Record<NodeId, Node>;
}

interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight?: number | string;
  lineHeight?: number | string;
  letterSpacing?: number;
  color: Paint;
  align?: 'left' | 'center' | 'right' | 'justify';
}

type Paint =
  | { type: 'solid'; color: string }           // prefer tokenRef when tokens land
  | { type: 'token'; tokenId: Ulid }
  | { type: 'linearGradient'; stops: { offset: number; color: string }[]; angle: number }
  | { type: 'image'; assetId: Ulid };

interface Stroke {
  paint: Paint;
  weight: number;
  align?: 'center' | 'inside' | 'outside';
}

interface ImageFilters {
  brightness?: number;
  contrast?: number;
  saturation?: number;
}

interface Variable {
  id: Ulid;
  key: string;                    // e.g. "Name"
  valueType: 'string' | 'number' | 'boolean' | 'color' | 'asset';
  defaultValue?: unknown;
}

interface TokenRef {
  id: Ulid;
  kind: 'color' | 'font' | 'spacing' | 'radius';
  name: string;
  value: unknown;
}
```

### 4.4 Every node must answer

| Question | Where it lives |
|----------|----------------|
| How identified? | `id` (immutable ULID) |
| How transformed? | `transform` (+ parent chain) |
| How styled? | type-specific style / `fills` / `strokes` / `textStyle` / tokens |
| How constrained? | `constraints` |
| How selected? | Editor selection set of `NodeId[]` (UI state, not document) |
| How versioned? | Document `revision` + persisted `DesignRevision` snapshots |

### 4.5 What is *not* in the document

- Pointer / hover / marquee UI state
- Fabric object references
- Derived selection handles
- Ephemeral guide lines (may be session-only)
- Binary asset bytes (store asset refs + platform blob store)

---

## 5. Command model

Commands are the **only** write API for the live document.

### 5.1 Interaction loop (mandatory)

```text
User interaction
      ↓
Interaction layer (hit-test / gesture)
      ↓
Document Command
      ↓
Document store (apply + history)
      ↓
Renderer adapter (Document → Fabric)
      ↓
Canvas paints
```

### 5.2 Initial command set (Gen 2)

```text
CreateNode
DeleteNode
MoveNode
ResizeNode
RotateNode
ReorderNode          # z-index / sibling order
ReparentNode
GroupNodes
UngroupNodes
ApplyStyle
SetText
SetVariable
BindVariable         # node prop ← variable
ReplaceAsset
SetConstraints
CreatePage
DeletePage
DuplicateNode
ApplyBrandKit        # expands to style/asset commands
```

Each command:

- Targets IDs only
- Is serializable JSON
- Declares whether it is **coalesceable** (e.g. continuous drag → one history entry on pointer-up)
- Provides inverse data for undo **or** is recorded with a snapshot boundary

### 5.3 History policy (Gen 2 — lightweight)

| Event | History behavior |
|-------|------------------|
| Pointer-down → drag → pointer-up | Coalesce into one `MoveNode` / `ResizeNode` |
| Typing burst | Coalesce `SetText` until blur / idle |
| Discrete actions (delete, group, align) | One command each |
| Autosave | Persist document at revision N; **not** every coalesce tick |
| Explicit "Version" / restore | `DesignRevision` row |

**Do not** store a full document snapshot per mousemove.  
**Do not** require a global event-sourced log for Gen 2.

### 5.4 Apply semantics

```text
apply(doc, command) → { doc', inverse? }
```

- Pure function preferred for unit tests
- Server may re-validate on save (authz, schema version)
- Reject commands that reference unknown IDs

### 5.5 Command envelope (sketch)

```ts
interface DocumentCommand {
  commandVersion: 1;
  type: string;                 // e.g. "MoveNode"
  commandId: string;            // ulid for idempotency / telemetry
  issuedAt: string;             // ISO-8601
  coalesceKey?: string;         // same key merges until commit
  payload: Record<string, unknown>;
}
```

Example:

```json
{
  "commandVersion": 1,
  "type": "MoveNode",
  "commandId": "cmd_01HX…",
  "issuedAt": "2026-08-04T20:00:00.000Z",
  "coalesceKey": "drag:node_01HX…",
  "payload": { "nodeId": "node_01HX…", "x": 120, "y": 80 }
}
```

---

## 6. Renderer abstraction

### 6.1 Interface

```text
Document Graph
      ↓
RendererAdapter.render(doc, viewState) → void
RendererAdapter.hitTest?(point) → NodeId | null   # optional; may live in interaction layer
```

View state (non-document): zoom, pan, selection IDs, hovered ID, active tool.

### 6.2 Fabric adapter rules

| Allowed | Forbidden |
|---------|-----------|
| Build / update Fabric objects from document nodes | Treating Fabric `object:modified` as source of truth |
| Map `node_*` → Fabric object via side table | Persisting Fabric JSON as canonical |
| Destroy/rebuild dirty subgraphs | Round-tripping edits Fabric→Document in the hot path |
| One-shot **importer** for Gen 1 → Gen 2 migration | Continuous bidirectional sync |

**Asymmetry:** `Document → Fabric` is the live path. Fabric mutations from tools must be intercepted and converted to commands *before* they become authoritative—or tools should draw previews only until commit.

Recommended interaction strategy:

1. During drag: optional ephemeral preview overlay **or** optimistic local command apply.
2. On commit: finalize command into history.
3. Adapter reconciles Fabric tree to document (diff by node id).

### 6.3 Future renderers (Gen 4+)

Same document feeds:

- Canvas / WebGL preview
- SVG export
- PDF export
- Server-side raster workers

Export becomes "render document with adapter X", not "call Fabric.toDataURL only".

---

## 7. AI integration

### Hard rule

> **AI must never emit Fabric JSON.**

### Target pipeline

```text
Intent (prompt / tool)
      ↓
Planner (Studio / shared AI orchestration)
      ↓
Document Commands[]  (or DesignDocument patch compiled to commands)
      ↓
Document apply
      ↓
Renderer
```

### Gen 1 → Gen 2 migration for AI

| Today | Target |
|-------|--------|
| OpenRouter returns Fabric JSON | Returns command list or document graph |
| Client loads JSON into canvas | Client/server applies commands |
| Quota on Studio | Unchanged |

Until the planner is ready, a **temporary compiler** may translate model output → commands **inside the Design service**, never storing Fabric as canonical. Delete that compiler once models emit commands natively.

### AI must reason about

Spacing, typography, hierarchy, color, alignment, components, brand tokens—as **operations on the graph**, not redraws of opaque JSON blobs.

---

## 8. Document lifecycle

```text
Create (blank | template | AI)
   ↓
Edit (commands + coalesce history)
   ↓
Autosave (revision++)
   ↓
Explicit version / share / export / bulk
   ↓
Archive / delete (soft)
```

### Persistence (target)

| Store | Contents |
|-------|----------|
| `design_documents` | Metadata + `schema_version` + current graph jsonb (or normalized nodes) |
| `design_revisions` | Periodic / explicit snapshots for restore |
| `design_assets` → platform assets | Bytes + CDN URL; document holds `assetId` only |
| Session cookie | Auth only |

### Gen 1 compatibility

Existing rows store `canvas_json` (Fabric). Migration plan:

1. Ship Gen 2 schema alongside.
2. On open: if only Fabric blob exists → run **offline importer** → `DesignDocument`, write back, keep Fabric blob read-only backup until confidence.
3. New writes: document graph only.
4. Drop Fabric-as-canonical after soak.

---

## 9. Versioning

| Layer | Mechanism |
|-------|-----------|
| Schema | `DesignDocument.schemaVersion` + migration functions |
| Document content | Monotonic `revision` on successful save |
| User-facing history | `DesignRevision` snapshots (sparse) |
| Commands | `commandVersion` field for forward-compatible clients |

Breaking schema changes require a written migration note in this doc or an ADR under `docs/adr/`.

---

## 10. Shared platform vs Design (strategic)

Indobase's advantage is an **AI-first business suite**, not a standalone design SaaS.

**Share:** asset platform, AI orchestration, Studio auth/roles, background jobs, publish/handoff.  
**Do not force:** Builder's long-running agent event model onto Design's interactive loop.

Builder = async, repair, preview, deploy.  
Design = sub-frame latency, gesture coalescing, retained renderer.

Shared vocabulary (commands, stable IDs, canonical models) is enough.

---

## 11. Roadmap (engineering priority)

Reordered for dependency hygiene:

| Order | Work | Why |
|-------|------|-----|
| 1 | **Document model** | Hardest to retrofit |
| 2 | **Stable node IDs + command API** | Everything else references these |
| 3 | **Asset references** (not embedded bytes) | Cleaner components / AI / share |
| 4 | **Components** | Instances + overrides on stable nodes |
| 5 | **Variables / tokens** | Brand + bulk + personalization |
| 6 | Collaboration (CRDT/OT) | Needs stable graph + commands |
| 7 | Background jobs | Export / AI / thumbs at scale |
| 8 | Plugin API | Document commands as extension surface |
| 9 | Multi-renderer / leave Fabric | Only after document is center |

Feature work (templates, stock, export polish) may continue on Gen 1 **only** if it does not deepen Fabric-as-canonical coupling. Prefer additive UI that can retarget to commands later.

---

## 12. Gen 1 inventory (truth)

Current `indobase-design-v2` approximates:

```text
User → Preact UI → Fabric canvas → canvas_json → Postgres → Export
```

Also: Studio SSO, templates seed, brand kit, AI draft (Fabric-shaped), data merge, uploads, Openverse, comments, share links, suite handoffs.

**Debt Gen 2 pays down:** Fabric JSON as schema, AI→Fabric lock-in, weak identity, no command boundary, no renderer interface.

---

## 13. Acceptance criteria for "Gen 2 done"

1. Opening a design loads a `DesignDocument`, not Fabric JSON as authority.
2. Drag / resize / type go through commands; undo uses command history.
3. Fabric adapter can be blown away and rebuilt from document without loss of canonical fields.
4. AI path produces commands (or document patches), never persisted Fabric trees.
5. Every node has a stable `node_*` ID referenced by at least comments + selection + save round-trip.
6. Legacy Fabric documents migrate via one-shot importer.
7. This document remains the contributor entrypoint; feature matrix stays in `INDOBASE-DESIGN.md`.

---

## 14. What we are deliberately *not* doing yet

- Scaffolding adapters before the schema is reviewed
- Bidirectional live Fabric↔Document sync
- Event sourcing pointer streams
- Replacing Fabric in the same milestone as the model
- Multiplayer CRDT
- Plugin marketplace

---

## 15. Next steps (process)

1. Review this spec with anyone who will touch editor/AI/persistence.
2. ADR: freeze `schemaVersion: 1` field list (trim/extend the sketch in §4).
3. ADR: command JSON envelope + coalesce rules.
4. Only then: implement document store + one-way Fabric adapter + gesture→command wiring.
5. Migrate AI compiler last among Gen 2 code paths (or first behind a flag) so no new Fabric-emitting AI lands.

---

## Related docs

- [INDOBASE-DESIGN.md](./INDOBASE-DESIGN.md) — product parity, deploy, how-to
- [INDOBASE-DESIGN-V2.md](./INDOBASE-DESIGN-V2.md) — short engineering pointer / image pin
- [MARKETING.md](./MARKETING.md) — suite handoffs from Studio
- Design SSO contract: `apps/studio/lib/api/saas/design-launch.ts` (`aud=indobase-design`)
