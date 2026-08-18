import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Button } from "antd";
import { ChevronLeft, ChevronRight, Copy, Edit3, Eye, X } from "lucide-react";
import { Streamdown } from "streamdown";

import { markdownInfo, splitMarkdownSections, type MarkdownHeading } from "@/lib/canvas/canvas-markdown";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData } from "@/types/canvas";

export type CanvasMarkdownReaderLabels = {
    fallbackTitle: string;
    emptyTitle: string;
    emptyHint: string;
    editorPlaceholder: string;
};

type CanvasMarkdownReaderProps = {
    node: CanvasNodeData | null;
    labels: CanvasMarkdownReaderLabels;
    contentOverride?: string;
    readOnly?: boolean;
    onChange: (nodeId: string, content: string) => void;
    onClose: () => void;
};

const LARGE_MARKDOWN_THRESHOLD = 120_000;
const EDIT_SAVE_DELAY = 800;

export function CanvasMarkdownReader({ node, labels, contentOverride, readOnly = false, onChange, onClose }: CanvasMarkdownReaderProps) {
    const { message } = App.useApp();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [mode, setMode] = useState<"read" | "edit">("read");
    const [activeSectionIndex, setActiveSectionIndex] = useState(0);
    const content = contentOverride ?? node?.metadata?.content ?? "";
    const info = useMemo(() => markdownInfo(content, node?.title || labels.fallbackTitle), [content, labels.fallbackTitle, node?.title]);
    const sections = useMemo(() => (content.length >= LARGE_MARKDOWN_THRESHOLD ? splitMarkdownSections(content) : [{ id: "markdown-section-all", title: "全文", content }]), [content]);
    const sectionIndex = Math.min(activeSectionIndex, sections.length - 1);
    const activeSection = sections[sectionIndex];
    const activeSectionInfo = useMemo(() => markdownInfo(activeSection.content, activeSection.title), [activeSection]);
    const paged = sections.length > 1;
    const contentRef = useRef<HTMLDivElement>(null);
    const mainRef = useRef<HTMLElement>(null);
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const activeNodeIdRef = useRef<string | null>(null);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const flushEditor = useCallback(() => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        const next = editorRef.current?.value;
        if (!node || readOnly || next == null || next === content) return;
        onChange(node.id, next);
    }, [content, node, onChange, readOnly]);

    const closeReader = useCallback(() => {
        flushEditor();
        onClose();
    }, [flushEditor, onClose]);

    useEffect(() => {
        if (!node) {
            activeNodeIdRef.current = null;
            return;
        }
        if (activeNodeIdRef.current === node.id) return;
        activeNodeIdRef.current = node.id;
        setMode(content.trim() ? "read" : "edit");
        setActiveSectionIndex(0);
    }, [content, node]);

    useEffect(() => {
        if (!node) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            if (event.isComposing) return;
            closeReader();
        };
        document.addEventListener("keydown", handleKeyDown, true);
        return () => document.removeEventListener("keydown", handleKeyDown, true);
    }, [closeReader, node]);

    useEffect(
        () => () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        },
        [],
    );

    if (!node) return null;

    const copyMarkdown = async () => {
        await navigator.clipboard.writeText(editorRef.current?.value ?? content);
        message.success("已复制 Markdown");
    };

    const jumpToHeading = (heading: MarkdownHeading) => {
        contentRef.current?.querySelector<HTMLElement>(`#${CSS.escape(heading.id)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const openSection = (index: number) => {
        setActiveSectionIndex(index);
        mainRef.current?.scrollTo({ top: 0 });
    };

    const toggleMode = () => {
        if (mode === "edit") flushEditor();
        setMode(mode === "read" ? "edit" : "read");
    };

    const queueChange = (value: string) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            onChange(node.id, value);
        }, EDIT_SAVE_DELAY);
    };

    return (
        <div
            className="fixed inset-0 z-[300] flex flex-col"
            style={{ background: `color-mix(in srgb, ${theme.canvas.background} 94%, black)` }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <header className="flex h-16 shrink-0 items-center gap-3 border-b px-5" style={{ borderColor: theme.toolbar.border, color: theme.node.text }}>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{info.title}</div>
                    <div className="mt-1 text-xs" style={{ color: theme.node.muted }}>
                        {info.wordCount} 字 · {info.headingCount} 个标题{paged && mode === "read" ? ` · 第 ${sectionIndex + 1}/${sections.length} 章` : ""}
                    </div>
                </div>
                {paged && mode === "read" ? (
                    <div className="flex items-center">
                        <Button type="text" icon={<ChevronLeft className="size-4" />} disabled={sectionIndex === 0} onClick={() => openSection(sectionIndex - 1)}>
                            上一章
                        </Button>
                        <Button type="text" icon={<ChevronRight className="size-4" />} disabled={sectionIndex === sections.length - 1} onClick={() => openSection(sectionIndex + 1)}>
                            下一章
                        </Button>
                    </div>
                ) : null}
                <Button icon={<Copy className="size-4" />} onClick={copyMarkdown} disabled={!content.trim()}>
                    复制 Markdown
                </Button>
                {!readOnly ? (
                    <Button icon={mode === "read" ? <Edit3 className="size-4" /> : <Eye className="size-4" />} onClick={toggleMode}>
                        {mode === "read" ? "编辑" : "阅读"}
                    </Button>
                ) : null}
                <Button icon={<X className="size-4" />} onClick={closeReader}>
                    关闭
                </Button>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)]">
                <aside className="hidden border-r p-4 lg:block" style={{ borderColor: theme.toolbar.border }}>
                    <div className="mb-3 text-xs font-medium" style={{ color: theme.node.muted }}>
                        {paged ? "章节" : "目录"}
                    </div>
                    <div className="thin-scrollbar flex max-h-[calc(100vh-112px)] flex-col gap-1 overflow-y-auto">
                        {paged ? (
                            sections.map((section, index) => (
                                <button
                                    key={section.id}
                                    type="button"
                                    className="truncate rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-black/5 dark:hover:bg-white/10"
                                    style={{ color: theme.node.text, background: index === sectionIndex ? theme.toolbar.activeBg : undefined }}
                                    onClick={() => openSection(index)}
                                >
                                    {section.title}
                                </button>
                            ))
                        ) : info.headings.length ? (
                            info.headings.map((heading) => (
                                <button
                                    key={heading.id}
                                    type="button"
                                    className="truncate rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-black/5 dark:hover:bg-white/10"
                                    style={{ paddingLeft: 8 + (heading.level - 1) * 14, color: theme.node.text }}
                                    onClick={() => jumpToHeading(heading)}
                                >
                                    {heading.text}
                                </button>
                            ))
                        ) : (
                            <div className="text-xs leading-5" style={{ color: theme.node.placeholder }}>
                                Markdown 标题会显示在这里
                            </div>
                        )}
                    </div>
                </aside>

                <main ref={mainRef} className="thin-scrollbar min-h-0 overflow-y-auto px-5 py-8">
                    {mode === "edit" && !readOnly ? (
                        <textarea
                            key={node.id}
                            ref={editorRef}
                            data-markdown-reader-editor
                            className="mx-auto block h-[calc(100vh-128px)] w-full max-w-[960px] resize-none rounded-lg border bg-transparent p-5 font-mono text-sm leading-7 outline-none"
                            style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
                            defaultValue={content}
                            placeholder={labels.editorPlaceholder}
                            onChange={(event) => queueChange(event.target.value)}
                            onWheel={(event) => event.stopPropagation()}
                        />
                    ) : (
                        <article ref={contentRef} className="canvas-markdown-reader mx-auto max-w-[860px] pb-20 text-base leading-8" style={{ color: theme.node.text }}>
                            {content.trim() ? <RenderedMarkdown content={activeSection.content} headings={activeSectionInfo.headings} /> : <EmptyMarkdownState theme={theme} labels={labels} onEdit={readOnly ? undefined : () => setMode("edit")} />}
                        </article>
                    )}
                </main>
            </div>
        </div>
    );
}

function RenderedMarkdown({ content, headings }: { content: string; headings: MarkdownHeading[] }) {
    let index = 0;
    return (
        <Streamdown
            mode="static"
            components={{
                h1: ({ children, ...props }) => (
                    <h1 id={headings[index++]?.id} {...props}>
                        {children}
                    </h1>
                ),
                h2: ({ children, ...props }) => (
                    <h2 id={headings[index++]?.id} {...props}>
                        {children}
                    </h2>
                ),
                h3: ({ children, ...props }) => (
                    <h3 id={headings[index++]?.id} {...props}>
                        {children}
                    </h3>
                ),
            }}
        >
            {content}
        </Streamdown>
    );
}

function EmptyMarkdownState({ theme, labels, onEdit }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; labels: CanvasMarkdownReaderLabels; onEdit?: () => void }) {
    return (
        <button
            type="button"
            className={`flex min-h-[360px] w-full flex-col items-center justify-center rounded-lg border border-dashed text-center transition ${onEdit ? "hover:bg-black/5 dark:hover:bg-white/10" : "cursor-default"}`}
            style={{ borderColor: theme.toolbar.border, color: theme.node.placeholder }}
            onClick={onEdit}
        >
            <span className="text-base font-medium">{labels.emptyTitle}</span>
            <span className="mt-2 text-sm">{labels.emptyHint}</span>
        </button>
    );
}
