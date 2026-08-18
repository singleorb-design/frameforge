# Creator-First Shot Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a creator finish a shot through four visible actions: check the episode, fill only missing assets, confirm the shot, then copy and return an external generation result.

**Architecture:** Keep asset snapshots, revisions, and platform capability records in the existing production model, but remove their labels and selectors from the creator-facing default route. The shot workbench becomes an exception-first workspace: only missing materials and confirmation state are shown by default; manual binding, history, and fine-grained edits move into one collapsed “更多调整” surface.

**Tech Stack:** Vite, React, TypeScript, Ant Design, Tailwind, Zustand, existing production domain helpers.

## Global Constraints

- 中文界面；外部平台生成是主路径，画布不生成视频。
- 正式领域数据仍使用已有内部版本快照，不删除 `version` 字段或历史记录。
- 主流程不展示 `vN`、版本化资产、修订号、能力档案版本或手动版本选择器。
- 只让角色名触发缺少人物；身份、设定、动作、道具和泛化语义词不得触发人物资产草案。
- 不新增依赖；不执行构建、类型检查或测试，按项目约束以静态检查和 Vite 模块加载验证。

---

### Task 1: Filter Non-Character Terms

**Files:**
- Modify: `web/src/lib/production/shot-preflight.ts`
- Modify: `web/src/types/production.ts`
- Modify: `web/src/lib/production/shot-preflight-prompt.ts`

**Interfaces:**
- Consumes: `detectNamedCharacters(text, knownNames, speakers)` and persisted `ShotPreflightIssue` records.
- Produces: only valid role names can create `missing-character` issues; existing invalid issues are removed during production normalization.

- [ ] **Step 1: Define ignored semantic terms**

Add a shared-style predicate in each existing local normalization boundary:

```ts
const ignoredCharacterTerms = new Set([
    "身份", "设定", "角色", "人物", "主角", "男主", "女主",
    "镜头", "场景", "动作", "状态", "画面", "剧情", "信息",
]);
```

- [ ] **Step 2: Filter detection results**

Require a detected candidate to be absent from `ignoredCharacterTerms`, absent from existing crowd terms, and either present in known names or match a role-name pattern without action/object markers.

- [ ] **Step 3: Filter persisted invalid issues**

Extend `normalizeShotPreflight` so a stored `missing-character` issue is removed when its suggested name is an ignored semantic term or an action/object phrase.

- [ ] **Step 4: Reinforce the model prompt**

Add an instruction to the preflight prompt that identity and role descriptions such as “身份”“主角设定” are semantic fields, never character names or missing-character candidates.

- [ ] **Step 5: Static verification**

Run `git diff --check` and request the affected Vite modules. Expected: all HTTP responses are `200` and no transform error appears.

### Task 2: Remove Internal Version Language from Creator Surfaces

**Files:**
- Modify: `web/src/components/canvas/shot-workbench/canvas-shot-workbench.tsx`
- Modify: `web/src/components/canvas/shot-workbench/shot-asset-bindings.tsx`
- Modify: `web/src/components/canvas/shot-workbench/shot-preflight-summary.tsx`
- Modify: `web/src/components/canvas/canvas-production-node-content.tsx`

**Interfaces:**
- Consumes: existing `ShotAssetBinding.version`, asset record `currentVersion`, shot revision, and history.
- Produces: asset pickers always bind the current internal snapshot without exposing a version selector; creator labels only show asset names, states, and roles.

- [ ] **Step 1: Rename creator-facing sections**

Replace:

```text
版本化资产 -> 本镜头素材
历史版本 -> 更多调整
修改绑定 -> 手动调整素材
```

- [ ] **Step 2: Hide version selectors**

Change the asset binding picker to list only current card names. On selection, retain `record.currentVersion` internally. Remove the visible per-binding version `<Select>` while preserving role and state inputs in the manual section.

- [ ] **Step 3: Remove version labels**

Remove `v${...}` from shot header, asset summary, preflight asset rows, shot canvas nodes, and restore success copy. Keep only human-relevant state labels.

- [ ] **Step 4: Move low-frequency actions**

Put manual asset edits and restore-history buttons inside the existing collapsed “更多调整” area. The default shot view must contain the AI summary, flow, matched materials, missing material cards, and the confirmation action only.

- [ ] **Step 5: Static verification**

Load the workbench modules through Vite and inspect all changed strings with `rg`. Expected: no creator-facing `版本化资产`, `历史版本`, or `v${` remains in the changed default workbench surface.

### Task 3: Make Four-Step Progress the Default

**Files:**
- Modify: `web/src/components/canvas/shot-workbench/canvas-shot-workbench.tsx`
- Modify: `web/src/components/canvas/shot-workbench/control-asset-panel.tsx`
- Modify: `web/src/components/canvas/shot-workbench/jimeng-task-panel.tsx`
- Modify: `web/src/components/canvas/shot-workbench/candidate-review-panel.tsx`
- Modify: `web/src/components/canvas/shotboard-workbench/canvas-shotboard-workbench.tsx`

**Interfaces:**
- Consumes: shot preflight issues, `generationPlan`, control assets, Jimeng task records, and candidates.
- Produces: a visible creator progression with clear next action and no required navigation knowledge.

- [ ] **Step 1: Add a compact progress header**

Render four static creator steps with current state:

```text
1 检查分镜 -> 2 补齐素材 -> 3 确认镜头 -> 4 外部生成与回传
```

The current step is derived from open blocking issues, plan approval, task existence, and candidates.

- [ ] **Step 2: Default the workbench to the next action**

Keep “镜头定义” as the default when missing materials or confirmation is pending. Select “准备画面” after confirmation and “外部生成” after control assets are ready. Preserve candidate review as a later tab.

- [ ] **Step 3: Rename technical tabs and copy**

Replace “控制资产” with “准备画面”, “即梦任务单” with “外部生成”, and internal capability-profile wording with “生成设置”. Do not expose profile version in the default controls.

- [ ] **Step 4: Simplify external generation**

Show one primary “复制完整生成任务” action after settings are ready. Existing compile/publish records remain internal; the visible UI explains upload order, final prompt, and return action without asking the user to manage task versions.

- [ ] **Step 5: Simplify result return**

Rename candidate review copy to “回传结果”. The source task selector lists descriptive labels without task version; upload remains blocked only when there is no external generation task.

- [ ] **Step 6: Static verification**

Load the workbench page and all touched modules from Vite. Expected: all return `200`, no transform errors, and the app route returns `200`.

### Task 4: Update Creator-Facing Documentation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Modify: `docs/content/docs/progress/ai-comic-production-acceptance.mdx`

**Interfaces:**
- Consumes: final visible labels and four-step workflow.
- Produces: testable expectations aligned with the simplified interface.

- [ ] **Step 1: Record the user-visible change**

Add one `[优化]` changelog line for the creator-first four-step flow and hidden internal snapshots.

- [ ] **Step 2: Add acceptance cases**

Add checks that:

```text
“身份” never appears as a missing person.
The default workbench has no visible version or revision number.
Manual material selection and history are hidden under “更多调整”.
The creator can follow check -> fill -> confirm -> external generation -> return result.
```

- [ ] **Step 3: Final verification and commit**

Run `git diff --check`, request `/canvas` plus every changed source module through Vite, inspect `git status --short`, then commit:

```text
feat: simplify creator shot workflow

Co-authored-by: TRAE CLI <noreply@bytedance.com>
```
