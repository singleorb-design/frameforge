import { getJimengProfile, validateJimengSettings } from "@/lib/production/jimeng-profile";
import { findShotContext } from "@/lib/production/shotboard-editor";
import type {
    AssetVersionSnapshot,
    ControlAssetKind,
    JimengTask,
    PlatformCapabilityProfile,
    ProductionProject,
    Shot,
    ShotControlAssetRecord,
    ShotGenerationMode,
} from "@/types/production";
import { staleApprovedCandidates } from "@/lib/production/shot-candidate-state";

export type JimengTaskSettings = {
    profileId: string;
    profileVersion?: number;
    model: string;
    ratio: string;
    durationSeconds: number;
    resolution: string;
    nativeAudio: boolean;
};

export function compileJimengTask(
    production: ProductionProject,
    shotboardId: string,
    shotId: string,
    settings: JimengTaskSettings,
    taskId: string,
    now: string,
): JimengTask {
    const { shot } = findShotContext(production, shotboardId, shotId);
    if (!shot.generationPlan || shot.generationPlan.status !== "approved") throw new Error("镜头生成方案尚未确认");
    const profile = getJimengProfile(production, settings.profileId, settings.profileVersion);
    const selectedAssets = selectedApprovedAssets(shot.controlAssets);
    const counts = {
        images: selectedAssets.filter((item) => item.version.mimeType.startsWith("image/")).length,
        videos: selectedAssets.filter((item) => item.version.mimeType.startsWith("video/")).length,
        audios: selectedAssets.filter((item) => item.version.mimeType.startsWith("audio/")).length,
        keyframes: selectedAssets.filter((item) => item.record.kind === "keyframe").length,
    };
    validateJimengSettings(profile, { ...settings, mode: shot.generationPlan.mode }, counts);
    const requiredKinds = requiredKindsForMode(shot.generationPlan.mode);
    const missing = requiredKinds.find((kind) => !selectedAssets.some((item) => item.record.kind === kind));
    if (missing) throw new Error(`缺少已审核控制资产：${missing}`);
    if (shot.generationPlan.mode === "multi-frame" && selectedAssets.filter((item) => item.record.kind === "keyframe").length < 2) throw new Error("智能多帧至少需要 2 张已审核关键帧");
    if (shot.generationPlan.mode === "omni-reference" && !selectedAssets.length) throw new Error("全能参考模式至少需要一项已审核参考资产");
    const ordered = orderAssets(selectedAssets, shot.generationPlan.mode);
    const referenceCounts = new Map<string, number>();
    const references = ordered.map((item) => {
        const group = referenceGroup(item.record.kind);
        const index = referenceCounts.get(group) || 0;
        referenceCounts.set(group, index + 1);
        return {
            referenceName: referenceName(item.record.kind, index),
            purpose: item.version.purpose,
            recordId: item.record.id,
            version: item.version.version,
        };
    });
    const prompt = compilePrompt(production, shot, references);
    return {
        id: taskId,
        version: (shot.jimengTasks.at(-1)?.version || 0) + 1,
        shotId: shot.id,
        shotRevision: shot.revision,
        planVersion: shot.generationPlan.version,
        profileSnapshot: structuredCloneProfile(profile),
        assetSnapshots: shotAssetSnapshots(shot),
        controlAssetVersions: ordered.map((item) => ({ recordId: item.record.id, version: item.version.version, storageKey: item.version.storageKey, kind: item.record.kind })),
        mode: shot.generationPlan.mode,
        settings: {
            model: settings.model,
            ratio: settings.ratio,
            durationSeconds: settings.durationSeconds,
            resolution: settings.resolution,
            nativeAudio: settings.nativeAudio,
        },
        uploadSteps: ordered.map((item, index) => ({
            order: index + 1,
            fileName: item.version.fileName,
            role: uploadRole(item.record.kind),
            referenceName: shot.generationPlan?.mode === "omni-reference" ? references[index]?.referenceName : undefined,
        })),
        referenceMap: references,
        prompt,
        negativeInstructions: ["不要改变人物身份、发型、服装和关键道具", "不要新增人物或物体", "避免手脸畸变、穿模、闪烁、文字和水印"],
        operationSteps: operationSteps(shot, settings, ordered),
        acceptanceCriteria: acceptanceCriteria(shot),
        retryPlaybook: [
            { symptom: "人物或道具漂移", action: "减少无关参考，只保留身份与关键道具，并强化一致性约束" },
            { symptom: "动作不完整", action: "降低动作幅度或延长时长，一次只修改动作描述" },
            { symptom: "首尾过渡畸变", action: "缩小首尾状态差异，保持机位、光线和空间结构一致" },
            { symptom: "运镜抢过表演", action: "降低运镜速度，保留一个主要摄像机动作" },
            { symptom: "结果不稳定", action: "每次只修改一个变量：控制资产、提示词、时长或模式" },
        ],
        status: "draft",
        createdAt: now,
    };
}

export function publishJimengTask(production: ProductionProject, shotboardId: string, shotId: string, task: JimengTask, now: string) {
    const { shotboard, shot } = findShotContext(production, shotboardId, shotId);
    if (shot.status !== "control-assets-ready" && shot.status !== "task-published") throw new Error("控制资产尚未就绪");
    if (task.shotRevision !== shot.revision || task.planVersion !== shot.generationPlan?.version) throw new Error("任务单已落后于当前镜头或方案，请重新编译");
    const published: JimengTask = { ...task, status: "published" };
    const tasks = shot.jimengTasks.map((item) => (item.status === "published" ? { ...item, status: "archived" as const } : item)).concat(published);
    const nextShot: Shot = staleApprovedCandidates({ ...shot, jimengTasks: tasks, currentJimengTaskId: published.id, status: "task-published", updatedAt: now });
    return {
        ...production,
        shotboards: production.shotboards.map((item) =>
            item.id === shotboard.id ? { ...item, version: item.version + 1, updatedAt: now, shots: item.shots.map((current) => (current.id === shot.id ? nextShot : current)) } : item,
        ),
    };
}

export function jimengTaskToMarkdown(task: JimengTask) {
    return [
        `# 即梦生成任务 · ${task.shotId}`,
        "",
        `- 模式：${task.mode}`,
        `- 模型：${task.settings.model}`,
        `- 比例：${task.settings.ratio}`,
        `- 时长：${task.settings.durationSeconds}s`,
        `- 分辨率：${task.settings.resolution}`,
        `- 原生音频：${task.settings.nativeAudio ? "开启" : "关闭"}`,
        "",
        "## 上传顺序",
        ...task.uploadSteps.map((step) => `${step.order}. ${step.fileName} -> ${step.role}${step.referenceName ? `（${step.referenceName}）` : ""}`),
        "",
        "## 最终 Prompt",
        task.prompt,
        "",
        "## 禁止项",
        ...task.negativeInstructions.map((item) => `- ${item}`),
        "",
        "## 操作流程",
        ...task.operationSteps.map((item, index) => `${index + 1}. ${item}`),
        "",
        "## 验收标准",
        ...task.acceptanceCriteria.map((item) => `- ${item}`),
        "",
        "## 失败重试",
        ...task.retryPlaybook.map((item) => `- ${item.symptom}：${item.action}`),
    ].join("\n");
}

function compilePrompt(production: ProductionProject, shot: Shot, references: JimengTask["referenceMap"]) {
    const identities = shot.characterBindings.map((binding) => assetDescription(production.characters, binding.assetId, binding.version, binding.role, binding.state));
    const scene = shot.sceneBinding ? assetDescription(production.scenes, shot.sceneBinding.assetId, shot.sceneBinding.version, shot.sceneBinding.role, shot.sceneBinding.state) : "";
    const props = shot.propBindings.map((binding) => assetDescription(production.props, binding.assetId, binding.version, binding.role, binding.state));
    const refs = references.map((item) => `${item.referenceName}：${item.purpose}`).join("；");
    return [
        `镜头目标：${shot.narrativePurpose}`,
        identities.length ? `主体：${identities.join("；")}` : "",
        scene ? `场景与光线：${scene}` : "",
        props.length ? `关键道具：${props.join("；")}` : "",
        `开始状态：${shot.startState}`,
        `动作过程：${shot.action}`,
        `结束状态：${shot.endState}`,
        `镜头：${shot.framing.shotSize}，${shot.framing.cameraAngle}，${shot.framing.composition}，${shot.framing.cameraMovement}`,
        `动作节奏克制、自然、可完成，严格保持屏幕方向：${shot.framing.screenDirection}`,
        refs ? `参考职责：${refs}` : "",
        "保持人物、服装、场景、道具和光线连续，不新增人物，不改变关键物件。",
    ].filter(Boolean).join("\n");
}

function operationSteps(shot: Shot, settings: JimengTaskSettings, assets: ReturnType<typeof selectedApprovedAssets>) {
    return [
        "打开即梦 AI 视频生成页面。",
        `选择模型“${settings.model}”和“${modeLabel(shot.generationPlan!.mode)}”模式。`,
        ...assets.map((item, index) => `按第 ${index + 1} 位上传 ${item.version.fileName}，设置为${uploadRole(item.record.kind)}。`),
        `设置 ${settings.ratio}、${settings.durationSeconds} 秒、${settings.resolution}，${settings.nativeAudio ? "开启" : "关闭"}原生音频。`,
        "粘贴最终 Prompt，生成多个候选。",
        "按任务单验收标准检查，失败时一次只修改一个变量。",
    ];
}

function acceptanceCriteria(shot: Shot) {
    return [
        `开始状态符合：${shot.startState}`,
        `动作完整执行：${shot.action}`,
        `结束状态符合：${shot.endState}`,
        `景别、角度与运镜符合：${shot.framing.shotSize} / ${shot.framing.cameraAngle} / ${shot.framing.cameraMovement}`,
        ...shot.continuityNotes.map((item) => `连续性：${item}`),
        "人物身份、服装、道具状态和场景光线无漂移",
        "无手脸畸变、穿模、闪烁、增物、文字或水印",
    ];
}

function selectedApprovedAssets(records: ShotControlAssetRecord[]) {
    return records.flatMap((record) => {
        const version = record.versions.find((item) => item.version === record.selectedVersion);
        return version?.status === "approved" ? [{ record, version }] : [];
    });
}

function orderAssets(assets: ReturnType<typeof selectedApprovedAssets>, mode: ShotGenerationMode) {
    const order: ControlAssetKind[] =
        mode === "first-last-frame"
            ? ["first-frame", "last-frame", "identity-reference", "scene-reference", "prop-reference"]
            : mode === "multi-frame"
              ? ["keyframe", "identity-reference", "scene-reference", "prop-reference"]
              : mode === "first-frame"
                ? ["first-frame", "identity-reference", "scene-reference", "prop-reference"]
                : ["identity-reference", "scene-reference", "prop-reference", "action-reference", "camera-reference", "audio-reference"];
    return assets.slice().sort((a, b) => order.indexOf(a.record.kind) - order.indexOf(b.record.kind) || a.record.order - b.record.order || a.record.id.localeCompare(b.record.id));
}

function requiredKindsForMode(mode: ShotGenerationMode): ControlAssetKind[] {
    if (mode === "first-frame") return ["first-frame"];
    if (mode === "first-last-frame") return ["first-frame", "last-frame"];
    if (mode === "multi-frame") return ["keyframe"];
    return [];
}

function uploadRole(kind: ControlAssetKind) {
    if (kind === "first-frame") return "首帧";
    if (kind === "last-frame") return "尾帧";
    if (kind === "keyframe") return "智能多帧关键帧";
    return "全能参考";
}

function referenceName(kind: ControlAssetKind, index: number) {
    if (kind === "identity-reference") return `@角色${index + 1}`;
    if (kind === "scene-reference") return `@场景${index + 1}`;
    if (kind === "prop-reference") return `@道具${index + 1}`;
    if (kind === "action-reference") return `@动作参考${index + 1}`;
    if (kind === "camera-reference") return `@运镜参考${index + 1}`;
    if (kind === "audio-reference") return `@音频参考${index + 1}`;
    return `@图片${index + 1}`;
}

function referenceGroup(kind: ControlAssetKind) {
    if (kind === "identity-reference") return "character";
    if (kind === "scene-reference") return "scene";
    if (kind === "prop-reference") return "prop";
    if (kind === "action-reference") return "action";
    if (kind === "camera-reference") return "camera";
    if (kind === "audio-reference") return "audio";
    return "image";
}

function modeLabel(mode: ShotGenerationMode) {
    if (mode === "first-frame") return "首帧";
    if (mode === "first-last-frame") return "首尾帧";
    if (mode === "multi-frame") return "智能多帧";
    return "全能参考";
}

function shotAssetSnapshots(shot: Shot): AssetVersionSnapshot[] {
    return [
        ...shot.characterBindings.map((item) => ({ assetId: item.assetId, version: item.version, role: item.role })),
        ...(shot.sceneBinding ? [{ assetId: shot.sceneBinding.assetId, version: shot.sceneBinding.version, role: shot.sceneBinding.role }] : []),
        ...shot.propBindings.map((item) => ({ assetId: item.assetId, version: item.version, role: item.role })),
    ];
}

function assetDescription<T>(records: Array<{ id: string; versions: Array<{ version: number; data: T }> }>, id: string, version: number, role: string, state?: string) {
    const data = records.find((record) => record.id === id)?.versions.find((item) => item.version === version)?.data;
    if (!data || typeof data !== "object") return [role, state].filter(Boolean).join("，");
    const source = data as Record<string, unknown>;
    return [source.name, role, state, source.appearance, source.clothing, source.spatialLayout, source.shape].filter((item) => typeof item === "string" && item).join("，");
}

function structuredCloneProfile(profile: PlatformCapabilityProfile): PlatformCapabilityProfile {
    return JSON.parse(JSON.stringify(profile)) as PlatformCapabilityProfile;
}
