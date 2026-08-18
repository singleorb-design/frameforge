import { Button, Tag } from "antd";
import { Copy, LoaderCircle, Sparkles, Square } from "lucide-react";
import { useEffect, useState } from "react";

import { emitCanvasEvent } from "@/lib/canvas/canvas-event-bus";
import { compileAssetPrompt } from "@/lib/production/asset-prompt-compiler";
import type { AssetDraft, ShotPreflightIssue } from "@/types/production";

export function MissingAssetCard({
    shotboardId,
    issue,
    draft,
    previewPrompt,
    candidates = [],
    onSelectCandidate,
}: {
    shotboardId: string;
    issue: ShotPreflightIssue;
    draft?: AssetDraft;
    previewPrompt?: { positivePrompt: string; negativePrompt: string; recommendedRatio: string };
    candidates?: Array<{ id: string; name: string }>;
    onSelectCandidate?: (assetId: string) => void;
}) {
    if (!issue.assetKind || !issue.suggestedName || !issue.prompt) return null;
    const isGenerating = issue.assetDraftStatus === "generating";
    const preview = draft ? compileAssetPrompt(draft) : null;
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!isGenerating) return;
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [isGenerating]);
    const elapsedSeconds = issue.assetDraftStartedAt ? Math.max(1, Math.floor((now - new Date(issue.assetDraftStartedAt).getTime()) / 1000)) : 0;
    return (
        <div className="border-l-2 border-amber-500 bg-amber-500/5 px-3 py-3 text-xs">
            <div className="flex items-start justify-between gap-2">
                <div><b>缺少{kindLabel(issue.assetKind)}：{issue.suggestedName}</b><div className="mt-1 opacity-55">影响镜头：{issue.shotIds.join("、")}</div></div>
                <Tag color={issue.severity === "blocking" ? "red" : "gold"}>{issue.severity === "blocking" ? "必须处理" : "建议确认"}</Tag>
            </div>
            {candidates.length && onSelectCandidate ? (
                <div className="mt-2 flex flex-wrap gap-2">
                    {candidates.map((candidate) => (
                        <Button key={candidate.id} size="small" type="primary" onClick={() => onSelectCandidate(candidate.id)}>
                            使用 {candidate.name}
                        </Button>
                    ))}
                </div>
            ) : null}
            <div className="mt-2 border border-dashed p-2 leading-5 opacity-65">{issue.prompt.positivePrompt}</div>
            <div className="mt-2 flex flex-wrap gap-2">
                <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => void navigator.clipboard.writeText(preview ? formatPromptPack(preview) : previewPrompt ? formatPromptPack({ ...previewPrompt, use: "缺失资产临时参考图", workflow: ["先用此图建立视觉母版。", "资产卡草案生成成功后，改用完整资产 Prompt 生成标准设定图和三视图。"] }) : `${issue.prompt!.positivePrompt}\n\n负向：${issue.prompt!.negativePrompt}`)}>复制 Prompt</Button>
                <Button size="small" type="primary" disabled={isGenerating} icon={isGenerating ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} onClick={() => emitCanvasEvent("asset-draft:generate", { shotboardId, issueId: issue.id })}>
                    {isGenerating ? "AI 正在补齐素材" : issue.assetDraftStatus === "error" ? "重新补齐素材" : "AI 补齐素材"}
                </Button>
                {isGenerating ? <Button size="small" danger icon={<Square className="size-3.5 fill-current" />} onClick={() => emitCanvasEvent("asset-draft:cancel", { shotboardId, issueId: issue.id })}>停止生成</Button> : null}
            </div>
            {isGenerating ? <div className="mt-2 flex items-center gap-1.5 text-blue-700 dark:text-blue-300"><LoaderCircle className="size-3.5 animate-spin" /> 正在根据相关镜头和对白补齐素材，已等待 {elapsedSeconds} 秒。</div> : null}
            {issue.assetDraftStatus === "error" ? <div className="mt-2 border-l-2 border-red-500 px-2 py-1 text-red-600 dark:text-red-400">补齐失败：{issue.assetDraftError || "请检查文本模型配置后重试"}</div> : null}
            {draft ? (
                <div className="mt-3 border-t pt-3">
                    <div className="font-semibold">{draft.name} · AI 补齐方案</div>
                    <div className="mt-1 leading-5 opacity-60">{draftSummary(draft)}</div>
                    <div className="mt-2 border border-dashed p-2 leading-5 opacity-65">{preview?.positivePrompt}</div>
                    <div className="mt-2 flex gap-2">
                        <Button size="small" type="primary" onClick={() => emitCanvasEvent("asset-draft:adopt", { shotboardId, draftId: draft.id })}>采用素材</Button>
                        <Button size="small" onClick={() => emitCanvasEvent("asset-draft:adopt", { shotboardId, draftId: draft.id, generateImage: true })}>采用并生成参考图</Button>
                        <Button size="small" onClick={() => emitCanvasEvent("asset-draft:discard", { shotboardId, draftId: draft.id })}>丢弃</Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function draftSummary(draft: AssetDraft) {
    const data = draft.data;
    if ("appearance" in data) return `${data.role}；${data.appearance}；服装：${data.clothing}`;
    if ("spatialLayout" in data) return `${data.narrativeFunction}；空间：${data.spatialLayout}；光线：${data.defaultLighting}`;
    return `${data.narrativeFunction}；造型：${data.shape}；材质：${data.material}；状态：${data.states.map((item) => item.name).join("、")}`;
}
function kindLabel(kind: ShotPreflightIssue["assetKind"]) {
    return kind === "character" ? "人物" : kind === "scene" ? "场景" : "道具";
}

function formatPromptPack(prompt: NonNullable<ReturnType<typeof compileAssetPrompt>>) {
    return [
        `用途：${prompt.use}`,
        `推荐比例：${prompt.ratio}`,
        "",
        "正向 Prompt：",
        prompt.positivePrompt,
        "",
        "负向 Prompt：",
        prompt.negativePrompt,
        "",
        "操作流程：",
        ...prompt.workflow.map((step, index) => `${index + 1}. ${step}`),
    ].join("\n");
}
