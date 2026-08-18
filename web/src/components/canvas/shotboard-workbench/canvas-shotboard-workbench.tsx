import { App, Button, Select, Tag } from "antd";
import { Download, FileText, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";

import { acknowledgeContinuityFinding, runContinuityValidation } from "@/lib/production/continuity-validator";
import { assetReferenceCountForShot } from "@/lib/production/shot-control-assets";
import { summarizeShotPreflight } from "@/lib/production/shot-preflight";
import { shotModeLabels, shotStatusLabels } from "@/lib/production/shot-mode-labels";
import type { ProductionProject } from "@/types/production";

export function CanvasShotboardWorkbench({
    production,
    shotboardId,
    onChange,
    onRunPreflight,
    isPreflighting,
    onOpenShot,
    onOpenMarkdown,
    onExport,
    onClose,
}: {
    production: ProductionProject;
    shotboardId: string;
    onChange: (production: ProductionProject) => void;
    onRunPreflight: (scope: "issues" | "all") => void;
    isPreflighting: boolean;
    onOpenShot: (shotId: string) => void;
    onOpenMarkdown: () => void;
    onExport: (mode: "work" | "jimeng" | "final") => void;
    onClose: () => void;
}) {
    const { message } = App.useApp();
    const shotboard = production.shotboards.find((item) => item.id === shotboardId);
    const [filter, setFilter] = useState("all");
    const [preflightFilter, setPreflightFilter] = useState("issues");
    useEffect(() => {
        const handler = (event: KeyboardEvent) => event.key === "Escape" && onClose();
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);
    if (!shotboard) return null;
    const preflightSummary = summarizeShotPreflight(shotboard);
    const shots = shotboard.shots.filter((shot) => {
        if (filter !== "all" && shot.status !== filter) return false;
        if (preflightFilter === "issues") return shot.preflight.status === "needs-review" || shot.preflight.status === "failed" || shot.preflight.status === "user-locked";
        if (preflightFilter === "ready") return shot.preflight.status === "ready";
        if (preflightFilter === "failed") return shot.preflight.status === "failed";
        return true;
    });
    const counts = Object.fromEntries(Array.from(new Set(shotboard.shots.map((shot) => shot.status))).map((status) => [status, shotboard.shots.filter((shot) => shot.status === status).length]));
    const errors = shotboard.continuityFindings.filter((item) => item.severity === "error").length;
    const warnings = shotboard.continuityFindings.filter((item) => item.severity === "warning" && !item.acknowledged).length;
    const referenceCount = shotboard.shots.reduce((total, shot) => total + assetReferenceCountForShot(production, shot), 0);
    return (
        <div className="fixed inset-0 z-[300] flex flex-col bg-background text-foreground" onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
            <header className="flex min-h-16 flex-wrap items-center gap-3 border-b border-stone-200 px-5 py-2 dark:border-stone-800">
                <div className="min-w-0 flex-1"><h1 className="truncate text-base font-semibold">{shotboard.title} · 生产看板</h1><p className="mt-1 text-xs opacity-50">{shotboard.scenes.length} 场 · {shotboard.shots.length} 镜 · {(shotboard.targetDurationMs / 1000).toFixed(1)}s</p></div>
                <Button icon={isPreflighting ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} disabled={isPreflighting} onClick={() => onRunPreflight("issues")}>重新整理异常</Button>
                <Button disabled={isPreflighting} onClick={() => onRunPreflight("all")}>{isPreflighting ? "AI 正在检查镜头" : "AI 检查整集"}</Button>
                <Button icon={<RefreshCw className="size-4" />} onClick={() => { onChange(runContinuityValidation(production, shotboardId, new Date().toISOString())); message.success("连续性检查已更新"); }}>连续性检查</Button>
                <Button icon={<FileText className="size-4" />} onClick={onOpenMarkdown}>分镜报告</Button>
                <Select value={filter} onChange={setFilter} className="w-36" options={[{ value: "all", label: "全部状态" }, ...Object.keys(counts).map((status) => ({ value: status, label: `${shotStatusLabels[status as keyof typeof shotStatusLabels]} ${counts[status]}` }))]} />
                <Button icon={<X className="size-4" />} onClick={onClose}>关闭</Button>
            </header>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
                <div className="mb-4 border-l-2 border-blue-500 bg-blue-500/5 px-3 py-2 text-xs leading-5">
                    <b>AI 检查整集</b>会根据剧本、对白、角色设定、场景和道具重新匹配镜头素材，补全镜头摘要与状态，并把异常集中出来。它不会改写台词、镜头顺序或人工锁定字段。
                    {isPreflighting ? <div className="mt-1 flex items-center gap-1.5 text-blue-700 dark:text-blue-300"><LoaderCircle className="size-3.5 animate-spin" /> 正在逐场检查镜头，完成后会更新自动确认和异常数量。</div> : null}
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Select
                        value={preflightFilter}
                        onChange={setPreflightFilter}
                        className="w-44"
                        options={[
                            { value: "issues", label: `需处理 ${preflightSummary.needsReview + preflightSummary.failed}` },
                            { value: "ready", label: `已自动确认 ${preflightSummary.autoApproved}` },
                            { value: "failed", label: `整理失败 ${preflightSummary.failed}` },
                            { value: "all", label: `全部镜头 ${preflightSummary.total}` },
                        ]}
                    />
                    <span className="text-xs opacity-45">默认只展示需要你处理的镜头</span>
                </div>
                <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
                    <Metric label="已自动确认" value={preflightSummary.autoApproved} />
                    <Metric label="需处理" value={preflightSummary.needsReview} danger />
                    <Metric label="整理失败" value={preflightSummary.failed} danger />
                    <Metric label="视觉参考" value={referenceCount} />
                    <Metric label="剪辑就绪" value={shotboard.shots.filter((shot) => shot.status === "edit-ready").length} />
                    <Metric label="连续性错误" value={errors} danger />
                    <Metric label="待确认警告" value={warnings} />
                </div>
                {!shots.length ? <div className="mb-6 border-y border-stone-200 py-8 text-center text-sm opacity-50 dark:border-stone-800">当前筛选下没有镜头</div> : null}
                {shotboard.scenes.slice().sort((a, b) => a.order - b.order).map((scene) => {
                    const sceneShots = scene.shotIds.map((id) => shots.find((shot) => shot.id === id)).filter(Boolean);
                    if (!sceneShots.length) return null;
                    return <section key={scene.id} className="mb-6">
                        <h2 className="mb-2 text-sm font-semibold">场次 {scene.order} · {scene.heading}</h2>
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                            {sceneShots.map((shot) => <div key={shot!.id} className="border-b border-stone-200 p-3 text-xs dark:border-stone-800">
                                <div className="flex justify-between gap-2"><b>{shot!.code} · {shot!.narrativePurpose}</b><Tag>{shotStatusLabels[shot!.status]}</Tag></div>
                                <div className="mt-2 opacity-55">{shot!.generationPlan ? shotModeLabels[shot!.generationPlan.mode] : "模式未确认"} · {(shot!.targetDurationMs / 1000).toFixed(1)}s</div>
                                <div className="mt-1 opacity-55">{shot!.preflight.summary || "暂无 AI 摘要"}</div>
                                <div className="mt-1 opacity-55">
                                    视觉参考 {assetReferenceCountForShot(production, shot!)} 张 · 候选 {shot!.candidates.length} · {shot!.approvedCandidateId ? "已采用" : "未采用"}
                                </div>
                                {shot!.preflight.issues.filter((item) => item.status === "open").map((issue) => <div key={issue.id} className="mt-2 border-l-2 border-amber-500 pl-2 text-amber-700 dark:text-amber-400">{issue.message}</div>)}
                                {shot!.preflight.error ? <div className="mt-2 text-red-500">{shot!.preflight.error}</div> : null}
                                {shot!.blockers.filter((item) => item.severity === "error").length ? <div className="mt-2 text-red-500">有阻塞问题</div> : null}
                                <Button className="mt-3" size="small" type="text" onClick={() => onOpenShot(shot!.id)}>查看并处理</Button>
                            </div>)}
                        </div>
                    </section>;
                })}
                <section className="mt-8 border-t border-stone-200 pt-5 dark:border-stone-800">
                    <h2 className="text-sm font-semibold">跨镜连续性</h2>
                    {shotboard.continuityCheckedAt ? <div className="mt-1 text-xs opacity-45">最近检查：{shotboard.continuityCheckedAt}</div> : null}
                    {shotboard.continuityFindings.length ? shotboard.continuityFindings.map((finding) => <div key={finding.id} className="mt-2 flex items-center gap-3 border-l-2 px-3 py-2 text-xs" style={{ borderColor: finding.severity === "error" ? "#ef4444" : "#f59e0b" }}>
                        <span className="flex-1">{finding.message}</span><Tag color={finding.severity === "error" ? "red" : "gold"}>{finding.severity}</Tag>{finding.severity === "warning" && !finding.acknowledged ? <Button size="small" onClick={() => onChange(acknowledgeContinuityFinding(production, shotboardId, finding.id, new Date().toISOString()))}>确认知悉</Button> : null}
                    </div>) : <p className="mt-2 text-xs opacity-45">尚未运行连续性检查</p>}
                </section>
                <section className="mt-8 flex flex-wrap gap-2 border-t border-stone-200 pt-5 dark:border-stone-800">
                    <Button icon={<Download className="size-4" />} onClick={() => onExport("work")}>导出工作包</Button>
                    <Button icon={<Download className="size-4" />} onClick={() => onExport("jimeng")}>导出即梦任务包</Button>
                    <Button type="primary" icon={<Download className="size-4" />} onClick={() => onExport("final")}>导出最终剪辑包</Button>
                </section>
            </div>
        </div>
    );
}

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
    return <div className="border-b border-stone-200 p-3 dark:border-stone-800"><div className="text-xs opacity-50">{label}</div><div className={`mt-1 text-2xl font-semibold ${danger && value ? "text-red-500" : ""}`}>{value}</div></div>;
}
