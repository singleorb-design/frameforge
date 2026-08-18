import { ChevronRight, ImageUp, UsersRound, UserRound } from "lucide-react";

import { CanvasNodeType } from "@/types/canvas";
import type { CanvasNodeContext } from "@/types/canvas-plugin";

export function CanvasCharacterNodeContent({ ctx }: { ctx: CanvasNodeContext }) {
    return ctx.node.type === CanvasNodeType.CharacterGroup ? <CharacterGroupContent ctx={ctx} /> : <CharacterCardContent ctx={ctx} />;
}

function CharacterGroupContent({ ctx }: { ctx: CanvasNodeContext }) {
    const metadata = ctx.node.metadata || {};
    const children = (metadata.characterChildIds || []).map((id) => ctx.getNode(id)).filter(Boolean);
    const names = children.map((node) => node?.metadata?.name || node?.title).filter(Boolean).slice(0, 6);
    const skipped = metadata.skippedCharacters || [];
    const expanded = metadata.characterBatchExpanded !== false;
    return (
        <div className="relative flex h-full w-full flex-col overflow-visible p-4" style={{ color: ctx.theme.node.text }}>
            {!expanded && children.length ? (
                <div className="pointer-events-none absolute inset-0 overflow-visible">
                    {Array.from({ length: Math.min(children.length, 4) }).map((_, index) => (
                        <div
                            key={index}
                            className="absolute rounded-[inherit] border shadow-[0_14px_34px_rgba(68,64,60,.14)] transition-transform"
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
            ) : null}
            <div className="flex items-start gap-3">
                <UsersRound className="mt-0.5 size-5 shrink-0" style={{ color: ctx.theme.node.muted }} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">角色设定</div>
                    <div className="mt-1 text-[11px]" style={{ color: ctx.theme.node.muted }}>
                        {children.length} 个主要角色
                    </div>
                </div>
                <button
                    type="button"
                    className="grid size-8 shrink-0 place-items-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={(event) => {
                        event.stopPropagation();
                        ctx.emit("character-group:toggle", { nodeId: ctx.node.id });
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    title={expanded ? "收起角色设定" : "展开角色设定"}
                >
                    <ChevronRight className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
                </button>
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-hidden text-sm leading-6">
                {names.length ? names.join(" / ") : metadata.status === "loading" ? "正在整理主要角色..." : "暂无角色设定"}
                {skipped.length ? (
                    <div className="mt-3 text-xs leading-5" style={{ color: ctx.theme.node.muted }}>
                        已跳过：{skipped.map((item) => item.name).join("、")}
                    </div>
                ) : null}
            </div>
            <div className="mt-3 text-[11px]" style={{ color: ctx.theme.node.muted }}>
                {expanded ? "已展开" : "已收起"}
            </div>
        </div>
    );
}

function CharacterCardContent({ ctx }: { ctx: CanvasNodeContext }) {
    const metadata = ctx.node.metadata || {};
    const locks = metadata.consistencyLocks || [];
    const props = metadata.props || [];
    const references = ctx.production.assetReferences.filter((item) => item.assetId === metadata.productionRecordId && item.assetVersion === metadata.productionVersion);
    return (
        <div className="flex h-full w-full flex-col overflow-hidden p-4" style={{ color: ctx.theme.node.text }}>
            <div className="flex items-start gap-3">
                <UserRound className="mt-0.5 size-5 shrink-0" style={{ color: ctx.theme.node.muted }} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{metadata.name || ctx.node.title || "角色设定"}</div>
                    <div className="mt-1 truncate text-[11px]" style={{ color: ctx.theme.node.muted }}>
                        {[metadata.role, metadata.importance].filter(Boolean).join(" / ") || "角色设定"}
                    </div>
                </div>
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-hidden text-sm leading-6">
                <div className="line-clamp-2">{[metadata.hair, metadata.face, metadata.body].filter(Boolean).join("，") || "暂无外观设定"}</div>
                <div className="mt-2 line-clamp-2">{[metadata.clothing, props.length ? props.join("、") : ""].filter(Boolean).join("，")}</div>
                {locks.length ? (
                    <div className="mt-3 text-xs leading-5" style={{ color: ctx.theme.node.muted }}>
                        一致性：{locks.slice(0, 4).join(" / ")}
                    </div>
                ) : null}
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
