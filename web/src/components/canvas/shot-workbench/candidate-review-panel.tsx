import { App, Button, Checkbox, Input, InputNumber, Select, Tag } from "antd";
import { Check, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { addShotCandidate, approveShotCandidate, rejectShotCandidate, updateShotCandidate } from "@/lib/production/shot-candidates";
import { resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";
import type { ProductionProject, Shot, ShotCandidate } from "@/types/production";

export function CandidateReviewPanel({
    production,
    shotboardId,
    shot,
    onChange,
    onPin,
}: {
    production: ProductionProject;
    shotboardId: string;
    shot: Shot;
    onChange: (production: ProductionProject) => void;
    onPin?: (shotId: string, candidateId: string) => void;
}) {
    const { message } = App.useApp();
    const inputRef = useRef<HTMLInputElement>(null);
    const sourceTasks = useMemo(
        () => shot.jimengTasks.filter((task) => task.status === "published" || task.status === "stale" || task.status === "archived"),
        [shot.jimengTasks],
    );
    const [sourceTaskId, setSourceTaskId] = useState(shot.currentJimengTaskId || sourceTasks.at(-1)?.id || "");
    const [activeId, setActiveId] = useState(shot.approvedCandidateId || shot.candidates.at(-1)?.id || "");
    const candidate = shot.candidates.find((item) => item.id === activeId);
    const [draft, setDraft] = useState<ShotCandidate | null>(candidate ? cloneCandidate(candidate) : null);
    const [videoUrl, setVideoUrl] = useState("");
    useEffect(() => {
        const next = shot.candidates.find((item) => item.id === activeId);
        setDraft(next ? cloneCandidate(next) : null);
    }, [activeId, shot.candidates]);
    useEffect(() => {
        const fallback = shot.currentJimengTaskId || sourceTasks.at(-1)?.id || "";
        setSourceTaskId((current) => sourceTasks.some((task) => task.id === current) ? current : fallback);
    }, [shot.currentJimengTaskId, sourceTasks]);
    useEffect(() => {
        let active = true;
        void (async () => {
            const url = draft?.storageKey ? await resolveMediaUrl(draft.storageKey) : "";
            if (active) setVideoUrl(url);
        })();
        return () => { active = false; };
    }, [draft?.storageKey]);
    const dirty = useMemo(() => Boolean(candidate && draft && JSON.stringify(candidate) !== JSON.stringify(draft)), [candidate, draft]);
    const upload = async (file?: File) => {
        if (!file || !sourceTaskId) {
            message.error("请先选择来源任务单");
            return;
        }
        try {
            const stored = await uploadMediaFile(file, "video");
            const task = sourceTasks.find((item) => item.id === sourceTaskId);
            if (!task) throw new Error("来源任务单不存在");
            const id = `candidate-${shot.id}-${Date.now()}`;
            onChange(addShotCandidate(production, shotboardId, shot.id, {
                id,
                sourceTaskId: task.id,
                sourceTaskVersion: task.version,
                storageKey: stored.storageKey,
                fileName: file.name || `${id}.mp4`,
                mimeType: stored.mimeType,
                durationMs: stored.durationMs || task.settings.durationSeconds * 1000,
                createdAt: new Date().toISOString(),
            }));
            setActiveId(id);
            message.success("外部生成结果已上传");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "结果上传失败");
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    };
    const save = () => {
        if (!draft) return;
        onChange(updateShotCandidate(production, shotboardId, shot.id, draft.id, {
            review: draft.review,
            inMs: draft.inMs,
            outMs: draft.outMs,
            targetDurationMs: draft.targetDurationMs,
            editNotes: draft.editNotes,
            editDirectives: draft.editDirectives,
        }, new Date().toISOString()));
        message.success("候选验收信息已保存");
    };
    return (
        <div className="thin-scrollbar h-full overflow-y-auto p-5">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div><h2 className="text-base font-semibold">回传结果</h2><p className="mt-1 text-xs opacity-50">把外部平台生成的视频上传回来，确认画面符合这一镜后再采用。</p></div>
                <div className="flex gap-2">
                    {sourceTasks.length > 1 ? <Select className="w-56" placeholder="选择生成任务" value={sourceTaskId || undefined} onChange={setSourceTaskId} options={sourceTasks.map((task) => ({ value: task.id, label: `生成任务 · ${taskStatusLabel(task.status)}` }))} /> : null}
                    <Button icon={<Upload className="size-4" />} disabled={!sourceTaskId} onClick={() => inputRef.current?.click()}>上传结果</Button>
                </div>
            </div>
            {shot.candidates.length ? <Select className="mb-4 w-full" value={activeId} onChange={setActiveId} options={shot.candidates.map((item) => ({ value: item.id, label: `${item.fileName} · ${candidateStatusLabel(item.status)}` }))} /> : <div className="text-sm opacity-50">暂无回传视频</div>}
            {draft ? <div className="grid gap-5 lg:grid-cols-[minmax(360px,1fr)_minmax(360px,1fr)]">
                <div>
                    <video src={videoUrl} controls className="aspect-video w-full bg-black" />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                        <label className="text-xs"><span className="mb-1 block opacity-50">入点(s)</span><InputNumber className="w-full" min={0} step={0.1} value={draft.inMs / 1000} onChange={(value) => setDraft({ ...draft, inMs: Number(value || 0) * 1000 })} /></label>
                        <label className="text-xs"><span className="mb-1 block opacity-50">出点(s)</span><InputNumber className="w-full" min={0} step={0.1} value={draft.outMs / 1000} onChange={(value) => setDraft({ ...draft, outMs: Number(value || 0) * 1000 })} /></label>
                        <label className="text-xs"><span className="mb-1 block opacity-50">目标(s)</span><InputNumber className="w-full" min={0.1} step={0.1} value={draft.targetDurationMs / 1000} onChange={(value) => setDraft({ ...draft, targetDurationMs: Number(value || 0) * 1000 })} /></label>
                    </div>
                    <label className="mt-3 block text-xs"><span className="mb-1 block opacity-50">剪辑备注</span><Input.TextArea rows={3} value={draft.editNotes} onChange={(event) => setDraft({ ...draft, editNotes: event.target.value })} /></label>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        {Object.entries(draft.editDirectives).map(([key, value]) => <label key={key} className="text-xs"><span className="mb-1 block opacity-50">{directiveLabels[key] || key}</span><Input value={value} onChange={(event) => setDraft({ ...draft, editDirectives: { ...draft.editDirectives, [key]: event.target.value } })} /></label>)}
                    </div>
                </div>
                <div>
                    <div className="mb-3 flex items-center gap-2"><b>验收清单</b><Tag color={draft.status === "approved" ? "green" : draft.status === "rejected" ? "red" : "gold"}>{candidateStatusLabel(draft.status)}</Tag></div>
                    {draft.review.map((item) => <div key={item.key} className="mb-3 border-b border-stone-200 pb-3 dark:border-stone-800"><Checkbox checked={item.passed} onChange={(event) => setDraft({ ...draft, review: draft.review.map((current) => current.key === item.key ? { ...current, passed: event.target.checked } : current) })}>{reviewLabels[item.key]}</Checkbox><Input className="mt-2" size="small" value={item.note} onChange={(event) => setDraft({ ...draft, review: draft.review.map((current) => current.key === item.key ? { ...current, note: event.target.value } : current) })} /></div>)}
                    <div className="flex flex-wrap gap-2">
                        <Button disabled={!dirty} onClick={save}>保存验收</Button>
                        <Button type="primary" icon={<Check className="size-4" />} disabled={dirty || draft.status === "stale" || draft.review.some((item) => !item.passed)} onClick={() => onChange(approveShotCandidate(production, shotboardId, shot.id, draft.id, new Date().toISOString()))}>采用候选</Button>
                        <Button danger icon={<X className="size-4" />} onClick={() => onChange(rejectShotCandidate(production, shotboardId, shot.id, draft.id, new Date().toISOString()))}>退回</Button>
                        {draft.status === "approved" && onPin ? <Button onClick={() => onPin(shot.id, draft.id)}>固定到画布</Button> : null}
                    </div>
                </div>
            </div> : null}
            <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
        </div>
    );
}

function cloneCandidate(candidate: ShotCandidate): ShotCandidate {
    return { ...candidate, review: candidate.review.map((item) => ({ ...item })), editDirectives: { ...candidate.editDirectives } };
}

const reviewLabels: Record<ShotCandidate["review"][number]["key"], string> = {
    identity: "角色外观、服装和表情",
    scene: "场景、光线和空间关系",
    prop: "道具形状、状态和持有关系",
    "start-end": "开始与结束状态",
    action: "动作完整度和自然度",
    camera: "运镜方向和速度",
    artifacts: "畸变、穿模、闪烁、增物、文字和水印",
    continuity: "与前后镜头连续性",
};

const directiveLabels: Record<string, string> = { speed: "变速", freeze: "定格", crop: "裁切", interpolation: "补帧", transition: "转场", grading: "调色" };

function taskStatusLabel(status: "draft" | "published" | "stale" | "archived") {
    return { draft: "待生成", published: "已准备", stale: "需要更新", archived: "已归档" }[status];
}

function candidateStatusLabel(status: ShotCandidate["status"]) {
    return { candidate: "待检查", approved: "已采用", rejected: "已退回", stale: "需要重新生成" }[status];
}
