import { ChevronRight, Clapperboard, ImageUp, Map, Package, ScrollText } from "lucide-react";
import type { ReactNode } from "react";

import { CanvasNodeType } from "@/types/canvas";
import type { CanvasNodeContext } from "@/types/canvas-plugin";
import type { Shot } from "@/types/production";
import { shotStatusLabels } from "@/lib/production/shot-mode-labels";
import { assetReferenceCountForShot } from "@/lib/production/shot-control-assets";

export function CanvasProductionNodeContent({ ctx }: { ctx: CanvasNodeContext }) {
    if (ctx.node.type === CanvasNodeType.SceneGroup) return <ProductionGroupContent ctx={ctx} label="场景卡组" icon={<Map className="size-5" />} />;
    if (ctx.node.type === CanvasNodeType.PropGroup) return <ProductionGroupContent ctx={ctx} label="道具卡组" icon={<Package className="size-5" />} />;
    if (ctx.node.type === CanvasNodeType.Shotboard) return <ShotboardContent ctx={ctx} />;
    if (ctx.node.type === CanvasNodeType.SceneCard) return <SceneCardContent ctx={ctx} />;
    if (ctx.node.type === CanvasNodeType.PropCard) return <PropCardContent ctx={ctx} />;
    return <ShotContent ctx={ctx} />;
}

function ProductionGroupContent({ ctx, label, icon }: { ctx: CanvasNodeContext; label: string; icon: ReactNode }) {
    const children = (ctx.node.metadata?.productionChildIds || []).map((id) => ctx.getNode(id)).filter(Boolean);
    const expanded = ctx.node.metadata?.productionExpanded !== false;
    return (
        <div className="relative flex h-full w-full flex-col overflow-visible p-4" style={{ color: ctx.theme.node.text }}>
            <StackedCards ctx={ctx} count={children.length} expanded={expanded} />
            <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0" style={{ color: ctx.theme.node.muted }}>
                    {icon}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{label}</div>
                    <div className="mt-1 text-[11px]" style={{ color: ctx.theme.node.muted }}>
                        {children.length} 张已定稿卡片
                    </div>
                </div>
                <ToggleButton ctx={ctx} expanded={expanded} />
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-hidden text-sm leading-6">{children.map((node) => node?.title).filter(Boolean).slice(0, 8).join(" / ") || "暂无资产"}</div>
            <div className="mt-3 text-[11px]" style={{ color: ctx.theme.node.muted }}>
                {expanded ? "已展开" : "已收起"}
            </div>
        </div>
    );
}

function ShotboardContent({ ctx }: { ctx: CanvasNodeContext }) {
    const shotboard = ctx.production.shotboards.find((item) => item.id === ctx.node.metadata?.productionRecordId);
    const children = (ctx.node.metadata?.productionChildIds || []).map((id) => ctx.getNode(id)).filter(Boolean);
    const expanded = ctx.node.metadata?.productionExpanded !== false;
    return (
        <div className="relative flex h-full w-full flex-col overflow-visible p-4" style={{ color: ctx.theme.node.text }}>
            <StackedCards ctx={ctx} count={children.length} expanded={expanded} />
            <div className="flex items-start gap-3">
                <ScrollText className="mt-0.5 size-5 shrink-0" style={{ color: ctx.theme.node.muted }} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{shotboard?.title || ctx.node.title}</div>
                    <div className="mt-1 text-[11px]" style={{ color: ctx.theme.node.muted }}>
                        {shotboard ? `${shotboard.scenes.length} 场 · ${shotboard.shots.length} 镜 · ${formatDuration(shotboard.targetDurationMs)} · ${shotboard.targetRatio}` : "分镜数据缺失"}
                    </div>
                </div>
                <ToggleButton ctx={ctx} expanded={expanded} />
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-hidden text-sm leading-6">
                {shotboard?.scenes
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((scene) => scene.heading)
                    .join(" / ") || "暂无分镜"}
            </div>
            <div className="mt-3 text-[11px]" style={{ color: ctx.theme.node.muted }}>
                双击全屏阅读 · {expanded ? "镜头已展开" : "镜头已收起"}
            </div>
        </div>
    );
}

function SceneCardContent({ ctx }: { ctx: CanvasNodeContext }) {
    const card = findVersion(ctx.production.scenes, ctx.node.metadata?.productionRecordId, ctx.node.metadata?.productionVersion);
    return <AssetCard ctx={ctx} icon={<Map className="size-5" />} title={card?.name || ctx.node.title} subtitle={card?.defaultLighting || "场景设定"} lines={[card?.spatialLayout, card?.continuityLocks.join(" / ")]} />;
}

function PropCardContent({ ctx }: { ctx: CanvasNodeContext }) {
    const card = findVersion(ctx.production.props, ctx.node.metadata?.productionRecordId, ctx.node.metadata?.productionVersion);
    return <AssetCard ctx={ctx} icon={<Package className="size-5" />} title={card?.name || ctx.node.title} subtitle={[card?.material, card?.scale].filter(Boolean).join(" / ") || "道具设定"} lines={[card?.shape, card?.states.map((state) => state.name).join(" / "), card?.continuityLocks.join(" / ")]} />;
}

function ShotContent({ ctx }: { ctx: CanvasNodeContext }) {
    const shot = findShot(ctx);
    return (
        <div className="flex h-full w-full flex-col overflow-hidden p-4" style={{ color: ctx.theme.node.text }}>
            <div className="flex items-start gap-3">
                <Clapperboard className="mt-0.5 size-5 shrink-0" style={{ color: ctx.theme.node.muted }} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{shot ? `${shot.code} · ${shot.narrativePurpose}` : ctx.node.title}</div>
                    <div className="mt-1 truncate text-[11px]" style={{ color: ctx.theme.node.muted }}>
                        {shot ? `${shot.framing.shotSize} / ${shot.framing.cameraAngle} · ${formatDuration(shot.targetDurationMs)}` : "镜头数据缺失"}
                    </div>
                </div>
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-hidden text-sm leading-6">
                <div className="line-clamp-1">开始：{shot?.startState || "—"}</div>
                <div className="line-clamp-2">动作：{shot?.action || "—"}</div>
                <div className="line-clamp-1">结束：{shot?.endState || "—"}</div>
            </div>
            <div className="mt-3 text-[11px]" style={{ color: ctx.theme.node.muted }}>
                {shot ? `${shotStatusLabels[shot.status]} · 视觉参考 ${assetReferenceCountForShot(ctx.production, shot)} 张 · 双击进入镜头工作台` : "镜头数据缺失"}
            </div>
        </div>
    );
}

function AssetCard({ ctx, icon, title, subtitle, lines }: { ctx: CanvasNodeContext; icon: ReactNode; title: string; subtitle: string; lines: Array<string | undefined> }) {
    const references = ctx.production.assetReferences.filter((item) => item.assetId === ctx.node.metadata?.productionRecordId && item.assetVersion === ctx.node.metadata?.productionVersion);
    return (
        <div className="flex h-full w-full flex-col overflow-hidden p-4" style={{ color: ctx.theme.node.text }}>
            <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0" style={{ color: ctx.theme.node.muted }}>
                    {icon}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{title}</div>
                    <div className="mt-1 truncate text-[11px]" style={{ color: ctx.theme.node.muted }}>
                        {subtitle}
                    </div>
                </div>
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-hidden text-sm leading-6">
                {lines.filter(Boolean).map((line, index) => (
                    <div key={index} className="line-clamp-2">
                        {line}
                    </div>
                ))}
            </div>
            <div className="mt-3 text-[11px]" style={{ color: ctx.theme.node.muted }}>
                {references.length ? `${references.length} 张正式参考图` : "尚未上传正式参考图"}
            </div>
            <button
                type="button"
                className="absolute bottom-3 right-3 grid size-8 place-items-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10"
                onClick={(event) => {
                    event.stopPropagation();
                    ctx.emit("asset-reference:upload", { nodeId: ctx.node.id });
                }}
                onMouseDown={(event) => event.stopPropagation()}
                title="上传外部生成图"
            >
                <ImageUp className="size-4" />
            </button>
        </div>
    );
}

function ToggleButton({ ctx, expanded }: { ctx: CanvasNodeContext; expanded: boolean }) {
    return (
        <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10"
            onClick={(event) => {
                event.stopPropagation();
                ctx.emit("production-group:toggle", { nodeId: ctx.node.id });
            }}
            onMouseDown={(event) => event.stopPropagation()}
            title={expanded ? "收起子节点" : "展开子节点"}
        >
            <ChevronRight className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
    );
}

function StackedCards({ ctx, count, expanded }: { ctx: CanvasNodeContext; count: number; expanded: boolean }) {
    if (expanded || !count) return null;
    return (
        <div className="pointer-events-none absolute inset-0 overflow-visible">
            {Array.from({ length: Math.min(count, 4) }).map((_, index) => (
                <div
                    key={index}
                    className="absolute rounded-[inherit] border shadow-[0_14px_34px_rgba(68,64,60,.14)]"
                    style={{
                        inset: 0,
                        background: `linear-gradient(135deg, ${ctx.theme.node.panel}, ${ctx.theme.node.fill})`,
                        borderColor: ctx.theme.node.stroke,
                        transform: `translate(${22 + index * 14}px, ${10 + index * 8}px) rotate(${4 + index * 3}deg)`,
                        zIndex: -index - 1,
                        opacity: 0.9 - index * 0.12,
                    }}
                />
            ))}
        </div>
    );
}

function findVersion<T>(records: Array<{ id: string; versions: Array<{ version: number; data: T }> }>, id?: string, version?: number): T | undefined {
    return records.find((record) => record.id === id)?.versions.find((item) => item.version === version)?.data;
}

function findShot(ctx: CanvasNodeContext): Shot | undefined {
    return ctx.production.shotboards.flatMap((shotboard) => shotboard.shots).find((shot) => shot.id === ctx.node.metadata?.productionRecordId);
}

function formatDuration(durationMs: number) {
    const seconds = durationMs / 1000;
    return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
}
