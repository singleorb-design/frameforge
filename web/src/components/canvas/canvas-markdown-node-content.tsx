import { useMemo, type ReactNode } from "react";

import { markdownInfo } from "@/lib/canvas/canvas-markdown";
import type { CanvasNodeContext } from "@/types/canvas-plugin";

export type CanvasMarkdownNodeLabels = {
    fallbackTitle: string;
    emptyTitle: string;
    emptyBody: string;
};

export function CanvasMarkdownNodeContent({ ctx, icon, labels }: { ctx: CanvasNodeContext; icon: ReactNode; labels: CanvasMarkdownNodeLabels }) {
    const content = ctx.node.metadata?.content || "";
    const title = ctx.node.title || labels.fallbackTitle;
    const info = useMemo(() => markdownInfo(content, title), [content, title]);
    const empty = !content.trim();

    return (
        <div className="flex h-full w-full flex-col overflow-hidden p-4" style={{ color: ctx.theme.node.text }}>
            <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0" style={{ color: ctx.theme.node.muted }}>
                    {icon}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{empty ? labels.emptyTitle : info.title}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px]" style={{ color: ctx.theme.node.muted }}>
                        <span>{info.wordCount} 字</span>
                        <span>{info.headingCount} 个标题</span>
                    </div>
                </div>
            </div>
            <div className="thin-scrollbar mt-4 min-h-0 flex-1 overflow-hidden whitespace-pre-wrap break-words text-sm leading-6" style={{ color: empty ? ctx.theme.node.placeholder : ctx.theme.node.text }}>
                {empty ? labels.emptyBody : info.summary || "双击全屏阅读"}
            </div>
            <div className="mt-3 text-[11px]" style={{ color: ctx.theme.node.muted }}>
                双击全屏阅读
            </div>
        </div>
    );
}
