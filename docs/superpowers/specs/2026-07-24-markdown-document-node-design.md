# Markdown 文档节点设计

## 背景

剧本节点已经解决了“长 Markdown 剧本”的阅读和编辑体验：双击节点进入全屏阅读器，支持标题目录、Markdown 渲染、原文编辑和复制。

但生成分镜、角色设定、提示词包等长文结果时，当前文本生成仍默认落到普通文本节点。普通文本节点只按纯文本展示，不能渲染 Markdown 表格、标题、引用和分割线；同时模型可能输出 `<think>...</think>` 推理内容，导致生成结果在节点中显得混乱。

本设计不新增“分镜节点”。分镜本质上先是一个 Markdown 长文档，只有当后续需要镜头级状态、拆镜头、批量生图/视频时，才值得升级为专用分镜节点。

## 目标

- 新增通用“Markdown 文档”节点，用于承载分镜、角色设定、提示词包等 Markdown 长文结果。
- 复用剧本节点现有的全屏 Markdown 阅读/编辑体验，避免复制一套阅读器。
- 保留剧本节点语义：剧本节点仍表示原始剧本资产。
- 配置节点文本生成支持选择结果输出为“普通文本”或“Markdown 文档”。
- 生成结果写入前清洗 `<think>...</think>` 推理块，避免污染文本和 Markdown 文档。
- 保持现有画布节点、连接、资源引用和本地持久化模型。

## 非目标

- 不做专用分镜节点。
- 不做镜头级状态管理、拆镜头、批量生图或批量视频。
- 不引入富文本编辑器。
- 不新增 Markdown 渲染依赖；继续使用 `streamdown`。
- 不改变图片、视频、音频生成结果的输出方式。
- 不做旧数据迁移；项目尚未上线，新节点按新结构直接保存。

## 推荐方案

把当前剧本节点中的 Markdown 能力抽成通用 Markdown 能力：

- `CanvasMarkdownReader`：通用全屏 Markdown 阅读/编辑器。
- `CanvasMarkdownNodeContent`：通用 Markdown 节点卡片内容。
- `canvas-markdown.ts`：通用 Markdown 标题、摘要、字数、目录解析。

然后保留两个节点类型：

- `Script`：剧本节点，标题“剧本”，默认文案围绕“剧本”。
- `MarkdownDocument`：Markdown 文档节点，标题“文档”，默认文案围绕“Markdown 文档”。

两类节点都保存原始 Markdown 到 `metadata.content`，都通过 `resource()` 输出 `{ kind: "text", text: metadata.content }`，因此都能作为下游文本资源。

## 节点语义

### 剧本节点

用途：承载原始剧本资产。

交互：

- 双击进入全屏阅读/编辑。
- `Esc` 退出全屏。
- 卡片提示“双击全屏阅读”。

文案：

- 空态：“双击全屏粘贴 Markdown 剧本”。
- 标题回退：“剧本”。

### Markdown 文档节点

用途：承载生成结果和长文档资产，例如：

- 分镜脚本
- 角色设定
- 世界观设定
- 镜头提示词包
- 发布文案方案

交互：

- 双击进入全屏阅读/编辑。
- `Esc` 退出全屏。
- 卡片提示“双击全屏阅读”。

文案：

- 空态：“双击全屏粘贴 Markdown 文档”。
- 标题回退：“文档”。

## 生成结果输出类型

配置节点在 `generationMode === "text"` 时新增结果类型设置：

- `普通文本`：保持现有行为，结果落到 `CanvasNodeType.Text`。
- `Markdown 文档`：结果落到 `CanvasNodeType.MarkdownDocument`。

建议新增 metadata 字段：

```ts
textOutputType?: "text" | "markdown";
```

默认值为 `"text"`，确保现有文本生成体验不变。

当配置节点切到文本模式时，在配置卡片或配置面板中显示一个轻量切换控件。只在文本模式展示，图片/视频/音频模式不展示。

## 分镜生成链路

用户可以用普通文本节点写分镜要求：

```text
请基于上游剧本生成短剧分镜脚本，每场拆 5 个镜头，输出 Markdown 表格。
```

推荐画布链路：

```text
剧本节点 ───────┐
文本节点 ───────┤ -> 生成配置节点（文本模式，输出：Markdown 文档）
                ↓
          Markdown 文档节点（分镜脚本）
```

这里不要求新增“分镜节点”。Markdown 文档节点负责把分镜结果展示得可读、可编辑、可复制。

后续如果用户需要镜头级管理，可以基于 Markdown 文档节点继续设计“拆分为镜头节点”的能力。

## 上下文组装

当前生成配置节点只读取自己的直接上游资源。若用户使用：

```text
剧本节点 -> 文本节点 -> 生成配置节点
```

配置节点只能读取文本节点，不能自动读取剧本节点。

本设计建议先保持显式连接规则：

```text
剧本节点 ───────┐
文本节点 ───────┤ -> 生成配置节点
```

理由：

- 行为清晰，可预期。
- 不把“上游的上游”隐式塞进 prompt。
- 避免递归链路导致 prompt 过长或包含用户未意识到的内容。

如果后续仍希望支持 `剧本 -> 文本 -> 配置` 的隐式组装，应作为单独设计：只向上追一层文本资源，并在 UI 中明确展示“已包含上游上下文”。

## `<think>` 清洗

文本模型可能返回：

```html
<think>
模型推理过程...
</think>

# 最终结果
...
```

写入文本节点或 Markdown 文档节点前，应统一清洗掉 `<think>...</think>` 块。

建议新增工具函数：

```ts
stripModelThinking(text: string): string
```

规则：

- 删除完整的 `<think>...</think>` 块，支持多行。
- 删除开头未闭合的 `<think>` 到文本末尾时要保守处理：如果没有 `</think>`，只在 `<think>` 出现在文本开头时删除。
- 清洗后 `trim()`，避免结果开头留下空行。

同时在文本生成请求 prompt 中追加约束：

```text
只输出最终内容，不要输出思考过程、分析过程或 <think> 标签。
```

清洗是兜底，prompt 约束是前置预防。

## 文件落点

预计改动集中在：

- `web/src/types/canvas.ts`
  - 新增 `CanvasNodeType.MarkdownDocument`。
  - 新增 `CanvasNodeMetadata.textOutputType?: "text" | "markdown"`。
- `web/src/constant/canvas.ts`
  - 新增 Markdown 文档节点默认尺寸和 metadata。
- `web/src/lib/canvas/canvas-script-markdown.ts`
  - 重命名或抽成 `web/src/lib/canvas/canvas-markdown.ts`。
  - 保留导出兼容或同步更新调用点。
- `web/src/components/canvas/canvas-script-reader.tsx`
  - 抽成 `CanvasMarkdownReader`，通过 props 传入文案配置。
- `web/src/components/canvas/canvas-script-node-content.tsx`
  - 抽成 `CanvasMarkdownNodeContent`，通过 props/definition metadata 区分剧本和文档文案。
- `web/src/components/canvas/nodes/builtin-nodes.tsx`
  - 注册 `MarkdownDocument` 节点。
  - `Script` 和 `MarkdownDocument` 共用 Markdown Content 和 resource 输出。
- `web/src/components/canvas/canvas-config-node-panel.tsx`
  - 文本模式下增加输出类型切换。
- `web/src/components/canvas/canvas-node-generation.ts`
  - 文本生成结果根据 `textOutputType` 选择 `Text` 或 `MarkdownDocument` 节点。
  - 写入前清洗 `<think>`。
- `web/src/pages/canvas/project.tsx`
  - 当前 `scriptReaderNodeId` 可泛化为 `markdownReaderNodeId`。
  - `openScriptReader` 可泛化为 `openMarkdownReader`。
  - 文本模式生成结果按输出类型创建节点。

## 文档与验证

这是用户可感知的新功能。实现完成后需要：

- 在 `CHANGELOG.md` 的 `Unreleased` 添加 `[新增]` 或 `[调整]` 记录。
- 在 `docs/content/docs/progress/pending-test.mdx` 添加待测试项。
- 检查 `docs/content/docs/progress/todo.mdx` 是否有相关待办需要移动或更新。

建议人工验证：

- 新建 Markdown 文档节点后，节点显示空态。
- 双击 Markdown 文档节点进入全屏，`Esc` 退出。
- 粘贴包含标题、表格、引用、列表、分割线的 Markdown 后能正确渲染。
- 剧本节点仍保持原有剧本文案和双击全屏体验。
- 配置节点切到文本模式时，可选择“普通文本”或“Markdown 文档”输出。
- 选择 Markdown 文档输出后，文本生成结果落到 Markdown 文档节点。
- 模型输出包含 `<think>...</think>` 时，最终节点内容不包含该块。
- Markdown 文档节点连接到下游配置节点时，下游能读取完整 Markdown 文本。

