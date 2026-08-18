import type {
    ProductionBlocker,
    ProductionProject,
    Shot,
    ShotEditableFields,
    ShotRevision,
    ShotboardRecord,
    StoryScene,
} from "@/types/production";
import { staleApprovedCandidates } from "@/lib/production/shot-candidate-state";

export function findShotContext(production: ProductionProject, shotboardId: string, shotId: string): { shotboard: ShotboardRecord; shot: Shot; scene: StoryScene } {
    const shotboard = production.shotboards.find((item) => item.id === shotboardId);
    if (!shotboard) throw new Error("分镜表不存在");
    const shot = shotboard.shots.find((item) => item.id === shotId);
    if (!shot) throw new Error("镜头不存在");
    const scene = shotboard.scenes.find((item) => item.id === shot.sceneId);
    if (!scene) throw new Error("镜头所属场次不存在");
    return { shotboard, shot, scene };
}

export function updateShot(production: ProductionProject, shotboardId: string, shotId: string, patch: Partial<ShotEditableFields>, now: string) {
    const { shotboard, shot } = findShotContext(production, shotboardId, shotId);
    const history = [...shot.history, { revision: shot.revision, snapshot: snapshotShot(shot), preflight: shot.preflight, savedAt: now }].slice(-30);
    const planHistory = shot.generationPlan?.status === "approved" ? [...shot.planHistory, shot.generationPlan].slice(-20) : shot.planHistory;
    const changedFields = changedFieldPaths(shot, patch);
    const nextShot: Shot = staleApprovedCandidates({
        ...shot,
        ...clonePatch(patch),
        revision: shot.revision + 1,
        history,
        status: "draft",
        blockers: [],
        preflight: changedFields.length ? lockPreflightFields(shot.preflight, changedFields) : shot.preflight,
        generationPlan: shot.generationPlan ? { ...shot.generationPlan, status: "recommended", confirmedAt: undefined, updatedAt: now } : undefined,
        planHistory,
        jimengTasks: shot.jimengTasks.map((task) => (task.status === "published" ? { ...task, status: "stale" as const } : task)),
        updatedAt: now,
    }, "draft");
    nextShot.blockers = validateShotRecord(production, shotboard, nextShot);
    return replaceShot(production, shotboard, nextShot, now);
}

export function bindShotAssets(
    production: ProductionProject,
    shotboardId: string,
    shotId: string,
    bindings: Pick<ShotEditableFields, "characterBindings" | "sceneBinding" | "propBindings">,
    now: string,
) {
    return updateShot(production, shotboardId, shotId, bindings, now);
}

export function approveShot(production: ProductionProject, shotboardId: string, shotId: string, now: string) {
    const { shotboard, shot } = findShotContext(production, shotboardId, shotId);
    const blockers = validateShotRecord(production, shotboard, shot);
    if (blockers.some((blocker) => blocker.severity === "error")) throw new Error("镜头仍有阻塞问题，无法确认");
    return replaceShot(production, shotboard, { ...shot, status: "shot-approved", blockers, updatedAt: now }, now);
}

export function restoreShotRevision(production: ProductionProject, shotboardId: string, shotId: string, revision: number, now: string) {
    const { shotboard, shot } = findShotContext(production, shotboardId, shotId);
    const saved = shot.history.find((item) => item.revision === revision);
    if (!saved) throw new Error("镜头历史版本不存在");
    const restored: Shot = staleApprovedCandidates({
        ...shot,
        ...clonePatch(saved.snapshot),
        revision: shot.revision + 1,
        history: [...shot.history, { revision: shot.revision, snapshot: snapshotShot(shot), preflight: shot.preflight, savedAt: now }].slice(-30),
        status: "draft",
        preflight: saved.preflight || shot.preflight,
        blockers: [],
        updatedAt: now,
    }, "draft");
    restored.blockers = validateShotRecord(production, shotboard, restored);
    return replaceShot(production, shotboard, restored, now);
}

export function validateShot(production: ProductionProject, shotboardId: string, shotId: string) {
    const { shotboard, shot } = findShotContext(production, shotboardId, shotId);
    return validateShotRecord(production, shotboard, shot);
}

export function snapshotShot(shot: Shot): ShotEditableFields {
    return {
        narrativePurpose: shot.narrativePurpose,
        emotionalBeat: shot.emotionalBeat,
        informationGain: shot.informationGain,
        shotCategory: shot.shotCategory,
        framing: { ...shot.framing },
        startState: shot.startState,
        action: shot.action,
        endState: shot.endState,
        continuityNotes: [...shot.continuityNotes],
        characterBindings: shot.characterBindings.map((item) => ({ ...item })),
        sceneBinding: shot.sceneBinding ? { ...shot.sceneBinding } : undefined,
        propBindings: shot.propBindings.map((item) => ({ ...item })),
        dialogueCueIds: [...shot.dialogueCueIds],
        voiceoverCueIds: [...shot.voiceoverCueIds],
        soundCues: [...shot.soundCues],
        targetDurationMs: shot.targetDurationMs,
        editRelation: shot.editRelation,
    };
}

function validateShotRecord(production: ProductionProject, shotboard: ShotboardRecord, shot: Shot): ProductionBlocker[] {
    const blockers: ProductionBlocker[] = [];
    required(blockers, shot.narrativePurpose, "shot.narrativePurpose", "镜头缺少剧情目的");
    required(blockers, shot.startState, "shot.startState", "镜头缺少开始状态");
    required(blockers, shot.action, "shot.action", "镜头缺少动作过程");
    required(blockers, shot.endState, "shot.endState", "镜头缺少结束状态");
    if (!Number.isFinite(shot.targetDurationMs) || shot.targetDurationMs <= 0) blockers.push(error("invalid-duration", "镜头时长必须大于 0", "shot.targetDurationMs"));
    if (!shot.sceneBinding) blockers.push(error("missing-scene", "镜头必须绑定场景", "shot.sceneBinding"));
    shot.characterBindings.forEach((binding) => validateBinding(blockers, binding, production.characters, "人物"));
    if (shot.sceneBinding) validateBinding(blockers, shot.sceneBinding, production.scenes, "场景");
    shot.propBindings.forEach((binding) => validateBinding(blockers, binding, production.props, "道具"));

    const breakdown = production.scriptBreakdowns.find((item) => item.id === shotboard.sourceScriptRevision);
    if (!breakdown) blockers.push(error("missing-script-revision", "镜头来源剧本版本不存在", "shotboard.sourceScriptRevision"));
    else {
        const dialogueIds = new Set(breakdown.dialogueCues.map((item) => item.id));
        const voiceoverIds = new Set(breakdown.voiceoverCues.map((item) => item.id));
        shot.dialogueCueIds.forEach((id) => !dialogueIds.has(id) && blockers.push(error("missing-dialogue", `对白不存在：${id}`, "shot.dialogueCueIds", id)));
        shot.voiceoverCueIds.forEach((id) => !voiceoverIds.has(id) && blockers.push(error("missing-voiceover", `旁白不存在：${id}`, "shot.voiceoverCueIds", id)));
    }
    if (!shot.characterBindings.length) blockers.push(warning("no-character", "镜头未绑定人物；空镜可忽略此提示"));
    if ((shot.editRelation === "continuous" || shot.editRelation === "match-cut") && !shot.continuityNotes.length) blockers.push(warning("missing-continuity", "连续或匹配剪辑镜头建议补充连续性说明"));
    if (shot.targetDurationMs < 1000 || shot.targetDurationMs > 15000) blockers.push(warning("duration-risk", "单镜时长建议控制在 1-15 秒"));
    if (shot.characterBindings.length > 3) blockers.push(warning("crowded-shot", "镜头人物超过 3 个，生成稳定性风险较高"));
    return blockers;
}

function validateBinding<T>(
    blockers: ProductionBlocker[],
    binding: { assetId: string; version: number },
    records: Array<{ id: string; versions: Array<{ version: number; data: T }> }>,
    label: string,
) {
    const record = records.find((item) => item.id === binding.assetId);
    if (!record) {
        blockers.push(error("missing-asset", `${label}资产不存在：${binding.assetId}`, undefined, binding.assetId));
        return;
    }
    if (!record.versions.some((item) => item.version === binding.version)) blockers.push(error("missing-asset-version", `${label}资产版本不存在：${binding.assetId} v${binding.version}`, undefined, binding.assetId));
}

function replaceShot(production: ProductionProject, shotboard: ShotboardRecord, shot: Shot, now: string): ProductionProject {
    return {
        ...production,
        shotboards: production.shotboards.map((item) =>
            item.id === shotboard.id
                ? {
                      ...item,
                      version: item.version + 1,
                      shots: item.shots.map((current) => (current.id === shot.id ? shot : current)),
                      updatedAt: now,
                  }
                : item,
        ),
    };
}

function clonePatch(patch: Partial<ShotEditableFields>) {
    return {
        ...patch,
        ...(patch.framing ? { framing: { ...patch.framing } } : {}),
        ...(patch.continuityNotes ? { continuityNotes: [...patch.continuityNotes] } : {}),
        ...(patch.characterBindings ? { characterBindings: patch.characterBindings.map((item) => ({ ...item })) } : {}),
        ...("sceneBinding" in patch ? { sceneBinding: patch.sceneBinding ? { ...patch.sceneBinding } : undefined } : {}),
        ...(patch.propBindings ? { propBindings: patch.propBindings.map((item) => ({ ...item })) } : {}),
        ...(patch.dialogueCueIds ? { dialogueCueIds: [...patch.dialogueCueIds] } : {}),
        ...(patch.voiceoverCueIds ? { voiceoverCueIds: [...patch.voiceoverCueIds] } : {}),
        ...(patch.soundCues ? { soundCues: [...patch.soundCues] } : {}),
    };
}

function changedFieldPaths(shot: Shot, patch: Partial<ShotEditableFields>) {
    const changed: string[] = [];
    Object.entries(patch).forEach(([key, value]) => {
        if (key === "framing" && value && typeof value === "object") {
            Object.entries(value).forEach(([field, fieldValue]) => {
                if (JSON.stringify(shot.framing[field as keyof ShotEditableFields["framing"]]) !== JSON.stringify(fieldValue)) changed.push(`framing.${field}`);
            });
            return;
        }
        if (JSON.stringify(shot[key as keyof ShotEditableFields]) !== JSON.stringify(value)) changed.push(key);
    });
    return changed;
}

function lockPreflightFields(preflight: Shot["preflight"], fieldPaths: string[]): Shot["preflight"] {
    const lockedFieldPaths = Array.from(new Set([...preflight.lockedFieldPaths, ...fieldPaths]));
    const fieldSources = Array.from(
        new Map(
            [
                ...preflight.fieldSources,
                ...fieldPaths.map((fieldPath) => ({
                    fieldPath,
                    source: "user" as const,
                    confidence: "high" as const,
                    reason: "用户手动修改",
                })),
            ].map((item) => [item.fieldPath, item]),
        ).values(),
    );
    return { ...preflight, status: "user-locked", lockedFieldPaths, fieldSources };
}

function required(blockers: ProductionBlocker[], value: string, fieldPath: string, message: string) {
    if (!value.trim()) blockers.push(error("required", message, fieldPath));
}

function error(code: string, message: string, fieldPath?: string, assetId?: string): ProductionBlocker {
    return { code, message, fieldPath, assetId, severity: "error" };
}

function warning(code: string, message: string): ProductionBlocker {
    return { code, message, severity: "warning" };
}
