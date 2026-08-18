import { ChevronRight, Images } from "lucide-react";

import type { CanvasNodeContext } from "@/types/canvas-plugin";

const assetLabels = {
    "three-view": "三视图",
    "expression-grid": "表情九宫格",
    "shot-scale": "景别参考",
} as const;

export function CanvasCharacterAssetGroupContent({ ctx }: { ctx: CanvasNodeContext }) {
    const metadata = ctx.node.metadata || {};
    const children = (metadata.characterAssetChildIds || []).map((id) => ctx.getNode(id)).filter(Boolean);
    const expanded = metadata.characterAssetExpanded !== false;
    const labels = children.map((node) => (node?.metadata?.assetKind ? assetLabels[node.metadata.assetKind] : node?.title)).filter(Boolean);
    return (
        <div className="relative flex h-full w-full flex-col overflow-visible p-4" style={{ color: ctx.theme.node.text }}>
            {!expanded && children.length ? (
                <div className="pointer-events-none absolute inset-0 overflow-visible">
                    {Array.from({ length: Math.min(children.length, 3) }).map((_, index) => (
                        <div
                            key={index}
                            className="absolute rounded-[inherit] border shadow-[0_14px_34px_rgba(68,64,60,.14)]"
                            style={{
                                inset: 0,
                                background: `linear-gradient(135deg, ${ctx.theme.node.panel}, ${ctx.theme.node.fill})`,
                                borderColor: ctx.theme.node.stroke,
                                transform: `translate(${22 + index * 16}px, ${10 + index * 9}px) rotate(${4 + index * 3}deg)`,
                                zIndex: -index - 1,
                            }}
                        />
                    ))}
                </div>
            ) : null}
            <div className="flex items-start gap-3">
                <Images className="mt-0.5 size-5 shrink-0" style={{ color: ctx.theme.node.muted }} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{ctx.node.title || "视觉参考"}</div>
                    <div className="mt-1 text-[11px]" style={{ color: ctx.theme.node.muted }}>
                        {children.length} / {metadata.assetKinds?.length || 3} 项资产
                    </div>
                </div>
                <button
                    type="button"
                    className="grid size-8 shrink-0 place-items-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={(event) => {
                        event.stopPropagation();
                        ctx.emit("character-asset-group:toggle", { nodeId: ctx.node.id });
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    title={expanded ? "收起视觉参考" : "展开视觉参考"}
                >
                    <ChevronRight className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
                </button>
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-hidden text-sm leading-6">
                {labels.length ? labels.join(" / ") : metadata.status === "loading" ? "正在准备视觉参考..." : "暂无视觉参考"}
                {metadata.errorDetails ? <div className="mt-3 text-xs text-red-400">{metadata.errorDetails}</div> : null}
            </div>
            <div className="mt-3 text-[11px]" style={{ color: ctx.theme.node.muted }}>
                {expanded ? "双击收起" : "双击展开"}
            </div>
        </div>
    );
}
