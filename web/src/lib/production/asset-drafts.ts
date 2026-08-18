import { z } from "zod";
import { jsonrepair } from "jsonrepair";

import { extractGeneratedJson } from "@/lib/production/generated-production";
import { validateShot } from "@/lib/production/shotboard-editor";
import type {
    AssetDraft,
    CharacterCardSnapshot,
    ProductionProject,
    PropCard,
    SceneCard,
    ShotPreflightIssue,
    VersionedRecord,
} from "@/types/production";

const text = z.string().trim().min(1);
const stringArray = z.array(text);
const characterSchema = z.object({
    sourceNodeId: z.string(),
    name: text,
    role: text,
    appearance: text,
    clothing: text,
    props: stringArray,
    positivePrompt: text,
    negativePrompt: text,
    consistencyLocks: stringArray.min(1),
}).strict();
const sceneSchema = z.object({
    name: text,
    narrativeFunction: text,
    era: text,
    locationType: text,
    spatialLayout: text,
    materials: stringArray,
    palette: stringArray,
    defaultLighting: text,
    timeVariants: stringArray,
    weatherVariants: stringArray,
    continuityLocks: stringArray.min(1),
    positivePrompt: text,
    negativePrompt: text,
    sourceNote: text,
}).strict();
const propSchema = z.object({
    name: text,
    narrativeFunction: text,
    ownerCharacterId: text.optional(),
    shape: text,
    material: text,
    colors: stringArray,
    scale: text,
    handlingRules: stringArray,
    states: z.array(z.object({ id: text, name: text, description: text }).strict()).min(1),
    continuityLocks: stringArray.min(1),
    positivePrompt: text,
    negativePrompt: text,
    sourceNote: text,
}).strict();

const draftSchema = z.object({
    name: text,
    data: z.unknown(),
    imagePrompt: text,
    negativePrompt: text,
    recommendedRatio: text,
}).strict();

export type AssetDraftContext = {
    issue: ShotPreflightIssue;
    shotIds: string[];
    beatIds: string[];
    context: Array<{
        shotId: string;
        code: string;
        narrativePurpose: string;
        startState: string;
        action: string;
        endState: string;
        beats: string[];
        dialogue: string[];
    }>;
};

export type AssetDraftAdoption = {
    production: ProductionProject;
    recordId: string;
    version: number;
    kind: AssetDraft["kind"];
    data: AssetDraft["data"];
    sourceShotIds: string[];
};

export function findAssetDraftContext(production: ProductionProject, shotboardId: string, issueId: string): AssetDraftContext {
    const shotboard = production.shotboards.find((item) => item.id === shotboardId);
    if (!shotboard) throw new Error("分镜表不存在");
    const sourceIssue = shotboard.shots.flatMap((shot) => shot.preflight.issues).find((issue) => issue.id === issueId);
    if (!sourceIssue?.assetKind || !sourceIssue.suggestedName) throw new Error("该异常不支持生成资产卡");
    const key = issueKey(sourceIssue);
    const matching = shotboard.shots.flatMap((shot) =>
        shot.preflight.issues
            .filter((issue) => issue.status === "open" && issueKey(issue) === key)
            .map((issue) => ({ shot, issue })),
    );
    const breakdown = production.scriptBreakdowns.find((item) => item.id === shotboard.sourceScriptRevision);
    const shotIds = Array.from(new Set(matching.map((item) => item.shot.id)));
    const beatIds = Array.from(new Set(matching.flatMap((item) => item.shot.sourceBeatIds)));
    return {
        issue: sourceIssue,
        shotIds,
        beatIds,
        context: matching.map(({ shot }) => ({
            shotId: shot.id,
            code: shot.code,
            narrativePurpose: shot.narrativePurpose,
            startState: shot.startState,
            action: shot.action,
            endState: shot.endState,
            beats: shot.sourceBeatIds.flatMap((id) => {
                const beat = breakdown?.beats.find((item) => item.id === id);
                return beat ? [beat.summary] : [];
            }),
            dialogue: shot.dialogueCueIds.flatMap((id) => {
                const cue = breakdown?.dialogueCues.find((item) => item.id === id);
                return cue ? [`${cue.speaker}：${cue.text}`] : [];
            }),
        })),
    };
}

export function buildAssetDraftPrompt(production: ProductionProject, shotboardId: string, issueId: string) {
    const context = findAssetDraftContext(production, shotboardId, issueId);
    const kind = context.issue.assetKind!;
    const dataShape =
        kind === "character"
            ? `{"sourceNodeId":"","name":"","role":"","appearance":"","clothing":"","props":[],"positivePrompt":"","negativePrompt":"","consistencyLocks":[""]}`
            : kind === "scene"
              ? `{"name":"","narrativeFunction":"","era":"","locationType":"","spatialLayout":"","materials":[],"palette":[],"defaultLighting":"","timeVariants":[],"weatherVariants":[],"continuityLocks":[""],"positivePrompt":"","negativePrompt":"","sourceNote":""}`
              : `{"name":"","narrativeFunction":"","shape":"","material":"","colors":[],"scale":"","handlingRules":[],"states":[{"id":"state-1","name":"","description":""}],"continuityLocks":[""],"positivePrompt":"","negativePrompt":"","sourceNote":""}`;
    return `你是 AI 漫剧资产设计师。根据相关镜头生成一份${kindLabel(kind)}资产卡草案。

只输出一个 JSON 对象，不要输出数组、Markdown、解释、思考过程或 <think>。
资产名称必须为“${context.issue.suggestedName}”。
只设计这一项资产，不新增其他人物、场景或道具。
设定必须覆盖所有相关镜头中的状态变化，并给出可复用的一致性锁定。
“data”必须是对象；“recommendedRatio”必须填写，人物为 3:2，场景为 16:9，道具为 1:1。

输出格式：
{
  "name": "${context.issue.suggestedName}",
  "data": ${dataShape},
  "imagePrompt": "",
  "negativePrompt": "",
  "recommendedRatio": "${kind === "character" ? "3:2" : kind === "scene" ? "16:9" : "1:1"}"
}

相关镜头：
${JSON.stringify(context.context, null, 2)}`;
}

export function buildMissingAssetPreviewPrompt(production: ProductionProject, shotboardId: string, issueId: string) {
    const context = findAssetDraftContext(production, shotboardId, issueId);
    const kind = context.issue.assetKind!;
    const contextText = context.context
        .flatMap((shot) => [shot.narrativePurpose, shot.startState, shot.action, shot.endState, ...shot.beats, ...shot.dialogue])
        .filter(Boolean)
        .join("；");
    const style =
        kind === "character"
            ? "high-quality stylized 3D animation character design for Chinese fantasy AI comic drama, detailed PBR costume materials, cinematic soft key light, full body, three-quarter front view, clean muted studio background, complete body visible, no text"
            : kind === "scene"
              ? "high-quality stylized 3D animation environment for Chinese fantasy AI comic drama, cinematic 3D environment modeling, detailed PBR architecture materials, empty environment, no people, wide establishing composition, no text"
              : "high-quality stylized 3D animation prop design for Chinese fantasy AI comic drama, detailed PBR material, product-level 3D modeling, centered isolated object, three-quarter front view, no hands, no people, no text";
    const negative =
        "2D flat illustration, anime cel shading, photoreal human, realistic live-action face, chibi, low poly, toy plastic look, distorted anatomy, bad hands, extra fingers, multiple people, cropped body, text, watermark, logo, blur, overexposure, unrelated modern elements";
    return {
        positivePrompt: `${kindLabel(kind)}: ${context.issue.suggestedName}, story context: ${contextText}, ${style}`,
        negativePrompt: negative,
        recommendedRatio: kind === "character" ? "3:2" : kind === "scene" ? "16:9" : "1:1",
    };
}

export function parseAssetDraft(
    textValue: string,
    context: AssetDraftContext,
    idFactory: () => string,
    now: string,
): AssetDraft {
    const json = extractAssetDraftJson(textValue);
    let value: unknown;
    try {
        value = JSON.parse(json);
    } catch {
        value = JSON.parse(jsonrepair(json));
    }
    const parsed = draftSchema.safeParse(normalizeAssetDraftOutput(value, context));
    if (!parsed.success) {
        const detail = parsed.error.issues.slice(0, 8).map((item) => `${item.path.join(".")}：${item.message}`).join("；");
        throw new Error(`资产卡草案字段校验失败：${detail}`);
    }
    const kind = context.issue.assetKind!;
    const data = dataSchemaFor(kind).safeParse(parsed.data.data);
    if (!data.success) {
        const detail = data.error.issues.slice(0, 8).map((item) => `data.${item.path.join(".")}：${item.message}`).join("；");
        throw new Error(`资产卡草案字段校验失败：${detail}`);
    }
    if (parsed.data.name !== context.issue.suggestedName) throw new Error("资产卡草案名称与缺失资产不一致");
    return {
        id: idFactory(),
        kind,
        name: parsed.data.name,
        sourceShotIds: context.shotIds,
        sourceBeatIds: context.beatIds,
        data: data.data,
        imagePrompt: parsed.data.imagePrompt,
        negativePrompt: parsed.data.negativePrompt,
        recommendedRatio: parsed.data.recommendedRatio,
        status: "draft",
        createdAt: now,
    };
}

function normalizeAssetDraftOutput(value: unknown, context: AssetDraftContext) {
    const expectedName = context.issue.suggestedName!;
    const root = unwrapAssetObject(value, expectedName);
    if (!isRecord(root)) return root;
    const kind = context.issue.assetKind!;
    const embedded = root.data ?? root.asset ?? root.assetCard ?? root.payload;
    const rawData = embedded === undefined ? flatAssetData(root) : unwrapAssetObject(embedded, expectedName);
    if (!isRecord(rawData)) throw new Error("资产卡草案的 data 必须是一个对象");
    const imagePrompt = firstText(root.imagePrompt, root.prompt, context.issue.prompt?.positivePrompt);
    const negativePrompt = firstText(root.negativePrompt, root.negative, context.issue.prompt?.negativePrompt);
    const data = normalizeAssetData(rawData, kind, expectedName, imagePrompt, negativePrompt);
    return {
        name: firstText(root.name, data.name) || expectedName,
        data,
        imagePrompt: firstText(imagePrompt, data.positivePrompt),
        negativePrompt: firstText(negativePrompt, data.negativePrompt),
        recommendedRatio: firstText(root.recommendedRatio, root.ratio, root.aspectRatio, root.size) || defaultRatio(kind),
    };
}

function dataSchemaFor(kind: AssetDraft["kind"]) {
    return kind === "character" ? characterSchema : kind === "scene" ? sceneSchema : propSchema;
}

function unwrapAssetObject(value: unknown, expectedName: string): unknown {
    if (!Array.isArray(value)) return value;
    const candidates = value.filter(
        (item): item is Record<string, unknown> =>
            isRecord(item) && typeof item.name === "string" && normalize(item.name) === normalize(expectedName),
    );
    if (candidates.length === 1) return candidates[0];
    if (value.length === 1) return value[0];
    throw new Error("资产卡草案返回了多个对象，无法确定应采用哪一项");
}

function flatAssetData(root: Record<string, unknown>) {
    const { name: _name, imagePrompt: _imagePrompt, prompt: _prompt, negativePrompt: _negativePrompt, negative: _negative, recommendedRatio: _recommendedRatio, ratio: _ratio, aspectRatio: _aspectRatio, size: _size, ...data } = root;
    return data;
}

function normalizeAssetData(
    source: Record<string, unknown>,
    kind: AssetDraft["kind"],
    expectedName: string,
    imagePrompt: string,
    negativePrompt: string,
) {
    const name = firstText(source.name) || expectedName;
    const positivePrompt = firstText(source.positivePrompt, imagePrompt);
    const negative = firstText(source.negativePrompt, negativePrompt);
    if (kind === "character") {
        return {
            sourceNodeId: firstText(source.sourceNodeId),
            name,
            role: firstText(source.role),
            appearance: firstText(source.appearance, source.look, source.description),
            clothing: firstText(source.clothing, source.costume, source.outfit),
            props: textArray(source.props, source.signatureProps, source.accessories),
            positivePrompt,
            negativePrompt: negative,
            consistencyLocks: textArray(source.consistencyLocks, source.continuityLocks, source.locks, defaultLocks(name)),
        };
    }
    if (kind === "scene") {
        return {
            name,
            narrativeFunction: firstText(source.narrativeFunction, source.function),
            era: firstText(source.era, source.period),
            locationType: firstText(source.locationType, source.type),
            spatialLayout: firstText(source.spatialLayout, source.layout),
            materials: textArray(source.materials),
            palette: textArray(source.palette, source.colors),
            defaultLighting: firstText(source.defaultLighting, source.lighting),
            timeVariants: textArray(source.timeVariants, source.timeOfDay),
            weatherVariants: textArray(source.weatherVariants, source.weather),
            continuityLocks: textArray(source.continuityLocks, source.consistencyLocks, source.locks, defaultLocks(name)),
            positivePrompt,
            negativePrompt: negative,
            sourceNote: firstText(source.sourceNote, source.source, defaultSourceNote(name)),
        };
    }
    return {
        name,
        narrativeFunction: firstText(source.narrativeFunction, source.function),
        ownerCharacterId: firstText(source.ownerCharacterId, source.ownerId) || undefined,
        shape: firstText(source.shape, source.appearance, source.description),
        material: firstText(source.material),
        colors: textArray(source.colors, source.palette),
        scale: firstText(source.scale, source.size),
        handlingRules: textArray(source.handlingRules, source.usage, source.rules),
        states: propStates(source.states, name),
        continuityLocks: textArray(source.continuityLocks, source.consistencyLocks, source.locks, defaultLocks(name)),
        positivePrompt,
        negativePrompt: negative,
        sourceNote: firstText(source.sourceNote, source.source, defaultSourceNote(name)),
    };
}

function propStates(value: unknown, name: string) {
    if (!Array.isArray(value) || !value.length) return [{ id: "state-1", name: "默认状态", description: `${name} 的常规可用状态` }];
    return value.map((item, index) => {
        if (typeof item === "string") return { id: `state-${index + 1}`, name: item, description: item };
        if (!isRecord(item)) return item;
        return {
            id: firstText(item.id) || `state-${index + 1}`,
            name: firstText(item.name, item.state),
            description: firstText(item.description, item.detail, item.name, item.state),
        };
    });
}

function textArray(...values: unknown[]) {
    for (const value of values) {
        if (Array.isArray(value)) {
            const items = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
            if (items.length) return items;
        }
        if (typeof value === "string" && value.trim()) return [value];
    }
    return [];
}

function firstText(...values: unknown[]) {
    return values.find((item): item is string => typeof item === "string" && Boolean(item.trim()))?.trim() || "";
}

function defaultRatio(kind: AssetDraft["kind"]) {
    return kind === "character" ? "3:2" : kind === "scene" ? "16:9" : "1:1";
}

function defaultLocks(name: string) {
    return [`保持${name}的外观、主色和关键结构一致`];
}

function defaultSourceNote(name: string) {
    return `根据相关镜头生成：${name}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function addAssetDraft(production: ProductionProject, shotboardId: string, draft: AssetDraft): ProductionProject {
    return {
        ...production,
        shotboards: production.shotboards.map((shotboard) =>
            shotboard.id === shotboardId
                ? {
                      ...shotboard,
                      assetDrafts: [...shotboard.assetDrafts.filter((item) => !(item.status === "draft" && item.kind === draft.kind && normalize(item.name) === normalize(draft.name))), draft],
                      shots: updateIssueDraftStatus(shotboard.shots, draft.kind, draft.name, "ready"),
                  }
                : shotboard,
        ),
    };
}

export function setAssetDraftIssueStatus(
    production: ProductionProject,
    shotboardId: string,
    issueId: string,
    status: NonNullable<ShotPreflightIssue["assetDraftStatus"]>,
    error?: string,
    startedAt?: string,
): ProductionProject {
    const shotboard = production.shotboards.find((item) => item.id === shotboardId);
    const issue = shotboard?.shots.flatMap((shot) => shot.preflight.issues).find((item) => item.id === issueId);
    if (!shotboard || !issue?.assetKind || !issue.suggestedName) return production;
    return {
        ...production,
        shotboards: production.shotboards.map((item) =>
            item.id === shotboardId
                ? {
                      ...item,
                      shots: updateIssueDraftStatus(item.shots, issue.assetKind!, issue.suggestedName!, status, error, startedAt),
                  }
                : item,
        ),
    };
}

export function discardAssetDraft(production: ProductionProject, shotboardId: string, draftId: string): ProductionProject {
    return {
        ...production,
        shotboards: production.shotboards.map((shotboard) =>
            shotboard.id === shotboardId
                ? { ...shotboard, assetDrafts: shotboard.assetDrafts.map((draft) => draft.id === draftId ? { ...draft, status: "discarded" } : draft) }
                : shotboard,
        ),
    };
}

export function adoptAssetDraft(
    production: ProductionProject,
    shotboardId: string,
    draftId: string,
    now: string,
    idFactory: () => string,
): AssetDraftAdoption {
    const shotboard = production.shotboards.find((item) => item.id === shotboardId);
    const draft = shotboard?.assetDrafts.find((item) => item.id === draftId);
    if (!shotboard || !draft || draft.status !== "draft") throw new Error("资产卡草案不存在或已经处理");
    const recordId = idFactory();
    const record = versioned(recordId, draft.data, now);
    let next: ProductionProject = {
        ...production,
        characters: draft.kind === "character" ? [...production.characters, record as VersionedRecord<CharacterCardSnapshot>] : production.characters,
        scenes: draft.kind === "scene" ? [...production.scenes, record as VersionedRecord<SceneCard>] : production.scenes,
        props: draft.kind === "prop" ? [...production.props, record as VersionedRecord<PropCard>] : production.props,
        shotboards: production.shotboards.map((item) =>
            item.id === shotboardId
                ? {
                      ...item,
                      assetDrafts: item.assetDrafts.map((candidate) => candidate.id === draftId ? { ...candidate, status: "adopted" } : candidate),
                      shots: item.shots.map((shot) => {
                          if (!draft.sourceShotIds.includes(shot.id)) return shot;
                          const binding = { assetId: recordId, version: 1, role: defaultRole(draft.kind), state: "" };
                          return {
                              ...shot,
                              characterBindings: draft.kind === "character" ? appendBinding(shot.characterBindings, binding) : shot.characterBindings,
                              sceneBinding: draft.kind === "scene" ? binding : shot.sceneBinding,
                              propBindings: draft.kind === "prop" ? appendBinding(shot.propBindings, binding) : shot.propBindings,
                              preflight: {
                                  ...shot.preflight,
                                  status: "pending",
                                  issues: shot.preflight.issues.map((issue) =>
                                      issue.status === "open" && issue.assetKind === draft.kind && normalize(issue.suggestedName || "") === normalize(draft.name)
                                          ? { ...issue, status: "resolved" }
                                          : issue,
                                  ),
                              },
                              updatedAt: now,
                          };
                      }),
                  }
                : item,
        ),
    };
    const currentBoard = next.shotboards.find((item) => item.id === shotboardId)!;
    currentBoard.shots.filter((shot) => draft.sourceShotIds.includes(shot.id)).forEach((shot) => {
        const blockers = validateShot(next, shotboardId, shot.id);
        next = {
            ...next,
            shotboards: next.shotboards.map((item) =>
                item.id === shotboardId
                    ? {
                          ...item,
                          shots: item.shots.map((candidate) =>
                              candidate.id === shot.id
                                  ? {
                                        ...candidate,
                                        blockers,
                                        status: !blockers.some((blocker) => blocker.severity === "error") && !candidate.preflight.issues.some((issue) => issue.status === "open" && issue.severity !== "optional")
                                            ? "shot-approved"
                                            : "draft",
                                        preflight: {
                                            ...candidate.preflight,
                                            status: !blockers.some((blocker) => blocker.severity === "error") && !candidate.preflight.issues.some((issue) => issue.status === "open" && issue.severity !== "optional")
                                                ? "ready"
                                                : "needs-review",
                                        },
                                    }
                                  : candidate,
                          ),
                      }
                    : item,
            ),
        };
    });
    return { production: next, recordId, version: 1, kind: draft.kind, data: draft.data, sourceShotIds: draft.sourceShotIds };
}

function versioned<T>(id: string, data: T, createdAt: string): VersionedRecord<T> {
    return { id, currentVersion: 1, versions: [{ version: 1, data, createdAt }] };
}
function appendBinding<T extends { assetId: string }>(values: T[], value: T) {
    return values.some((item) => item.assetId === value.assetId) ? values : [...values, value];
}
function defaultRole(kind: AssetDraft["kind"]) {
    return kind === "character" ? "镜头人物" : kind === "scene" ? "主场景" : "关键道具";
}
function kindLabel(kind: AssetDraft["kind"]) {
    return kind === "character" ? "Character" : kind === "scene" ? "Environment" : "Prop";
}
function issueKey(issue: ShotPreflightIssue) {
    return `${issue.assetKind}:${normalize(issue.suggestedName || "")}`;
}

function updateIssueDraftStatus(
    shots: ProductionProject["shotboards"][number]["shots"],
    kind: NonNullable<ShotPreflightIssue["assetKind"]>,
    name: string,
    status: NonNullable<ShotPreflightIssue["assetDraftStatus"]>,
    error?: string,
    startedAt?: string,
) {
    return shots.map((shot) => ({
        ...shot,
        preflight: {
            ...shot.preflight,
            issues: shot.preflight.issues.map((issue) =>
                issue.status === "open" && issue.assetKind === kind && normalize(issue.suggestedName || "") === normalize(name)
                    ? {
                          ...issue,
                          assetDraftStatus: status,
                          assetDraftError: error,
                          assetDraftStartedAt: status === "generating" ? startedAt : undefined,
                      }
                    : issue,
            ),
        },
    }));
}

function normalize(value: string) {
    return value.replace(/[\s·・._\-:：,，。'"“”‘’]/g, "").toLowerCase();
}

function extractAssetDraftJson(textValue: string) {
    const clean = textValue.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim();
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(clean)?.[1]?.trim() || clean;
    const arrayStart = fenced.search(/\[\s*\{/);
    const objectStart = fenced.indexOf("{");
    if (arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart)) {
        const end = fenced.lastIndexOf("]");
        if (end > arrayStart) return fenced.slice(arrayStart, end + 1).trim();
    }
    return extractGeneratedJson(fenced);
}
