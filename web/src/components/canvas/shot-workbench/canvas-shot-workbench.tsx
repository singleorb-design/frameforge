import { App, Button, Collapse, Input, InputNumber, Segmented, Select } from "antd";
import { AlertTriangle, CircleCheck, History, ImagePlus, RefreshCw, Save, Send, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ShotAssetBindings } from "@/components/canvas/shot-workbench/shot-asset-bindings";
import { ControlAssetPanel } from "@/components/canvas/shot-workbench/control-asset-panel";
import { JimengTaskPanel } from "@/components/canvas/shot-workbench/jimeng-task-panel";
import { CandidateReviewPanel } from "@/components/canvas/shot-workbench/candidate-review-panel";
import { ShotList } from "@/components/canvas/shot-workbench/shot-list";
import { ShotPreflightSummary } from "@/components/canvas/shot-workbench/shot-preflight-summary";
import { canvasThemes } from "@/lib/canvas-theme";
import { emitCanvasEvent } from "@/lib/canvas/canvas-event-bus";
import { unlockShotFields } from "@/lib/production/shot-preflight";
import { autoPrepareShot } from "@/lib/production/shot-auto-progress";
import { shotStatusLabels } from "@/lib/production/shot-mode-labels";
import { findShotContext, restoreShotRevision, snapshotShot, updateShot, validateShot } from "@/lib/production/shotboard-editor";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ProductionBlocker, ProductionProject, Shot, ShotCategory, ShotEditableFields } from "@/types/production";

type Props = {
    production: ProductionProject;
    shotboardId: string;
    initialShotId: string;
    onChange: (production: ProductionProject) => void;
    onPinControlAsset?: (shotId: string, recordId: string, version: number) => void;
    onPinTask?: (shotId: string, taskId: string) => void;
    onPinCandidate?: (shotId: string, candidateId: string) => void;
    onClose: () => void;
};

export function CanvasShotWorkbench({ production, shotboardId, initialShotId, onChange, onPinControlAsset, onPinTask, onPinCandidate, onClose }: Props) {
    const { message, modal } = App.useApp();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [activeShotId, setActiveShotId] = useState(initialShotId);
    const context = useMemo(() => findShotContext(production, shotboardId, activeShotId), [activeShotId, production, shotboardId]);
    const [draft, setDraft] = useState<ShotEditableFields>(() => snapshotShot(context.shot));
    const [tab, setTab] = useState<"definition" | "assets" | "task" | "candidates">(() => defaultTab(context.shot));
    const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(snapshotShot(context.shot)), [context.shot, draft]);

    useEffect(() => {
        setDraft(snapshotShot(context.shot));
        setTab(defaultTab(context.shot));
    }, [context.shot]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => event.key === "Escape" && requestClose();
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [dirty, onClose]);

    const save = () => {
        const now = new Date().toISOString();
        const updated = updateShot(production, shotboardId, activeShotId, draft, now);
        onChange(autoPrepareShot(updated, shotboardId, activeShotId, now));
        message.success("镜头已保存，生成方式已自动更新");
    };
    const restore = (revision: number) => run(() => {
        const now = new Date().toISOString();
        const restored = restoreShotRevision(production, shotboardId, activeShotId, revision, now);
        onChange(autoPrepareShot(restored, shotboardId, activeShotId, now));
    }, "已恢复此前保存的镜头内容");
    const run = (action: () => void, success: string) => {
        try {
            action();
            message.success(success);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败");
        }
    };

    const breakdown = production.scriptBreakdowns.find((item) => item.id === context.shotboard.sourceScriptRevision);
    const dialogue = breakdown?.dialogueCues.filter((cue) => draft.dialogueCueIds.includes(cue.id)) || [];
    const voiceover = breakdown?.voiceoverCues.filter((cue) => draft.voiceoverCueIds.includes(cue.id)) || [];
    const blockers = context.shot.blockers.length ? context.shot.blockers : validateShot(production, shotboardId, activeShotId);
    const blockingErrors = blockers.filter((blocker) => blocker.severity === "error");
    const blockingIssues = context.shot.preflight.issues.filter((issue) => issue.status === "open" && issue.severity === "blocking");

    return (
        <div
            className="fixed inset-0 z-[300] flex flex-col"
            style={{ background: theme.canvas.background, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2 lg:flex-nowrap lg:px-5" style={{ borderColor: theme.toolbar.border }}>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{context.shotboard.title}</div>
                    <div className="mt-1 text-xs opacity-50">
                        镜头 {context.shot.code} · {shotStatusLabels[context.shot.status]}
                    </div>
                </div>
                <Button icon={<Save className="size-4" />} disabled={!dirty} onClick={save}>保存镜头</Button>
                <Button icon={<X className="size-4" />} onClick={requestClose}>关闭</Button>
            </header>
            <div className="thin-scrollbar grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[260px_minmax(520px,1fr)_360px] lg:overflow-hidden">
                <ShotList shotboard={context.shotboard} activeShotId={activeShotId} onSelect={requestShotChange} />
                <main className="thin-scrollbar min-h-0 p-4 lg:overflow-y-auto lg:p-5">
                    <Segmented
                        className="mb-5"
                        value={tab}
                        onChange={(value) => setTab(value as typeof tab)}
                        options={[
                            { value: "definition", label: "1. 检查分镜" },
                            { value: "assets", label: "2. 准备画面" },
                            { value: "task", label: "3. 外部生成" },
                            { value: "candidates", label: "4. 回传结果" },
                        ]}
                    />
                    {tab === "assets" ? (
                        <ControlAssetPanel production={production} shotboardId={shotboardId} shot={context.shot} onChange={onChange} onPin={onPinControlAsset} onOpenExternal={() => setTab("task")} />
                    ) : tab === "task" ? (
                        <JimengTaskPanel production={production} shotboardId={shotboardId} shot={context.shot} onChange={onChange} onPin={onPinTask} onOpenReturn={() => setTab("candidates")} />
                    ) : tab === "candidates" ? (
                        <CandidateReviewPanel production={production} shotboardId={shotboardId} shot={context.shot} onChange={onChange} onPin={onPinCandidate} />
                    ) : (
                    <div className="mx-auto max-w-4xl space-y-5">
                        <ShotPreflightSummary
                            production={production}
                            shot={{ ...context.shot, ...draft }}
                            shotboardId={shotboardId}
                            onChange={(next) => onChange(autoPrepareShot(next, shotboardId, activeShotId, new Date().toISOString()))}
                        />
                        <Collapse
                            ghost
                            items={[
                                {
                                    key: "advanced",
                                    label: `高级编辑${context.shot.preflight.lockedFieldPaths.length ? ` · 已锁定 ${context.shot.preflight.lockedFieldPaths.length} 项` : ""}`,
                                    children: (
                                        <div className="space-y-5 border-t pt-4">
                                            {context.shot.preflight.lockedFieldPaths.length ? (
                                                <section className="border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2 text-xs">
                                                    <div className="mb-2 flex items-center justify-between gap-2">
                                                        <b>人工修改优先</b>
                                                        <Button size="small" type="text" onClick={() => onChange(unlockShotFields(production, shotboardId, activeShotId))}>允许 AI 重写全部</Button>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {context.shot.preflight.lockedFieldPaths.map((path) => (
                                                            <Button key={path} size="small" onClick={() => onChange(unlockShotFields(production, shotboardId, activeShotId, [path]))}>
                                                                {fieldLabel(path)} · 允许 AI 重写
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </section>
                                            ) : null}
                                            <Section title="叙事定义">
                                                <Field label="剧情目的"><Input.TextArea rows={2} value={draft.narrativePurpose} onChange={(event) => set("narrativePurpose", event.target.value)} /></Field>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <Field label="情绪节拍"><Input value={draft.emotionalBeat} onChange={(event) => set("emotionalBeat", event.target.value)} /></Field>
                                                    <Field label="信息增量"><Input value={draft.informationGain} onChange={(event) => set("informationGain", event.target.value)} /></Field>
                                                </div>
                                            </Section>
                                            <Section title="镜头语言">
                                                <div className="grid grid-cols-3 gap-3">
                                                    <Field label="镜头类型"><Select className="w-full" value={draft.shotCategory} onChange={(value) => set("shotCategory", value)} options={shotCategories.map((value) => ({ value, label: value }))} /></Field>
                                                    <Field label="景别"><Input value={draft.framing.shotSize} onChange={(event) => setFraming("shotSize", event.target.value)} /></Field>
                                                    <Field label="角度"><Input value={draft.framing.cameraAngle} onChange={(event) => setFraming("cameraAngle", event.target.value)} /></Field>
                                                    <Field label="构图"><Input value={draft.framing.composition} onChange={(event) => setFraming("composition", event.target.value)} /></Field>
                                                    <Field label="镜头意图"><Input value={draft.framing.lensIntent} onChange={(event) => setFraming("lensIntent", event.target.value)} /></Field>
                                                    <Field label="屏幕方向"><Input value={draft.framing.screenDirection} onChange={(event) => setFraming("screenDirection", event.target.value)} /></Field>
                                                </div>
                                                <Field label="运镜"><Input value={draft.framing.cameraMovement} onChange={(event) => setFraming("cameraMovement", event.target.value)} /></Field>
                                            </Section>
                                            <Section title="表演与落点">
                                                <Field label="开始状态"><Input.TextArea rows={2} value={draft.startState} onChange={(event) => set("startState", event.target.value)} /></Field>
                                                <Field label="动作过程"><Input.TextArea rows={3} value={draft.action} onChange={(event) => set("action", event.target.value)} /></Field>
                                                <Field label="结束状态"><Input.TextArea rows={2} value={draft.endState} onChange={(event) => set("endState", event.target.value)} /></Field>
                                                <Field label="连续性说明"><Input.TextArea rows={2} value={draft.continuityNotes.join("\n")} onChange={(event) => set("continuityNotes", lines(event.target.value))} /></Field>
                                            </Section>
                                            <Section title="时长、声音与剪辑">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <Field label="目标时长（秒）"><InputNumber className="w-full" min={0.1} step={0.5} value={draft.targetDurationMs / 1000} onChange={(value) => set("targetDurationMs", Math.round(Number(value || 0) * 1000))} /></Field>
                                                    <Field label="剪辑关系"><Select className="w-full" value={draft.editRelation} onChange={(value) => set("editRelation", value)} options={["cut", "match-cut", "continuous", "transition"].map((value) => ({ value, label: value }))} /></Field>
                                                </div>
                                                <Field label="音效 Cue"><Input.TextArea rows={2} value={draft.soundCues.join("\n")} onChange={(event) => set("soundCues", lines(event.target.value))} /></Field>
                                                <ReadOnlyCues title="对白" cues={dialogue.map((cue) => `${cue.speaker}：${cue.text}`)} />
                                                <ReadOnlyCues title="旁白" cues={voiceover.map((cue) => `${cue.speaker}：${cue.text}`)} />
                                            </Section>
                                        </div>
                                    ),
                                },
                            ]}
                        />
                    </div>
                    )}
                </main>
                <aside className="thin-scrollbar min-h-0 border-t p-4 lg:overflow-y-auto lg:border-l lg:border-t-0" style={{ borderColor: theme.toolbar.border }}>
                    <CreatorSteps step={creatorStep(context.shot)} />
                    <Section title="本镜头素材">
                        <AssetResultSummary production={production} shot={{ ...context.shot, ...draft }} />
                    </Section>
                    <Section title="必须处理">
                        {blockingErrors.map((blocker, index) => (
                            <div key={`${blocker.code}-${index}`} className="mb-2 flex gap-2 border-l-2 border-red-500 px-2 py-1.5 text-xs">
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{blocker.message}
                            </div>
                        ))}
                        {blockingIssues.map((issue) => (
                            <div key={issue.id} className="mb-2 flex gap-2 border-l-2 border-red-500 px-2 py-1.5 text-xs">
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{issue.message}
                            </div>
                        ))}
                        {!blockingErrors.length && !blockingIssues.length ? <div className="text-xs text-green-700 dark:text-green-400">没有必须处理的问题</div> : null}
                    </Section>
                    <Section title="下一步">
                        <NextAction shot={context.shot} blockers={blockers} onOpenAssets={() => setTab("assets")} onOpenTask={() => setTab("task")} onOpenCandidates={() => setTab("candidates")} />
                    </Section>
                    <Collapse
                        ghost
                        items={[{
                            key: "more",
                            label: "更多调整",
                            children: (
                                <div className="space-y-4">
                                    <ShotAssetBindings
                                        production={production}
                                        characters={draft.characterBindings}
                                        scene={draft.sceneBinding}
                                        props={draft.propBindings}
                                        onCharactersChange={(value) => set("characterBindings", value)}
                                        onSceneChange={(value) => set("sceneBinding", value)}
                                        onPropsChange={(value) => set("propBindings", value)}
                                    />
                                    <div className="flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: theme.toolbar.border }}>
                                        <Button size="small" type="text" icon={<RefreshCw className="size-3.5" />} onClick={() => emitCanvasEvent("shotboard-preflight:run", { shotboardId, shotIds: [activeShotId], scope: "issues" })}>让 AI 重新检查</Button>
                                        {context.shot.history.slice().reverse().map((item) => (
                                            <Button key={item.revision} size="small" type="text" icon={<History className="size-3.5" />} onClick={() => restore(item.revision)}>恢复此前保存内容</Button>
                                        ))}
                                    </div>
                                </div>
                            ),
                        }]}
                    />
                </aside>
            </div>
        </div>
    );

    function set<K extends keyof ShotEditableFields>(key: K, value: ShotEditableFields[K]) {
        setDraft((current) => ({ ...current, [key]: value }));
    }
    function setFraming<K extends keyof ShotEditableFields["framing"]>(key: K, value: string) {
        setDraft((current) => ({ ...current, framing: { ...current.framing, [key]: value } }));
    }
    function requestShotChange(shotId: string) {
        if (!dirty) {
            openShot(shotId);
            return;
        }
        modal.confirm({
            title: "放弃未保存修改？",
            content: "切换镜头会丢失当前未保存内容。",
            okText: "放弃并切换",
            cancelText: "继续编辑",
            onOk: () => openShot(shotId),
        });
    }
    function openShot(shotId: string) {
        const prepared = autoPrepareShot(production, shotboardId, shotId, new Date().toISOString());
        if (prepared !== production) onChange(prepared);
        setActiveShotId(shotId);
    }
    function requestClose() {
        if (!dirty) {
            onClose();
            return;
        }
        modal.confirm({
            title: "放弃未保存修改？",
            content: "关闭工作台会丢失当前未保存内容。",
            okText: "放弃并关闭",
            cancelText: "继续编辑",
            onOk: onClose,
        });
    }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return <section className="space-y-3 border-b border-stone-200 pb-5 dark:border-stone-800"><h2 className="text-sm font-semibold">{title}</h2>{children}</section>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
    return <label className="block text-xs"><span className="mb-1.5 block opacity-50">{label}</span>{children}</label>;
}
function ReadOnlyCues({ title, cues }: { title: string; cues: string[] }) {
    return <div className="text-xs"><div className="mb-1 opacity-50">{title}</div>{cues.length ? cues.map((cue) => <div key={cue} className="leading-5">{cue}</div>) : <span className="opacity-35">无</span>}</div>;
}
function NextAction({
    shot,
    blockers,
    onOpenAssets,
    onOpenTask,
    onOpenCandidates,
}: {
    shot: Shot;
    blockers: ProductionBlocker[];
    onOpenAssets: () => void;
    onOpenTask: () => void;
    onOpenCandidates: () => void;
}) {
    const blockingCount = blockers.filter((item) => item.severity === "error").length
        + shot.preflight.issues.filter((issue) => issue.status === "open" && issue.severity === "blocking").length;
    if (blockingCount) return <div className="text-xs leading-5 text-amber-700 dark:text-amber-400">先处理上方 {blockingCount} 个必须问题。完成后系统会自动选择生成方式并带入已有参考图。</div>;
    if (shot.candidates.length || shot.status === "candidate-review" || shot.status === "edit-ready") return <Button type="primary" className="w-full" onClick={onOpenCandidates}>查看并采用回传结果</Button>;
    if (shot.currentJimengTaskId || shot.status === "task-published") return <Button type="primary" className="w-full" onClick={onOpenTask}>继续外部生成并回传结果</Button>;
    if (shot.status === "control-assets-ready") return <Button type="primary" className="w-full" onClick={onOpenTask}>生成外部任务</Button>;
    if (shot.generationPlan?.status === "approved") return <Button type="primary" className="w-full" onClick={onOpenAssets}>准备镜头必需画面</Button>;
    return <div className="text-xs leading-5 opacity-55">系统正在整理镜头。只有无法自动判断的问题才需要你处理。</div>;
}
function AssetResultSummary({ production, shot }: { production: ProductionProject; shot: ShotEditableFields }) {
    const rows = [
        ["人物", shot.characterBindings.map((item) => bindingLabel(production.characters, item)).join("、")],
        ["场景", shot.sceneBinding ? bindingLabel(production.scenes, shot.sceneBinding) : ""],
        ["道具", shot.propBindings.map((item) => bindingLabel(production.props, item)).join("、")],
    ];
    return <div className="mb-2 space-y-1.5 text-xs">{rows.map(([label, value]) => <div key={label} className="grid grid-cols-[36px_1fr] gap-2"><span className="opacity-45">{label}</span><span>{value || "未匹配"}</span></div>)}</div>;
}
function bindingLabel<T>(records: Array<{ id: string; versions: Array<{ version: number; data: T }> }>, binding: { assetId: string; version: number; role: string; state?: string }) {
    const data = records.find((record) => record.id === binding.assetId)?.versions.find((item) => item.version === binding.version)?.data;
    const name = data && typeof data === "object" && "name" in data && typeof data.name === "string" ? data.name : binding.assetId;
    return `${name}${binding.state ? ` · ${binding.state}` : ""}`;
}
function fieldLabel(path: string) {
    return {
        narrativePurpose: "剧情目的",
        emotionalBeat: "情绪节拍",
        informationGain: "信息增量",
        shotCategory: "镜头类型",
        "framing.shotSize": "景别",
        "framing.cameraAngle": "角度",
        "framing.composition": "构图",
        "framing.lensIntent": "镜头意图",
        "framing.screenDirection": "屏幕方向",
        "framing.cameraMovement": "运镜",
        startState: "开始状态",
        action: "动作过程",
        endState: "结束状态",
        continuityNotes: "连续性说明",
        characterBindings: "人物绑定",
        sceneBinding: "场景绑定",
        propBindings: "道具绑定",
        soundCues: "音效",
        targetDurationMs: "目标时长",
        editRelation: "剪辑关系",
    }[path] || "自定义字段";
}
function lines(value: string) {
    return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}
const shotCategories: ShotCategory[] = ["establishing", "dialogue", "emotion-closeup", "reaction", "prop-detail", "action", "reveal", "transition"];

function defaultTab(shot: ProductionProject["shotboards"][number]["shots"][number]) {
    if (shot.candidates.length || shot.status === "candidate-review" || shot.status === "edit-ready") return "candidates" as const;
    if (shot.currentJimengTaskId || shot.status === "task-published") return "task" as const;
    if (shot.status === "control-assets-ready") return "task" as const;
    if (shot.generationPlan?.status === "approved") return "assets" as const;
    return "definition" as const;
}

function creatorStep(shot: ProductionProject["shotboards"][number]["shots"][number]) {
    if (shot.candidates.length || shot.status === "candidate-review" || shot.status === "edit-ready") return 4;
    if (shot.currentJimengTaskId || shot.status === "task-published") return 3;
    if (shot.status === "control-assets-ready") return 3;
    if (shot.generationPlan?.status === "approved") return 2;
    return 1;
}

function CreatorSteps({ step }: { step: number }) {
    const steps = [
        ["检查分镜", CircleCheck],
        ["准备画面", ImagePlus],
        ["外部生成", Send],
        ["回传结果", Sparkles],
    ] as const;
    return (
        <div className="mb-5 grid grid-cols-4 gap-1 border-b pb-4" style={{ borderColor: "currentColor" }}>
            {steps.map(([label, Icon], index) => {
                const active = index + 1 === step;
                const complete = index + 1 < step;
                return (
                    <div key={label} className={`min-w-0 text-center text-[10px] ${active ? "font-semibold" : "opacity-45"}`}>
                        <Icon className={`mx-auto mb-1 size-3.5 ${complete ? "text-green-600" : ""}`} />
                        <span className="block truncate">{label}</span>
                    </div>
                );
            })}
        </div>
    );
}
