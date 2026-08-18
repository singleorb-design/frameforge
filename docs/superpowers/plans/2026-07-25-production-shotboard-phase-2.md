# Production Shotboard Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen shot workbench where users edit structured shots, bind versioned character/scene/prop assets, review blockers, receive an explainable recommendation among four video-control modes, and explicitly approve the shot and generation plan.

**Architecture:** Extend each `Shot` with revision history, production status, blockers, and an optional versioned generation plan. Keep all mutations in pure functions under `web/src/lib/production/`; the React workbench receives a `ProductionProject` and emits one updated project per user command. Open the workbench from a shot-node double click and persist updates through the existing project production/history path.

**Tech Stack:** React 19, TypeScript, Ant Design 6, Tailwind CSS 4, Zustand 5, existing canvas theme and production domain.

## Global Constraints

- Page copy stays Chinese.
- Do not generate control frames, video, Jimeng prompts, task sheets, candidate videos, or Jianying packages in Phase 2.
- Every shot keeps `startState -> action -> endState`.
- The mode engine recommends and explains; the user must explicitly confirm.
- Changing editable shot fields or asset bindings increments the shot revision and Shotboard version, appends a previous-state history entry, resets shot approval, and marks the current plan unapproved.
- Changing only the selected recommended mode still creates a new plan version but does not rewrite shot narrative fields.
- Asset bindings pin explicit record versions.
- Error blockers prevent shot or plan approval. Warning blockers remain visible but can be accepted.
- Use the existing `CanvasProject.production` as the only persisted source.
- Do not add dependencies or a second store.
- Do not run typecheck, build, tests, or formatting; use focused source inspection and `git diff --check`.
- Every commit ends with `Co-authored-by: TRAE CLI <noreply@bytedance.com>`.

---

### Task 1: Extend Shot Revision, Status, Plan, and Blocker Types

**Files:**
- Modify: `web/src/types/production.ts`
- Modify: `web/src/lib/production/generated-production.ts`

**Produces:**

```ts
export type ShotProductionStatus =
    | "draft"
    | "shot-approved"
    | "plan-approved"
    | "control-assets-ready"
    | "task-published"
    | "external-generating"
    | "candidate-review"
    | "edit-ready"
    | "blocked";

export type ShotGenerationMode =
    | "first-frame"
    | "first-last-frame"
    | "multi-frame"
    | "omni-reference";

export type ProductionBlocker = {
    code: string;
    message: string;
    fieldPath?: string;
    assetId?: string;
    severity: "warning" | "error";
};

export type RequiredControlAsset = {
    kind:
        | "first-frame"
        | "last-frame"
        | "keyframes"
        | "identity-reference"
        | "scene-reference"
        | "prop-reference"
        | "action-reference"
        | "camera-reference"
        | "audio-reference";
    label: string;
    required: boolean;
    reason: string;
};

export type ShotGenerationPlan = {
    version: number;
    mode: ShotGenerationMode;
    status: "recommended" | "approved";
    confidence: "high" | "medium" | "low";
    reasons: string[];
    rejectedModes: Array<{ mode: ShotGenerationMode; reason: string }>;
    requiredAssets: RequiredControlAsset[];
    risks: string[];
    confirmedAt?: string;
    updatedAt: string;
};

export type ShotRevision = {
    revision: number;
    snapshot: ShotEditableFields;
    savedAt: string;
};
```

- [ ] Add `ShotEditableFields` containing narrative purpose, emotional beat, information gain, category, framing, start/action/end, continuity notes, asset bindings, cue IDs, sound cues, duration, and edit relation.
- [ ] Change `Shot` to extend `ShotEditableFields` and add:

```ts
revision: number;
history: ShotRevision[];
status: ShotProductionStatus;
blockers: ProductionBlocker[];
generationPlan?: ShotGenerationPlan;
planHistory: ShotGenerationPlan[];
```

- [ ] In `importGeneratedProduction()`, initialize `revision: 1`, `history: []`, `blockers: []`, `planHistory: []`, and no generation plan.
- [ ] Inspect all `status: "draft"` assignments and commit:

```bash
git commit -m "feat: add shot production state

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 2: Add Pure Shot Mutation and Validation Module

**Files:**
- Create: `web/src/lib/production/shotboard-editor.ts`

**Produces:**

```ts
findShotContext(production, shotboardId, shotId): {
    shotboard: ShotboardRecord;
    shot: Shot;
    scene: StoryScene;
}

updateShot(
    production: ProductionProject,
    shotboardId: string,
    shotId: string,
    patch: Partial<ShotEditableFields>,
    now: string,
): ProductionProject

approveShot(production, shotboardId, shotId, now): ProductionProject

bindShotAssets(
    production,
    shotboardId,
    shotId,
    bindings: Pick<ShotEditableFields, "characterBindings" | "sceneBinding" | "propBindings">,
    now,
): ProductionProject

validateShot(production, shotboardId, shotId): ProductionBlocker[]
```

- [ ] Implement `snapshotShot()` to copy all editable arrays/objects without retaining mutable references.
- [ ] `updateShot()` appends the current revision snapshot, applies the patch, increments shot revision and Shotboard version, sets status to `draft`, recalculates blockers, and changes an approved plan to `recommended`.
- [ ] Limit history to the most recent 30 revisions.
- [ ] `validateShot()` emits error blockers for empty narrative purpose, start/action/end, invalid duration, missing scene binding, missing referenced asset/version, and cues that do not exist in the source breakdown.
- [ ] Emit warnings for no character bindings, no continuity notes on `continuous`/`match-cut`, target duration below 1 second or above 15 seconds, and more than three character bindings.
- [ ] `approveShot()` recalculates blockers and throws `镜头仍有阻塞问题，无法确认` when any error exists; otherwise sets `shot-approved`.
- [ ] `bindShotAssets()` delegates to `updateShot()` and never mutates records.
- [ ] Add `restoreShotRevision(production, shotboardId, shotId, revision, now)` that restores a saved snapshot as a new revision rather than deleting newer history.
- [ ] Inspect imports for React/Zustand absence and commit:

```bash
git commit -m "feat: add shotboard editor domain logic

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 3: Implement Explainable Mode Recommendation

**Files:**
- Create: `web/src/lib/production/shot-mode-recommender.ts`
- Create: `web/src/lib/production/shot-mode-labels.ts`

**Produces:**

```ts
recommendShotMode(production, shotboardId, shotId, now): ShotGenerationPlan
confirmShotPlan(production, shotboardId, shotId, mode, now): ProductionProject
requiredAssetsForMode(mode, shot): RequiredControlAsset[]
```

- [ ] Define Chinese labels for all modes, statuses, blocker severities, and asset kinds.
- [ ] Implement deterministic scoring:
  - `first-frame`: +3 for reaction/emotion-closeup/prop-detail; +2 for one short action; -3 for continuous edit relation or explicit ending anchors.
  - `first-last-frame`: +4 for continuous/match-cut; +3 when end state contains explicit landing/change terms such as `最终/落在/变为/睁眼/起身/打开/关闭/转身`; +2 for reveal/action.
  - `multi-frame`: +4 when action contains three or more ordered clauses split by `随后/然后/接着/最终`; +3 for transformation/ritual/process terms; -4 when camera movement or continuity notes indicate multiple camera positions.
  - `omni-reference`: +2 for two or more character bindings; +2 for scene + prop bindings; +3 when continuity notes mention动作参考/运镜参考/音频参考.
- [ ] Choose the highest score; ties resolve in order `first-frame`, `first-last-frame`, `omni-reference`, `multi-frame` to prefer simpler control.
- [ ] Confidence: high when winner margin >= 3, medium when >= 1, low otherwise.
- [ ] Return reasons for positive rules, one rejection reason per non-selected mode, required assets, and risks.
- [ ] Required assets:
  - first-frame: first frame, optional identity/scene/prop references based on bindings.
  - first-last-frame: first and last frame plus optional identity references.
  - multi-frame: keyframe sequence plus optional identity/scene references.
  - omni-reference: identity/scene/prop references based on bindings; add action/camera/audio reference as optional requirements.
- [ ] `confirmShotPlan()` requires `shot-approved`; creates or increments plan version, recalculates requirements for the selected mode, sets `approved`, updates timestamp, clears old mode approval, and sets shot status `plan-approved`.
- [ ] Changing an approved mode preserves the previous plan in `planHistory` and caps history at 20.
- [ ] Commit:

```bash
git commit -m "feat: recommend shot generation modes

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 4: Build Full-Screen Shot Workbench

**Files:**
- Create: `web/src/components/canvas/shot-workbench/canvas-shot-workbench.tsx`
- Create: `web/src/components/canvas/shot-workbench/shot-definition-panel.tsx`
- Create: `web/src/components/canvas/shot-workbench/shot-asset-bindings.tsx`
- Create: `web/src/components/canvas/shot-workbench/shot-plan-panel.tsx`
- Create: `web/src/components/canvas/shot-workbench/shot-list.tsx`

**Props:**

```ts
type CanvasShotWorkbenchProps = {
    production: ProductionProject;
    shotboardId: string;
    initialShotId: string;
    onChange: (production: ProductionProject) => void;
    onClose: () => void;
};
```

- [ ] Build a fixed full-screen `z-[300]` layout using current canvas theme:
  - 260px left shot list grouped by StoryScene.
  - flexible center editor.
  - 340px right bindings/status/plan.
- [ ] `Esc` closes; wheel/pointer events do not reach canvas.
- [ ] Left list supports search and status filter, displays shot code/title/duration/status, and switches active shot without closing.
- [ ] Definition panel fields:
  - narrative purpose, emotional beat, information gain.
  - category, shot size, angle, composition, lens intent, screen direction, camera movement.
  - start state, action, end state, continuity notes.
  - duration seconds and edit relation.
  - dialogue/voiceover text is read-only from cue IDs in Phase 2; sound cues remain editable.
- [ ] Use local draft state and explicit `保存镜头` button. Saving calls `updateShot()` once, preventing history entries per keystroke.
- [ ] Add `确认镜头` button that calls `approveShot()`, showing blocker errors through Ant Design message.
- [ ] Asset bindings:
  - character multi-select with explicit version, role, and state text.
  - one scene + version + role.
  - prop multi-select with version, role, and state.
  - options resolve from `ProductionProject.characters/scenes/props`.
  - save all bindings in the same `保存镜头` transaction.
- [ ] Right panel shows blockers, revision number/history restore buttons, state progress, and the mode recommendation.
- [ ] Plan panel shows all four modes, recommendation confidence/reasons/rejections/required assets/risks, supports manual mode selection, and only enables `确认生成方案` after shot approval.
- [ ] Do not show Phase 3 upload/generation controls; required assets are a checklist preview only.
- [ ] Keep cards at max 8px radius, use lucide icons, no nested decorative cards.
- [ ] Commit:

```bash
git commit -m "feat: add shot production workbench

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 5: Integrate Workbench with Canvas and Persistence

**Files:**
- Modify: `web/src/components/canvas/nodes/builtin-nodes.tsx`
- Modify: `web/src/components/canvas/canvas-production-node-content.tsx`
- Modify: `web/src/pages/canvas/project.tsx`
- Modify: `web/src/components/canvas/canvas-side-panel.tsx`

- [ ] Add shot double-click definition:

```ts
onDoubleClick: (ctx) => {
    ctx.emit("shot:open", {
        nodeId: ctx.node.id,
        shotId: ctx.node.metadata?.productionRecordId,
        shotboardId: ctx.node.metadata?.productionRootId,
    });
    return true;
}
```

Do not trust `productionRootId` as the domain shotboard ID; in `project.tsx`, resolve the root canvas node and use its `productionRecordId`.

- [ ] Add `shotWorkbench` state `{ shotboardId, shotId } | null`, subscribe to `shot:open`, and render `CanvasShotWorkbench`.
- [ ] `onChange` atomically updates `productionRef`, state, and matching projection metadata:
  - update shot node title.
  - set `productionVersion` to the updated Shotboard version.
  - update shotboard root `productionVersion`.
  - keep IDs and positions.
- [ ] Because production is already in history, one save/approve/confirm command becomes one undo entry.
- [ ] Change shot cards from “阶段 1 只读镜头” to status label and `双击进入镜头工作台`.
- [ ] Side-panel shot summary includes status and revision.
- [ ] Workbench remains open while saving and reflects new production.
- [ ] Commit:

```bash
git commit -m "feat: connect shot workbench to canvas

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 6: Documentation and Phase 2 Review

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/progress/todo.mdx`
- Modify: `docs/content/docs/progress/pending-test.mdx`

- [ ] Add changelog:

```md
+ [新增] 镜头节点支持全屏工作台，可编辑镜头、绑定版本化资产、检查阻塞项并确认首帧、首尾帧、智能多帧或全能参考方案。
```

- [ ] Change TODO to phases 3-4 only.
- [ ] Add pending test covering:
  - double-click shot opens and Esc closes.
  - edit/save creates one revision and undo restores production plus node title/status.
  - invalid/missing fields block approval.
  - versioned character/scene/prop binding.
  - recommendation reasons for all four modes.
  - manual override and plan confirmation.
  - editing approved shot resets status and plan approval.
  - refresh/export/import preserves revisions, bindings, blockers, and plan.
- [ ] Run only:

```bash
git diff --check
rg -n "shot-approved|plan-approved|recommendShotMode|CanvasShotWorkbench|shot:open" web/src CHANGELOG.md docs/content/docs/progress
git status --short
```

- [ ] Commit:

```bash
git commit -m "docs: record shot workbench phase two

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Manual Acceptance

1. Open a generated shotboard and double-click a shot.
2. Edit start/action/end and save once; confirm revision increments once.
3. Bind one character, scene, and prop at explicit versions.
4. Attempt approval with a missing required field and confirm it is blocked.
5. Fix blockers and approve the shot.
6. Inspect recommendation reasons and rejected modes.
7. Override the mode and confirm the generation plan.
8. Edit the shot again and verify status returns to draft and plan returns to recommended.
9. Restore an earlier shot revision as a new revision.
10. Undo/redo and refresh; production and canvas card must remain synchronized.
11. Export/import v4 archive and verify workbench state survives.

## Phase 2 Non-Goals

- No image generation or uploads inside the workbench.
- No first/last/keyframe records.
- No Jimeng operation steps or prompt compiler.
- No candidate video upload.
- No cross-shot visual similarity check.
- No Jianying timeline package.
