# Markdown Document Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic Markdown document node and let text generation output either plain text nodes or Markdown document nodes, while cleaning model thinking tags.

**Architecture:** Generalize the existing script Markdown reader/card into reusable Markdown components that can serve both `Script` and `MarkdownDocument` nodes. Keep generated text output behavior backward compatible by defaulting to plain text, with an explicit config-node `textOutputType` switch for Markdown documents. Clean `<think>...</think>` at the write boundary so both text and Markdown outputs stay readable.

**Tech Stack:** Vite, React, TypeScript, Ant Design, Tailwind, Zustand, existing `streamdown` Markdown renderer.

## Global Constraints

- Page copy stays Chinese.
- Do not add AI script generation, rewriting, or structural AI splitting.
- Do not add a rich text editor; edit raw Markdown with a textarea.
- Do not add cloud sync or separate file storage.
- Do not change ordinary text node behavior by default.
- Do not add a new Markdown rendering dependency; reuse `streamdown`.
- Preserve the current canvas theme via `canvasThemes` and `useThemeStore`.
- Do not run syntax checks, builds, or tests after coding; project AGENTS says the user will do that.
- Do not touch unrelated files.

---

## File Structure

- Rename/generalize `web/src/lib/canvas/canvas-script-markdown.ts` into `web/src/lib/canvas/canvas-markdown.ts`.
- Create `web/src/components/canvas/canvas-markdown-node-content.tsx`.
- Create `web/src/components/canvas/canvas-markdown-reader.tsx`.
- Remove old script-specific component files after call sites move.
- Modify `web/src/types/canvas.ts` for `MarkdownDocument` and `textOutputType`.
- Modify `web/src/constant/canvas.ts` for Markdown document defaults.
- Modify `web/src/components/canvas/nodes/builtin-nodes.tsx` to register Script and MarkdownDocument with shared Markdown components.
- Modify `web/src/components/canvas/canvas-node.tsx` to open Markdown reader for both Script and MarkdownDocument.
- Modify `web/src/pages/canvas/project.tsx` to use generalized Markdown reader state and create Markdown document outputs.
- Modify `web/src/components/canvas/canvas-config-node-panel.tsx` to expose output type in text mode.
- Modify `web/src/components/canvas/canvas-node-generation.ts` to add `stripModelThinking`.
- Modify `CHANGELOG.md` and `docs/content/docs/progress/pending-test.mdx`.

---

## Tasks

- [ ] Generalize Markdown helpers and components.
- [ ] Add `MarkdownDocument` node type and shared built-in registration.
- [ ] Add text output type selector on config nodes.
- [ ] Route text generation results to Text or MarkdownDocument and strip `<think>` blocks.
- [ ] Update documentation and run focused source inspections.

## Manual Verification

Do not run build/typecheck. Use focused `rg` inspections and leave browser verification to the user:

- Script node still says 剧本 and opens full-screen on double-click.
- Markdown document node appears as 文档 and opens full-screen on double-click.
- Config node text mode can choose 普通文本 or Markdown 文档.
- Text generation defaults to ordinary text output.
- Markdown output creates MarkdownDocument nodes.
- `<think>...</think>` is stripped before writing generated text.
