import { AlertTriangle, CheckCircle2, LockKeyhole } from "lucide-react";
import { Tag } from "antd";

import { MissingAssetCard } from "@/components/canvas/shot-workbench/missing-asset-card";
import { buildMissingAssetPreviewPrompt } from "@/lib/production/asset-drafts";
import { assetReferenceCountForShot } from "@/lib/production/shot-control-assets";
import { resolveShotAssetIssue } from "@/lib/production/shot-preflight";
import type { ProductionProject, Shot, ShotAssetBinding } from "@/types/production";

export function ShotPreflightSummary({
    production,
    shot,
    shotboardId,
    onChange,
}: {
    production: ProductionProject;
    shot: Shot;
    shotboardId: string;
    onChange?: (production: ProductionProject) => void;
}) {
    const sourceByField = new Map(shot.preflight.fieldSources.map((item) => [item.fieldPath, item]));
    const shotboard = production.shotboards.find((item) => item.id === shotboardId);
    const referenceCount = assetReferenceCountForShot(production, shot);
    const hasAttachedReference = shot.controlAssets.some((item) => ["identity-reference", "scene-reference", "prop-reference"].includes(item.kind));
    return (
        <div className="space-y-5">
            <section className="border-l-2 border-blue-500 bg-blue-500/5 px-4 py-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                    <StatusTag status={shot.preflight.status} />
                    <Tag>{confidenceLabel(shot.preflight.confidence)}</Tag>
                    {shot.preflight.lockedFieldPaths.length ? <Tag icon={<LockKeyhole className="size-3" />}>人工锁定 {shot.preflight.lockedFieldPaths.length} 项</Tag> : null}
                </div>
                <p className="m-0 text-sm leading-7">{shot.preflight.summary || defaultSummary(shot)}</p>
                {sourceByField.get("narrativePurpose") ? <SourceLine source={sourceByField.get("narrativePurpose")!} /> : null}
            </section>

            <section>
                <div className="mb-2 text-xs font-semibold">表演流程</div>
                <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
                    <FlowStep title="开始" content={shot.startState} />
                    <span className="self-center text-center opacity-30">→</span>
                    <FlowStep title="动作" content={shot.action} />
                    <span className="self-center text-center opacity-30">→</span>
                    <FlowStep title="结束" content={shot.endState} />
                </div>
            </section>

            <section>
                <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold">
                    <span>AI 已匹配素材</span>
                    <span className={referenceCount ? "text-green-700 dark:text-green-400" : "opacity-40"}>
                        {referenceCount
                            ? hasAttachedReference
                                ? `已接入 ${referenceCount} 张视觉参考`
                                : `已有 ${referenceCount} 张视觉参考，系统将自动带入`
                            : "暂无视觉参考"}
                    </span>
                </div>
                <AssetRow label="人物" bindings={shot.characterBindings} production={production} kind="character" sources={shot.preflight.fieldSources} />
                <AssetRow label="场景" bindings={shot.sceneBinding ? [shot.sceneBinding] : []} production={production} kind="scene" sources={shot.preflight.fieldSources} />
                <AssetRow label="道具" bindings={shot.propBindings} production={production} kind="prop" sources={shot.preflight.fieldSources} />
            </section>

            {shot.preflight.issues.some((item) => item.status === "open") ? (
                <section>
                    <div className="mb-2 text-xs font-semibold">需要处理</div>
                    <div className="space-y-2">
                        {shot.preflight.issues.filter((item) => item.status === "open").map((item) => (
                            item.assetKind && item.suggestedName && item.prompt ? (
                                <MissingAssetCard
                                    key={item.id}
                                    shotboardId={shotboardId}
                                    issue={item}
                                    draft={shotboard?.assetDrafts.find((draft) => draft.status === "draft" && draft.kind === item.assetKind && normalize(draft.name) === normalize(item.suggestedName || ""))}
                                    previewPrompt={buildMissingAssetPreviewPrompt(production, shotboardId, item.id)}
                                    candidates={candidateAssets(production, item)}
                                    onSelectCandidate={
                                        onChange
                                            ? (assetId) => onChange(resolveShotAssetIssue(production, shotboardId, shot.id, item.id, assetId, new Date().toISOString()))
                                            : undefined
                                    }
                                />
                            ) : (
                                <div key={item.id} className="flex gap-2 border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2 text-xs leading-5">
                                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                                    <div><b>{severityLabel(item.severity)}</b> · {item.message}</div>
                                </div>
                            )
                        ))}
                    </div>
                </section>
            ) : (
                <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
                    <CheckCircle2 className="size-4" /> 本镜头素材已匹配，系统已自动准备生成方式
                </div>
            )}
        </div>
    );
}

function FlowStep({ title, content }: { title: string; content: string }) {
    return <div className="border px-3 py-2 text-xs"><b className="mb-1 block">{title}</b><p className="m-0 leading-5 opacity-70">{content || "AI 尚未补全"}</p></div>;
}

function AssetRow({
    label,
    bindings,
    production,
    kind,
    sources,
}: {
    label: string;
    bindings: ShotAssetBinding[];
    production: ProductionProject;
    kind: "character" | "scene" | "prop";
    sources: Shot["preflight"]["fieldSources"];
}) {
    const records = kind === "character" ? production.characters : kind === "scene" ? production.scenes : production.props;
    return (
        <div className="grid grid-cols-[46px_1fr] gap-3 border-t py-2 text-xs first:border-t-0">
            <span className="opacity-45">{label}</span>
            <div className="space-y-1.5">
                {bindings.length ? bindings.map((binding) => {
                    const record = records.find((item) => item.id === binding.assetId);
                    const data = record?.versions.find((item) => item.version === binding.version)?.data;
                    const source = sources.find((item) => item.fieldPath.includes(binding.assetId));
                    return (
                        <div key={binding.assetId}>
                            <div><b>{assetName(data)}</b>{binding.role ? ` · ${binding.role}` : ""}{binding.state ? ` · ${binding.state}` : ""}</div>
                            {source ? <SourceLine source={source} /> : null}
                        </div>
                    );
                }) : <span className="opacity-35">未匹配</span>}
            </div>
        </div>
    );
}

function SourceLine({ source }: { source: Shot["preflight"]["fieldSources"][number] }) {
    return <div className="mt-1 text-[11px] opacity-45">依据：{sourceLabel(source.source)} · {source.reason}</div>;
}

function StatusTag({ status }: { status: Shot["preflight"]["status"] }) {
    const labels = { pending: "待整理", running: "AI 整理中", ready: "已准备", "needs-review": "需处理", failed: "整理失败", "user-locked": "人工锁定" };
    return <Tag color={status === "ready" ? "green" : status === "failed" ? "red" : status === "needs-review" ? "gold" : "default"}>{labels[status]}</Tag>;
}

function defaultSummary(shot: Shot) {
    return `${shot.narrativePurpose}。${shot.startState}；${shot.action}；最终${shot.endState}。`;
}
function assetName(value: unknown) {
    return value && typeof value === "object" && "name" in value && typeof value.name === "string" ? value.name : "未命名资产";
}
function sourceLabel(value: Shot["preflight"]["fieldSources"][number]["source"]) {
    return { script: "剧本", dialogue: "对白", "connected-asset": "连线资产", "canvas-asset": "画布资产", rule: "规则匹配", ai: "AI 推断", user: "人工修改" }[value];
}
function confidenceLabel(value: Shot["preflight"]["confidence"]) {
    return value === "high" ? "高置信度" : value === "medium" ? "中置信度" : "低置信度";
}
function severityLabel(value: Shot["preflight"]["issues"][number]["severity"]) {
    return value === "blocking" ? "必须处理" : value === "review" ? "建议确认" : "可选";
}
function normalize(value: string) {
    return value.replace(/[\s·・._\-:：,，。'"“”‘’]/g, "").toLowerCase();
}

function candidateAssets(production: ProductionProject, issue: Shot["preflight"]["issues"][number]) {
    if (!issue.assetKind || !issue.candidateAssetIds?.length) return [];
    const records = issue.assetKind === "character" ? production.characters : issue.assetKind === "scene" ? production.scenes : production.props;
    return issue.candidateAssetIds.flatMap((id) => {
        const record = records.find((item) => item.id === id);
        const data = record?.versions.find((item) => item.version === record.currentVersion)?.data;
        return record ? [{ id: record.id, name: assetName(data) }] : [];
    });
}
