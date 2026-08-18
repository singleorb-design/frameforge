# Markdown 剧本节点设计

## 背景

画布当前已有文本节点，适合保存提示词、短文案和文本生成结果。但 AI 漫剧剧本通常是较长的 Markdown 文档，包含集标题、场次、对白、动作描述、镜头提示和结尾钩子。直接放入普通文本节点时，画布卡片过小，阅读缺少目录和排版层次，编辑与阅读体验也混在一起。

本设计新增一个专用“剧本”节点，用于承载用户已经写好的 Markdown 剧本。它不负责 AI 生成剧本，核心目标是让用户在画布上能识别剧本资产，并能点击进入全屏 Markdown 阅读体验。

## 目标

- 新增一个专用剧本节点，出现在画布创建菜单中。
- 剧本内容使用 Markdown 格式保存和编辑。
- 点击剧本节点后打开全屏阅读器，默认渲染 Markdown 阅读态。
- 全屏阅读器支持目录、滚动阅读、阅读/编辑切换、关闭和复制 Markdown。
- 剧本节点可作为文本资源连接给下游生成配置、图片、视频或文本节点。
- 保持当前画布主题和交互风格，不引入厚重装饰或独立页面。

## 非目标

- 不做 AI 剧本生成、改写或结构化拆解。
- 不引入复杂富文本编辑器。
- 不做云同步或独立文件存储。
- 不做旧数据迁移；项目尚未上线，新节点按新结构直接保存。
- 不改变普通文本节点的行为。

## 推荐方案

新增内置节点类型 `Script`，标题为“剧本”。节点内容保存在 `metadata.content` 中，内容是原始 Markdown 字符串。节点定义通过 `resource()` 输出 `{ kind: "text", text: metadata.content }`，复用现有画布资源引用和生成链路。

节点卡片只展示剧本摘要，不直接承载完整阅读。点击或双击节点打开全屏阅读器；全屏阅读器是本功能的主体验。

## 节点卡片

默认尺寸建议为 `380 x 260`，略大于文本节点但仍适合画布扫视。

卡片内容：

- 图标和标题：“剧本”。
- Markdown 标题：优先取第一个一级标题 `# ...`；没有时使用节点标题。
- 摘要：从 Markdown 去除基础标记后的前几行生成。
- 统计：字数、Markdown 标题数量。
- 空态：显示“粘贴 Markdown 剧本”。
- 操作提示：显示“点击全屏阅读”。

卡片样式遵循 `canvasThemes` 和当前画布节点风格。非图片节点不使用多余灰色缩略图底色，按钮采用透明背景和轻微 hover 反馈。

## 全屏阅读器

点击剧本节点打开全屏覆盖层，而不是节点下方小面板。覆盖层应阻止滚轮事件继续传给画布，避免阅读时触发画布缩放或平移。

布局：

- 顶部工具栏：剧本标题、字数、标题数、阅读/编辑切换、复制 Markdown、关闭。
- 主阅读区：居中正文容器，最大宽度约 `860px`，适合长文阅读。
- 目录区：从 Markdown heading 提取目录，放在左侧或右侧。点击目录项滚动到对应标题。
- 空态：提供大面积粘贴入口，引导用户进入编辑态。

交互：

- `Esc` 关闭全屏阅读器。
- 阅读态默认渲染 Markdown。
- 编辑态显示原始 Markdown textarea。
- 切回阅读态后立即按最新 Markdown 渲染。
- 复制按钮复制原始 Markdown，而不是渲染后的纯文本。

## Markdown 渲染

优先复用 `web/package.json` 已有的 `streamdown` 依赖渲染 Markdown，不新增 Markdown 渲染依赖。阅读器外层提供剧本阅读样式，覆盖常见 Markdown 元素：

- `h1` / `h2` / `h3`：清晰分级，并可用于目录锚点。
- `p`：适合中文长文的字号和行高。
- `blockquote`：用于旁白、备注或制作说明。
- `ul` / `ol`：用于镜头列表、角色列表、制作要点。
- `strong` / `em`：保留重点。
- `hr`：用于场次或段落分隔。
- `code` / `pre`：保留技术备注或提示词块。

不启用原始 HTML 注入。若 Markdown 中包含 HTML，按渲染库默认安全策略处理，不额外放开。

## 目录提取

目录从原始 Markdown 中用轻量规则提取 heading：

- 支持 `#`、`##`、`###`。
- 每项包含标题文本、层级、稳定锚点。
- 正文渲染时对应 heading 使用相同锚点。
- 若没有 heading，则不显示目录区，阅读区保持居中。

目录只是阅读辅助，不改变原始 Markdown。

## 编辑与保存

编辑态使用 textarea，避免引入富文本编辑器。输入内容直接更新节点 `metadata.content`。为避免频繁保存，可以在组件内部做 300-500ms debounce；关闭阅读器或切换阅读态时确保最后一次内容已写入节点。

节点标题不自动覆盖用户自定义标题。卡片和阅读器显示的剧本标题来自 Markdown 第一个一级标题；没有一级标题时回退到节点标题。

## 下游引用

剧本节点是文本资源节点。下游生成配置节点或其他节点连接剧本节点时，读取的是原始 Markdown 文本。这样下游模型可以保留剧本标题、场次、对白和镜头提示结构。

现有资源链路中需要注意：`canvas-node-generation.ts` 的 `readNodeTextInput` 当前只显式读取文本节点和 `metadata.prompt`。实现时应让插件/内置自定义节点声明的 `resource()` 文本也能进入 generation input，避免剧本节点在提及菜单中可见但生成上下文读不到正文。

## 文件落点

预计改动集中在：

- `web/src/types/canvas.ts`：新增 `CanvasNodeType.Script`。
- `web/src/constant/canvas.ts`：新增剧本节点默认尺寸和 metadata。
- `web/src/components/canvas/nodes/builtin-nodes.tsx`：注册剧本节点定义、图标、资源输出和渲染组件。
- `web/src/components/canvas/canvas-node.tsx`：支持剧本节点内容渲染和点击打开全屏阅读器。
- `web/src/components/canvas/canvas-script-reader.tsx`：新增全屏 Markdown 阅读器。
- `web/src/lib/canvas/canvas-resource-references.ts`：确保剧本节点作为文本资源可被提及。
- `web/src/components/canvas/canvas-node-generation.ts`：确保剧本节点文本进入下游生成上下文。

如果实现时发现全屏阅读器更适合在页面层持有状态，可以在 `web/src/pages/canvas/project.tsx` 中维护当前打开的剧本节点 id，并把打开回调传给 `CanvasNode`。

## 文档与验证

这是用户可感知的新功能。实现完成后需要：

- 在 `CHANGELOG.md` 的 `Unreleased` 添加一条 `[新增]` 记录。
- 在 `docs/content/docs/progress/pending-test.mdx` 添加待测试项。
- 检查 `docs/content/docs/progress/todo.mdx` 是否有相关待办需要移动或更新。

建议人工验证：

- 新建剧本节点后，节点显示空态。
- 粘贴 Markdown 后，阅读态能渲染标题、段落、列表、引用和分隔线。
- Markdown heading 能生成目录，点击可跳转。
- `Esc` 和关闭按钮能退出全屏。
- 编辑态修改后切回阅读态，内容立即更新。
- 复制按钮复制原始 Markdown。
- 剧本节点连接到生成配置节点后，下游能拿到完整 Markdown 文本。
