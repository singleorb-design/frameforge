import { jsonrepair } from "jsonrepair";

import { extractGeneratedJson } from "@/lib/production/generated-production";
import { actionObjectName, isInvalidCharacterCandidate, isSemanticCharacterTerm } from "@/lib/production/character-name-filter";
import { matchShotAssets } from "@/lib/production/shot-preflight";
import { shotPreflightOutputSchema, type ShotPreflightModelOutput } from "@/lib/production/shot-preflight-schema";
import type { ProductionProject, Shot, ShotAssetBinding, ShotPreflightIssue, ShotPreflightPatch, ShotboardRecord } from "@/types/production";

export type ShotPreflightRequestBatch = {
    id: string;
    shotboardId: string;
    preferredAssetIds: string[];
    allowedAssetIds: string[];
    shots: Array<{
        shot: Shot;
        match: ReturnType<typeof matchShotAssets>;
        beats: Array<{ id: string; summary: string; dramaticFunction: string }>;
        dialogue: Array<{ speaker: string; text: string }>;
        voiceover: Array<{ speaker: string; text: string }>;
        previous?: { code: string; endState: string; characterStates: string[]; propStates: string[] };
        next?: { code: string; startState: string };
    }>;
    assets: {
        characters: Array<{ id: string; version: number; name: string; role: string; appearance: string; clothing: string; consistencyLocks: string[] }>;
        scenes: Array<{ id: string; version: number; name: string; narrativeFunction: string; spatialLayout: string; lighting: string; continuityLocks: string[] }>;
        props: Array<{ id: string; version: number; name: string; narrativeFunction: string; states: string[]; continuityLocks: string[] }>;
    };
};

export function buildShotPreflightBatches(
    production: ProductionProject,
    shotboardId: string,
    preferredAssetIds: string[] = [],
    targetShotIds?: string[],
): ShotPreflightRequestBatch[] {
    const shotboard = requiredShotboard(production, shotboardId);
    const breakdown = production.scriptBreakdowns.find((item) => item.id === shotboard.sourceScriptRevision);
    if (!breakdown) throw new Error("镜头来源剧本结构不存在");
    const allowed = new Set([
        ...production.characters.map((item) => item.id),
        ...production.scenes.map((item) => item.id),
        ...production.props.map((item) => item.id),
    ]);
    const targets = targetShotIds ? new Set(targetShotIds) : null;
    const shotById = new Map(shotboard.shots.map((shot) => [shot.id, shot]));
    const ordered = shotboard.scenes
        .slice()
        .sort((a, b) => a.order - b.order)
        .flatMap((scene) => scene.shotIds.map((id) => shotById.get(id)).filter((shot): shot is Shot => Boolean(shot)));
    const indexById = new Map(ordered.map((shot, index) => [shot.id, index]));
    const batches: ShotPreflightRequestBatch[] = [];
    shotboard.scenes
        .slice()
        .sort((a, b) => a.order - b.order)
        .forEach((scene) => {
            const shots = scene.shotIds
                .map((id) => shotById.get(id))
                .filter((shot): shot is Shot => Boolean(shot) && (!targets || targets.has(shot!.id)));
            for (let offset = 0; offset < shots.length; offset += 8) {
                const group = shots.slice(offset, offset + 8);
                batches.push({
                    id: `preflight-${shotboardId}-${scene.id}-${offset}`,
                    shotboardId,
                    preferredAssetIds: preferredAssetIds.filter((id) => allowed.has(id)),
                    allowedAssetIds: Array.from(allowed),
                    assets: compactAssets(production),
                    shots: group.map((shot) => {
                        const index = indexById.get(shot.id) || 0;
                        const previous = ordered[index - 1];
                        const next = ordered[index + 1];
                        return {
                            shot,
                            match: matchShotAssets(production, shotboardId, shot.id, preferredAssetIds),
                            beats: shot.sourceBeatIds.flatMap((id) => {
                                const beat = breakdown.beats.find((item) => item.id === id);
                                return beat ? [{ id: beat.id, summary: beat.summary, dramaticFunction: beat.dramaticFunction }] : [];
                            }),
                            dialogue: shot.dialogueCueIds.flatMap((id) => {
                                const cue = breakdown.dialogueCues.find((item) => item.id === id);
                                return cue ? [{ speaker: cue.speaker, text: cue.text }] : [];
                            }),
                            voiceover: shot.voiceoverCueIds.flatMap((id) => {
                                const cue = breakdown.voiceoverCues.find((item) => item.id === id);
                                return cue ? [{ speaker: cue.speaker, text: cue.text }] : [];
                            }),
                            previous: previous
                                ? {
                                      code: previous.code,
                                      endState: previous.endState,
                                      characterStates: previous.characterBindings.map(bindingState),
                                      propStates: previous.propBindings.map(bindingState),
                                  }
                                : undefined,
                            next: next ? { code: next.code, startState: next.startState } : undefined,
                        };
                    }),
                });
            }
        });
    return batches;
}

export function buildShotPreflightPrompt(batch: ShotPreflightRequestBatch) {
    const context = {
        preferredAssetIds: batch.preferredAssetIds,
        assets: batch.assets,
        shots: batch.shots.map(({ shot, match, beats, dialogue, voiceover, previous, next }) => ({
            shotId: shot.id,
            code: shot.code,
            current: {
                narrativePurpose: shot.narrativePurpose,
                emotionalBeat: shot.emotionalBeat,
                informationGain: shot.informationGain,
                shotCategory: shot.shotCategory,
                framing: shot.framing,
                startState: shot.startState,
                action: shot.action,
                endState: shot.endState,
                continuityNotes: shot.continuityNotes,
                soundCues: shot.soundCues,
                targetDurationMs: shot.targetDurationMs,
                editRelation: shot.editRelation,
            },
            lockedFieldPaths: shot.preflight.lockedFieldPaths,
            ruleMatches: {
                characters: match.characterBindings,
                scene: match.sceneBinding,
                props: match.propBindings,
                issues: match.issues,
            },
            beats,
            dialogue,
            voiceover,
            previous,
            next,
        })),
    };
    return `你是 AI 漫剧镜头整理师。根据结构化剧本、当前镜头和正式资产目录，为每个镜头返回可执行的补丁与异常。

只输出一个 JSON 对象，不要输出 Markdown、解释、思考过程或 <think>。
每个输入 shotId 必须且只能返回一次。
禁止增加或删除镜头，禁止修改 shotId、镜号、顺序、剧情节拍、对白、旁白、画幅和资产目录。
禁止创造资产 ID；assetStates 只能引用 assets 中的精确 id。
缺少资产时写入 issues，禁止虚构绑定；missing-character 的 suggestedName 只能来自人物目录、角色卡或对白说话人，不得从普通剧情句子中猜测新人物名。
动作描述不得被当作人物名：例如“沈夜手持玉佩”中的人物是“沈夜”，玉佩是道具；“手持玉佩”“握着黑戒”等不能作为 missing-character 的 suggestedName。
“身份”“角色设定”“人物设定”“镜头”“动作”“场景”等语义字段不是人物名，不能作为 missing-character 的 suggestedName。
“都废了”“配不上”“认命”“笑话”等状态、评价或口语短句不是人物名，不能作为 missing-character 的 suggestedName。
道具名称可省略颜色、年代或来源修饰词；例如目录中的“旧玉佩”可对应镜头中的“玉佩”，应保留/补充该道具绑定而非报缺少人物。
lockedFieldPaths 中的字段禁止返回修改值。
连线资产 preferredAssetIds 优先，规则已精确匹配的资产必须保留。
confidence 只有确定无歧义时才能为 high。

输出格式：
{
  "shots": [{
    "shotId": "",
    "summary": "一句可读镜头摘要",
    "confidence": "high",
    "fields": {
      "narrativePurpose": "",
      "emotionalBeat": "",
      "informationGain": "",
      "shotCategory": "establishing",
      "framing": {
        "shotSize": "",
        "cameraAngle": "",
        "composition": "",
        "lensIntent": "",
        "screenDirection": "",
        "cameraMovement": ""
      },
      "startState": "",
      "action": "",
      "endState": "",
      "continuityNotes": [],
      "soundCues": [],
      "targetDurationMs": 3000,
      "editRelation": "cut"
    },
    "assetStates": [{
      "assetId": "必须来自资产目录",
      "kind": "character",
      "role": "",
      "state": "",
      "confidence": "high",
      "reason": ""
    }],
    "issues": [{
      "kind": "missing-prop",
      "severity": "blocking",
      "message": "",
      "assetKind": "prop",
      "suggestedName": "",
      "candidateAssetIds": []
    }]
  }]
}

允许枚举：
- shotCategory: establishing | dialogue | emotion-closeup | reaction | prop-detail | action | reveal | transition
- editRelation: cut | match-cut | continuous | transition
- kind: missing-character | missing-scene | missing-prop | ambiguous-character | ambiguous-asset | state-conflict | stale-version | insufficient-context
- severity: blocking | review | optional

上下文：
${JSON.stringify(context, null, 2)}`;
}

export function parseShotPreflightOutput(text: string, batch: ShotPreflightRequestBatch): ShotPreflightPatch[] {
    const json = extractRepairableJson(text);
    let value: unknown;
    try {
        value = JSON.parse(json);
    } catch {
        value = JSON.parse(jsonrepair(json));
    }
    const parsed = shotPreflightOutputSchema.safeParse(normalizeShotPreflightOutput(value));
    if (!parsed.success) {
        const detail = parsed.error.issues.slice(0, 8).map((item) => `${item.path.join(".")}：${item.message}`).join("；");
        throw new Error(`AI 镜头整理字段校验失败：${detail}`);
    }
    validateOutput(parsed.data, batch);
    return parsed.data.shots.map((item) => toPatch(item, batch));
}

function toPatch(item: ShotPreflightModelOutput["shots"][number], batch: ShotPreflightRequestBatch): ShotPreflightPatch {
    const source = (fieldPath: string, reason: string) => ({ fieldPath, source: "ai" as const, confidence: item.confidence, reason });
    const fieldSources = Object.keys(item.fields).flatMap((field) =>
        field === "framing" && item.fields.framing
            ? Object.keys(item.fields.framing).map((name) => source(`framing.${name}`, "AI 根据剧本和相邻镜头补全"))
            : [source(field, "AI 根据剧本和相邻镜头补全")],
    );
    return {
        shotId: item.shotId,
        summary: item.summary,
        fields: item.fields,
        fieldSources,
        confidence: item.confidence,
        assetMatches: item.assetStates.map((state) => {
            const record = findRecord(batch, state.kind, state.assetId);
            return {
                assetId: state.assetId,
                version: record.version,
                role: state.role,
                state: state.state,
                kind: state.kind,
                confidence: state.confidence,
                reason: state.reason,
            };
        }),
        issues: [
            ...item.issues.flatMap((modelIssue, index) => issueFromModel(item.shotId, modelIssue, index, batch)),
            ...item.assetStates
                .filter((asset) => asset.confidence !== "high")
                .map((asset, index) => ({
                    id: `${item.shotId}:ambiguous-asset:confidence:${index}`,
                    kind: asset.kind === "character" ? "ambiguous-character" as const : "ambiguous-asset" as const,
                    severity: "review" as const,
                    message: `${asset.assetId} 的匹配置信度不足，请确认`,
                    shotIds: [item.shotId],
                    assetKind: asset.kind,
                    candidateAssetIds: [asset.assetId],
                    status: "open" as const,
                })),
        ],
    };
}

function extractRepairableJson(text: string) {
    try {
        return extractGeneratedJson(text);
    } catch {
        const clean = text.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim();
        const start = clean.indexOf("{");
        return start >= 0 ? clean.slice(start) : clean;
    }
}

function normalizeShotPreflightOutput(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const root = value as Record<string, unknown>;
    if (!Array.isArray(root.shots)) return value;
    return {
        ...root,
        shots: root.shots.map((shot) => {
            if (!shot || typeof shot !== "object" || Array.isArray(shot)) return shot;
            const source = shot as Record<string, unknown>;
            return {
                ...source,
                assetStates: Array.isArray(source.assetStates)
                    ? source.assetStates.map((asset) => pickFields(asset, ["assetId", "kind", "role", "state", "confidence", "reason"]))
                    : source.assetStates,
                issues: Array.isArray(source.issues)
                    ? source.issues.map((issue) => pickFields(issue, ["kind", "severity", "message", "assetKind", "suggestedName", "candidateAssetIds"]))
                    : source.issues,
            };
        }),
    };
}

function pickFields(value: unknown, fields: string[]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const source = value as Record<string, unknown>;
    return Object.fromEntries(fields.filter((field) => field in source).map((field) => [field, source[field]]));
}

function validateOutput(value: ShotPreflightModelOutput, batch: ShotPreflightRequestBatch) {
    const expected = new Set(batch.shots.map((item) => item.shot.id));
    const seen = new Set<string>();
    value.shots.forEach((shot) => {
        if (!expected.has(shot.shotId)) throw new Error(`AI 镜头整理引用批次外镜头：${shot.shotId}`);
        if (seen.has(shot.shotId)) throw new Error(`AI 镜头整理重复返回镜头：${shot.shotId}`);
        seen.add(shot.shotId);
        shot.assetStates.forEach((asset) => {
            if (!batch.allowedAssetIds.includes(asset.assetId)) throw new Error(`AI 镜头整理引用不存在资产：${asset.assetId}`);
        });
    });
    const missing = Array.from(expected).find((id) => !seen.has(id));
    if (missing) throw new Error(`AI 镜头整理漏掉镜头：${missing}`);
}

function compactAssets(production: ProductionProject): ShotPreflightRequestBatch["assets"] {
    return {
        characters: production.characters.map((record) => {
            const data = currentData(record);
            return { id: record.id, version: record.currentVersion, name: data.name, role: data.role, appearance: data.appearance, clothing: data.clothing, consistencyLocks: data.consistencyLocks };
        }),
        scenes: production.scenes.map((record) => {
            const data = currentData(record);
            return { id: record.id, version: record.currentVersion, name: data.name, narrativeFunction: data.narrativeFunction, spatialLayout: data.spatialLayout, lighting: data.defaultLighting, continuityLocks: data.continuityLocks };
        }),
        props: production.props.map((record) => {
            const data = currentData(record);
            return { id: record.id, version: record.currentVersion, name: data.name, narrativeFunction: data.narrativeFunction, states: data.states.map((state) => `${state.name}：${state.description}`), continuityLocks: data.continuityLocks };
        }),
    };
}

function findRecord(batch: ShotPreflightRequestBatch, kind: "character" | "scene" | "prop", id: string) {
    const list = kind === "character" ? batch.assets.characters : kind === "scene" ? batch.assets.scenes : batch.assets.props;
    const record = list.find((item) => item.id === id);
    if (!record) throw new Error(`AI 镜头整理引用不存在资产：${id}`);
    return record;
}

function currentData<T>(record: { currentVersion: number; versions: Array<{ version: number; data: T }> }) {
    const version = record.versions.find((item) => item.version === record.currentVersion);
    if (!version) throw new Error(`资产当前版本不存在：v${record.currentVersion}`);
    return version.data;
}

function bindingState(item: ShotAssetBinding) {
    return `${item.assetId}：${item.state || "默认状态"}`;
}

function issueFromModel(
    shotId: string,
    item: ShotPreflightModelOutput["shots"][number]["issues"][number],
    index: number,
    batch: ShotPreflightRequestBatch,
): ShotPreflightIssue[] {
    const corrected = correctActionObjectIssue(item, batch);
    if (!corrected) return [];
    const prompt = corrected.suggestedName && corrected.assetKind
        ? {
              positivePrompt: `${corrected.suggestedName}，${corrected.assetKind === "character" ? "人物设定卡" : corrected.assetKind === "scene" ? "无人物场景参考图" : "关键道具设定图"}，AI 漫剧生产参考，主体清晰，外观和状态可重复复现`,
              negativePrompt: "文字，水印，模糊，变形，多余主体，现代无关元素",
              recommendedRatio: corrected.assetKind === "character" ? "3:2" : corrected.assetKind === "scene" ? "16:9" : "1:1",
          }
        : undefined;
    return [{
        id: `${shotId}:${corrected.kind}:ai:${index}`,
        kind: corrected.kind,
        severity: corrected.severity,
        message: corrected.message,
        shotIds: [shotId],
        assetKind: corrected.assetKind,
        suggestedName: corrected.suggestedName,
        candidateAssetIds: corrected.candidateAssetIds,
        prompt,
        status: "open",
    }];
}

function correctActionObjectIssue(
    item: ShotPreflightModelOutput["shots"][number]["issues"][number],
    batch: ShotPreflightRequestBatch,
) {
    if (item.assetKind === "character" && !isTrustedCharacterIssue(item, batch)) return null;
    if (item.assetKind !== "character" || !item.suggestedName || !isInvalidCharacterCandidate(item.suggestedName)) return item;
    if (isSemanticCharacterTerm(item.suggestedName)) return null;
    const suggestedName = actionObjectName(item.suggestedName);
    const existing = batch.assets.props.find((asset) => propAliases(asset.name).some((alias) => normalizeName(alias) === normalizeName(suggestedName)));
    if (existing) return null;
    return {
        ...item,
        kind: "missing-prop" as const,
        message: `缺少关键道具：${suggestedName}`,
        assetKind: "prop" as const,
        suggestedName,
    };
}

function isTrustedCharacterIssue(
    item: ShotPreflightModelOutput["shots"][number]["issues"][number],
    batch: ShotPreflightRequestBatch,
) {
    if (!item.suggestedName) return false;
    const name = normalizeName(item.suggestedName);
    if (!name || isInvalidCharacterCandidate(item.suggestedName)) return false;
    const characterNames = new Set(batch.assets.characters.map((asset) => normalizeName(asset.name)));
    const speakers = new Set(batch.shots.flatMap((entry) => entry.dialogue.map((cue) => normalizeName(cue.speaker))));
    return characterNames.has(name) || speakers.has(name) || Boolean(item.candidateAssetIds?.some((id) => batch.assets.characters.some((asset) => asset.id === id)));
}

function propAliases(name: string) {
    const base = name.trim();
    const core = base.replace(/^(?:旧|古|祖传|订亲|黑色|幽紫色|金色|银色|神秘|破碎|完整|染血)/, "");
    return core.length >= 2 && core !== base ? [base, core] : [base];
}

function normalizeName(value: string) {
    return value.replace(/[\s·・._\-:：,，。'"“”‘’]/g, "").toLowerCase();
}

function requiredShotboard(production: ProductionProject, id: string): ShotboardRecord {
    const shotboard = production.shotboards.find((item) => item.id === id);
    if (!shotboard) throw new Error("分镜表不存在");
    return shotboard;
}
