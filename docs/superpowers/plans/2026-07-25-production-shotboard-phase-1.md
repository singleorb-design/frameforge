# Production Shotboard Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the production data foundation and a complete `Markdown 剧本/资产目录 -> 结构化 Shotboard -> 分镜表/镜头画布节点 -> 派生 Markdown 报告` workflow without generating video.

**Architecture:** Store production domain data once under `CanvasProject.production`; keep canvas nodes as lightweight projections that reference domain record IDs. Parse model output through a Zod schema and domain validator before any state write, then materialize persistent IDs and build all canvas projections in memory so generation succeeds or fails atomically. Reuse the current config node, direct-input rule, node registry, localforage persistence, root/child collapse animation, and Markdown reader.

**Tech Stack:** Vite, React 19, TypeScript, Ant Design 6, Tailwind CSS 4, Zustand 5, localforage, Zod 3, existing OpenAI-compatible text generation API.

## Global Constraints

- Page copy stays Chinese.
- The canvas does not call Jimeng or any other provider to generate video.
- Phase 1 adds production data, script breakdowns, base scene/prop cards, structured shotboards, canvas projections, and a derived Markdown report only.
- Do not implement the shot editing workbench, generation-mode recommendation, control-frame management, Jimeng task compilation, candidate review, continuity scoring, or Jianying production packages in this phase.
- Shotboard JSON is the source of truth; Markdown is derived and never parsed back into production data.
- Generation reads only resources directly connected to the config node. Do not recursively consume upstream resources.
- A generated result is committed atomically: schema failure, domain validation failure, or projection failure must create no production records and no output nodes.
- Production data exists only at `CanvasProject.production`; do not create a second persisted Zustand store.
- Images/video/audio remain in the existing localforage media stores and are referenced with `storageKey`.
- The project is not released. Raise the canvas export version directly from `3` to `4`; do not add migration branches for missing production data.
- Reuse `canvasThemes`, `useThemeStore`, the node registry, and existing root/child animation patterns.
- Use direct dependency `zod`; do not rely on its transitive installation and do not add a test framework.
- Do not run syntax checks, tests, builds, or formatting commands after coding; the repository `AGENTS.md` says the user performs those checks.
- Verification in this plan is limited to focused source inspection and `git diff --check`.
- Do not touch unrelated files.
- Every implementation commit message must end with:

```text
Co-authored-by: TRAE CLI <noreply@bytedance.com>
```

---

## Phase 1 Deliverable

The accepted user flow at the end of this plan is:

```text
Markdown 剧本 ─────────┐
导演要求文本 ─────────┤
人物卡组（可选） ─────┤
场景卡组（可选） ─────┤ -> 生成配置（文本 / 结构化分镜）
道具卡组（可选） ─────┘
                         ↓
                 场景卡组 + 场景卡
                 道具卡组 + 道具卡
                 分镜表 + 镜头子节点
                         ↓
                 双击分镜表阅读派生 Markdown
```

Phase 1 explicitly does not provide per-shot editing. A shot node is a read-only projection with a stable `shotId`; editing begins in Phase 2.

## File Structure

### New domain files

- `web/src/types/production.ts`
  - Production root, script breakdown, versioned character/scene/prop records, shotboard and shot types.
- `web/src/lib/production/generated-production-schema.ts`
  - Zod schemas for the model response and exported `GeneratedProductionDraft`.
- `web/src/lib/production/generated-production.ts`
  - JSON extraction, domain validation, prompt compilation, connected-resource catalog building, ID materialization, and immutable production merge.
- `web/src/lib/production/shotboard-markdown.ts`
  - Pure `shotboardToMarkdown()` renderer.
- `web/src/lib/production/production-canvas-projection.ts`
  - Pure conversion from imported production records to canvas nodes/connections.
- `web/src/lib/canvas/canvas-production-groups.ts`
  - Production root/child ownership, hidden-state, animation-offset, and ordered-child helpers.

### New UI files

- `web/src/components/canvas/canvas-production-node-content.tsx`
  - Scene group/card, prop group/card, shotboard and shot card rendering.

### Modified integration files

- `web/package.json`
- `web/package-lock.json`
- `web/src/types/canvas.ts`
- `web/src/types/canvas-export.ts`
- `web/src/stores/canvas/use-canvas-store.ts`
- `web/src/constant/canvas.ts`
- `web/src/components/canvas/nodes/builtin-nodes.tsx`
- `web/src/components/canvas/canvas-config-node-panel.tsx`
- `web/src/components/canvas/canvas-markdown-reader.tsx`
- `web/src/components/canvas/canvas-side-panel.tsx`
- `web/src/lib/canvas/canvas-auto-layout.ts`
- `web/src/pages/canvas/project.tsx`
- `web/src/lib/canvas/canvas-export.ts`
- `web/src/pages/canvas/index.tsx`
- `CHANGELOG.md`
- `docs/content/docs/progress/todo.mdx`
- `docs/content/docs/progress/pending-test.mdx`

---

### Task 1: Add the Production Domain Root and Project Persistence

**Files:**
- Create: `web/src/types/production.ts`
- Modify: `web/src/types/canvas.ts`
- Modify: `web/src/stores/canvas/use-canvas-store.ts`
- Modify: `web/src/types/canvas-export.ts`
- Modify: `web/src/lib/canvas/canvas-export.ts`
- Modify: `web/src/pages/canvas/index.tsx`

**Interfaces:**
- Produces: `ProductionProject`, `createEmptyProductionProject()`, and all Phase 1 domain record types.
- Produces: `CanvasProject.production: ProductionProject`.
- Produces: canvas export file `version: 4`.
- Consumes: existing `CanvasProject`, localforage persistence, recursive storage-key export.

- [ ] **Step 1: Create the production domain types**

Create `web/src/types/production.ts` with these concrete Phase 1 types:

```ts
export type VersionedRecord<T> = {
    id: string;
    currentVersion: number;
    versions: Array<{
        version: number;
        data: T;
        createdAt: string;
    }>;
};

export type ProductionProject = {
    schemaVersion: 1;
    scriptBreakdowns: ScriptBreakdown[];
    characters: Array<VersionedRecord<CharacterCardSnapshot>>;
    scenes: Array<VersionedRecord<SceneCard>>;
    props: Array<VersionedRecord<PropCard>>;
    styleBibles: Array<VersionedRecord<StyleBible>>;
    shotboards: ShotboardRecord[];
};

export type ScriptBreakdown = {
    id: string;
    sourceScriptNodeId: string;
    revision: string;
    markdownHash: string;
    episodeNumber: number;
    title: string;
    scenes: ScriptScene[];
    beats: ScriptBeat[];
    dialogueCues: DialogueCue[];
    voiceoverCues: VoiceoverCue[];
    createdAt: string;
};

export type ScriptScene = {
    id: string;
    order: number;
    heading: string;
    location: string;
    timeOfDay: string;
    beatIds: string[];
};

export type ScriptBeat = {
    id: string;
    sceneId: string;
    order: number;
    summary: string;
    dramaticFunction: string;
};

export type DialogueCue = {
    id: string;
    beatId: string;
    characterId?: string;
    speaker: string;
    text: string;
};

export type VoiceoverCue = {
    id: string;
    beatId: string;
    speaker: string;
    text: string;
};

export type CharacterCardSnapshot = {
    sourceNodeId: string;
    name: string;
    role: string;
    appearance: string;
    clothing: string;
    props: string[];
    positivePrompt: string;
    negativePrompt: string;
    consistencyLocks: string[];
};

export type SceneCard = {
    name: string;
    narrativeFunction: string;
    era: string;
    locationType: string;
    spatialLayout: string;
    materials: string[];
    palette: string[];
    defaultLighting: string;
    timeVariants: string[];
    weatherVariants: string[];
    continuityLocks: string[];
    positivePrompt: string;
    negativePrompt: string;
    sourceNote: string;
};

export type PropState = {
    id: string;
    name: string;
    description: string;
};

export type PropCard = {
    name: string;
    narrativeFunction: string;
    ownerCharacterId?: string;
    shape: string;
    material: string;
    colors: string[];
    scale: string;
    handlingRules: string[];
    states: PropState[];
    continuityLocks: string[];
    positivePrompt: string;
    negativePrompt: string;
    sourceNote: string;
};

export type StyleBible = {
    name: string;
    visualStyle: string;
    palette: string[];
    lightingRules: string[];
    compositionRules: string[];
    negativeRules: string[];
};

export type StoryScene = {
    id: string;
    order: number;
    heading: string;
    locationAssetId?: string;
    timeOfDay: string;
    dramaticPurpose: string;
    beatSummary: string;
    shotIds: string[];
};

export type ShotCategory =
    | "establishing"
    | "dialogue"
    | "emotion-closeup"
    | "reaction"
    | "prop-detail"
    | "action"
    | "reveal"
    | "transition";

export type ShotAssetBinding = {
    assetId: string;
    version: number;
    role: string;
    state?: string;
};

export type Shot = {
    id: string;
    sceneId: string;
    order: number;
    code: string;
    sourceBeatIds: string[];
    narrativePurpose: string;
    emotionalBeat: string;
    informationGain: string;
    shotCategory: ShotCategory;
    framing: {
        shotSize: string;
        cameraAngle: string;
        composition: string;
        lensIntent: string;
        screenDirection: string;
        cameraMovement: string;
    };
    startState: string;
    action: string;
    endState: string;
    continuityNotes: string[];
    characterBindings: ShotAssetBinding[];
    sceneBinding?: ShotAssetBinding;
    propBindings: ShotAssetBinding[];
    dialogueCueIds: string[];
    voiceoverCueIds: string[];
    soundCues: string[];
    targetDurationMs: number;
    editRelation: "cut" | "match-cut" | "continuous" | "transition";
    status: "draft";
    createdAt: string;
    updatedAt: string;
};

export type ShotboardRecord = {
    id: string;
    version: number;
    sourceScriptNodeId: string;
    sourceScriptRevision: string;
    episodeNumber: number;
    title: string;
    targetDurationMs: number;
    targetRatio: "9:16" | "16:9" | "1:1" | "4:3" | "3:4";
    scenes: StoryScene[];
    shots: Shot[];
    generatedAt: string;
    updatedAt: string;
};

export function createEmptyProductionProject(): ProductionProject {
    return {
        schemaVersion: 1,
        scriptBreakdowns: [],
        characters: [],
        scenes: [],
        props: [],
        styleBibles: [],
        shotboards: [],
    };
}
```

- [ ] **Step 2: Add production projection metadata to canvas node types**

Extend `CanvasNodeType` in `web/src/types/canvas.ts`:

```ts
SceneGroup = "scene-group",
SceneCard = "scene-card",
PropGroup = "prop-group",
PropCard = "prop-card",
Shotboard = "shotboard",
Shot = "shot",
```

Change:

```ts
textOutputType?: "text" | "markdown";
```

to:

```ts
textOutputType?: "text" | "markdown" | "shotboard";
```

Add only lightweight projection fields to `CanvasNodeMetadata`:

```ts
productionRecordId?: string;
productionVersion?: number;
productionRootId?: string;
productionChildIds?: string[];
productionExpanded?: boolean;
productionKind?: "scene" | "prop" | "shotboard" | "shot";
```

Do not add complete scene, prop, or shot fields to `CanvasNodeMetadata`.

- [ ] **Step 3: Persist production on the existing project**

Modify `CanvasProject` in `web/src/stores/canvas/use-canvas-store.ts`:

```ts
import { createEmptyProductionProject, type ProductionProject } from "@/types/production";

export type CanvasProject = {
    // existing fields
    production: ProductionProject;
};
```

Add `production: createEmptyProductionProject()` in `createProject()`.

In `importProject()`, require the new data directly:

```ts
production: source.production || createEmptyProductionProject(),
```

Include `"production"` in the `updateProject` patch type:

```ts
updateProject: (
    id: string,
    patch: Partial<
        Pick<
            CanvasProject,
            "nodes" | "connections" | "chatSessions" | "activeChatId" |
            "backgroundMode" | "showImageInfo" | "viewport" | "production"
        >
    >,
) => void;
```

The fallback only covers manually constructed imports during development; do not add version migration logic.

- [ ] **Step 4: Raise the canvas archive version**

Change `CanvasExportFile.version` from `3` to `4` in `web/src/types/canvas-export.ts`.

Change the archive object in `web/src/lib/canvas/canvas-export.ts`:

```ts
const data: CanvasExportFile = {
    app: "frameforge",
    version: 4,
    exportedAt: new Date().toISOString(),
    projects: exportedProjects,
};
```

In `web/src/pages/canvas/index.tsx`, reject non-v4 archives before writing any media:

```ts
if (data.app !== "frameforge" || data.version !== 4 || !Array.isArray(data.projects)) {
    throw new Error("unsupported canvas archive");
}
```

Keep `collectStorageKeys(project)` unchanged; it already recursively includes future production `storageKey` values.

- [ ] **Step 5: Inspect the persistence contract**

Run:

```bash
rg -n "production:|schemaVersion: 1|version: 4|textOutputType" \
  web/src/types/production.ts \
  web/src/types/canvas.ts \
  web/src/stores/canvas/use-canvas-store.ts \
  web/src/types/canvas-export.ts \
  web/src/lib/canvas/canvas-export.ts \
  web/src/pages/canvas/index.tsx
```

Expected:

- `CanvasProject` contains one `production` field.
- Production defaults exist in create/import paths.
- Export and import both require version `4`.
- `textOutputType` includes `shotboard`.

- [ ] **Step 6: Commit**

```bash
git add \
  web/src/types/production.ts \
  web/src/types/canvas.ts \
  web/src/stores/canvas/use-canvas-store.ts \
  web/src/types/canvas-export.ts \
  web/src/lib/canvas/canvas-export.ts \
  web/src/pages/canvas/index.tsx
git commit -m "feat: add production project data

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 2: Add the Generated Production Contract, Validator, and Importer

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Create: `web/src/lib/production/generated-production-schema.ts`
- Create: `web/src/lib/production/generated-production.ts`
- Create: `web/src/lib/production/shotboard-markdown.ts`

**Interfaces:**
- Consumes: `ProductionProject` and domain types from Task 1.
- Produces:

```ts
buildProductionGenerationInput(
    configNodeId: string,
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    production: ProductionProject,
    composerContent?: string,
): ProductionGenerationInput

buildShotboardGenerationPrompt(input: ProductionGenerationInput): string

parseGeneratedProduction(
    text: string,
    catalogs: Pick<ProductionGenerationInput, "characters" | "scenes" | "props">,
): GeneratedProductionDraft

importGeneratedProduction(
    current: ProductionProject,
    draft: GeneratedProductionDraft,
    context: ProductionImportContext,
): ProductionImportResult

shotboardToMarkdown(
    production: ProductionProject,
    shotboardId: string,
): string
```

- Invariant: `parseGeneratedProduction()` has no side effects.
- Invariant: `importGeneratedProduction()` returns new data and never mutates `current`.
- Invariant: generated local IDs are remapped to persistent IDs through an injected `idFactory`.

- [ ] **Step 1: Add Zod as a direct dependency**

Run from `web/`:

```bash
npm install zod@3.25.76
```

Expected file changes:

- `web/package.json` contains `"zod": "^3.25.76"`.
- `web/package-lock.json` records Zod as a direct dependency of the root package.

Do not run any other npm script.

- [ ] **Step 2: Define the strict generated-response schema**

Create `web/src/lib/production/generated-production-schema.ts`.

The top-level schema must be:

```ts
import { z } from "zod";

const id = z.string().trim().min(1);
const text = z.string().trim().min(1);
const textArray = z.array(text);

const generatedScriptSceneSchema = z.object({
    id,
    order: z.number().int().positive(),
    heading: text,
    location: text,
    timeOfDay: text,
    beatIds: z.array(id).min(1),
}).strict();

const generatedScriptBeatSchema = z.object({
    id,
    sceneId: id,
    order: z.number().int().positive(),
    summary: text,
    dramaticFunction: text,
}).strict();

const generatedDialogueCueSchema = z.object({
    id,
    beatId: id,
    characterId: id.optional(),
    speaker: text,
    text,
}).strict();

const generatedVoiceoverCueSchema = z.object({
    id,
    beatId: id,
    speaker: text,
    text,
}).strict();

const generatedSceneCardSchema = z.object({
    id,
    name: text,
    narrativeFunction: text,
    era: text,
    locationType: text,
    spatialLayout: text,
    materials: textArray,
    palette: textArray,
    defaultLighting: text,
    timeVariants: textArray,
    weatherVariants: textArray,
    continuityLocks: textArray.min(1),
    positivePrompt: text,
    negativePrompt: text,
    sourceNote: text,
}).strict();

const generatedPropStateSchema = z.object({
    id,
    name: text,
    description: text,
}).strict();

const generatedPropCardSchema = z.object({
    id,
    name: text,
    narrativeFunction: text,
    ownerCharacterId: id.optional(),
    shape: text,
    material: text,
    colors: textArray,
    scale: text,
    handlingRules: textArray,
    states: z.array(generatedPropStateSchema).min(1),
    continuityLocks: textArray.min(1),
    positivePrompt: text,
    negativePrompt: text,
    sourceNote: text,
}).strict();

const generatedShotBindingSchema = z.object({
    assetId: id,
    role: text,
    state: text.optional(),
}).strict();

const generatedShotSchema = z.object({
    id,
    sceneId: id,
    order: z.number().int().positive(),
    code: text,
    sourceBeatIds: z.array(id).min(1),
    narrativePurpose: text,
    emotionalBeat: text,
    informationGain: text,
    shotCategory: z.enum([
        "establishing",
        "dialogue",
        "emotion-closeup",
        "reaction",
        "prop-detail",
        "action",
        "reveal",
        "transition",
    ]),
    framing: z.object({
        shotSize: text,
        cameraAngle: text,
        composition: text,
        lensIntent: text,
        screenDirection: text,
        cameraMovement: text,
    }).strict(),
    startState: text,
    action: text,
    endState: text,
    continuityNotes: textArray,
    characterBindings: z.array(generatedShotBindingSchema),
    sceneBinding: generatedShotBindingSchema.optional(),
    propBindings: z.array(generatedShotBindingSchema),
    dialogueCueIds: z.array(id),
    voiceoverCueIds: z.array(id),
    soundCues: textArray,
    targetDurationMs: z.number().int().positive(),
    editRelation: z.enum(["cut", "match-cut", "continuous", "transition"]),
}).strict();

const generatedStorySceneSchema = z.object({
    id,
    order: z.number().int().positive(),
    heading: text,
    locationAssetId: id.optional(),
    timeOfDay: text,
    dramaticPurpose: text,
    beatSummary: text,
    shotIds: z.array(id).min(1),
}).strict();

export const generatedProductionSchema = z.object({
    scriptBreakdown: z.object({
        episodeNumber: z.number().int().positive(),
        title: text,
        scenes: z.array(generatedScriptSceneSchema).min(1),
        beats: z.array(generatedScriptBeatSchema).min(1),
        dialogueCues: z.array(generatedDialogueCueSchema),
        voiceoverCues: z.array(generatedVoiceoverCueSchema),
    }).strict(),
    scenes: z.array(generatedSceneCardSchema),
    props: z.array(generatedPropCardSchema),
    shotboard: z.object({
        episodeNumber: z.number().int().positive(),
        title: text,
        targetDurationMs: z.number().int().positive(),
        targetRatio: z.enum(["9:16", "16:9", "1:1", "4:3", "3:4"]),
        scenes: z.array(generatedStorySceneSchema).min(1),
        shots: z.array(generatedShotSchema).min(1),
    }).strict(),
}).strict();

export type GeneratedProductionDraft = z.infer<typeof generatedProductionSchema>;
```

Do not use `.passthrough()`; unknown fields should produce a readable validation error.

- [ ] **Step 3: Build connected-resource catalogs and the model prompt**

Create `web/src/lib/production/generated-production.ts` and define:

```ts
export type ProductionGenerationInput = {
    sourceScriptNodeId: string;
    scriptMarkdown: string;
    directorInstructions: string[];
    characters: Array<{
        id: string;
        version: number;
        name: string;
        role: string;
        appearance: string;
        clothing: string;
        props: string[];
        consistencyLocks: string[];
    }>;
    scenes: Array<{ id: string; version: number; data: SceneCard }>;
    props: Array<{ id: string; version: number; data: PropCard }>;
};
```

`buildProductionGenerationInput()` must:

1. Call `getGenerationResourceNodes(configNodeId, nodes, connections)`.
2. If `composerContent` contains `@[node:<id>]`, retain only the referenced input node IDs; if composer mode is enabled but contains no references, return the same empty-input error behavior as current composer generation.
3. Require exactly one non-empty `Script` node.
4. Treat connected `Text` and `MarkdownDocument` nodes as director instructions.
5. Expand connected `CharacterGroup`, `SceneGroup`, and `PropGroup` child IDs.
6. Map character-card metadata into `characters` with `version: 1`.
7. Read scene/prop records through `productionRecordId` only after the caller supplies the current `ProductionProject`; use this complete signature:

```ts
export function buildProductionGenerationInput(
    configNodeId: string,
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    production: ProductionProject,
    composerContent?: string,
): ProductionGenerationInput
```

Throw these exact Chinese errors:

```ts
if (!scriptNodes.length) throw new Error("结构化分镜需要直接连接 1 个非空剧本节点");
if (scriptNodes.length > 1) throw new Error("结构化分镜一次只能连接 1 个剧本节点");
```

`buildShotboardGenerationPrompt()` must emit:

- The user's director instructions first.
- The exact response JSON contract represented by the Zod schema.
- The script Markdown.
- Character, existing-scene, and existing-prop catalogs as JSON.
- These non-negotiable instructions:

```text
只输出一个 JSON 对象，不要输出 Markdown、解释或思考过程。
每个镜头必须有 startState、action、endState。
每个镜头至少引用一个 scriptBreakdown.beats 的 id。
characterBindings 只能使用人物目录中的精确 id。
已有场景/道具必须沿用目录中的精确 id；缺失场景和关键道具才在 scenes/props 中创建新的局部 id。
不要为群演、普通桌椅或背景装饰创建正式资产。
不要把多个机位或多个叙事事件塞入一个镜头。
镜头总时长应接近 targetDurationMs。
```

- [ ] **Step 4: Parse JSON and report exact paths**

Add:

```ts
export function extractGeneratedJson(text: string) {
    const clean = stripModelThinking(text);
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(clean);
    const candidate = fenced?.[1]?.trim() || clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1).trim();
    if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
        throw new Error("模型没有返回完整 JSON 对象");
    }
    return candidate;
}

export function parseGeneratedProduction(
    text: string,
    catalogs: Pick<ProductionGenerationInput, "characters" | "scenes" | "props">,
): GeneratedProductionDraft {
    let value: unknown;
    try {
        value = JSON.parse(extractGeneratedJson(text));
    } catch (error) {
        if (error instanceof Error && error.message === "模型没有返回完整 JSON 对象") throw error;
        throw new Error(`结构化分镜 JSON 解析失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
    const result = generatedProductionSchema.safeParse(value);
    if (!result.success) {
        const detail = result.error.issues
            .slice(0, 8)
            .map((issue) => `${issue.path.join(".") || "root"}：${issue.message}`)
            .join("；");
        throw new Error(`结构化分镜字段校验失败：${detail}`);
    }
    validateGeneratedProduction(result.data, catalogs);
    return result.data;
}
```

Implement `validateGeneratedProduction()` with reusable helpers:

```ts
function assertUnique(label: string, values: string[]) {
    const duplicate = values.find((value, index) => values.indexOf(value) !== index);
    if (duplicate) throw new Error(`${label}存在重复 ID：${duplicate}`);
}

function assertReferences(label: string, values: string[], allowed: Set<string>) {
    const missing = values.find((value) => !allowed.has(value));
    if (missing) throw new Error(`${label}引用不存在：${missing}`);
}
```

Validate:

- Unique IDs for breakdown scenes, beats, dialogue cues, voiceover cues, generated scenes, props, shotboard scenes, and shots.
- Every breakdown scene `beatId` exists and points back to that scene.
- Every cue `beatId` exists.
- Every shotboard scene `shotId` exists and every shot points back to that scene.
- Every shot `sourceBeatId`, dialogue cue ID, and voiceover cue ID exists.
- Every character binding exists in the connected character catalog; pass the allowed character IDs into parsing with this final signature:

```ts
parseGeneratedProduction(
    text: string,
    catalogs: Pick<ProductionGenerationInput, "characters" | "scenes" | "props">,
): GeneratedProductionDraft
```

- Every scene/prop binding exists either in the connected catalog or generated scene/prop list.
- Shot orders and scene orders are unique.
- Total shot duration is within `60%..140%` of `shotboard.targetDurationMs`; outside this range is a hard validation error in Phase 1.

- [ ] **Step 5: Materialize persistent IDs and merge immutably**

Add:

```ts
export type ProductionImportContext = {
    sourceScriptNodeId: string;
    scriptMarkdown: string;
    characters: ProductionGenerationInput["characters"];
    now: string;
    idFactory: () => string;
};

export type ProductionImportResult = {
    production: ProductionProject;
    scriptBreakdown: ScriptBreakdown;
    shotboard: ShotboardRecord;
    sceneRecordIds: string[];
    propRecordIds: string[];
};
```

Implement:

```ts
export function hashProductionText(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
```

`importGeneratedProduction()` must:

1. Generate persistent IDs for the breakdown, its scenes/beats/cues, generated scene records, generated prop records, the shotboard, shotboard scenes, and shots.
2. Remap all local relationships.
3. Preserve external character IDs from the connected catalog.
4. Preserve existing scene/prop IDs from connected catalogs.
5. Create new `VersionedRecord` entries only for generated scene/prop local IDs.
6. Snapshot connected characters into `production.characters` at version `1` if not present.
7. Set `sourceScriptRevision` to the new breakdown ID.
8. Set every new shot status to `"draft"`.
9. Return:

```ts
{
    production: {
        ...current,
        scriptBreakdowns: [...current.scriptBreakdowns, scriptBreakdown],
        characters: mergedCharacters,
        scenes: [...current.scenes, ...newScenes],
        props: [...current.props, ...newProps],
        shotboards: [...current.shotboards, shotboard],
    },
    scriptBreakdown,
    shotboard,
    sceneRecordIds: newScenes.map((record) => record.id),
    propRecordIds: newProps.map((record) => record.id),
}
```

No function in this file may call a React setter or Zustand store.

- [ ] **Step 6: Render the derived Markdown report**

Create `web/src/lib/production/shotboard-markdown.ts`:

```ts
export function shotboardToMarkdown(production: ProductionProject, shotboardId: string) {
    const shotboard = production.shotboards.find((item) => item.id === shotboardId);
    if (!shotboard) throw new Error("分镜表不存在");
    const shotById = new Map(shotboard.shots.map((shot) => [shot.id, shot]));
    const lines = [
        `# ${shotboard.title}`,
        "",
        `- 集数：第 ${shotboard.episodeNumber} 集`,
        `- 目标时长：${formatDuration(shotboard.targetDurationMs)}`,
        `- 画幅：${shotboard.targetRatio}`,
        `- 场次数：${shotboard.scenes.length}`,
        `- 镜头数：${shotboard.shots.length}`,
        "",
    ];

    shotboard.scenes
        .slice()
        .sort((a, b) => a.order - b.order)
        .forEach((scene) => {
            lines.push(`## 场次 ${scene.order}：${scene.heading}`, "", scene.dramaticPurpose, "");
            scene.shotIds.forEach((shotId) => {
                const shot = shotById.get(shotId);
                if (!shot) return;
                lines.push(
                    `### ${shot.code} · ${shot.narrativePurpose}`,
                    "",
                    `- 类型：${shot.shotCategory}`,
                    `- 景别 / 角度：${shot.framing.shotSize} / ${shot.framing.cameraAngle}`,
                    `- 构图：${shot.framing.composition}`,
                    `- 运镜：${shot.framing.cameraMovement}`,
                    `- 开始状态：${shot.startState}`,
                    `- 动作：${shot.action}`,
                    `- 结束状态：${shot.endState}`,
                    `- 时长：${formatDuration(shot.targetDurationMs)}`,
                    "",
                );
            });
        });
    return lines.join("\n").trim();
}

function formatDuration(durationMs: number) {
    const seconds = durationMs / 1000;
    return Number.isInteger(seconds) ? `${seconds} 秒` : `${seconds.toFixed(1)} 秒`;
}
```

- [ ] **Step 7: Inspect parser boundaries**

Run:

```bash
rg -n "safeParse|validateGeneratedProduction|importGeneratedProduction|shotboardToMarkdown|idFactory|hashProductionText" \
  web/src/lib/production
```

Expected:

- Schema parsing and domain validation are separate.
- Import accepts an injected clock and ID factory.
- No file under `web/src/lib/production/` imports React, Zustand, or a page module.

- [ ] **Step 8: Commit**

```bash
git add \
  web/package.json \
  web/package-lock.json \
  web/src/lib/production/generated-production-schema.ts \
  web/src/lib/production/generated-production.ts \
  web/src/lib/production/shotboard-markdown.ts
git commit -m "feat: add structured shotboard contract

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 3: Build Production Canvas Projections

**Files:**
- Create: `web/src/lib/production/production-canvas-projection.ts`
- Modify: `web/src/constant/canvas.ts`

**Interfaces:**
- Consumes: `ProductionImportResult`, source config node ID/position, existing nodes.
- Produces:

```ts
export type ProductionCanvasProjection = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    rootNodeIds: string[];
    shotboardNodeId: string;
};

export function projectProductionToCanvas(
    imported: ProductionImportResult,
    source: CanvasNodeData,
    idFactory: () => string,
): ProductionCanvasProjection
```

- Invariant: projection creates no domain data and performs no state writes.
- Invariant: every production node stores only record IDs/versions and ownership metadata.

- [ ] **Step 1: Add default sizes and metadata**

In `web/src/constant/canvas.ts`, add:

```ts
[CanvasNodeType.SceneGroup]: { width: 360, height: 220, title: "场景卡组" },
[CanvasNodeType.SceneCard]: { width: 320, height: 220, title: "场景卡" },
[CanvasNodeType.PropGroup]: { width: 360, height: 220, title: "道具卡组" },
[CanvasNodeType.PropCard]: { width: 320, height: 220, title: "道具卡" },
[CanvasNodeType.Shotboard]: { width: 380, height: 240, title: "分镜表" },
[CanvasNodeType.Shot]: { width: 320, height: 220, title: "镜头" },
```

Add node specs:

```ts
[CanvasNodeType.SceneGroup]: {
    ...NODE_DEFAULT_SIZE[CanvasNodeType.SceneGroup],
    metadata: {
        status: "idle",
        productionKind: "scene",
        productionExpanded: true,
        productionChildIds: [],
    },
},
[CanvasNodeType.SceneCard]: {
    ...NODE_DEFAULT_SIZE[CanvasNodeType.SceneCard],
    metadata: { status: "idle", productionKind: "scene" },
},
[CanvasNodeType.PropGroup]: {
    ...NODE_DEFAULT_SIZE[CanvasNodeType.PropGroup],
    metadata: {
        status: "idle",
        productionKind: "prop",
        productionExpanded: true,
        productionChildIds: [],
    },
},
[CanvasNodeType.PropCard]: {
    ...NODE_DEFAULT_SIZE[CanvasNodeType.PropCard],
    metadata: { status: "idle", productionKind: "prop" },
},
[CanvasNodeType.Shotboard]: {
    ...NODE_DEFAULT_SIZE[CanvasNodeType.Shotboard],
    metadata: {
        status: "idle",
        productionKind: "shotboard",
        productionExpanded: true,
        productionChildIds: [],
    },
},
[CanvasNodeType.Shot]: {
    ...NODE_DEFAULT_SIZE[CanvasNodeType.Shot],
    metadata: { status: "idle", productionKind: "shot" },
},
```

- [ ] **Step 2: Create scene and prop group projections**

In `production-canvas-projection.ts`, create one scene root and one prop root only when the import result contains records of that kind.

Layout roots to the right of the source config node:

```ts
const gap = 120;
const columnX = source.position.x + source.width + gap;
const sceneRootY = source.position.y - 260;
const propRootY = source.position.y;
const shotboardRootY = source.position.y + 260;
```

Group metadata:

```ts
{
    status: "success",
    productionKind: "scene",
    productionRecordId: imported.scriptBreakdown.id,
    productionExpanded: true,
    productionChildIds: sceneNodes.map((node) => node.id),
}
```

Child metadata:

```ts
{
    status: "success",
    productionKind: "scene",
    productionRecordId: sceneRecord.id,
    productionVersion: sceneRecord.currentVersion,
    productionRootId: sceneRoot.id,
}
```

Arrange children in two columns:

```ts
function childPosition(root: CanvasNodeData, index: number, width: number, height: number) {
    return {
        x: root.position.x + root.width + 120 + (index % 2) * (width + 36),
        y: root.position.y + Math.floor(index / 2) * (height + 32),
    };
}
```

Connections:

```text
config -> scene group -> scene cards
config -> prop group -> prop cards
```

- [ ] **Step 3: Create shotboard and shot projections**

Create one shotboard root:

```ts
{
    id: idFactory(),
    type: CanvasNodeType.Shotboard,
    title: `第 ${shotboard.episodeNumber} 集 · ${shotboard.title}`,
    position: { x: columnX, y: shotboardRootY },
    width: shotboardSpec.width,
    height: shotboardSpec.height,
    metadata: {
        status: "success",
        productionKind: "shotboard",
        productionRecordId: shotboard.id,
        productionVersion: shotboard.version,
        productionExpanded: true,
        productionChildIds: shotNodes.map((node) => node.id),
    },
}
```

Create shot nodes in scene/order sequence, two columns, with:

```ts
metadata: {
    status: "success",
    productionKind: "shot",
    productionRecordId: shot.id,
    productionVersion: shotboard.version,
    productionRootId: shotboardRoot.id,
}
```

Connections:

```text
config -> shotboard -> each shot
```

Do not connect every character/scene/prop card to every shot in Phase 1; those bindings are represented in Shotboard domain data and become visible/editable in Phase 2.

- [ ] **Step 4: Return one immutable projection**

The final function returns:

```ts
return {
    nodes: [...sceneGroupNodes, ...propGroupNodes, shotboardRoot, ...shotNodes],
    connections: [...sceneConnections, ...propConnections, ...shotConnections],
    rootNodeIds: [sceneRoot?.id, propRoot?.id, shotboardRoot.id].filter(
        (id): id is string => Boolean(id),
    ),
    shotboardNodeId: shotboardRoot.id,
};
```

Throw before returning if any domain record referenced by the import result is missing.

- [ ] **Step 5: Inspect projection metadata**

Run:

```bash
rg -n "productionRecordId|productionRootId|productionChildIds|CanvasNodeType.Shotboard|CanvasNodeType.SceneGroup" \
  web/src/lib/production/production-canvas-projection.ts \
  web/src/constant/canvas.ts
```

Expected:

- Full scene/prop/shot data is absent from canvas metadata.
- Root nodes own child node IDs.
- All generated connections use IDs created by `idFactory`.

- [ ] **Step 6: Commit**

```bash
git add \
  web/src/constant/canvas.ts \
  web/src/lib/production/production-canvas-projection.ts
git commit -m "feat: project shotboards onto canvas

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 4: Register and Render Production Nodes with Collapse Behavior

**Files:**
- Create: `web/src/components/canvas/canvas-production-node-content.tsx`
- Create: `web/src/lib/canvas/canvas-production-groups.ts`
- Modify: `web/src/types/canvas-plugin.ts`
- Modify: `web/src/components/canvas/nodes/builtin-nodes.tsx`
- Modify: `web/src/components/canvas/canvas-side-panel.tsx`
- Modify: `web/src/components/canvas/canvas-node-generation.ts`
- Modify: `web/src/lib/canvas/canvas-resource-references.ts`
- Modify: `web/src/lib/canvas/canvas-auto-layout.ts`
- Modify: `web/src/pages/canvas/hooks/use-plugin-host.tsx`
- Modify: `web/src/pages/canvas/project.tsx`

**Interfaces:**
- Consumes: production records from `CanvasProject.production`.
- Produces:

```ts
productionGroupRootId(node, nodes): string | null
productionGroupChildIds(node): string[]
isHiddenProductionChild(node, nodes, collapsingIds?): boolean
productionChildMotion(node, nodes): { x: number; y: number; index: number } | null
```

- Produces node event: `"production-group:toggle"` with `{ nodeId: string }`.
- Invariant: scene/prop/shotboard roots share one collapse implementation.

- [ ] **Step 1: Add pure production ownership helpers**

Create `web/src/lib/canvas/canvas-production-groups.ts`:

```ts
import type { CanvasNodeData } from "@/types/canvas";

export function productionGroupChildIds(node: CanvasNodeData) {
    return node.metadata?.productionChildIds || [];
}

export function productionGroupRootId(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    const rootId = node.metadata?.productionRootId;
    if (!rootId) return null;
    const root = nodes.find((item) => item.id === rootId);
    return root?.metadata?.productionChildIds?.includes(node.id) ? root.id : null;
}

export function isHiddenProductionChild(
    node: CanvasNodeData,
    nodes: CanvasNodeData[],
    collapsingIds?: Set<string>,
) {
    const rootId = productionGroupRootId(node, nodes);
    if (!rootId) return false;
    if (collapsingIds?.has(rootId)) return false;
    const root = nodes.find((item) => item.id === rootId);
    return Boolean(root && root.metadata?.productionExpanded === false);
}

export function productionChildMotion(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    const rootId = productionGroupRootId(node, nodes);
    if (!rootId) return null;
    const root = nodes.find((item) => item.id === rootId);
    if (!root) return null;
    const index = productionGroupChildIds(root).indexOf(node.id);
    const stackX = root.position.x + 34 + Math.max(index, 0) * 14;
    const stackY = root.position.y + 14 + Math.max(index, 0) * 8;
    return {
        x: stackX - node.position.x,
        y: stackY - node.position.y,
        index: Math.max(index, 0),
    };
}
```

- [ ] **Step 2: Render all six production node types**

Create `canvas-production-node-content.tsx`.

Export one dispatcher:

```ts
export function CanvasProductionNodeContent({ ctx }: { ctx: CanvasNodeContext }) {
    if (ctx.node.type === CanvasNodeType.SceneGroup) return <ProductionGroupContent ctx={ctx} label="场景卡组" />;
    if (ctx.node.type === CanvasNodeType.PropGroup) return <ProductionGroupContent ctx={ctx} label="道具卡组" />;
    if (ctx.node.type === CanvasNodeType.Shotboard) return <ShotboardContent ctx={ctx} />;
    if (ctx.node.type === CanvasNodeType.SceneCard) return <SceneCardContent ctx={ctx} />;
    if (ctx.node.type === CanvasNodeType.PropCard) return <PropCardContent ctx={ctx} />;
    return <ShotContent ctx={ctx} />;
}
```

The component cannot read duplicated metadata. Add `production?: ProductionProject` to `CanvasNodeContext` and `CanvasPluginHost` in `web/src/types/canvas-plugin.ts`, then provide the current project production through `usePluginHost`.

This is required so registered node renderers resolve:

```ts
const record = ctx.production?.scenes.find(
    (item) => item.id === ctx.node.metadata?.productionRecordId,
);
const version = record?.versions.find(
    (item) => item.version === ctx.node.metadata?.productionVersion,
);
```

Render:

- Group: count, names/codes, expanded state, loading/error.
- Scene card: name, spatial layout, default lighting, continuity locks.
- Prop card: name, shape/material/scale, states, continuity locks.
- Shotboard: episode/title, scene count, shot count, target duration/ratio.
- Shot: code, narrative purpose, shot size/angle, start/action/end, duration.

Group buttons emit:

```ts
ctx.emit("production-group:toggle", { nodeId: ctx.node.id });
```

Cards use icons from `lucide-react` and theme values from `ctx.theme`; no hard-coded light/dark backgrounds.

- [ ] **Step 3: Register built-in resources and definitions**

Modify `builtin-nodes.tsx`.

Register all six nodes with `showInCreateMenu: false`.

Root group `resource()` output:

- Scene group: all current-version scene cards as a JSON text catalog.
- Prop group: all current-version prop cards as a JSON text catalog.
- Shotboard: `shotboardToMarkdown(ctx.production, shotboardId)` is not available to the current `resource(node)` signature.

Change the node resource interface to accept optional production:

```ts
resource?: (
    node: CanvasNodeData,
    production?: ProductionProject,
) => CanvasNodeResource | null;
```

Update all resource call sites to pass current production. Keep existing nodes working when production is omitted.

The required call sites are:

- `resourceText()` and `resourceKind()` in `web/src/lib/canvas/canvas-resource-references.ts`.
- `readNodeTextInput()` in `web/src/components/canvas/canvas-node-generation.ts`.
- `buildNodeMentionReferences()`, `getMentionResourceNodes()`, `getGenerationResourceNodes()`, `buildNodeGenerationContext()`, and `buildNodeGenerationInputs()` gain an optional/final `production` argument and forward it.
- `project.tsx` passes the current `production` object when building config inputs, mention references, and generation context.

Production definitions:

```ts
{
    type: CanvasNodeType.SceneGroup,
    title: "场景卡组",
    icon: <Map className={iconClass} />,
    Content: CanvasProductionNodeContent,
    hidePanel: true,
    showInCreateMenu: false,
    resource: builtinResource,
    onDoubleClick: (ctx) => {
        ctx.emit("production-group:toggle", { nodeId: ctx.node.id });
        return true;
    },
}
```

Use equivalent definitions for prop group and shotboard. Scene/prop/shot child cards have no `onDoubleClick` in Phase 1.

- [ ] **Step 4: Integrate collapse visibility and animation**

In `project.tsx`:

1. Add:

```ts
const [collapsingProductionGroupIds, setCollapsingProductionGroupIds] = useState<Set<string>>(new Set());
const [openingProductionGroupIds, setOpeningProductionGroupIds] = useState<Set<string>>(new Set());
```

2. Add one generic toggle:

```ts
const toggleProductionGroupExpanded = useCallback((nodeId: string) => {
    const root = nodesRef.current.find((node) => node.id === nodeId);
    if (!root?.metadata?.productionChildIds?.length) return;
    const expanded = root.metadata.productionExpanded !== false;
    const transientSetter = expanded ? setCollapsingProductionGroupIds : setOpeningProductionGroupIds;
    transientSetter((current) => new Set(current).add(nodeId));
    window.setTimeout(() => {
        transientSetter((current) => {
            const next = new Set(current);
            next.delete(nodeId);
            return next;
        });
    }, expanded ? 320 : 340);
    setNodes((current) =>
        current.map((node) =>
            node.id === nodeId
                ? { ...node, metadata: { ...node.metadata, productionExpanded: !expanded } }
                : node,
        ),
    );
}, []);
```

3. Subscribe to `"production-group:toggle"`.
4. Exclude hidden production children in `visibleNodes`.
5. Exclude hidden production endpoints when rendering connections.
6. Add `productionChildMotion()` to the existing `batchMotion` selection.
7. Include production children when dragging/deleting a selected root.
8. Clear root child IDs when individual child nodes are deleted.

Deleting projection nodes does not delete production records in Phase 1. The domain data remains available in the project archive; this matches the later “projection is not the record” rule.

- [ ] **Step 5: Integrate one-click layout**

Modify `canvas-auto-layout.ts`:

```ts
node.metadata?.productionChildIds?.forEach((id) => ids.add(id));
```

Add production children to `memberIds`, `includeChildrenInLayout`, `isOwnedChild()`, and `orderedChildren()`.

Expanded production groups normalize children to the same two-column grid. Collapsed production groups lay out as one root unit.

- [ ] **Step 6: Add side-panel icons, filters, and summaries**

Modify `canvas-side-panel.tsx`:

- Add icons for scene, prop, shotboard and shot.
- Add filters:

```ts
{ label: "场景", value: CanvasNodeType.SceneCard },
{ label: "道具", value: CanvasNodeType.PropCard },
{ label: "分镜", value: CanvasNodeType.Shot },
```

- Add preview summaries resolved from `production`.
- Pass `production={production}` from `project.tsx` to `CanvasSidePanel`.

- [ ] **Step 7: Inspect group integration**

Run:

```bash
rg -n "production-group:toggle|isHiddenProductionChild|productionChildIds|productionChildMotion" \
  web/src/components/canvas \
  web/src/lib/canvas \
  web/src/pages/canvas/project.tsx
```

Expected:

- One toggle event handles scene, prop and shotboard roots.
- Hidden children are excluded from nodes and connections.
- Auto-layout, drag and delete include production children.

- [ ] **Step 8: Commit**

```bash
git add \
  web/src/types/canvas-plugin.ts \
  web/src/components/canvas/canvas-production-node-content.tsx \
  web/src/lib/canvas/canvas-production-groups.ts \
  web/src/components/canvas/nodes/builtin-nodes.tsx \
  web/src/components/canvas/canvas-side-panel.tsx \
  web/src/components/canvas/canvas-node-generation.ts \
  web/src/lib/canvas/canvas-resource-references.ts \
  web/src/lib/canvas/canvas-auto-layout.ts \
  web/src/pages/canvas/hooks/use-plugin-host.tsx \
  web/src/pages/canvas/project.tsx
git commit -m "feat: add production canvas nodes

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 5: Connect Config-Node Generation to Atomic Shotboard Import

**Files:**
- Modify: `web/src/components/canvas/canvas-config-node-panel.tsx`
- Modify: `web/src/components/canvas/canvas-markdown-reader.tsx`
- Modify: `web/src/pages/canvas/hooks/use-plugin-host.tsx`
- Modify: `web/src/pages/canvas/project.tsx`

**Interfaces:**
- Consumes all pure functions from Tasks 2 and 3.
- Produces a complete atomic UI transaction:

```ts
raw model output
  -> parseGeneratedProduction
  -> importGeneratedProduction
  -> projectProductionToCanvas
  -> setProduction + setNodes + setConnections
```

- Invariant: no loading placeholder output nodes are created for `shotboard`; output nodes appear only after validation and projection succeed.

- [ ] **Step 1: Add “结构化分镜” to config output**

In `CanvasConfigNodePanel`, add:

```ts
{ value: "shotboard", label: "结构化分镜" },
```

When selected, show one muted line under the segmented control:

```tsx
{node.metadata?.textOutputType === "shotboard" ? (
    <div className="mb-2 text-[11px]" style={{ color: theme.node.muted }}>
        需要直接连接剧本；人物卡组、场景卡组和道具卡组可作为资产目录输入。
    </div>
) : null}
```

Do not add a second generation mode; this remains `generationMode: "text"`.

- [ ] **Step 2: Make production part of local project state and undo history**

In `project.tsx` add:

```ts
const [production, setProduction] = useState<ProductionProject>(createEmptyProductionProject());
const productionRef = useRef(production);
```

Set `productionRef.current = production` in the same style as `nodesRef`.

Add `production` to `CanvasHistoryEntry`, `createHistoryEntry()`, comparison, `applyHistory()`, load restoration, clear-canvas behavior, and project persistence:

```ts
updateProject(projectId, {
    nodes,
    connections,
    chatSessions,
    activeChatId,
    backgroundMode,
    showImageInfo,
    production,
});
```

Clearing the canvas sets `production` to `createEmptyProductionProject()` because all production projections and records belong to that canvas.

Undoing a structured-generation action restores production, nodes and connections together.

- [ ] **Step 3: Pass production into node resources and renderers**

Update:

- `usePluginHost({ production, ... })`.
- `CanvasSidePanel production={production}`.
- The `CanvasNode` plugin context path so every built-in `Content` gets the same production object.
- `getNodeDefinition(type)?.resource?.(node, production)` calls in resource references and generation input building.

`CanvasResourceReference` remains text/image/video/audio; production catalogs are exposed as text resources.

- [ ] **Step 4: Add the structured-generation branch**

In `handleGenerateNode`, after config readiness and before generic loading child creation:

```ts
const isStructuredShotboard =
    mode === "text" &&
    sourceNode?.type === CanvasNodeType.Config &&
    sourceNode.metadata?.textOutputType === "shotboard";
```

For this branch:

```ts
setRunningNodeId(nodeId);
const controller = startGenerationRequest(nodeId, nodeId, nodeId);
setNodes((current) =>
    current.map((node) =>
        node.id === nodeId
            ? {
                  ...node,
                  metadata: {
                      ...node.metadata,
                      status: NODE_STATUS_LOADING,
                      errorDetails: undefined,
                      rawModelOutput: undefined,
                  },
              }
            : node,
    ),
);

try {
    const input = buildProductionGenerationInput(
        nodeId,
        nodesRef.current,
        connectionsRef.current,
        productionRef.current,
        sourceNode.metadata?.composerContent,
    );
    const generationPrompt = buildShotboardGenerationPrompt({
        ...input,
        directorInstructions: [
            ...input.directorInstructions,
            ...(prompt.trim() ? [prompt.trim()] : []),
        ],
    });
    const raw = await requestImageQuestion(
        generationConfig,
        [{ role: "user", content: generationPrompt }],
        () => undefined,
        { signal: controller.signal },
    );
    if (controller.signal.aborted) return;
    const draft = parseGeneratedProduction(raw, input);
    const imported = importGeneratedProduction(
        productionRef.current,
        draft,
        {
            sourceScriptNodeId: input.sourceScriptNodeId,
            scriptMarkdown: input.scriptMarkdown,
            characters: input.characters,
            now: new Date().toISOString(),
            idFactory: nanoid,
        },
    );
    const projection = projectProductionToCanvas(imported, sourceNode, nanoid);
    const nextProduction = imported.production;
    const nextNodes = [
        ...nodesRef.current.map((node) =>
            node.id === nodeId
                ? {
                      ...node,
                      metadata: {
                          ...node.metadata,
                          status: NODE_STATUS_SUCCESS,
                          prompt,
                          rawModelOutput: raw,
                          errorDetails: undefined,
                      },
                  }
                : node,
        ),
        ...projection.nodes,
    ];
    const nextConnections = [...connectionsRef.current, ...projection.connections];

    productionRef.current = nextProduction;
    nodesRef.current = nextNodes;
    connectionsRef.current = nextConnections;
    setProduction(nextProduction);
    setNodes(nextNodes);
    setConnections(nextConnections);
    setSelectedNodeIds(new Set([projection.shotboardNodeId]));
    setSelectedConnectionId(null);
    message.success(`已生成 ${imported.shotboard.shots.length} 个结构化镜头`);
} catch (error) {
    if (isGenerationCanceled(error)) return;
    const errorDetails = error instanceof Error ? error.message : "结构化分镜生成失败";
    message.error(errorDetails);
    setNodes((current) =>
        current.map((node) =>
            node.id === nodeId
                ? {
                      ...node,
                      metadata: {
                          ...node.metadata,
                          status: NODE_STATUS_ERROR,
                          errorDetails,
                      },
                  }
                : node,
        ),
    );
} finally {
    finishGenerationRequest(nodeId, controller);
    setRunningNodeId(null);
}
return;
```

Set `rawModelOutput` immediately after the request and before parsing in the catch-safe local variable, then write it to config metadata on parse failure. Do not create scene/prop/shot nodes before `projectProductionToCanvas()` returns.

- [ ] **Step 5: Open a derived Markdown report from the shotboard root**

Generalize `CanvasMarkdownReader` props:

```ts
type CanvasMarkdownReaderProps = {
    node: CanvasNodeData | null;
    labels: CanvasMarkdownReaderLabels;
    contentOverride?: string;
    readOnly?: boolean;
    onChange: (nodeId: string, content: string) => void;
    onClose: () => void;
};
```

Use:

```ts
const content = contentOverride ?? node?.metadata?.content ?? "";
```

When `readOnly`:

- Hide the edit/read toggle.
- Never render the textarea.
- Keep copy, table of contents, close, and `Esc`.
- Change copy success text to `已复制 Markdown`.

In `project.tsx`, when the selected reader node is `Shotboard`, derive:

```ts
const shotboardMarkdown =
    markdownReaderNode?.type === CanvasNodeType.Shotboard &&
    markdownReaderNode.metadata?.productionRecordId
        ? shotboardToMarkdown(production, markdownReaderNode.metadata.productionRecordId)
        : undefined;
```

Open the reader on shotboard double-click by handling a `"shotboard:open"` event from the node definition. Do not overload shotboard double-click with collapse; the card’s explicit chevron toggles collapse, while double-click opens the report.

Revise the Task 4 shotboard definition accordingly:

```ts
onDoubleClick: (ctx) => {
    ctx.emit("shotboard:open", { nodeId: ctx.node.id });
    return true;
},
```

- [ ] **Step 6: Preserve generic text/Markdown behavior**

The existing branch remains:

```ts
const textNodeType =
    textOutputType === "markdown"
        ? CanvasNodeType.MarkdownDocument
        : CanvasNodeType.Text;
```

It must execute only when `textOutputType !== "shotboard"`.

Do not stream partial structured JSON into a text or Markdown node.

- [ ] **Step 7: Inspect the atomic write path**

Run:

```bash
rg -n "isStructuredShotboard|buildProductionGenerationInput|parseGeneratedProduction|projectProductionToCanvas|setProduction|shotboardToMarkdown" \
  web/src/pages/canvas/project.tsx \
  web/src/components/canvas/canvas-config-node-panel.tsx \
  web/src/components/canvas/canvas-markdown-reader.tsx
```

Expected:

- One structured branch returns before generic text child creation.
- Parsing/import/projection complete before setters.
- Production is present in load/save/history paths.
- Shotboard Markdown is derived from production, not stored in node metadata.

- [ ] **Step 8: Commit**

```bash
git add \
  web/src/components/canvas/canvas-config-node-panel.tsx \
  web/src/components/canvas/canvas-markdown-reader.tsx \
  web/src/pages/canvas/hooks/use-plugin-host.tsx \
  web/src/pages/canvas/project.tsx
git commit -m "feat: generate structured shotboards

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 6: Complete Side Effects, Documentation, and Manual Acceptance

**Files:**
- Modify: `web/src/components/canvas/canvas-node-hover-toolbar.tsx`
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/progress/todo.mdx`
- Modify: `docs/content/docs/progress/pending-test.mdx`

**Interfaces:**
- Consumes the complete Phase 1 workflow.
- Produces user-facing labels and a concrete manual acceptance checklist.

- [ ] **Step 1: Add production node labels**

Extend `nodeTypeLabel()`:

```ts
if (node.type === CanvasNodeType.SceneGroup) return "场景卡组";
if (node.type === CanvasNodeType.SceneCard) return "场景卡";
if (node.type === CanvasNodeType.PropGroup) return "道具卡组";
if (node.type === CanvasNodeType.PropCard) return "道具卡";
if (node.type === CanvasNodeType.Shotboard) return "分镜表";
if (node.type === CanvasNodeType.Shot) return "镜头";
```

Do not add Phase 2 editing actions to the hover toolbar.

- [ ] **Step 2: Update the changelog**

Add one line under `Unreleased`:

```md
+ [新增] 生成配置支持从剧本与人物、场景、道具目录生成结构化分镜，并创建可折叠的分镜表和镜头节点。
```

- [ ] **Step 3: Move Phase 1 from TODO to pending test**

Replace the existing broad TODO line with:

```md
- AI 漫剧生产后续：继续按 `docs/superpowers/specs/2026-07-25-production-shotboard-and-jimeng-handoff-design.md` 实现阶段 2-4，包括镜头工作台、模式推荐、控制资产、即梦任务单、候选回填与剪映标准生产包。
```

Add to `pending-test.mdx`:

```md
- 结构化分镜阶段 1：将非空 Markdown 剧本直接连接到生成配置，文本模式输出选择“结构化分镜”后应生成场景卡组、道具卡组和分镜表；分镜表展开后应显示按场次和镜号排序的镜头节点，折叠/展开动画、连线、一键整理和撤销应正常；双击分镜表应全屏阅读由 Shotboard 派生的 Markdown，不能编辑派生报告；模型返回非法 JSON、重复 ID、丢失剧情节拍或无效资产引用时不应创建任何半成品节点，配置节点应显示具体字段错误并保留原始输出；刷新、导出 v4 压缩包并重新导入后，生产数据、节点和连线应完整恢复。
```

- [ ] **Step 4: Perform focused source inspection**

Run:

```bash
git diff --check
rg -n "结构化分镜|CanvasNodeType.Shotboard|productionRecordId|version: 4" \
  web/src \
  CHANGELOG.md \
  docs/content/docs/progress
git status --short
```

Expected:

- `git diff --check` prints nothing.
- Structured output, node types, production IDs, and archive v4 all have call sites.
- Only files in this plan are modified.

Do not run `npm run typecheck`, `npm run build`, tests, or formatting.

- [ ] **Step 5: Leave the user this browser acceptance sequence**

The implementation handoff must report these exact manual checks:

1. Create a fresh canvas and paste a Markdown episode script.
2. Generate or connect a character group.
3. Create a config node and directly connect the script and character group.
4. Select `文本 -> 结构化分镜`.
5. Start generation.
6. Confirm one scene group, one prop group, one shotboard and their child nodes appear only after the request validates.
7. Double-click each root and verify collapse/expand; use the shotboard chevron for collapse and double-click the body for full-screen Markdown.
8. Confirm the derived Markdown contains scene headings and each shot’s start/action/end state.
9. Connect the generated scene/prop groups to another config node and confirm they count as text inputs.
10. Trigger one-click layout and verify each root/child set stays together.
11. Undo and redo the generation; production data and nodes must move together.
12. Refresh the page.
13. Export the canvas, delete it, import the v4 archive, and confirm all production records and projections return.
14. Force an invalid model response and confirm no partial production nodes are created.

- [ ] **Step 6: Commit**

```bash
git add \
  web/src/components/canvas/canvas-node-hover-toolbar.tsx \
  CHANGELOG.md \
  docs/content/docs/progress/todo.mdx \
  docs/content/docs/progress/pending-test.mdx
git commit -m "docs: record structured shotboard phase one

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Plan Self-Review

### Spec Coverage

- Production data root and one persistent source: Task 1.
- Script revision, beat IDs, scene/prop types, shotboard schema: Tasks 1-2.
- Mature schema validation and strict all-or-nothing import: Task 2.
- Config-node `shotboard` output: Task 5.
- Scene/prop/shotboard roots and child canvas nodes: Tasks 3-4.
- Two-layer shotboard canvas expression: Tasks 3-4.
- Collapse animation and one-click layout: Task 4.
- Derived Markdown report: Tasks 2 and 5.
- Project persistence, undo/redo, export/import: Tasks 1 and 5.
- User-visible docs and pending verification: Task 6.
- Phase 2-4 scope is explicitly excluded.

### Type Consistency

- `CanvasNodeMetadata.productionRecordId` identifies the domain record for all projections.
- `productionRootId` and `productionChildIds` are only canvas ownership fields.
- `ShotboardRecord.sourceScriptRevision` references `ScriptBreakdown.id`.
- Generated local IDs are accepted only inside `GeneratedProductionDraft`; persistent IDs are created by `importGeneratedProduction()`.
- `projectProductionToCanvas()` consumes `ProductionImportResult` and never parses model output.
- Markdown rendering consumes `ProductionProject + shotboardId`, never node content.

### Verification Constraint

This repository has no test script and its `AGENTS.md` explicitly says not to execute syntax checks, builds, or tests after coding. The plan therefore keeps core logic pure and injects ID/time dependencies for later testability, but limits execution-time verification to source inspection, `git diff --check`, and the documented browser acceptance sequence.
