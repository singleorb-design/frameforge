# AI Shot Preflight and Exception Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在结构化分镜生成后自动整理整集镜头、匹配已有资产、自动确认高置信度镜头，并把镜头工作台改成只处理异常的可读流程。

**Architecture:** 领域层使用纯函数完成上下文构建、确定性资产匹配、AI 补丁合并、异常生成和资产草案采用；页面层只负责编排文本模型请求与应用 Production 更新。AI 只返回按镜头 ID 定位的补丁，不返回完整 Shotboard；人工锁定字段、已有合法绑定和已发布任务保持最高优先级。

**Tech Stack:** React 19、TypeScript、Ant Design、Zustand、Zod、现有 OpenAI 兼容文本请求、浏览器本地 Production 持久化。

## Global Constraints

- 中文 UI。
- 不在画布中生成视频。
- 连线资产优先，当前画布版本化资产兜底。
- AI 不自动创建缺失资产，只创建待采用的结构化资产草案。
- 人工修改字段永久优先，除非用户主动解除锁定。
- 高置信度且无 blocker/review 异常的镜头才自动确认。
- 不改写台词、剧情节拍、镜头 ID、镜头顺序和来源关系。
- 不覆盖已发布即梦任务；镜头变化沿用现有 stale 规则。
- 按 `AGENTS.md` 不运行构建、类型检查或测试；验证限于静态差异、源码检索和 Vite 模块 HTTP 加载。

---

### Task 1: Preflight Domain Model and Deterministic Matcher

**Files:**
- Modify: `web/src/types/production.ts`
- Create: `web/src/lib/production/shot-preflight.ts`

**Interfaces:**
- Consumes: `ProductionProject`, `ShotboardRecord`, `Shot`, `ScriptBreakdown`.
- Produces:
  - `createPendingPreflight(): ShotPreflightState`
  - `matchShotAssets(production, shotboardId, shotId, preferredAssetIds): ShotPreflightMatch`
  - `applyShotPreflight(production, shotboardId, results, now): ShotPreflightApplyResult`
  - `summarizeShotPreflight(shotboard): ShotPreflightSummary`
  - `lockShotFields(preflight, fieldPaths): ShotPreflightState`

- [ ] **Step 1: Extend Production types**

Add `ShotFieldSource`, `ShotPreflightIssue`, `ShotPreflightState`, `ShotPreflightBatch`, `AssetDraft`, `ShotPreflightPatch` and `ShotPreflightModelResult`.

Add to `Shot`:

```ts
preflight: ShotPreflightState;
```

Add to `ShotboardRecord`:

```ts
preflightBatches: ShotPreflightBatch[];
assetDrafts: AssetDraft[];
```

Update `normalizeProductionProject` so old projects receive:

```ts
preflight: createPendingPreflightShape
preflightBatches: []
assetDrafts: []
```

- [ ] **Step 2: Implement normalized-name matching**

`matchShotAssets` must:

1. Preserve valid existing bindings.
2. Match dialogue speakers to character `data.name`.
3. Match beat/shot text mentions to character, scene and prop names.
4. Search preferred asset IDs first.
5. Auto-bind only one exact high-confidence match.
6. Emit aggregated missing/ambiguous issues otherwise.
7. Attach field sources explaining each match.

- [ ] **Step 3: Implement preflight application**

`applyShotPreflight` must:

1. Reject unknown shot IDs and unknown asset/version IDs.
2. Ignore fields listed in `lockedFieldPaths`.
3. Preserve legal existing asset bindings.
4. Apply rule matches before AI fields.
5. Create one shot revision per preflight run.
6. Reuse `validateShot` rules.
7. Auto-set `shot-approved` only for high-confidence results without blocking/review issues.
8. Append one batch, retaining the latest 20.

- [ ] **Step 4: Static verification**

Run:

```bash
git diff --check
rg -n "ShotPreflightState|preflightBatches|assetDrafts|matchShotAssets|applyShotPreflight" web/src/types/production.ts web/src/lib/production/shot-preflight.ts
```

Expected: no diff errors and all interfaces present.

- [ ] **Step 5: Commit**

```bash
git add web/src/types/production.ts web/src/lib/production/shot-preflight.ts
git commit -m "feat: add shot preflight domain model"
```

Commit body must end with:

```text
Co-authored-by: TRAE CLI <noreply@bytedance.com>
```

### Task 2: AI Context, Schema, and Batch Compiler

**Files:**
- Create: `web/src/lib/production/shot-preflight-schema.ts`
- Create: `web/src/lib/production/shot-preflight-prompt.ts`
- Create: `web/src/lib/production/shot-preflight-runner.ts`

**Interfaces:**
- Consumes:
  - `matchShotAssets(...)`
  - `parseGeneratedProduction` JSON repair conventions.
- Produces:
  - `buildShotPreflightBatches(production, shotboardId, preferredAssetIds): ShotPreflightRequestBatch[]`
  - `buildShotPreflightPrompt(batch): string`
  - `parseShotPreflightOutput(text, batch): ShotPreflightModelResult`
  - `mergePreflightBatchResults(production, shotboardId, batchResults, now): ShotPreflightApplyResult`

- [ ] **Step 1: Define strict Zod schema**

Allow AI output only:

```ts
{
  shots: [{
    shotId,
    summary,
    confidence,
    fields: {
      narrativePurpose?,
      emotionalBeat?,
      informationGain?,
      framing?,
      startState?,
      action?,
      endState?,
      continuityNotes?,
      soundCues?,
      targetDurationMs?,
      editRelation?
    },
    assetStates: [{ assetId, role, state, confidence, reason }],
    issues: [...]
  }]
}
```

Do not allow AI output to include dialogue, beat IDs, shot order or new asset IDs.

- [ ] **Step 2: Build minimal context**

Each batch contains at most 8 shots from one story scene plus read-only previous/next shot summaries. Include referenced beats/cues and compact asset catalogs. Do not include the full Markdown script.

- [ ] **Step 3: Build Chinese repair-resistant prompt**

The prompt must:

- Require one JSON object only.
- List exact enum values.
- State prohibited fields.
- Require existing asset IDs only.
- Ask for missing assets as issues, not invented bindings.
- Include locked field paths.

- [ ] **Step 4: Parse and validate**

Reuse `extractGeneratedJson` and `jsonrepair`. Verify every returned `shotId` belongs to the batch and every `assetId` belongs to the provided catalog.

- [ ] **Step 5: Static verification and commit**

```bash
git diff --check
rg -n "max.*8|lockedFieldPaths|禁止|shotId|assetId" web/src/lib/production/shot-preflight-*.ts
git add web/src/lib/production/shot-preflight-*.ts
git commit -m "feat: compile AI shot preflight batches"
```

Append the required co-author trailer.

### Task 3: Automatic Whole-Episode Orchestration

**Files:**
- Modify: `web/src/pages/canvas/project.tsx`
- Modify: `web/src/lib/production/generated-production.ts`

**Interfaces:**
- Consumes:
  - `buildShotPreflightBatches`
  - `buildShotPreflightPrompt`
  - `parseShotPreflightOutput`
  - `mergePreflightBatchResults`
- Produces:
  - automatic post-generation preflight
  - manual `shotboard-preflight:run` canvas event handler

- [ ] **Step 1: Preserve preferred connected asset IDs**

Extend the structured generation result/context so the orchestration receives IDs from directly connected character, scene and prop inputs.

- [ ] **Step 2: Run batches with concurrency two**

After the Shotboard is imported and projected:

1. Persist the generated Shotboard immediately.
2. Mark target shots `running`.
3. Process batches with at most two active requests.
4. Apply each successful batch independently.
5. Mark failed batch shots `failed` with the error.
6. Keep the config node running until all batches settle.

- [ ] **Step 3: Report outcome**

Success message:

```text
已生成 19 个镜头：自动确认 15，需处理 3，整理失败 1
```

If all preflight batches fail, keep the generated Shotboard and show:

```text
分镜已生成，AI 整理失败，可在分镜表中重试
```

- [ ] **Step 4: Add manual retry event**

Handle:

```ts
onCanvasEvent("shotboard-preflight:run", { nodeId, scope: "all" | "issues" })
```

Manual retry must preserve locked fields and approved/published task history.

- [ ] **Step 5: Static verification and commit**

```bash
git diff --check
rg -n "shotboard-preflight:run|自动确认|整理失败|Promise|concurrency" web/src/pages/canvas/project.tsx
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/src/pages/canvas/project.tsx
```

Expected HTTP 200. Commit with required trailer.

### Task 4: Exception-First Shot and Episode Workbenches

**Files:**
- Modify: `web/src/components/canvas/shot-workbench/canvas-shot-workbench.tsx`
- Modify: `web/src/components/canvas/shot-workbench/shot-asset-bindings.tsx`
- Create: `web/src/components/canvas/shot-workbench/shot-preflight-summary.tsx`
- Modify: `web/src/components/canvas/shotboard-workbench/canvas-shotboard-workbench.tsx`
- Create: `web/src/components/canvas/shotboard-workbench/preflight-exception-list.tsx`

**Interfaces:**
- Consumes:
  - `shot.preflight`
  - `summarizeShotPreflight`
  - `lockShotFields`
- Produces:
  - readable default shot summary
  - collapsed advanced editor
  - whole-episode exception list
  - retry event buttons

- [ ] **Step 1: Build readable shot summary**

Default view must show:

- title and compact camera summary
- readable paragraph
- start/action/end flow
- matched asset rows with source/confidence
- open issues

Do not show raw `informationGain`, `screenDirection`, `editRelation` or enum values in the default view.

- [ ] **Step 2: Move existing form into Advanced Edit**

Use Ant Design `Collapse`. When a field changes, add its exact field path to `lockedFieldPaths`. Show a small lock indicator and “允许 AI 重写” action.

- [ ] **Step 3: Replace right asset form with result rows**

Keep manual binding controls accessible under “修改绑定”. Default rows show name, version, role, state and matching reason.

- [ ] **Step 4: Add whole-episode exception view**

Show counts and filters:

- 已自动确认
- 需处理
- 整理失败
- 全部

Buttons:

- 重新整理异常
- 重新检查整集
- 忽略可选异常

- [ ] **Step 5: Static verification and commit**

```bash
git diff --check
rg -n "高级编辑|允许 AI 重写|重新整理异常|已自动确认|需处理" web/src/components/canvas/shot-workbench web/src/components/canvas/shotboard-workbench
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/src/components/canvas/shot-workbench/canvas-shot-workbench.tsx
```

Commit with required trailer.

### Task 5: Missing Asset Drafts and Adoption

**Files:**
- Create: `web/src/lib/production/asset-drafts.ts`
- Create: `web/src/components/canvas/shot-workbench/missing-asset-card.tsx`
- Modify: `web/src/components/canvas/shot-workbench/canvas-shot-workbench.tsx`
- Modify: `web/src/components/canvas/shotboard-workbench/preflight-exception-list.tsx`
- Modify: `web/src/pages/canvas/project.tsx`

**Interfaces:**
- Produces:
  - `buildAssetDraftPrompt(production, shotboardId, issueId): string`
  - `parseAssetDraft(text, issue): AssetDraft`
  - `adoptAssetDraft(production, shotboardId, draftId, now, idFactory): AssetDraftAdoption`
  - canvas event `asset-draft:generate`
  - canvas event `asset-draft:adopt`

- [ ] **Step 1: Aggregate missing assets**

Group open missing issues by `assetKind + normalized suggestedName`. Include all source shot and beat IDs.

- [ ] **Step 2: Generate prompt and strict draft schema**

Character drafts produce `CharacterCardSnapshot`; scene drafts produce `SceneCard`; prop drafts produce `PropCard`. Include image prompt, negative prompt and recommended ratio.

- [ ] **Step 3: Keep drafts non-formal**

Generation stores draft only in `shotboard.assetDrafts`. It must not modify `production.characters/scenes/props` or create canvas cards.

- [ ] **Step 4: Adopt draft**

Adoption:

1. Creates one versioned formal record.
2. Creates or appends to the relevant canvas group.
3. Binds all affected shots.
4. Resolves matching issues.
5. Revalidates and auto-confirms newly clean shots.
6. Marks draft adopted.

- [ ] **Step 5: Add UI actions**

Each missing issue shows:

- AI 生成资产卡
- 复制 Prompt
- 绑定已有资产
- 忽略（optional only）

Draft card shows summary, `采用资产卡`, `丢弃`, and after adoption the existing model/external reference image workflow.

- [ ] **Step 6: Static verification and commit**

```bash
git diff --check
rg -n "AI 生成资产卡|复制 Prompt|采用资产卡|assetDrafts|adoptAssetDraft" web/src
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/canvas
```

Commit with required trailer.

### Task 6: Documentation and Final Static Acceptance

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/progress/todo.mdx`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Modify: `docs/content/docs/progress/ai-comic-production-acceptance.mdx`

**Interfaces:**
- Consumes all prior tasks.
- Produces user-facing manual acceptance coverage.

- [ ] **Step 1: Document test scenarios**

Cover:

- automatic preflight after generation
- connected-first matching
- high-confidence auto approval
- human field locks
- batch partial failure
- exception filters
- missing asset draft generation
- draft adoption and canvas projection
- reference image entry
- refresh/export/import persistence

- [ ] **Step 2: Update progress**

Move this feature from TODO to pending test. Add one `[新增]` or `[调整]` Unreleased entry summarizing the user-visible workflow.

- [ ] **Step 3: Final static verification**

```bash
git diff --check
git status --short
rg -n "AI 整理|异常审核|资产草案|人工锁定" CHANGELOG.md docs/content/docs/progress
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/canvas
```

Expected: no diff errors, documented scenarios found, HTTP 200.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/content/docs/progress
git commit -m "docs: add AI shot preflight acceptance"
```

Append the required co-author trailer.
