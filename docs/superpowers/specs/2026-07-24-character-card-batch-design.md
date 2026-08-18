# 人物卡组批量生成设计

## 背景

用户已经有 Markdown 剧本节点，并希望基于剧本批量生成主要角色的人物卡，为后续三视图、角色立绘和分镜生产做准备。

人物卡不应像普通文本结果一样散落在画布上。角色资产会持续增加，如果每个角色都是孤立节点，画布会快速变乱，也不利于表达“这些人物卡来自同一个剧本和同一次批量生成任务”。

本设计新增“人物卡组”主节点和“人物卡”子节点。人物卡组负责管理一批从剧本生成的主要角色卡，支持折叠和展开；人物卡子节点承载单个角色的结构化设定，后续可继续派生三视图提示词或图片生成节点。

## 目标

- 从剧本节点批量生成主要角色人物卡。
- 默认只生成主要角色，不生成群演、路人、宾客甲乙、无名弟子等低复用角色。
- 生成后创建 1 个“人物卡组”主节点和多个“人物卡”子节点。
- 人物卡组支持折叠和展开，避免批量角色节点占满画布。
- 人物卡子节点支持独立选择、编辑、连接下游节点。
- 人物卡字段服务于后续三视图生成，强调可视化外观和一致性锁定。
- 批量生成失败或 JSON 解析失败时保留原始模型输出，方便人工修复。

## 非目标

- 不生成所有人物卡，只生成主要角色卡。
- 不做人物三视图生成。
- 不做批量三视图。
- 不做人物关系图谱。
- 不做角色一致性评分。
- 不做 LoRA、IP Adapter、ControlNet 等外部工作流绑定。
- 不做角色图库管理。

## 推荐用户流程

从剧本节点触发：

```text
剧本节点
  ↓ 点击“批量生成人物卡”
人物卡组主节点
  ├── 沈夜人物卡
  ├── 苏婉儿人物卡
  ├── 叶辰人物卡
  └── 九幽女帝人物卡
```

触发后弹出配置面板：

- 最多主要角色数：默认 `6`
- 风格补充：默认空，用户可填写“玄幻短剧、偏暗黑、半写实动漫”等
- 包含重要配角：默认开启
- 排除群演/无名人物：默认开启

点击生成后：

1. 读取剧本节点 Markdown 全文。
2. 组装角色卡批量生成 Prompt。
3. 调用当前文本模型。
4. 清洗 `<think>...</think>`。
5. 解析模型返回的 JSON。
6. 创建人物卡组主节点和人物卡子节点。
7. 自动连接：剧本节点 -> 人物卡组主节点 -> 人物卡子节点。

## 节点模型

### 人物卡组主节点

节点名：`人物卡组`

用途：管理一批从同一个剧本生成的主要角色卡。

建议类型：

```ts
CanvasNodeType.CharacterGroup = "character-group"
```

建议 metadata：

```ts
type CharacterGroupMetadata = {
  status?: "idle" | "loading" | "success" | "error";
  sourceScriptNodeId?: string;
  maxCharacters?: number;
  styleHint?: string;
  includeSupportingRoles?: boolean;
  excludeExtras?: boolean;
  characterChildIds?: string[];
  characterBatchExpanded?: boolean;
  skippedCharacters?: Array<{
    name: string;
    reason: string;
  }>;
  rawModelOutput?: string;
  errorDetails?: string;
};
```

卡片展示：

- 标题：人物卡组
- 来源剧本标题
- 角色数量，例如 `4 个主要角色`
- 角色名摘要：沈夜 / 苏婉儿 / 叶辰 / 九幽女帝
- skipped 摘要：已跳过宾客甲、宾客乙等
- 状态：生成中 / 已完成 / 失败
- 折叠/展开按钮

折叠态：

- 子人物卡隐藏或回收到主节点后方。
- 主节点显示数量、角色名和 skipped 摘要。
- 画布保持紧凑。

展开态：

- 子人物卡在主节点右侧或下方自动排布。
- 每张人物卡可独立选择、编辑、连接后续三视图提示词或图片生成节点。

### 人物卡子节点

节点名：`人物卡`

用途：承载单个角色的结构化设定。

建议类型：

```ts
CanvasNodeType.CharacterCard = "character-card"
```

建议 metadata：

```ts
type CharacterCardMetadata = {
  status?: "idle" | "loading" | "success" | "error";
  batchRootId?: string;
  sourceScriptNodeId?: string;
  name: string;
  role: string;
  importance: "主角" | "主要反派" | "核心配角" | "重要角色";
  storyFunction: string;
  ageRange: string;
  gender: "男" | "女" | "未知";
  body: string;
  face: string;
  hair: string;
  clothing: string;
  colors: string[];
  temperament: string;
  defaultExpression: string;
  props: string[];
  relationships: string;
  positivePrompt: string;
  negativePrompt: string;
  consistencyLocks: string[];
  sourceNote: string;
  rawCharacterJson?: unknown;
};
```

卡片展示：

```text
沈夜
男主 / 沈家少主 / 主角

黑色长发半束，眉眼冷峻，清瘦挺拔。
深色破损古风长袍，黑戒，玉佩。

一致性锁定：
黑色长发半束 / 黑戒 / 冷峻少年感
```

双击人物卡进入详情编辑，字段按结构化表单展示。V1 可以先使用简洁表单或 Markdown-like 分区编辑，但数据必须保留结构化字段。

## 画布布局

从剧本节点右侧生成主节点，再从主节点右侧或下方排布子节点。

推荐布局：

```text
剧本节点 -> 人物卡组
              ├── 沈夜
              ├── 苏婉儿
              ├── 叶辰
              └── 九幽女帝
```

布局规则：

- 主节点距离剧本节点右侧约 `120px`。
- 子节点展开时按两列网格或纵向列表排列。
- 子节点之间保持固定间距，避免重叠。
- 折叠时保留子节点数据，但不显示或以堆叠视觉收拢。

可复用现有图片批量节点思路：

- `metadata.characterBatchExpanded`
- `metadata.characterChildIds`
- 子节点 `metadata.batchRootId`

但人物卡组不应复用图片批量的图片尺寸逻辑；人物卡是结构化文本资产，默认尺寸可约 `320 x 220`。

## 批量生成 Prompt

系统提示词核心：

```md
你是 AI 漫剧角色设计师。请基于剧本，识别需要后续视觉复用的主要角色，并批量生成稳定的人物卡。

只生成主要角色卡，最多 {{maxCharacters}} 个。
不要为群演、路人、宾客甲乙、无名弟子、纯背景人物生成卡片。
如果角色外观没有明确描述，可以根据身份合理推断，但必须在 sourceNote 标注。
每个角色必须可用于后续三视图生成。
一致性锁定词必须具体可视化，不要写抽象性格。
不要输出思考过程、分析过程或 <think> 标签。
输出严格 JSON，不要输出 Markdown。

风格补充：
{{styleHint}}

剧本：
{{scriptMarkdown}}
```

输出 JSON：

```json
{
  "characters": [
    {
      "name": "沈夜",
      "role": "男主，沈家少主",
      "importance": "主角",
      "storyFunction": "在退婚羞辱中被打伤，血滴黑戒，触发九幽女帝觉醒",
      "ageRange": "18-22",
      "gender": "男",
      "body": "清瘦但挺拔，受伤后略显狼狈",
      "face": "眉眼冷峻，少年感，眼神压抑不甘",
      "hair": "黑色长发半束，几缕碎发垂落额前",
      "clothing": "深色破损古风长袍，胸口有血迹",
      "colors": ["黑", "暗红", "冷灰"],
      "temperament": "隐忍、屈辱、即将爆发",
      "defaultExpression": "克制、冷静、带压抑怒意",
      "props": ["黑戒", "旧玉佩"],
      "relationships": "被苏婉儿退婚，被叶辰羞辱，与九幽女帝通过黑戒产生契约关联",
      "positivePrompt": "18-22岁古风玄幻男主，黑色长发半束，眉眼冷峻，清瘦挺拔，深色破损长袍，胸口带血迹，手戴黑戒，压抑不甘的眼神",
      "negativePrompt": "现代服装，短发，金发，夸张肌肉，欧美脸，多人物，五官变形",
      "consistencyLocks": ["黑色长发半束", "深色破损古风长袍", "黑戒", "冷峻少年感"],
      "sourceNote": "剧本明确出现 + 外观根据男主身份推断"
    }
  ],
  "skipped": [
    {
      "name": "宾客甲",
      "reason": "群演，只承担议论功能，不建议建卡"
    }
  ]
}
```

## 失败处理

如果模型调用失败：

- 人物卡组主节点标记为 `error`。
- `metadata.errorDetails` 记录错误信息。

如果 JSON 解析失败：

- 人物卡组主节点标记为 `error`。
- `metadata.rawModelOutput` 保存原始模型输出。
- 同时可创建一个 Markdown 文档节点保存原始结果，方便用户查看和手动修复。

解析策略：

- 优先解析纯 JSON。
- 如果模型包裹了代码块，提取 ```json ... ``` 内部再解析。
- 写入前先复用已有 `stripModelThinking()` 清洗 `<think>...</think>`。
- 不做复杂容错重写，避免错误数据污染人物卡。

## 后续三视图衔接

人物卡子节点是后续三视图的唯一角色来源。

推荐后续链路：

```text
沈夜人物卡 -> 沈夜三视图提示词（Markdown 文档） -> 图片生成节点
```

三视图生成不直接读取剧本，避免剧情情绪污染基础角色设定。

## 文件落点

预计改动集中在：

- `web/src/types/canvas.ts`
  - 新增 `CanvasNodeType.CharacterGroup`
  - 新增 `CanvasNodeType.CharacterCard`
  - 扩展 metadata 字段或新增专用类型辅助函数
- `web/src/constant/canvas.ts`
  - 新增人物卡组和人物卡默认尺寸
- `web/src/components/canvas/nodes/builtin-nodes.tsx`
  - 注册人物卡组和人物卡节点
  - 声明人物卡作为文本资源输出，至少输出角色名和正/负向提示词
- `web/src/components/canvas/canvas-character-card-content.tsx`
  - 渲染人物卡组和人物卡卡片
- `web/src/components/canvas/canvas-character-card-editor.tsx`
  - 编辑单个人物卡结构化字段
- `web/src/pages/canvas/project.tsx`
  - 从剧本触发批量生成人物卡
  - 创建主节点和子节点
  - 控制折叠/展开布局
- `web/src/components/canvas/canvas-node-hover-toolbar.tsx`
  - 剧本节点增加“批量生成人物卡”操作
  - 人物卡组增加折叠/展开、重试操作
- `web/src/components/canvas/canvas-side-panel.tsx`
  - 支持人物卡组/人物卡过滤和预览

## 文档与验证

这是用户可感知的新功能。实现完成后需要：

- 在 `CHANGELOG.md` 的 `Unreleased` 添加 `[新增]` 记录。
- 在 `docs/content/docs/progress/pending-test.mdx` 添加待测试项。
- 检查 `docs/content/docs/progress/todo.mdx` 是否有相关待办需要移动或更新。

建议人工验证：

- 剧本节点上可以触发“批量生成人物卡”。
- 默认最多生成 6 个主要角色。
- 不为宾客甲乙、路人、无名弟子生成卡片。
- 生成人物卡组主节点和多个人物卡子节点。
- 主节点可折叠/展开。
- 展开后子人物卡不重叠，并可独立选择。
- 子人物卡字段包含三视图所需的外观、一致性锁定、正向提示词和负向提示词。
- JSON 解析失败时保留原始输出，不创建错误人物卡。
- 人物卡节点可连接到下游 Markdown 文档或图片生成流程。
