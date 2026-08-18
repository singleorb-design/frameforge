# Production Shotboard Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task.

**Goal:** Add versioned shot control assets and compile approved shots into reproducible, copy-ready Jimeng Web operation sheets without generating video.

**Architecture:** Store control assets and Jimeng tasks inside each Shot. Reuse existing image storage and image generation for control-frame creation; uploaded images are persisted through current image storage. A pure compiler combines shot data, pinned asset versions, approved control assets, and a versioned Jimeng capability profile. Publishing freezes snapshots; later changes mark the task stale.

**Global Constraints**

- No direct video generation or polling.
- No Jimeng browser automation/login.
- Control images may be generated with existing image API or uploaded manually.
- Every task is reproducible from frozen snapshots.
- Platform capabilities are versioned and editable, not hard-coded into Shot.
- Only approved plans can prepare control assets.
- Only complete approved control assets can publish a task.
- Do not add dependencies or run build/typecheck/tests.

---

### Task 1: Add Control Asset, Platform Profile, and Jimeng Task Types

**Files:** `web/src/types/production.ts`, `web/src/lib/production/generated-production.ts`

- [ ] Add `ControlAssetKind`, `ControlAssetStatus`, `ShotControlAssetVersion`, `ShotControlAssetRecord`.
- [ ] A control asset version stores `storageKey`, source type (`generated|uploaded|canvas`), file name, MIME type, dimensions, purpose, approval metadata, and asset-version snapshots.
- [ ] Add `PlatformCapabilityProfile` with platform `jimeng-web`, profileVersion, verifiedAt, model entries, supported modes, ratios, resolutions, durations, reference limits, nativeAudio, notes.
- [ ] Add default profile factory `createDefaultJimengProfile()` based on the research snapshot, with all mutable values visible.
- [ ] Extend `ProductionProject.platformProfiles`.
- [ ] Extend `Shot` with `controlAssets`, `jimengTasks`, `currentJimengTaskId`.
- [ ] Add `JimengTask` fields from the spec: shot/plan/profile snapshots, settings, upload steps, reference map, prompt, negative instructions, operation steps, acceptance criteria, retry playbook, status.
- [ ] Initialize arrays in generated shots and platform profile in new production projects.
- [ ] Commit.

### Task 2: Add Pure Control Asset Lifecycle

**Files:** Create `web/src/lib/production/shot-control-assets.ts`

- [ ] Implement `requiredControlAssetKinds(shot)` from approved plan.
- [ ] Implement `addControlAssetVersion(...)`, `approveControlAsset(...)`, `rejectControlAsset(...)`, `selectControlAssetVersion(...)`, `removeControlAssetRecord(...)`.
- [ ] Any control asset mutation increments Shotboard version.
- [ ] Approving validates required metadata and pinned asset snapshot.
- [ ] Recalculate shot status: `plan-approved` until all required records approved; then `control-assets-ready`.
- [ ] If a published task exists, mutation marks it stale while preserving it.
- [ ] Implement `buildControlFramePrompt(production, shotboardId, shotId, kind)` using shot + pinned assets, excluding full script.
- [ ] Commit.

### Task 3: Add Jimeng Profile and Task Compiler

**Files:** Create `web/src/lib/production/jimeng-profile.ts`, `web/src/lib/production/jimeng-task-compiler.ts`

- [ ] Implement profile lookup/version validation and user patching as a new profile version.
- [ ] Implement mode capability validation, ratio/resolution/duration validation and reference-limit validation.
- [ ] Compile reference names in deterministic upload order.
- [ ] Compile prompt layers: objective, identity/state, scene/light, start, action, end, camera, pacing, reference roles, constraints, optional audio.
- [ ] Compile mode-specific upload steps:
  - first frame.
  - first + last.
  - ordered keyframes.
  - omni references with explicit `@` roles.
- [ ] Add acceptance criteria from shot and bindings.
- [ ] Add failure-specific retry rules and “change one variable at a time”.
- [ ] `compileJimengTask()` returns draft; `publishJimengTask()` requires control-assets-ready, freezes snapshots, appends task, sets current ID and `task-published`.
- [ ] Editing profile alone shows update available; only selecting/syncing a new profile makes current task stale.
- [ ] Commit.

### Task 4: Add Control Asset and Task UI to Shot Workbench

**Files:** Modify workbench; create `control-asset-panel.tsx`, `jimeng-task-panel.tsx`, `jimeng-profile-modal.tsx`

- [ ] Add workbench tabs: 镜头定义 / 控制资产 / 即梦任务单.
- [ ] Control asset panel shows required kinds from approved plan and version/status.
- [ ] “模型生成” uses existing image generation with generated prompt; no video call.
- [ ] “外部上传” stores image through `uploadImage`.
- [ ] Approve/reject/version selection controls.
- [ ] Omni mode supports image/video/audio reference records only as metadata links in Phase 3; actual local image upload is required for images, video/audio may reference existing canvas asset storage keys.
- [ ] Task panel chooses profile/model/settings, previews upload order, reference mapping, prompt, steps, acceptance and retries.
- [ ] Publish button only enabled when ready; copy full task sheet and separate prompt.
- [ ] Profile modal exposes profile version, models, limits, ratios, resolution, duration, native audio, notes.
- [ ] No video generation button.
- [ ] Commit.

### Task 5: Pin Control Assets and Tasks to Canvas

**Files:** Modify `project.tsx`, add `production-pin.ts`

- [ ] Implement pin approved image version to ordinary Image node with production record/version metadata and Shot -> image connection.
- [ ] Implement pin Jimeng task to MarkdownDocument node containing compiled task sheet.
- [ ] Prevent duplicate pin for same record/version.
- [ ] Deleting pinned node does not delete domain record.
- [ ] Domain record deletion leaves pinned media intact and displays source missing in metadata.
- [ ] Add flat icon actions “固定到画布”.
- [ ] Commit.

### Task 6: Docs and Review

- [ ] Changelog: control assets and Jimeng task sheets.
- [ ] TODO phases 4 only.
- [ ] Pending tests: all four modes, upload/generate control image, approval gates, task compile/publish/stale, profile version, pin behavior, refresh/export/import.
- [ ] `git diff --check`, focused `rg`, no build/typecheck.
- [ ] Cross-review state invalidation, snapshots, no video API imports in Phase 3 UI/compiler.
- [ ] Commit.

## Manual Acceptance

1. Confirm a shot and generation plan.
2. Open control-assets tab; required items match mode.
3. Generate or upload each image, approve versions.
4. Status reaches control-assets-ready only when required items approved.
5. Compile task, inspect mode/settings/upload order/@ references/prompt/acceptance/retry.
6. Publish and copy full sheet.
7. Replace one control asset; old task becomes stale.
8. Create a new profile version; old task unchanged until user selects new profile.
9. Pin control frame and task to canvas; deleting pins keeps domain data.
10. Confirm no video generation action exists.
