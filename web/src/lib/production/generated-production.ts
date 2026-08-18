import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import { jsonrepair } from "jsonrepair";
import { isInvalidCharacterCandidate } from "@/lib/production/character-name-filter";
import type {
    CharacterCardSnapshot,
    ProductionProject,
    PropCard,
    SceneCard,
    ScriptBreakdown,
    Shot,
    ShotAssetBinding,
    ShotboardRecord,
    VersionedRecord,
} from "@/types/production";
import { generatedProductionSchema, type GeneratedProductionDraft } from "./generated-production-schema";
import { createPendingPreflight } from "./shot-preflight";

export type ProductionGenerationInput = {
    sourceScriptNodeId: string;
    scriptMarkdown: string;
    directorInstructions: string[];
    characters: Array<{
        id: string;
        sourceNodeId: string;
        version: number;
        name: string;
        role: string;
        appearance: string;
        clothing: string;
        props: string[];
        positivePrompt: string;
        negativePrompt: string;
        consistencyLocks: string[];
    }>;
    scenes: Array<{ id: string; version: number; data: SceneCard }>;
    props: Array<{ id: string; version: number; data: PropCard }>;
};

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

export function buildProductionGenerationInput(
    configNodeId: string,
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    production: ProductionProject,
    composerContent?: string,
): ProductionGenerationInput {
    const directIds = connections.filter((connection) => connection.toNodeId === configNodeId).map((connection) => connection.fromNodeId);
    const referencedIds = composerContent ? Array.from(composerContent.matchAll(/@\[node:([^\]]+)\]/g), (match) => match[1]) : [];
    const selectedIds = referencedIds.length ? new Set(referencedIds) : null;
    const directNodes = directIds
        .filter((id) => !selectedIds || selectedIds.has(id))
        .map((id) => nodes.find((node) => node.id === id))
        .filter((node): node is CanvasNodeData => Boolean(node));
    const scripts = directNodes.filter((node) => node.type === CanvasNodeType.Script && node.metadata?.content?.trim());
    if (!scripts.length) throw new Error("结构化分镜需要直接连接 1 个非空剧本节点");
    if (scripts.length > 1) throw new Error("结构化分镜一次只能连接 1 个剧本节点");

    const characters = expandGroupChildren(directNodes, nodes, CanvasNodeType.CharacterGroup).flatMap((node) => {
        if (node.type !== CanvasNodeType.CharacterCard || !node.metadata?.name) return [];
        return [
            {
                id: node.metadata.productionRecordId || node.id,
                sourceNodeId: node.id,
                version: node.metadata.productionVersion || 1,
                name: node.metadata.name,
                role: node.metadata.role || "",
                appearance: [node.metadata.body, node.metadata.face, node.metadata.hair].filter(Boolean).join("，"),
                clothing: node.metadata.clothing || "",
                props: node.metadata.props || [],
                positivePrompt: node.metadata.positivePrompt || "",
                negativePrompt: node.metadata.negativePrompt || "",
                consistencyLocks: node.metadata.consistencyLocks || [],
            },
        ];
    });
    const sceneIds = directNodes.flatMap((node) =>
        node.type === CanvasNodeType.SceneGroup
            ? node.metadata?.productionRecordIds || []
            : node.type === CanvasNodeType.SceneCard && node.metadata?.productionRecordId
              ? [node.metadata.productionRecordId]
              : [],
    );
    const propIds = directNodes.flatMap((node) =>
        node.type === CanvasNodeType.PropGroup
            ? node.metadata?.productionRecordIds || []
            : node.type === CanvasNodeType.PropCard && node.metadata?.productionRecordId
              ? [node.metadata.productionRecordId]
              : [],
    );
    const directorInstructions = directNodes.flatMap((node) =>
        node.type === CanvasNodeType.Text || node.type === CanvasNodeType.MarkdownDocument ? [node.metadata?.content || node.metadata?.prompt || ""] : [],
    ).filter(Boolean);

    return {
        sourceScriptNodeId: scripts[0].id,
        scriptMarkdown: scripts[0].metadata?.content || "",
        directorInstructions,
        characters: uniqueById(characters),
        scenes: Array.from(new Set(sceneIds)).flatMap((id) => {
            const record = production.scenes.find((item) => item.id === id);
            const version = record?.versions.find((item) => item.version === record.currentVersion);
            return record && version ? [{ id, version: version.version, data: version.data }] : [];
        }),
        props: Array.from(new Set(propIds)).flatMap((id) => {
            const record = production.props.find((item) => item.id === id);
            const version = record?.versions.find((item) => item.version === record.currentVersion);
            return record && version ? [{ id, version: version.version, data: version.data }] : [];
        }),
    };
}

export function buildShotboardGenerationPrompt(input: ProductionGenerationInput) {
    const directorInstructions = normalizeDirectorInstructions(input.directorInstructions, input.scriptMarkdown);
    const scriptMarkdown = selectRequestedEpisode(input.scriptMarkdown, directorInstructions);
    return `你是 AI 漫剧导演和分镜师。请把剧本拆解为可用于后续镜头生产的结构化数据。

导演要求：
${directorInstructions.length ? directorInstructions.join("\n\n") : "遵循剧本原意，强调情绪清晰、动作克制和镜头可执行性。"}

只输出一个 JSON 对象，不要输出 Markdown、解释或思考过程。
只处理导演要求指定的单集；如果要求“第一集”，严禁输出第二集及后续集内容。
每个镜头必须有 startState、action、endState。
每个镜头至少引用一个 scriptBreakdown.beats 的 id。
characterBindings 只能使用人物目录中的精确 id。
人物目录为空时，dialogueCues 不要输出 characterId，所有 characterBindings 输出空数组；严禁自行编造人物 id。
已有场景/道具必须沿用目录中的精确 id；缺失场景和关键道具才在 scenes/props 中创建新的局部 id。
不要为群演、普通桌椅或背景装饰创建正式资产。
不要把多个机位或多个叙事事件塞入一个镜头。
所有镜头 targetDurationMs 的总和必须等于 shotboard.targetDurationMs。
scenes 和 props 的 sourceNote 必须是非空字符串，说明内容来自剧本原文还是合理推断。
scenes 和 props 的 continuityLocks 至少包含一条非空、可执行的一致性约束；没有特殊要求时写“保持整体外观与空间关系一致”。
shotCategory 只能从以下值选择：establishing、dialogue、emotion-closeup、reaction、prop-detail、action、reveal、transition。

输出 JSON 结构：
{
  "scriptBreakdown": {
    "episodeNumber": 1,
    "title": "",
    "scenes": [{"id":"script-scene-1","order":1,"heading":"","location":"","timeOfDay":"","beatIds":["beat-1"]}],
    "beats": [{"id":"beat-1","sceneId":"script-scene-1","order":1,"summary":"","dramaticFunction":""}],
    "dialogueCues": [${input.characters.length ? '{"id":"dialogue-1","beatId":"beat-1","characterId":"人物目录精确id","speaker":"","text":""}' : '{"id":"dialogue-1","beatId":"beat-1","speaker":"","text":""}'}],
    "voiceoverCues": [{"id":"voiceover-1","beatId":"beat-1","speaker":"","text":""}]
  },
  "scenes": [{
    "id":"new-scene-1","name":"","narrativeFunction":"","era":"","locationType":"","spatialLayout":"",
    "materials":[],"palette":[],"defaultLighting":"","timeVariants":[],"weatherVariants":[],
    "continuityLocks":[""],"positivePrompt":"","negativePrompt":"","sourceNote":""
  }],
  "props": [{
    "id":"new-prop-1","name":"","narrativeFunction":"","shape":"","material":"","colors":[],"scale":"",
    "handlingRules":[],"states":[{"id":"state-1","name":"","description":""}],"continuityLocks":[""],
    "positivePrompt":"","negativePrompt":"","sourceNote":""
  }],
  "shotboard": {
    "episodeNumber": 1,
    "title": "",
    "targetDurationMs": 90000,
    "targetRatio": "9:16",
    "scenes": [{"id":"story-scene-1","order":1,"heading":"","locationAssetId":"已有或新场景id","timeOfDay":"","dramaticPurpose":"","beatSummary":"","shotIds":["shot-1"]}],
    "shots": [{
      "id":"shot-1","sceneId":"story-scene-1","order":1,"code":"001","sourceBeatIds":["beat-1"],
      "narrativePurpose":"","emotionalBeat":"","informationGain":"","shotCategory":"emotion-closeup",
      "framing":{"shotSize":"","cameraAngle":"","composition":"","lensIntent":"","screenDirection":"","cameraMovement":""},
      "startState":"","action":"","endState":"","continuityNotes":[],
      "characterBindings":${input.characters.length ? '[{"assetId":"人物目录精确id","role":"","state":""}]' : "[]"},
      "sceneBinding":{"assetId":"已有或新场景id","role":""},
      "propBindings":[{"assetId":"已有或新道具id","role":"","state":""}],
      "dialogueCueIds":[],"voiceoverCueIds":[],"soundCues":[],"targetDurationMs":3000,"editRelation":"cut"
    }]
  }
}

人物目录：
${JSON.stringify(input.characters, null, 2)}

已有场景目录：
${JSON.stringify(input.scenes, null, 2)}

已有道具目录：
${JSON.stringify(input.props, null, 2)}

剧本：
${scriptMarkdown}`;
}

export function extractGeneratedJson(text: string) {
    const clean = stripThinking(text);
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(clean);
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    const candidate = fenced?.[1]?.trim() || (start >= 0 && end > start ? clean.slice(start, end + 1).trim() : clean.trim());
    if (!candidate.startsWith("{") || !candidate.endsWith("}")) throw new Error("模型没有返回完整 JSON 对象");
    return candidate;
}

export function parseGeneratedProduction(
    text: string,
    catalogs: Pick<ProductionGenerationInput, "characters" | "scenes" | "props">,
): GeneratedProductionDraft {
    let value: unknown;
    let json: string;
    try {
        json = extractGeneratedJson(text);
    } catch (error) {
        throw new Error(`结构化分镜 JSON 解析失败：${errorMessage(error)}`);
    }
    try {
        value = JSON.parse(json);
    } catch (parseError) {
        try {
            value = JSON.parse(jsonrepair(json));
        } catch (repairError) {
            throw new Error(
                `结构化分镜 JSON 解析失败：${errorMessage(parseError)}；本地修复失败：${errorMessage(repairError)}`,
            );
        }
    }
    const result = generatedProductionSchema.safeParse(normalizeGeneratedProduction(value, catalogs));
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

export function isRepairableProductionError(error: unknown) {
    const message = errorMessage(error);
    return message.startsWith("结构化分镜 JSON 解析失败：") || message.startsWith("结构化分镜字段校验失败：");
}

export function buildProductionJsonRepairPrompt(text: string, error: unknown) {
    let json = text.trim();
    try {
        json = extractGeneratedJson(text);
    } catch {
        // Keep the original response so the repair model can recover truncated JSON.
    }
    return `你是 JSON 修复器。修复下面的结构化分镜 JSON，只输出修复后的单个 JSON 对象。

错误信息：
${errorMessage(error)}

规则：
1. 只修复 JSON 语法、损坏或缺失的字段名、缺失的冒号/逗号/引号/括号，以及明显的字段类型错误。
2. 禁止增加、删除、合并或重排场次、剧情节拍、对白、场景、道具和镜头。
3. 禁止改写台词、创作内容、ID、引用、镜号、顺序、画幅或时长。
4. 根据相邻对象恢复损坏字段名。常用字段包括：
   scriptBreakdown、episodeNumber、title、scenes、beats、dialogueCues、voiceoverCues；
   id、order、heading、location、timeOfDay、beatIds、sceneId、summary、dramaticFunction、beatId、speaker、text；
   name、narrativeFunction、era、locationType、spatialLayout、materials、palette、defaultLighting、timeVariants、weatherVariants、continuityLocks、positivePrompt、negativePrompt、sourceNote；
   ownerCharacterId、shape、material、colors、scale、handlingRules、states、description；
   shotboard、targetDurationMs、targetRatio、dramaticPurpose、beatSummary、shotIds、shots；
   code、sourceBeatIds、narrativePurpose、emotionalBeat、informationGain、shotCategory、framing、shotSize、cameraAngle、composition、lensIntent、screenDirection、cameraMovement；
   startState、action、endState、continuityNotes、characterBindings、sceneBinding、propBindings、assetId、role、state、dialogueCueIds、voiceoverCueIds、soundCues、editRelation。
5. 不要输出 Markdown、解释、思考过程或 <think> 标签。

待修复 JSON：
${json}`;
}

export function importGeneratedProduction(
    current: ProductionProject,
    draft: GeneratedProductionDraft,
    context: ProductionImportContext,
): ProductionImportResult {
    const breakdownId = context.idFactory();
    const scriptSceneMap = idMap(draft.scriptBreakdown.scenes, context.idFactory);
    const beatMap = idMap(draft.scriptBreakdown.beats, context.idFactory);
    const dialogueMap = idMap(draft.scriptBreakdown.dialogueCues, context.idFactory);
    const voiceoverMap = idMap(draft.scriptBreakdown.voiceoverCues, context.idFactory);
    const newSceneMap = idMap(draft.scenes, context.idFactory);
    const newPropMap = idMap(draft.props, context.idFactory);
    const storySceneMap = idMap(draft.shotboard.scenes, context.idFactory);
    const shotMap = idMap(draft.shotboard.shots, context.idFactory);
    const characterVersion = new Map(context.characters.map((item) => [item.id, item.version]));
    const existingSceneVersion = new Map(current.scenes.map((item) => [item.id, item.currentVersion]));
    const existingPropVersion = new Map(current.props.map((item) => [item.id, item.currentVersion]));
    const sceneId = (id: string) => newSceneMap.get(id) || id;
    const propId = (id: string) => newPropMap.get(id) || id;
    const sceneVersion = (id: string) => (newSceneMap.has(id) ? 1 : existingSceneVersion.get(id) || 1);
    const propVersion = (id: string) => (newPropMap.has(id) ? 1 : existingPropVersion.get(id) || 1);
    const scriptBreakdown: ScriptBreakdown = {
        id: breakdownId,
        sourceScriptNodeId: context.sourceScriptNodeId,
        revision: breakdownId,
        markdownHash: hashProductionText(context.scriptMarkdown),
        episodeNumber: draft.scriptBreakdown.episodeNumber,
        title: draft.scriptBreakdown.title,
        characterNames: extractScriptCharacterNames(context.scriptMarkdown),
        scenes: draft.scriptBreakdown.scenes.map((item) => ({
            ...item,
            id: scriptSceneMap.get(item.id)!,
            beatIds: item.beatIds.map((id) => beatMap.get(id)!),
        })),
        beats: draft.scriptBreakdown.beats.map((item) => ({ ...item, id: beatMap.get(item.id)!, sceneId: scriptSceneMap.get(item.sceneId)! })),
        dialogueCues: draft.scriptBreakdown.dialogueCues.map((item) => ({ ...item, id: dialogueMap.get(item.id)!, beatId: beatMap.get(item.beatId)! })),
        voiceoverCues: draft.scriptBreakdown.voiceoverCues.map((item) => ({ ...item, id: voiceoverMap.get(item.id)!, beatId: beatMap.get(item.beatId)! })),
        createdAt: context.now,
    };
    const newScenes: Array<VersionedRecord<SceneCard>> = draft.scenes.map(({ id, ...data }) => versioned(newSceneMap.get(id)!, data, context.now));
    const newProps: Array<VersionedRecord<PropCard>> = draft.props.map(({ id, ...data }) => ({
        ...versioned(newPropMap.get(id)!, { ...data, states: data.states.map((state) => ({ ...state, id: context.idFactory() })) }, context.now),
    }));
    const shotboardId = context.idFactory();
    const shots: Shot[] = draft.shotboard.shots.map((item) => ({
        ...item,
        id: shotMap.get(item.id)!,
        sceneId: storySceneMap.get(item.sceneId)!,
        sourceBeatIds: item.sourceBeatIds.map((id) => beatMap.get(id)!),
        characterBindings: item.characterBindings.map((binding) => materializeBinding(binding, binding.assetId, characterVersion.get(binding.assetId) || 1)),
        sceneBinding: item.sceneBinding ? materializeBinding(item.sceneBinding, sceneId(item.sceneBinding.assetId), sceneVersion(item.sceneBinding.assetId)) : undefined,
        propBindings: item.propBindings.map((binding) => materializeBinding(binding, propId(binding.assetId), propVersion(binding.assetId))),
        dialogueCueIds: item.dialogueCueIds.map((id) => dialogueMap.get(id)!),
        voiceoverCueIds: item.voiceoverCueIds.map((id) => voiceoverMap.get(id)!),
        revision: 1,
        history: [],
        status: "draft",
        blockers: [],
        planHistory: [],
        controlAssets: [],
        jimengTasks: [],
        candidates: [],
        preflight: createPendingPreflight(),
        createdAt: context.now,
        updatedAt: context.now,
    }));
    const shotboard: ShotboardRecord = {
        id: shotboardId,
        version: 1,
        sourceScriptNodeId: context.sourceScriptNodeId,
        sourceScriptRevision: breakdownId,
        episodeNumber: draft.shotboard.episodeNumber,
        title: draft.shotboard.title,
        targetDurationMs: draft.shotboard.targetDurationMs,
        targetRatio: draft.shotboard.targetRatio,
        scenes: draft.shotboard.scenes.map((item) => ({
            ...item,
            id: storySceneMap.get(item.id)!,
            locationAssetId: item.locationAssetId ? sceneId(item.locationAssetId) : undefined,
            shotIds: item.shotIds.map((id) => shotMap.get(id)!),
        })),
        shots,
        continuityFindings: [],
        preflightBatches: [],
        assetDrafts: [],
        generatedAt: context.now,
        updatedAt: context.now,
    };
    let mergedCharacters = [...current.characters];
    context.characters.forEach((item) => {
        const data: CharacterCardSnapshot = {
            sourceNodeId: item.sourceNodeId,
            name: item.name,
            role: item.role,
            appearance: item.appearance,
            clothing: item.clothing,
            props: item.props,
            positivePrompt: item.positivePrompt,
            negativePrompt: item.negativePrompt,
            consistencyLocks: item.consistencyLocks,
        };
        const existing = mergedCharacters.find((record) => record.id === item.id);
        if (!existing) {
            mergedCharacters.push(versionedAt(item.id, item.version, data, context.now));
            return;
        }
        const nextVersions = existing.versions.some((version) => version.version === item.version)
            ? existing.versions
            : [...existing.versions, { version: item.version, data, createdAt: context.now }];
        mergedCharacters = mergedCharacters.map((record) =>
            record.id === item.id ? { ...record, currentVersion: item.version, versions: nextVersions } : record,
        );
    });
    return {
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
    };
}

export function hashProductionText(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function extractScriptCharacterNames(markdown: string) {
    const heading = /^(\#{1,3})\s*主要人物[^\n]*$/m.exec(markdown);
    if (heading?.index === undefined) return [];
    const section = markdown.slice(heading.index + heading[0].length);
    const untilNextSection = section.search(/^\#{1,2}\s+\S/m);
    const content = untilNextSection >= 0 ? section.slice(0, untilNextSection) : section;
    return Array.from(
        new Set(
            Array.from(content.matchAll(/^\#{3,6}\s+(.+?)\s*$/gm), (match) => match[1].replace(/[*`]/g, "").trim())
                .filter((name) => name.length >= 2 && name.length <= 12 && !isInvalidCharacterCandidate(name)),
        ),
    );
}

function validateGeneratedProduction(draft: GeneratedProductionDraft, catalogs: Pick<ProductionGenerationInput, "characters" | "scenes" | "props">) {
    const breakdown = draft.scriptBreakdown;
    assertUnique("剧本场次", breakdown.scenes.map((item) => item.id));
    assertUnique("剧情节拍", breakdown.beats.map((item) => item.id));
    assertUnique("对白", breakdown.dialogueCues.map((item) => item.id));
    assertUnique("旁白", breakdown.voiceoverCues.map((item) => item.id));
    assertUnique("新增场景", draft.scenes.map((item) => item.id));
    assertUnique("新增道具", draft.props.map((item) => item.id));
    assertUnique("分镜场次", draft.shotboard.scenes.map((item) => item.id));
    assertUnique("镜头", draft.shotboard.shots.map((item) => item.id));
    assertUnique("镜号", draft.shotboard.shots.map((item) => item.code));
    assertUnique("剧本场次顺序", breakdown.scenes.map((item) => String(item.order)));
    assertUnique("场次内剧情节拍顺序", breakdown.beats.map((item) => `${item.sceneId}:${item.order}`));
    assertUnique("分镜场次顺序", draft.shotboard.scenes.map((item) => String(item.order)));
    assertUnique("镜头顺序", draft.shotboard.shots.map((item) => `${item.sceneId}:${item.order}`));
    if (breakdown.episodeNumber !== draft.shotboard.episodeNumber) throw new Error("剧本结构与分镜表的集数不一致");

    const scriptSceneIds = new Set(breakdown.scenes.map((item) => item.id));
    const beatIds = new Set(breakdown.beats.map((item) => item.id));
    const dialogueIds = new Set(breakdown.dialogueCues.map((item) => item.id));
    const voiceoverIds = new Set(breakdown.voiceoverCues.map((item) => item.id));
    const storySceneIds = new Set(draft.shotboard.scenes.map((item) => item.id));
    const shotIds = new Set(draft.shotboard.shots.map((item) => item.id));
    const characterIds = new Set(catalogs.characters.map((item) => item.id));
    const existingSceneIds = new Set(catalogs.scenes.map((item) => item.id));
    const existingPropIds = new Set(catalogs.props.map((item) => item.id));
    const sceneIds = new Set([...catalogs.scenes.map((item) => item.id), ...draft.scenes.map((item) => item.id)]);
    const propIds = new Set([...catalogs.props.map((item) => item.id), ...draft.props.map((item) => item.id)]);
    const reusedSceneId = draft.scenes.find((item) => existingSceneIds.has(item.id))?.id;
    if (reusedSceneId) throw new Error(`新增场景 ID 与已有资产重复：${reusedSceneId}`);
    const reusedPropId = draft.props.find((item) => existingPropIds.has(item.id))?.id;
    if (reusedPropId) throw new Error(`新增道具 ID 与已有资产重复：${reusedPropId}`);

    breakdown.beats.forEach((item) => {
        assertReferences(`剧情节拍 ${item.id} 的场次`, [item.sceneId], scriptSceneIds);
        if (!breakdown.scenes.find((scene) => scene.id === item.sceneId)?.beatIds.includes(item.id)) throw new Error(`剧情节拍 ${item.id} 未被所属场次引用`);
    });
    breakdown.scenes.forEach((item) => {
        assertReferences(`剧本场次 ${item.id} 的节拍`, item.beatIds, beatIds);
        const misplaced = item.beatIds.find((id) => breakdown.beats.find((beat) => beat.id === id)?.sceneId !== item.id);
        if (misplaced) throw new Error(`剧本场次 ${item.id} 引用了其他场次的剧情节拍：${misplaced}`);
    });
    breakdown.dialogueCues.forEach((item) => {
        assertReferences(`对白 ${item.id} 的节拍`, [item.beatId], beatIds);
        if (item.characterId) assertReferences(`对白 ${item.id} 的人物`, [item.characterId], characterIds);
    });
    breakdown.voiceoverCues.forEach((item) => assertReferences(`旁白 ${item.id} 的节拍`, [item.beatId], beatIds));
    draft.props.forEach((item) => item.ownerCharacterId && assertReferences(`道具 ${item.id} 的持有人`, [item.ownerCharacterId], characterIds));
    draft.shotboard.scenes.forEach((item) => {
        assertReferences(`分镜场次 ${item.id} 的镜头`, item.shotIds, shotIds);
        const misplaced = item.shotIds.find((id) => draft.shotboard.shots.find((shot) => shot.id === id)?.sceneId !== item.id);
        if (misplaced) throw new Error(`分镜场次 ${item.id} 引用了其他场次的镜头：${misplaced}`);
        if (item.locationAssetId) assertReferences(`分镜场次 ${item.id} 的场景`, [item.locationAssetId], sceneIds);
    });
    draft.shotboard.shots.forEach((item) => {
        assertReferences(`镜头 ${item.id} 的场次`, [item.sceneId], storySceneIds);
        if (!draft.shotboard.scenes.find((scene) => scene.id === item.sceneId)?.shotIds.includes(item.id)) throw new Error(`镜头 ${item.id} 未被所属分镜场次引用`);
        assertReferences(`镜头 ${item.id} 的剧情节拍`, item.sourceBeatIds, beatIds);
        assertReferences(`镜头 ${item.id} 的对白`, item.dialogueCueIds, dialogueIds);
        assertReferences(`镜头 ${item.id} 的旁白`, item.voiceoverCueIds, voiceoverIds);
        assertReferences(`镜头 ${item.id} 的人物`, item.characterBindings.map((binding) => binding.assetId), characterIds);
        if (item.sceneBinding) assertReferences(`镜头 ${item.id} 的场景`, [item.sceneBinding.assetId], sceneIds);
        assertReferences(`镜头 ${item.id} 的道具`, item.propBindings.map((binding) => binding.assetId), propIds);
    });
    const totalDuration = draft.shotboard.shots.reduce((sum, item) => sum + item.targetDurationMs, 0);
    if (totalDuration < draft.shotboard.targetDurationMs * 0.6 || totalDuration > draft.shotboard.targetDurationMs * 1.4) {
        throw new Error(`镜头总时长 ${totalDuration}ms 与目标时长 ${draft.shotboard.targetDurationMs}ms 偏差过大`);
    }
}

function normalizeGeneratedProduction(
    value: unknown,
    catalogs: Pick<ProductionGenerationInput, "characters" | "scenes" | "props">,
) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const root = value as Record<string, unknown>;
    const scenes = objectArray(root.scenes).map((item) => ({
        ...item,
        continuityLocks: nonEmptyStrings(item.continuityLocks, `保持${nonEmptyString(item.name) || "场景"}的整体外观、空间关系与光线一致`),
        sourceNote: nonEmptyString(item.sourceNote) || "模型未标注来源，需人工复核",
    }));
    const props = objectArray(root.props).map((item) => ({
        ...item,
        continuityLocks: nonEmptyStrings(item.continuityLocks, `保持${nonEmptyString(item.name) || "道具"}的外观、尺寸与状态连续`),
        sourceNote: nonEmptyString(item.sourceNote) || "模型未标注来源，需人工复核",
    }));
    const scriptBreakdown = asObject(root.scriptBreakdown);
    const shotboard = asObject(root.shotboard);
    const characterIds = new Set(catalogs.characters.map((item) => item.id));
    const characterIdByName = new Map(catalogs.characters.map((item) => [normalizeName(item.name), item.id]));
    const characterAliases = new Map<string, string>();
    const dialogueCues = objectArray(scriptBreakdown?.dialogueCues).map((item) => {
        const characterId = nonEmptyString(item.characterId);
        if (!characterId || characterIds.has(characterId)) return item;
        const matchedId = characterIdByName.get(normalizeName(nonEmptyString(item.speaker)));
        if (matchedId) {
            characterAliases.set(characterId, matchedId);
            return { ...item, characterId: matchedId };
        }
        if (characterIds.size) return item;
        const { characterId: _characterId, ...withoutCharacterId } = item;
        return withoutCharacterId;
    });
    const shots = normalizeShotDurations(
        objectArray(shotboard?.shots).map((item) => ({
            ...item,
            shotCategory: normalizeShotCategory(item.shotCategory),
            editRelation: normalizeEditRelation(item.editRelation),
            characterBindings: objectArray(item.characterBindings)
                .map((binding) => {
                    const assetId = nonEmptyString(binding.assetId);
                    const normalizedId = characterAliases.get(assetId) || assetId;
                    return { ...binding, assetId: normalizedId };
                })
                .filter((binding) => characterIds.size > 0 || characterIds.has(nonEmptyString(binding.assetId))),
        })),
        shotboard?.targetDurationMs,
    );
    const beats = objectArray(scriptBreakdown?.beats);
    const scriptScenes = objectArray(scriptBreakdown?.scenes).map((scene) => ({
        ...scene,
        beatIds: beats.filter((beat) => beat.sceneId === scene.id).map((beat) => beat.id),
    }));
    const storyScenes = objectArray(shotboard?.scenes).map((scene) => ({
        ...scene,
        shotIds: shots.filter((shot) => shot.sceneId === scene.id).map((shot) => shot.id),
    }));
    return {
        ...root,
        scenes,
        props: props.map((item) => {
            const ownerCharacterId = nonEmptyString(item.ownerCharacterId);
            if (!ownerCharacterId) return item;
            const normalizedId = characterAliases.get(ownerCharacterId) || ownerCharacterId;
            if (characterIds.has(normalizedId)) return { ...item, ownerCharacterId: normalizedId };
            if (characterIds.size) return item;
            const { ownerCharacterId: _ownerCharacterId, ...withoutOwnerCharacterId } = item;
            return withoutOwnerCharacterId;
        }),
        scriptBreakdown: scriptBreakdown
            ? {
                  ...scriptBreakdown,
                  scenes: scriptScenes,
                  dialogueCues,
              }
            : scriptBreakdown,
        shotboard: shotboard
            ? {
                  ...shotboard,
                  scenes: storyScenes,
                  shots,
              }
            : shotboard,
    };
}

function normalizeShotCategory(value: unknown) {
    if (typeof value !== "string") return value;
    const category = value.trim().toLowerCase();
    const allowed = new Set(["establishing", "dialogue", "emotion-closeup", "reaction", "prop-detail", "action", "reveal", "transition"]);
    if (allowed.has(category)) return category;
    if (category.includes("dialogue")) return "dialogue";
    if (category.includes("establish") || category.includes("opening")) return "establishing";
    if (category.includes("reaction")) return "reaction";
    if (category.includes("emotion") || category.includes("closeup") || category.includes("close-up")) return "emotion-closeup";
    if (category.includes("prop") || category.includes("detail") || category.includes("insert")) return "prop-detail";
    if (category.includes("action") || category.includes("fight")) return "action";
    if (category.includes("transition") || category.includes("exit")) return "transition";
    if (["intro", "reveal", "twist", "cliffhanger", "fantasy"].some((token) => category.includes(token))) return "reveal";
    return value;
}

function normalizeEditRelation(value: unknown) {
    if (typeof value !== "string") return value;
    const relation = value.trim().toLowerCase();
    if (["cut", "match-cut", "continuous", "transition"].includes(relation)) return relation;
    if (["fade", "fade-in", "fade-out", "dissolve", "wipe"].some((token) => relation.includes(token))) return "transition";
    return value;
}

function asObject(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function objectArray(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(asObject(item))) : [];
}

function nonEmptyString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error || "未知错误");
}

function nonEmptyStrings(value: unknown, fallback: string) {
    const values = Array.isArray(value) ? value.map(nonEmptyString).filter(Boolean) : [];
    return values.length ? values : [fallback];
}

function normalizeShotDurations(shots: Record<string, unknown>[], targetValue: unknown) {
    const target = typeof targetValue === "number" && Number.isInteger(targetValue) && targetValue > 0 ? targetValue : 0;
    const durations = shots.map((shot) => (typeof shot.targetDurationMs === "number" && Number.isInteger(shot.targetDurationMs) && shot.targetDurationMs > 0 ? shot.targetDurationMs : 0));
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    const ratio = target ? total / target : 0;
    if (!shots.length || !target || total === target || durations.some((duration) => !duration) || ratio < 0.6 || ratio > 1.4) return shots;
    const scaled = durations.map((duration) => Math.max(1, Math.round((duration * target) / total)));
    scaled[scaled.length - 1] += target - scaled.reduce((sum, duration) => sum + duration, 0);
    return shots.map((shot, index) => ({ ...shot, targetDurationMs: scaled[index] }));
}

function normalizeName(value: string) {
    return value.replace(/[\s·・.]/g, "").toLowerCase();
}

function normalizeDirectorInstructions(values: string[], scriptMarkdown: string) {
    const script = scriptMarkdown.trim();
    return Array.from(
        new Set(
            values
                .map((value) => value.trim())
                .filter(Boolean)
                .map((value) => (script && value.includes(script) ? value.split(script).join("").trim() : value))
                .map((value) => Array.from(new Set(value.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean))).join("\n\n"))
                .filter(Boolean),
        ),
    );
}

function selectRequestedEpisode(scriptMarkdown: string, directorInstructions: string[]) {
    const requested = directorInstructions
        .map((value) => parseEpisodeNumber(/第\s*([一二三四五六七八九十百\d]+)\s*集/.exec(value)?.[1]))
        .find(Boolean);
    if (!requested) return scriptMarkdown;
    const headings = Array.from(scriptMarkdown.matchAll(/^#{1,3}\s*第\s*([一二三四五六七八九十百\d]+)\s*集[^\n]*$/gm));
    const selectedIndex = headings.findIndex((match) => parseEpisodeNumber(match[1]) === requested);
    if (selectedIndex < 0) return scriptMarkdown;
    const firstEpisodeStart = headings[0].index || 0;
    const selectedStart = headings[selectedIndex].index || 0;
    const selectedEnd = headings[selectedIndex + 1]?.index ?? scriptMarkdown.length;
    return `${scriptMarkdown.slice(0, firstEpisodeStart).trim()}\n\n${scriptMarkdown.slice(selectedStart, selectedEnd).trim()}`.trim();
}

function parseEpisodeNumber(value?: string) {
    if (!value) return 0;
    if (/^\d+$/.test(value)) return Number(value);
    const digits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (value === "十") return 10;
    if (value.startsWith("十")) return 10 + (digits[value[1]] || 0);
    if (value.includes("十")) {
        const [tens, units] = value.split("十");
        return (digits[tens] || 0) * 10 + (digits[units] || 0);
    }
    return digits[value] || 0;
}

function expandGroupChildren(directNodes: CanvasNodeData[], nodes: CanvasNodeData[], groupType: CanvasNodeType) {
    const childIds = directNodes.filter((node) => node.type === groupType).flatMap((node) => node.metadata?.characterChildIds || node.metadata?.productionChildIds || []);
    return [...directNodes, ...childIds.map((id) => nodes.find((node) => node.id === id)).filter((node): node is CanvasNodeData => Boolean(node))];
}

function uniqueById<T extends { id: string }>(values: T[]) {
    return Array.from(new Map(values.map((item) => [item.id, item])).values());
}

function assertUnique(label: string, values: string[]) {
    const duplicate = values.find((value, index) => values.indexOf(value) !== index);
    if (duplicate) throw new Error(`${label}存在重复 ID：${duplicate}`);
}

function assertReferences(label: string, values: string[], allowed: Set<string>) {
    const missing = values.find((value) => !allowed.has(value));
    if (missing) throw new Error(`${label}引用不存在：${missing}`);
}

function idMap(values: Array<{ id: string }>, idFactory: () => string) {
    return new Map(values.map((item) => [item.id, idFactory()]));
}

function versioned<T>(id: string, data: T, createdAt: string): VersionedRecord<T> {
    return { id, currentVersion: 1, versions: [{ version: 1, data, createdAt }] };
}

function versionedAt<T>(id: string, version: number, data: T, createdAt: string): VersionedRecord<T> {
    return { id, currentVersion: version, versions: [{ version, data, createdAt }] };
}

function materializeBinding(binding: { assetId: string; role: string; state?: string }, assetId: string, version: number): ShotAssetBinding {
    return { ...binding, assetId, version };
}

function stripThinking(text: string) {
    return text
        .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
        .replace(/^\s*<think\b[^>]*>[\s\S]*$/i, "")
        .trim();
}
