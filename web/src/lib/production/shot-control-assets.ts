import { findShotContext } from "@/lib/production/shotboard-editor";
import { controlAssetLabels } from "@/lib/production/shot-mode-labels";
import type {
    AssetReferenceImage,
    AssetVersionSnapshot,
    ControlAssetKind,
    ProductionProject,
    Shot,
    ShotControlAssetRecord,
    ShotControlAssetVersion,
} from "@/types/production";
import { staleApprovedCandidates } from "@/lib/production/shot-candidate-state";

export function requiredControlAssetKinds(shot: Shot) {
    return (shot.generationPlan?.requiredAssets || []).filter((item) => item.required);
}

export function addControlAssetVersion(
    production: ProductionProject,
    shotboardId: string,
    shotId: string,
    input: Omit<ShotControlAssetVersion, "version" | "status" | "createdAt" | "assetSnapshots"> & {
        recordId?: string;
        kind: ControlAssetKind;
        label: string;
        required: boolean;
        createdAt: string;
    },
) {
    const { shotboard, shot } = findShotContext(production, shotboardId, shotId);
    if (shot.status !== "plan-approved" && shot.status !== "control-assets-ready" && shot.status !== "task-published") throw new Error("请先确认生成方案");
    const record = input.recordId
        ? shot.controlAssets.find((item) => item.id === input.recordId)
        : input.kind === "keyframe"
          ? undefined
          : shot.controlAssets.find((item) => item.kind === input.kind);
    const nextVersion = (record?.versions.at(-1)?.version || 0) + 1;
    const version: ShotControlAssetVersion = {
        version: nextVersion,
        storageKey: input.storageKey,
        source: input.source,
        fileName: input.fileName,
        mimeType: input.mimeType,
        width: input.width,
        height: input.height,
        durationMs: input.durationMs,
        purpose: input.purpose,
        status: "approved",
        assetSnapshots: shotAssetSnapshots(shot),
        reviewedAt: input.createdAt,
        reviewNote: "上传后自动采用",
        createdAt: input.createdAt,
    };
    const id = record?.id || input.recordId || `${shot.id}-${input.kind}-${input.createdAt}`;
    const nextRecord: ShotControlAssetRecord = record
        ? { ...record, label: input.label, required: input.required, selectedVersion: nextVersion, versions: [...record.versions, version] }
        : { id, kind: input.kind, label: input.label, required: input.required, order: shot.controlAssets.filter((item) => item.kind === input.kind).length + 1, selectedVersion: nextVersion, versions: [version] };
    return replaceControlAssets(production, shotboard.id, shot, [...shot.controlAssets.filter((item) => item.id !== id), nextRecord], input.createdAt);
}

export function approveControlAsset(production: ProductionProject, shotboardId: string, shotId: string, recordId: string, versionNumber: number, now: string, reviewNote = "") {
    return reviewControlAsset(production, shotboardId, shotId, recordId, versionNumber, "approved", now, reviewNote);
}

export function rejectControlAsset(production: ProductionProject, shotboardId: string, shotId: string, recordId: string, versionNumber: number, now: string, reviewNote: string) {
    return reviewControlAsset(production, shotboardId, shotId, recordId, versionNumber, "rejected", now, reviewNote);
}

export function selectControlAssetVersion(production: ProductionProject, shotboardId: string, shotId: string, recordId: string, version: number, now: string) {
    const { shotboard, shot } = findShotContext(production, shotboardId, shotId);
    const record = shot.controlAssets.find((item) => item.id === recordId);
    if (!record?.versions.some((item) => item.version === version)) throw new Error("控制资产版本不存在");
    return replaceControlAssets(production, shotboard.id, shot, shot.controlAssets.map((item) => (item.id === recordId ? { ...item, selectedVersion: version } : item)), now);
}

export function removeControlAssetRecord(production: ProductionProject, shotboardId: string, shotId: string, recordId: string, now: string) {
    const { shotboard, shot } = findShotContext(production, shotboardId, shotId);
    return replaceControlAssets(production, shotboard.id, shot, shot.controlAssets.filter((item) => item.id !== recordId), now);
}

export function buildControlFramePrompt(production: ProductionProject, shotboardId: string, shotId: string, kind: ControlAssetKind) {
    const { shot } = findShotContext(production, shotboardId, shotId);
    const identities = shot.characterBindings.map((binding) => describeAsset(production.characters, binding.assetId, binding.version, binding.role, binding.state));
    const scene = shot.sceneBinding ? describeAsset(production.scenes, shot.sceneBinding.assetId, shot.sceneBinding.version, shot.sceneBinding.role, shot.sceneBinding.state) : "";
    const props = shot.propBindings.map((binding) => describeAsset(production.props, binding.assetId, binding.version, binding.role, binding.state));
    const frameState = kind === "last-frame" ? shot.endState : kind === "keyframe" ? `${shot.startState} 到 ${shot.endState} 之间的必要阶段` : shot.startState;
    return `为 AI 漫剧镜头生成${kind === "last-frame" ? "尾帧" : kind === "keyframe" ? "关键帧" : "首帧"}定稿图。
镜头目的：${shot.narrativePurpose}
画面状态：${frameState}
景别与机位：${shot.framing.shotSize}，${shot.framing.cameraAngle}，${shot.framing.composition}
人物：${identities.filter(Boolean).join("；") || "无人物"}
场景：${scene || "按镜头描述"}
道具：${props.filter(Boolean).join("；") || "无关键道具"}
必须保持角色外观、服装状态、场景结构、道具形状和屏幕方向一致。只生成单张画面，不添加文字、水印或分镜网格。`;
}

export function assetReferenceImagesForShot(production: ProductionProject, shotboardId: string, shotId: string) {
    const { shot } = findShotContext(production, shotboardId, shotId);
    return assetReferenceImagesForBindings(production, shot);
}

export function assetReferenceCountForShot(production: ProductionProject, shot: Shot) {
    return assetReferenceImagesForBindings(production, shot).length;
}

export function syncAssetReferenceToBoundShots(production: ProductionProject, reference: AssetReferenceImage, now: string) {
    const updatedShotIds: string[] = [];
    const shotboards = production.shotboards.map((shotboard) => {
        let changed = false;
        const shots = shotboard.shots.map((shot) => {
            if (shot.generationPlan?.status !== "approved") return shot;
            const kinds = controlKindsForReference(shot, reference);
            if (!kinds.length) return shot;
            const controlAssets = kinds.reduce(
                (current, kind) => addAssetReferenceControlAsset(current, shot, reference, kind, now),
                shot.controlAssets,
            );
            if (controlAssets === shot.controlAssets) return shot;
            changed = true;
            updatedShotIds.push(shot.id);
            return nextShotForControlAssets(shot, controlAssets, now);
        });
        return changed
            ? { ...shotboard, version: shotboard.version + 1, updatedAt: now, shots }
            : shotboard;
    });
    return {
        production: updatedShotIds.length ? { ...production, shotboards } : production,
        updatedShotIds,
    };
}

export function autoApproveUploadedControlAssets(production: ProductionProject, shotboardId: string, shotId: string, now: string) {
    const { shotboard, shot } = findShotContext(production, shotboardId, shotId);
    const controlAssets = shot.controlAssets.map((record) => ({
        ...record,
        versions: record.versions.map((version) =>
            version.version === record.selectedVersion && version.source === "uploaded" && version.status === "review"
                ? { ...version, status: "approved" as const, reviewedAt: now, reviewNote: "旧画面已自动采用" }
                : version,
        ),
    }));
    return JSON.stringify(controlAssets) === JSON.stringify(shot.controlAssets)
        ? production
        : replaceControlAssets(production, shotboard.id, shot, controlAssets, now);
}

function assetReferenceImagesForBindings(production: ProductionProject, shot: Shot) {
    const bindings = [
        ...shot.characterBindings.map((item) => ({ ...item, role: "角色参考" })),
        ...(shot.sceneBinding ? [{ ...shot.sceneBinding, role: "场景结构参考" }] : []),
        ...shot.propBindings.map((item) => ({ ...item, role: "道具外观参考" })),
    ];
    return bindings.flatMap((binding) =>
        production.assetReferences
            .filter((reference) => reference.assetId === binding.assetId && reference.assetVersion === binding.version)
            .map((reference) => ({ reference, role: binding.role })),
    );
}

function reviewControlAsset(
    production: ProductionProject,
    shotboardId: string,
    shotId: string,
    recordId: string,
    versionNumber: number,
    status: "approved" | "rejected",
    now: string,
    reviewNote: string,
) {
    const { shotboard, shot } = findShotContext(production, shotboardId, shotId);
    const record = shot.controlAssets.find((item) => item.id === recordId);
    if (!record) throw new Error("控制资产不存在");
    if (!record.versions.some((item) => item.version === versionNumber)) throw new Error("控制资产版本不存在");
    const assets = shot.controlAssets.map((item) =>
        item.id === recordId
            ? {
                  ...item,
                  selectedVersion: versionNumber,
                  versions: item.versions.map((version) => (version.version === versionNumber ? { ...version, status, reviewedAt: now, reviewNote } : version)),
              }
            : item,
    );
    return replaceControlAssets(production, shotboard.id, shot, assets, now);
}

function replaceControlAssets(production: ProductionProject, shotboardId: string, shot: Shot, controlAssets: ShotControlAssetRecord[], now: string) {
    const nextShot = nextShotForControlAssets(shot, controlAssets, now);
    return {
        ...production,
        shotboards: production.shotboards.map((shotboard) =>
            shotboard.id === shotboardId
                ? { ...shotboard, version: shotboard.version + 1, updatedAt: now, shots: shotboard.shots.map((item) => (item.id === shot.id ? nextShot : item)) }
                : shotboard,
        ),
    };
}

function nextShotForControlAssets(shot: Shot, controlAssets: ShotControlAssetRecord[], now: string) {
    const requiredKinds = new Set(requiredControlAssetKinds(shot).map((item) => item.kind === "keyframes" ? "keyframe" : item.kind));
    const approvedKinds = new Set(
        controlAssets.flatMap((record) => {
            const selected = record.versions.find((version) => version.version === record.selectedVersion);
            return selected?.status === "approved" ? [record.kind] : [];
        }),
    );
    const approvedKeyframes = controlAssets.filter((record) => record.kind === "keyframe" && record.versions.find((version) => version.version === record.selectedVersion)?.status === "approved").length;
    const omniReady = shot.generationPlan?.mode !== "omni-reference" || approvedKinds.size > 0;
    const keyframesReady = shot.generationPlan?.mode !== "multi-frame" || approvedKeyframes >= 2;
    const ready = omniReady && keyframesReady && Array.from(requiredKinds).every((kind) => approvedKinds.has(kind as ControlAssetKind));
    const jimengTasks = shot.jimengTasks.map((task) => (task.status === "published" ? { ...task, status: "stale" as const } : task));
    const nextStatus = ready ? "control-assets-ready" : "plan-approved";
    return staleApprovedCandidates({ ...shot, controlAssets, jimengTasks, status: nextStatus, updatedAt: now }, nextStatus);
}

function controlKindsForReference(shot: Shot, reference: AssetReferenceImage): ControlAssetKind[] {
    return [
        ...shot.characterBindings
            .filter((binding) => binding.assetId === reference.assetId && binding.version === reference.assetVersion)
            .map(() => "identity-reference" as const),
        ...(shot.sceneBinding?.assetId === reference.assetId && shot.sceneBinding.version === reference.assetVersion ? ["scene-reference" as const] : []),
        ...shot.propBindings
            .filter((binding) => binding.assetId === reference.assetId && binding.version === reference.assetVersion)
            .map(() => "prop-reference" as const),
    ];
}

function addAssetReferenceControlAsset(
    controlAssets: ShotControlAssetRecord[],
    shot: Shot,
    reference: AssetReferenceImage,
    kind: "identity-reference" | "scene-reference" | "prop-reference",
    now: string,
) {
    const record = controlAssets.find((item) => item.kind === kind);
    if (record?.versions.some((item) => item.storageKey === reference.storageKey)) return controlAssets;
    const version: ShotControlAssetVersion = {
        version: (record?.versions.at(-1)?.version || 0) + 1,
        storageKey: reference.storageKey,
        source: "canvas",
        fileName: reference.fileName,
        mimeType: reference.mimeType,
        width: reference.width,
        height: reference.height,
        purpose: kind === "identity-reference" ? "角色参考" : kind === "scene-reference" ? "场景结构参考" : "道具外观参考",
        status: "approved",
        assetSnapshots: shotAssetSnapshots(shot),
        reviewedAt: now,
        reviewNote: "已从角色、场景或道具的视觉参考自动接入",
        createdAt: now,
    };
    const nextRecord: ShotControlAssetRecord = record
        ? { ...record, selectedVersion: version.version, versions: [...record.versions, version] }
        : {
              id: `${shot.id}-${kind}-${reference.id}`,
              kind,
              label: controlAssetLabels[kind],
              required: false,
              order: controlAssets.filter((item) => item.kind === kind).length + 1,
              selectedVersion: version.version,
              versions: [version],
          };
    return record
        ? controlAssets.map((item) => (item.id === record.id ? nextRecord : item))
        : [...controlAssets, nextRecord];
}

function shotAssetSnapshots(shot: Shot): AssetVersionSnapshot[] {
    return [
        ...shot.characterBindings.map((item) => ({ assetId: item.assetId, version: item.version, role: item.role })),
        ...(shot.sceneBinding ? [{ assetId: shot.sceneBinding.assetId, version: shot.sceneBinding.version, role: shot.sceneBinding.role }] : []),
        ...shot.propBindings.map((item) => ({ assetId: item.assetId, version: item.version, role: item.role })),
    ];
}

function describeAsset<T>(records: Array<{ id: string; versions: Array<{ version: number; data: T }> }>, id: string, version: number, role: string, state?: string) {
    const data = records.find((record) => record.id === id)?.versions.find((item) => item.version === version)?.data;
    if (!data || typeof data !== "object") return "";
    const source = data as Record<string, unknown>;
    return [source.name, role, state, source.appearance, source.clothing, source.spatialLayout, source.shape].filter((value) => typeof value === "string" && value).join("，");
}
