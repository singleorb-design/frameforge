# Markdown Script Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated “剧本” canvas node for Markdown scripts, with a full-screen Markdown reader/editor and downstream text-resource support.

**Architecture:** Add `CanvasNodeType.Script` as a built-in node type. Keep the canvas card small and scannable, and hold the full-screen reader state in `web/src/pages/canvas/project.tsx` so script nodes do not use the existing below-node prompt panel. Put Markdown parsing and summary helpers in one canvas-local utility file, and render the full-screen reader in a focused component.

**Tech Stack:** Vite, React, TypeScript, Tailwind, Ant Design, Zustand, `lucide-react`, existing `streamdown` Markdown renderer.

## Global Constraints

- Page copy stays Chinese.
- Do not add AI script generation, rewriting, or structural AI splitting.
- Do not add a rich text editor; edit raw Markdown with a textarea.
- Do not add cloud sync or separate file storage.
- Do not change ordinary text node behavior.
- Do not add a new Markdown rendering dependency; reuse `streamdown`.
- Preserve the current canvas theme via `canvasThemes` and `useThemeStore`.
- Do not run syntax checks, builds, or tests after coding; project AGENTS says the user will do that.
- Do not touch unrelated files or the existing untracked `docs/generated/` directory.
- User-visible implementation must update `CHANGELOG.md` and `docs/content/docs/progress/pending-test.mdx`; check `docs/content/docs/progress/todo.mdx`.

---

## File Structure

- Modify `web/src/types/canvas.ts`: add `CanvasNodeType.Script`.
- Modify `web/src/constant/canvas.ts`: add default size and metadata for script nodes.
- Create `web/src/lib/canvas/canvas-script-markdown.ts`: parse Markdown headings, derive title/summary/stats, strip simple Markdown for card preview.
- Create `web/src/components/canvas/canvas-script-node-content.tsx`: render the compact canvas card for script nodes.
- Create `web/src/components/canvas/canvas-script-reader.tsx`: render the full-screen Markdown reader/editor overlay.
- Modify `web/src/components/canvas/nodes/builtin-nodes.tsx`: register the script node, icon, resource output, and content renderer.
- Modify `web/src/components/canvas/canvas-node.tsx`: accept an `onOpenScriptReader` callback, route script node click/double-click to it, allow custom `Content` renderers for built-in registered nodes, and keep ordinary text node behavior unchanged.
- Modify `web/src/pages/canvas/project.tsx`: maintain `scriptReaderNodeId`, pass open callback into `CanvasNode`, render `CanvasScriptReader`, and save Markdown content back to the node.
- Modify `web/src/lib/canvas/canvas-resource-references.ts`: keep script node mentionable through its node definition resource.
- Modify `web/src/components/canvas/canvas-node-generation.ts`: read text from node definition `resource()` so script nodes feed downstream generation.
- Modify `CHANGELOG.md`: add one `[新增]` entry under `Unreleased`.
- Modify `docs/content/docs/progress/pending-test.mdx`: add manual verification item for the script node.
- Read `docs/content/docs/progress/todo.mdx`: confirm no related todo needs to move.

---

### Task 1: Add Script Node Type and Markdown Helpers

**Files:**
- Modify: `web/src/types/canvas.ts`
- Modify: `web/src/constant/canvas.ts`
- Create: `web/src/lib/canvas/canvas-script-markdown.ts`

**Interfaces:**
- Produces: `CanvasNodeType.Script`
- Produces: `parseMarkdownHeadings(markdown: string): ScriptHeading[]`
- Produces: `scriptMarkdownInfo(markdown: string, fallbackTitle: string): ScriptMarkdownInfo`
- Produces: `scriptHeadingAnchor(text: string, index: number): string`

- [ ] **Step 1: Add the script enum value**

In `web/src/types/canvas.ts`, extend `CanvasNodeType`:

```ts
export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Script = "script",
    Config = "config",
    Video = "video",
    Audio = "audio",
    Group = "group",
}
```

- [ ] **Step 2: Add the default script node spec**

In `web/src/constant/canvas.ts`, add the default size:

```ts
export const NODE_DEFAULT_SIZE = {
    [CanvasNodeType.Image]: { width: 340, height: 240, title: "图片" },
    [CanvasNodeType.Text]: { width: 340, height: 240, title: "文本" },
    [CanvasNodeType.Script]: { width: 380, height: 260, title: "剧本" },
    [CanvasNodeType.Config]: { width: 340, height: 240, title: "生成配置" },
    [CanvasNodeType.Video]: { width: 420, height: 236, title: "视频" },
    [CanvasNodeType.Audio]: { width: 340, height: 120, title: "音频" },
    [CanvasNodeType.Group]: { width: 760, height: 480, title: "组" },
} satisfies Record<CanvasNodeType, { width: number; height: number; title: string }>;
```

Add the matching metadata entry:

```ts
[CanvasNodeType.Script]: {
    ...NODE_DEFAULT_SIZE[CanvasNodeType.Script],
    metadata: { content: "", status: "idle" },
},
```

- [ ] **Step 3: Create Markdown parsing helpers**

Create `web/src/lib/canvas/canvas-script-markdown.ts`:

```ts
export type ScriptHeading = {
    id: string;
    level: 1 | 2 | 3;
    text: string;
};

export type ScriptMarkdownInfo = {
    title: string;
    summary: string;
    wordCount: number;
    headingCount: number;
    headings: ScriptHeading[];
};

export function scriptHeadingAnchor(text: string, index: number) {
    const slug = text
        .trim()
        .toLowerCase()
        .replace(/[`*_~[\]()#+.!?，。！？、：:；;'"“”‘’]/g, "")
        .replace(/\s+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `script-heading-${index}-${slug || "section"}`;
}

export function parseMarkdownHeadings(markdown: string): ScriptHeading[] {
    const headings: ScriptHeading[] = [];
    markdown.split(/\r?\n/).forEach((line) => {
        const match = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
        if (!match) return;
        const text = stripInlineMarkdown(match[2]).trim();
        if (!text) return;
        headings.push({ id: scriptHeadingAnchor(text, headings.length), level: match[1].length as 1 | 2 | 3, text });
    });
    return headings;
}

export function scriptMarkdownInfo(markdown: string, fallbackTitle: string): ScriptMarkdownInfo {
    const headings = parseMarkdownHeadings(markdown);
    const plain = stripMarkdown(markdown);
    const title = headings.find((heading) => heading.level === 1)?.text || fallbackTitle || "剧本";
    return {
        title,
        summary: plain
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 4)
            .join("\n"),
        wordCount: countReadableChars(plain),
        headingCount: headings.length,
        headings,
    };
}

function stripMarkdown(markdown: string) {
    return markdown
        .replace(/```[\s\S]*?```/g, "")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^>\s?/gm, "")
        .replace(/^\s*[-*+]\s+/gm, "")
        .replace(/^\s*\d+\.\s+/gm, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[*_~`]/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function stripInlineMarkdown(value: string) {
    return value.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_~`]/g, "");
}

function countReadableChars(value: string) {
    return value.replace(/\s/g, "").length;
}
```

- [ ] **Step 4: Manually inspect task output**

Confirm these files contain the expected declarations:

```bash
rg -n "Script|scriptMarkdownInfo|parseMarkdownHeadings" web/src/types/canvas.ts web/src/constant/canvas.ts web/src/lib/canvas/canvas-script-markdown.ts
```

Expected: output includes `Script = "script"`, `CanvasNodeType.Script`, `scriptMarkdownInfo`, and `parseMarkdownHeadings`.

- [ ] **Step 5: Commit Task 1**

```bash
git add web/src/types/canvas.ts web/src/constant/canvas.ts web/src/lib/canvas/canvas-script-markdown.ts
git commit -m $'feat: add markdown script node metadata\n\nCo-authored-by: TRAE CLI <noreply@bytedance.com>'
```

---

### Task 2: Register and Render the Compact Script Node Card

**Files:**
- Create: `web/src/components/canvas/canvas-script-node-content.tsx`
- Modify: `web/src/components/canvas/nodes/builtin-nodes.tsx`
- Modify: `web/src/components/canvas/canvas-node.tsx`

**Interfaces:**
- Consumes: `CanvasNodeType.Script`
- Consumes: `scriptMarkdownInfo(markdown: string, fallbackTitle: string): ScriptMarkdownInfo`
- Produces: `CanvasScriptNodeContent({ ctx }: { ctx: CanvasNodeContext }): JSX.Element`
- Produces: `CanvasNodeProps.onOpenScriptReader?: (node: CanvasNodeData) => void`

- [ ] **Step 1: Create the compact card renderer**

Create `web/src/components/canvas/canvas-script-node-content.tsx`:

```tsx
import { BookOpenText } from "lucide-react";

import { scriptMarkdownInfo } from "@/lib/canvas/canvas-script-markdown";
import type { CanvasNodeContext } from "@/types/canvas-plugin";

export function CanvasScriptNodeContent({ ctx }: { ctx: CanvasNodeContext }) {
    const content = ctx.node.metadata?.content || "";
    const info = scriptMarkdownInfo(content, ctx.node.title || "剧本");
    const empty = !content.trim();

    return (
        <div className="flex h-full w-full flex-col overflow-hidden p-4" style={{ color: ctx.theme.node.text }}>
            <div className="flex items-start gap-3">
                <BookOpenText className="mt-0.5 size-5 shrink-0" style={{ color: ctx.theme.node.muted }} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{empty ? "Markdown 剧本" : info.title}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px]" style={{ color: ctx.theme.node.muted }}>
                        <span>{info.wordCount} 字</span>
                        <span>{info.headingCount} 个标题</span>
                    </div>
                </div>
            </div>
            <div className="thin-scrollbar mt-4 min-h-0 flex-1 overflow-hidden whitespace-pre-wrap break-words text-sm leading-6" style={{ color: empty ? ctx.theme.node.placeholder : ctx.theme.node.text }}>
                {empty ? "点击全屏粘贴 Markdown 剧本" : info.summary || "点击全屏阅读"}
            </div>
            <div className="mt-3 text-[11px]" style={{ color: ctx.theme.node.muted }}>
                点击全屏阅读
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Register the script node**

In `web/src/components/canvas/nodes/builtin-nodes.tsx`, update imports:

```tsx
import { BookOpenText, FileText, Group, Image as ImageIcon, Music2, Settings2, Video } from "lucide-react";

import { CanvasScriptNodeContent } from "@/components/canvas/canvas-script-node-content";
```

Update `builtinResource`:

```ts
if (node.type === CanvasNodeType.Script && node.metadata?.content) return { kind: "text", text: node.metadata.content };
```

Add the definition:

```tsx
{ type: CanvasNodeType.Script, title: "剧本", icon: <BookOpenText className={iconClass} />, minimapColor: "#f59e0b", Content: CanvasScriptNodeContent, hidePanel: true, resource: builtinResource },
```

Place it after the text node so the create menu groups text-like nodes together.

- [ ] **Step 3: Add an open-reader callback to CanvasNode**

In `web/src/components/canvas/canvas-node.tsx`, add the prop:

```ts
onOpenScriptReader?: (node: CanvasNodeData) => void;
```

Destructure it from `CanvasNode` props:

```ts
onOpenScriptReader,
```

Update the double-click block before the text-node edit branch:

```tsx
if (data.type === CanvasNodeType.Script) {
    event.stopPropagation();
    onOpenScriptReader?.(data);
    return;
}
```

Update `finishNodeDrag` later in Task 3 to open on single click from the page layer; this step only handles double-click from inside the node component.

- [ ] **Step 4: Ensure custom built-in content renders**

In `NodeContent` inside `web/src/components/canvas/canvas-node.tsx`, move the definition `Content` check before `MissingPluginContent` and after built-in renderer lookup:

```tsx
const Renderer = nodeContentRenderers[props.node.type as CanvasNodeType];
if (Renderer) return <Renderer {...props} />;

const definition = getNodeDefinition(props.node.type);
if (definition?.Content && props.pluginContext) {
    const CustomContent = definition.Content;
    return <CustomContent ctx={props.pluginContext} />;
}
return <MissingPluginContent theme={props.theme} type={props.node.type} />;
```

Then change the `nodeContentRenderers` type from requiring every `CanvasNodeType` to allowing custom registered built-ins such as `script`:

```tsx
const nodeContentRenderers = {
    [CanvasNodeType.Text]: TextContent,
    [CanvasNodeType.Image]: ImageNodeContent,
    [CanvasNodeType.Config]: EmptyImageContent,
    [CanvasNodeType.Video]: VideoNodeContent,
    [CanvasNodeType.Audio]: AudioNodeContent,
    [CanvasNodeType.Group]: GroupNodeContent,
} satisfies Partial<Record<CanvasNodeType, (props: NodeContentRendererProps) => ReactNode>>;
```

This works for script nodes because `CanvasNode` already builds `pluginContext` for registered nodes through `pluginHost`.

- [ ] **Step 5: Manually inspect task output**

```bash
rg -n "CanvasScriptNodeContent|BookOpenText|CanvasNodeType.Script|onOpenScriptReader" web/src/components/canvas
```

Expected: output shows the new card component, script node registration, and callback prop.

- [ ] **Step 6: Commit Task 2**

```bash
git add web/src/components/canvas/canvas-script-node-content.tsx web/src/components/canvas/nodes/builtin-nodes.tsx web/src/components/canvas/canvas-node.tsx
git commit -m $'feat: add script node card\n\nCo-authored-by: TRAE CLI <noreply@bytedance.com>'
```

---

### Task 3: Add the Full-Screen Markdown Script Reader

**Files:**
- Create: `web/src/components/canvas/canvas-script-reader.tsx`
- Modify: `web/src/pages/canvas/project.tsx`
- Modify: `web/src/components/canvas/canvas-node.tsx`

**Interfaces:**
- Consumes: `scriptMarkdownInfo(markdown, fallbackTitle)`
- Produces: `CanvasScriptReader({ node, onChange, onClose }: CanvasScriptReaderProps): JSX.Element | null`
- Produces: `scriptReaderNodeId: string | null` state in `CanvasProjectPage`

- [ ] **Step 1: Create the full-screen reader**

Create `web/src/components/canvas/canvas-script-reader.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button } from "antd";
import { Copy, Edit3, Eye, X } from "lucide-react";
import { Streamdown } from "streamdown";

import { scriptMarkdownInfo, type ScriptHeading } from "@/lib/canvas/canvas-script-markdown";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData } from "@/types/canvas";

type CanvasScriptReaderProps = {
    node: CanvasNodeData | null;
    onChange: (nodeId: string, content: string) => void;
    onClose: () => void;
};

export function CanvasScriptReader({ node, onChange, onClose }: CanvasScriptReaderProps) {
    const { message } = App.useApp();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [mode, setMode] = useState<"read" | "edit">("read");
    const content = node?.metadata?.content || "";
    const info = useMemo(() => scriptMarkdownInfo(content, node?.title || "剧本"), [content, node?.title]);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!node) return;
        setMode(content.trim() ? "read" : "edit");
    }, [content, node]);

    useEffect(() => {
        if (!node) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [node, onClose]);

    if (!node) return null;

    const copyMarkdown = async () => {
        await navigator.clipboard.writeText(content);
        message.success("已复制 Markdown");
    };

    const jumpToHeading = (heading: ScriptHeading) => {
        contentRef.current?.querySelector<HTMLElement>(`#${CSS.escape(heading.id)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
                        {info.wordCount} 字 · {info.headingCount} 个标题
                    </div>
                </div>
                <Button icon={<Copy className="size-4" />} onClick={copyMarkdown} disabled={!content.trim()}>
                    复制 Markdown
                </Button>
                <Button icon={mode === "read" ? <Edit3 className="size-4" /> : <Eye className="size-4" />} onClick={() => setMode(mode === "read" ? "edit" : "read")}>
                    {mode === "read" ? "编辑" : "阅读"}
                </Button>
                <Button icon={<X className="size-4" />} onClick={onClose}>
                    关闭
                </Button>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)]">
                <aside className="hidden border-r p-4 lg:block" style={{ borderColor: theme.toolbar.border }}>
                    <div className="mb-3 text-xs font-medium" style={{ color: theme.node.muted }}>
                        目录
                    </div>
                    <div className="thin-scrollbar flex max-h-[calc(100vh-112px)] flex-col gap-1 overflow-y-auto">
                        {info.headings.length ? (
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

                <main className="thin-scrollbar min-h-0 overflow-y-auto px-5 py-8">
                    {mode === "edit" ? (
                        <textarea
                            className="mx-auto block h-[calc(100vh-128px)] w-full max-w-[960px] resize-none rounded-lg border bg-transparent p-5 font-mono text-sm leading-7 outline-none"
                            style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
                            value={content}
                            placeholder="# 第1集：标题\n\n## 0-3s Hook\n\n在这里粘贴 Markdown 剧本..."
                            onChange={(event) => onChange(node.id, event.target.value)}
                            onWheel={(event) => event.stopPropagation()}
                        />
                    ) : (
                        <article
                            ref={contentRef}
                            className="canvas-script-reader mx-auto max-w-[860px] pb-20 text-base leading-8"
                            style={{ color: theme.node.text }}
                        >
                            {content.trim() ? <ScriptMarkdown content={content} headings={info.headings} /> : <EmptyScriptState theme={theme} onEdit={() => setMode("edit")} />}
                        </article>
                    )}
                </main>
            </div>
        </div>
    );
}

function ScriptMarkdown({ content, headings }: { content: string; headings: ScriptHeading[] }) {
    let index = 0;
    return (
        <Streamdown
            components={{
                h1: ({ children, ...props }) => <h1 id={headings[index++]?.id} {...props}>{children}</h1>,
                h2: ({ children, ...props }) => <h2 id={headings[index++]?.id} {...props}>{children}</h2>,
                h3: ({ children, ...props }) => <h3 id={headings[index++]?.id} {...props}>{children}</h3>,
            }}
        >
            {content}
        </Streamdown>
    );
}

function EmptyScriptState({ theme, onEdit }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onEdit: () => void }) {
    return (
        <button type="button" className="flex min-h-[360px] w-full flex-col items-center justify-center rounded-lg border border-dashed text-center transition hover:bg-black/5 dark:hover:bg-white/10" style={{ borderColor: theme.toolbar.border, color: theme.node.placeholder }} onClick={onEdit}>
            <span className="text-base font-medium">粘贴 Markdown 剧本</span>
            <span className="mt-2 text-sm">点击进入编辑模式</span>
        </button>
    );
}
```

- [ ] **Step 2: Add reader state to the canvas page**

In `web/src/pages/canvas/project.tsx`, import the reader:

```tsx
import { CanvasScriptReader } from "@/components/canvas/canvas-script-reader";
```

Add state near `dialogNodeId`:

```ts
const [scriptReaderNodeId, setScriptReaderNodeId] = useState<string | null>(null);
```

Add derived node near render callbacks:

```ts
const scriptReaderNode = useMemo(() => nodes.find((node) => node.id === scriptReaderNodeId) || null, [nodes, scriptReaderNodeId]);
```

Add open/change callbacks:

```ts
const openScriptReader = useCallback((node: CanvasNodeData) => {
    setDialogNodeId(null);
    setScriptReaderNodeId(node.id);
}, []);

const handleScriptContentChange = useCallback((nodeId: string, content: string) => {
    setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, content } } : node)));
}, []);
```

Render the reader near other top-level overlays:

```tsx
<CanvasScriptReader node={scriptReaderNode} onChange={handleScriptContentChange} onClose={() => setScriptReaderNodeId(null)} />
```

- [ ] **Step 3: Open the reader on single click**

In `finishNodeDrag` inside `web/src/pages/canvas/project.tsx`, before opening regular panels, add:

```ts
const clickedNode = nodesRef.current.find((node) => node.id === clickedNodeId);
if (wasClick && clickedNode?.type === CanvasNodeType.Script) {
    setDialogNodeId(null);
    setScriptReaderNodeId(clickedNode.id);
    return;
}
```

Keep this before branches that call `setDialogNodeId(clickedNodeId)`.

- [ ] **Step 4: Pass double-click callback to nodes**

In the `CanvasNode` JSX in `web/src/pages/canvas/project.tsx`, add:

```tsx
onOpenScriptReader={openScriptReader}
```

- [ ] **Step 5: Add reader Markdown styles**

In `web/src/styles/globals.css`, append focused styles:

```css
.canvas-script-reader h1 {
    margin: 0 0 24px;
    font-size: 30px;
    line-height: 1.35;
    font-weight: 700;
}

.canvas-script-reader h2 {
    margin: 34px 0 14px;
    font-size: 22px;
    line-height: 1.45;
    font-weight: 650;
}

.canvas-script-reader h3 {
    margin: 26px 0 10px;
    font-size: 18px;
    line-height: 1.5;
    font-weight: 650;
}

.canvas-script-reader p {
    margin: 12px 0;
}

.canvas-script-reader blockquote {
    margin: 18px 0;
    border-left: 3px solid color-mix(in srgb, currentColor 22%, transparent);
    padding-left: 14px;
    opacity: 0.82;
}

.canvas-script-reader ul,
.canvas-script-reader ol {
    margin: 12px 0;
    padding-left: 1.5rem;
}

.canvas-script-reader hr {
    margin: 28px 0;
    border: 0;
    border-top: 1px solid color-mix(in srgb, currentColor 16%, transparent);
}

.canvas-script-reader pre {
    margin: 16px 0;
    overflow-x: auto;
    border-radius: 8px;
    padding: 14px;
    font-size: 13px;
}

.canvas-script-reader code {
    font-size: 0.92em;
}
```

- [ ] **Step 6: Manually inspect task output**

```bash
rg -n "CanvasScriptReader|scriptReaderNodeId|openScriptReader|canvas-script-reader|onOpenScriptReader" web/src
```

Expected: output shows the reader component, page state/callbacks, node prop, and CSS class.

- [ ] **Step 7: Commit Task 3**

```bash
git add web/src/components/canvas/canvas-script-reader.tsx web/src/pages/canvas/project.tsx web/src/components/canvas/canvas-node.tsx web/src/styles/globals.css
git commit -m $'feat: add fullscreen script reader\n\nCo-authored-by: TRAE CLI <noreply@bytedance.com>'
```

---

### Task 4: Wire Script Text into Downstream Generation

**Files:**
- Modify: `web/src/components/canvas/canvas-node-generation.ts`
- Modify: `web/src/lib/canvas/canvas-resource-references.ts`

**Interfaces:**
- Consumes: `getNodeDefinition(node.type)?.resource?.(node)`
- Produces: `readNodeTextInput(node: CanvasNodeData): string` that supports custom resource text

- [ ] **Step 1: Update generation text input reading**

In `web/src/components/canvas/canvas-node-generation.ts`, import the node registry:

```ts
import { getNodeDefinition } from "@/lib/canvas/node-registry";
```

Replace `readNodeTextInput` with:

```ts
function readNodeTextInput(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    const resource = getNodeDefinition(node.type)?.resource?.(node);
    if (resource?.kind === "text") return resource.text || "";
    return node.metadata?.prompt || "";
}
```

- [ ] **Step 2: Confirm mention references already support script resources**

In `web/src/lib/canvas/canvas-resource-references.ts`, inspect `resourceText` and `resourceKind`. They already call `getNodeDefinition(node.type)?.resource?.(node)`. No code change is required unless Task 2 registration used a different resource shape.

- [ ] **Step 3: Manually inspect task output**

```bash
rg -n "getNodeDefinition|resource\\?\\.kind === \"text\"|readNodeTextInput" web/src/components/canvas/canvas-node-generation.ts web/src/lib/canvas/canvas-resource-references.ts
```

Expected: generation input reads custom text resources, and resource references still use node definitions.

- [ ] **Step 4: Commit Task 4**

```bash
git add web/src/components/canvas/canvas-node-generation.ts web/src/lib/canvas/canvas-resource-references.ts
git commit -m $'feat: use script nodes as text inputs\n\nCo-authored-by: TRAE CLI <noreply@bytedance.com>'
```

---

### Task 5: Update User-Facing Docs and Manual Verification Notes

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Read: `docs/content/docs/progress/todo.mdx`

**Interfaces:**
- Consumes: implemented behavior from Tasks 1-4
- Produces: user-visible change log and pending-test instructions

- [ ] **Step 1: Update changelog**

In `CHANGELOG.md`, add this under `## Unreleased`:

```md
+ [新增] 画布新增 Markdown 剧本节点，支持点击进入全屏阅读和编辑剧本。
```

- [ ] **Step 2: Update pending-test**

In `docs/content/docs/progress/pending-test.mdx`, add this bullet near other canvas node checks:

```md
- Markdown 剧本节点：新建“剧本”节点后应显示空态；点击节点进入全屏阅读器，粘贴 Markdown 后应渲染标题、段落、列表、引用和分隔线；目录应按 `#` / `##` / `###` 标题生成并可跳转；编辑后切回阅读应立即更新；复制按钮应复制原始 Markdown；剧本节点连接到生成配置节点后，下游应能读取完整 Markdown 文本。
```

- [ ] **Step 3: Check todo**

Read `docs/content/docs/progress/todo.mdx`. If there is no existing Markdown script node todo, make no change. If a matching todo exists, move it to `pending-test.mdx` instead of duplicating it.

- [ ] **Step 4: Manually inspect docs**

```bash
rg -n "Markdown 剧本节点|剧本节点" CHANGELOG.md docs/content/docs/progress/pending-test.mdx docs/content/docs/progress/todo.mdx
```

Expected: changelog and pending-test mention the new node; todo only mentions it if there is still a future task.

- [ ] **Step 5: Commit Task 5**

```bash
git add CHANGELOG.md docs/content/docs/progress/pending-test.mdx docs/content/docs/progress/todo.mdx
git commit -m $'docs: add script node verification notes\n\nCo-authored-by: TRAE CLI <noreply@bytedance.com>'
```

---

### Task 6: Final Manual Acceptance Pass

**Files:**
- Read only unless a defect is found in touched files.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: final implementation confidence report.

- [ ] **Step 1: Confirm git status**

```bash
git status --short
```

Expected: no unexpected modified files. The pre-existing untracked `docs/generated/` may still appear and should not be added.

- [ ] **Step 2: Manual browser verification**

Ask the user to run the app using their normal workflow. Do not run build or typecheck. Verify these cases in the browser:

```text
1. New node menu contains “剧本”.
2. New script node shows “粘贴 Markdown 剧本” empty state.
3. Single-click script node opens full-screen reader.
4. Empty reader opens in edit mode.
5. Paste:
   # 第1集：雨夜重逢

   ## 0-3s Hook

   她在雨里看见失踪三年的未婚夫。

   ## 第一场 酒吧外

   > 旁白：命运从来不提前敲门。

   - 镜头：雨水落在戒指上
   - 情绪：震惊、克制、怀疑

   ---

   ## 结尾钩子

   他低声说：别相信我。
6. Reading mode renders headings, quote, list, and divider.
7. Directory lists the Markdown headings and jumps to sections.
8. Esc closes the reader.
9. Reopen, edit text, switch to read mode, and confirm content updates.
10. Copy Markdown returns the original Markdown.
11. Connect script node to a generation config node and confirm the composer/input summary can consume it as text.
```

- [ ] **Step 3: Report final state**

Summarize:

```text
Implemented Markdown script node with full-screen reading/editing.
Updated downstream text-resource handling.
Updated changelog and pending-test docs.
No build/typecheck was run per project instruction.
```

