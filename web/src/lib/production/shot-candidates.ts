import { findShotContext } from "@/lib/production/shotboard-editor";
import { staleApprovedCandidates } from "@/lib/production/shot-candidate-state";
import type { CandidateReviewItem, ProductionProject, Shot, ShotCandidate, ShotEditDirectives } from "@/types/production";

export function addShotCandidate(
    production: ProductionProject,
    shotboardId: string,
    shotId: string,
    input: Pick<ShotCandidate, "id" | "sourceTaskId" | "sourceTaskVersion" | "storageKey" | "fileName" | "mimeType" | "durationMs" | "createdAt">,
) {
    const { shotboard, shot } = findShotContext(production, shotboardId, shotId);
    const task = shot.jimengTasks.find((item) => item.id === input.sourceTaskId && item.version === input.sourceTaskVersion);
    if (!task) throw new Error("候选视频来源任务不存在");
    const candidate: ShotCandidate = {
        ...input,
        status: task.status === "stale" ? "stale" : "candidate",
        review: defaultReview(),
        inMs: 0,
        outMs: input.durationMs,
        targetDurationMs: Math.min(input.durationMs, shot.targetDurationMs),
        editNotes: "",
        editDirectives: emptyDirectives(),
    };
    return replaceCandidates(production, shotboard.id, shot, [...shot.candidates, candidate], undefined, input.createdAt, "candidate-review");
}

export function updateShotCandidate(
    production: ProductionProject,
    shotboardId: string,
    shotId: string,
    candidateId: string,
    patch: Partial<Pick<ShotCandidate, "review" | "inMs" | "outMs" | "targetDurationMs" | "editNotes" | "editDirectives">>,
    now: string,
) {
    const { shotboard, shot } = findShotContext(production, shotboardId, shotId);
    if (!shot.candidates.some((item) => item.id === candidateId)) throw new Error("候选视频不存在");
    const editingApproved = shot.approvedCandidateId === candidateId;
    const candidates = shot.candidates.map((item) =>
        item.id === candidateId
            ? { ...item, ...cloneCandidatePatch(patch), ...(editingApproved ? { status: "candidate" as const, reviewedAt: undefined } : {}) }
            : item,
    );
    return replaceCandidates(production, shotboard.id, shot, candidates, editingApproved ? undefined : shot.approvedCandidateId, now, editingApproved || !shot.approvedCandidateId ? "candidate-review" : "edit-ready");
}

export function approveShotCandidate(production: ProductionProject, shotboardId: string, shotId: string, candidateId: string, now: string) {
    const { shotboard, shot } = findShotContext(production, shotboardId, shotId);
    const candidate = shot.candidates.find((item) => item.id === candidateId);
    if (!candidate) throw new Error("候选视频不存在");
    if (candidate.status === "stale") throw new Error("候选来源任务已过期，不能采用");
    if (candidate.inMs < 0 || candidate.outMs <= candidate.inMs || candidate.outMs > candidate.durationMs) throw new Error("候选视频入点/出点无效");
    if (candidate.review.some((item) => !item.passed)) throw new Error("候选视频仍有未通过验收项");
    const candidates = shot.candidates.map((item) =>
        item.id === candidateId ? { ...item, status: "approved" as const, reviewedAt: now } : item.status === "approved" ? { ...item, status: "candidate" as const } : item,
    );
    return replaceCandidates(production, shotboard.id, shot, candidates, candidateId, now, "edit-ready");
}

export function rejectShotCandidate(production: ProductionProject, shotboardId: string, shotId: string, candidateId: string, now: string) {
    const { shotboard, shot } = findShotContext(production, shotboardId, shotId);
    const candidates = shot.candidates.map((item) => item.id === candidateId ? { ...item, status: "rejected" as const, reviewedAt: now } : item);
    const approvedCandidateId = shot.approvedCandidateId === candidateId ? undefined : shot.approvedCandidateId;
    return replaceCandidates(production, shotboard.id, shot, candidates, approvedCandidateId, now, approvedCandidateId ? "edit-ready" : "candidate-review");
}

export function defaultReview(): CandidateReviewItem[] {
    return [
        ["identity", "角色外观、服装和表情"],
        ["scene", "场景、光线和空间关系"],
        ["prop", "道具形状、状态和持有关系"],
        ["start-end", "开始与结束状态"],
        ["action", "动作完整度和自然度"],
        ["camera", "运镜方向和速度"],
        ["artifacts", "手脸畸变、穿模、闪烁、增物、文字和水印"],
        ["continuity", "与前后镜头连续性"],
    ].map(([key, note]) => ({ key: key as CandidateReviewItem["key"], passed: false, note }));
}

function emptyDirectives(): ShotEditDirectives {
    return { speed: "", freeze: "", crop: "", interpolation: "", transition: "", grading: "" };
}

function replaceCandidates(
    production: ProductionProject,
    shotboardId: string,
    shot: Shot,
    candidates: ShotCandidate[],
    approvedCandidateId: string | undefined,
    now: string,
    status: Shot["status"],
) {
    const nextShot = { ...shot, candidates, approvedCandidateId, status, updatedAt: now };
    return {
        ...production,
        shotboards: production.shotboards.map((shotboard) =>
            shotboard.id === shotboardId
                ? { ...shotboard, version: shotboard.version + 1, updatedAt: now, shots: shotboard.shots.map((item) => item.id === shot.id ? nextShot : item) }
                : shotboard,
        ),
    };
}

function cloneCandidatePatch(patch: Partial<Pick<ShotCandidate, "review" | "inMs" | "outMs" | "targetDurationMs" | "editNotes" | "editDirectives">>) {
    return {
        ...patch,
        ...(patch.review ? { review: patch.review.map((item) => ({ ...item })) } : {}),
        ...(patch.editDirectives ? { editDirectives: { ...patch.editDirectives } } : {}),
    };
}
