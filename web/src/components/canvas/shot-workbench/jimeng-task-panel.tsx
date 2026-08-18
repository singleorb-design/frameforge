import { App, Button, Checkbox, Select, Tag } from "antd";
import { Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { compileJimengTask, jimengTaskToMarkdown, publishJimengTask, type JimengTaskSettings } from "@/lib/production/jimeng-task-compiler";
import { shotModeLabels } from "@/lib/production/shot-mode-labels";
import type { JimengTask, ProductionProject, Shot } from "@/types/production";

export function JimengTaskPanel({ production, shotboardId, shot, onChange, onPin, onOpenReturn }: { production: ProductionProject; shotboardId: string; shot: Shot; onChange: (production: ProductionProject) => void; onPin?: (shotId: string, taskId: string) => void; onOpenReturn?: () => void }) {
    const { message } = App.useApp();
    const latestProfile = production.platformProfiles.slice().sort((a, b) => b.profileVersion - a.profileVersion)[0];
    const model = latestProfile?.models[0];
    const [settings, setSettings] = useState<JimengTaskSettings>(() => ({
        profileId: latestProfile?.id || "",
        profileVersion: latestProfile?.profileVersion,
        model: model?.id || "",
        ratio: model?.ratios[0] || "9:16",
        durationSeconds: closestDuration(model?.durationsSeconds || [5], shot.targetDurationMs / 1000),
        resolution: model?.resolutions.at(-1) || "1080p",
        nativeAudio: false,
    }));
    const [draft, setDraft] = useState<JimengTask | null>(null);
    useEffect(() => {
        if (!latestProfile || !model) return;
        setSettings({
            profileId: latestProfile.id,
            profileVersion: latestProfile.profileVersion,
            model: model.id,
            ratio: model.ratios[0] || "9:16",
            durationSeconds: closestDuration(model.durationsSeconds, shot.targetDurationMs / 1000),
            resolution: model.resolutions.at(-1) || "1080p",
            nativeAudio: false,
        });
    }, [shot.id]);
    useEffect(() => setDraft(null), [settings, shot.controlAssets, shot.generationPlan?.version, shot.revision]);
    const selectedModel = latestProfile?.models.find((item) => item.id === settings.model);
    const createExternalTask = () => {
        try {
            const task = compileJimengTask(production, shotboardId, shot.id, settings, `jimeng-${shot.id}-${Date.now()}`, new Date().toISOString());
            const next = publishJimengTask(production, shotboardId, shot.id, task, new Date().toISOString());
            onChange(next);
            setDraft({ ...task, status: "published" });
            message.success("外部生成任务已准备好");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "外部生成任务准备失败");
        }
    };
    const current = useMemo(() => shot.jimengTasks.find((item) => item.id === shot.currentJimengTaskId), [shot.currentJimengTaskId, shot.jimengTasks]);
    const displayed = draft || current || null;
    return (
        <div className="thin-scrollbar h-full overflow-y-auto p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
                <div><h2 className="text-base font-semibold">外部生成</h2><p className="mt-1 text-xs opacity-50">这里会整理上传顺序、提示词和操作步骤。复制后到即梦生成，完成后回到“回传结果”上传视频。</p></div>
                {current ? <Tag color={current.status === "published" ? "green" : current.status === "stale" ? "red" : "default"}>{taskStatusLabel(current.status)}</Tag> : null}
            </div>
            {!shot.generationPlan || shot.generationPlan.status !== "approved" ? <div className="text-sm opacity-55">该镜头还有必须处理的问题，解决后会自动准备外部生成设置。</div> : <>
                <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-xs"><span className="mb-1 block opacity-50">模型</span><Select className="w-full" value={settings.model} onChange={(model) => setSettings((current) => ({ ...current, model }))} options={(latestProfile?.models || []).map((item) => ({ value: item.id, label: item.label }))} /></label>
                    <label className="text-xs"><span className="mb-1 block opacity-50">模式</span><div className="h-8 pt-1.5 font-medium">{shotModeLabels[shot.generationPlan.mode]}</div></label>
                    <label className="text-xs"><span className="mb-1 block opacity-50">比例</span><Select className="w-full" value={settings.ratio} onChange={(ratio) => setSettings((current) => ({ ...current, ratio }))} options={(selectedModel?.ratios || []).map((value) => ({ value, label: value }))} /></label>
                    <label className="text-xs"><span className="mb-1 block opacity-50">时长</span><Select className="w-full" value={settings.durationSeconds} onChange={(durationSeconds) => setSettings((current) => ({ ...current, durationSeconds }))} options={(selectedModel?.durationsSeconds || []).map((value) => ({ value, label: `${value}s` }))} /></label>
                    <label className="text-xs"><span className="mb-1 block opacity-50">分辨率</span><Select className="w-full" value={settings.resolution} onChange={(resolution) => setSettings((current) => ({ ...current, resolution }))} options={(selectedModel?.resolutions || []).map((value) => ({ value, label: value }))} /></label>
                </div>
                <Checkbox className="mt-3" checked={settings.nativeAudio} onChange={(event) => setSettings((current) => ({ ...current, nativeAudio: event.target.checked }))}>启用即梦原生音频</Checkbox>
                <div className="mt-4 flex gap-2"><Button type="primary" onClick={createExternalTask}>{current ? "更新外部生成任务" : "生成外部任务"}</Button></div>
                {displayed ? <TaskPreview task={displayed} onCopy={(value, text) => { void navigator.clipboard.writeText(value); message.success(text); }} onPin={displayed.status === "published" && onPin ? () => onPin(shot.id, displayed.id) : undefined} onOpenReturn={displayed.status === "published" ? onOpenReturn : undefined} /> : null}
            </>}
        </div>
    );
}

function TaskPreview({ task, onCopy, onPin, onOpenReturn }: { task: JimengTask; onCopy: (value: string, text: string) => void; onPin?: () => void; onOpenReturn?: () => void }) {
    return <div className="mt-6 space-y-5 text-sm">
        <section><div className="mb-2 flex flex-wrap justify-between gap-2"><b>上传顺序</b><div className="flex gap-2"><Button size="small" icon={<Copy className="size-3.5" />} onClick={() => onCopy(jimengTaskToMarkdown(task), "完整生成任务已复制")}>复制完整生成任务</Button>{onPin ? <Button size="small" onClick={onPin}>固定到画布</Button> : null}</div></div>{task.uploadSteps.map((step) => <div key={step.order}>{step.order}. {step.fileName} → {step.role} {step.referenceName || ""}</div>)}</section>
        <section><div className="mb-2 flex justify-between"><b>最终 Prompt</b><Button size="small" icon={<Copy className="size-3.5" />} onClick={() => onCopy(task.prompt, "Prompt 已复制")}>复制 Prompt</Button></div><pre className="whitespace-pre-wrap rounded-md border border-stone-200 p-3 text-xs leading-6 dark:border-stone-800">{task.prompt}</pre></section>
        <section><b>操作流程</b>{task.operationSteps.map((item, index) => <div key={item} className="mt-1">{index + 1}. {item}</div>)}</section>
        <section><b>验收标准</b>{task.acceptanceCriteria.map((item) => <div key={item} className="mt-1">- {item}</div>)}</section>
        {onOpenReturn ? <Button type="primary" onClick={onOpenReturn}>下一步：上传外部生成结果</Button> : null}
    </div>;
}

function closestDuration(values: number[], target: number) {
    return values.reduce((best, value) => Math.abs(value - target) < Math.abs(best - target) ? value : best, values[0] || 5);
}

function taskStatusLabel(status: JimengTask["status"]) {
    return { draft: "待生成", published: "已准备", stale: "需要更新", archived: "已归档" }[status];
}
