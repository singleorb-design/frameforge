---
name: drama-production
description: Use when the user wants FrameForge to turn a short-drama, AI comic drama, screenplay, storyboard, chapter, visual idea, character/location/prop asset, or shot list into a canvas-based production workflow. Trigger for requests such as "短剧生产链", "AI 漫剧生产", "剧本生成分镜", "生成角色/场景/道具参考图 Prompt", "逐镜视频 Prompt", "即梦任务单", "把这个剧本放到画布生产", or "融合短剧 skill 到 FrameForge". This skill routes creative-production knowledge into FrameForge canvas nodes and should use the canvas MCP skill when creating or modifying boards.
---

# FrameForge 短剧影像生产

本 skill 把短剧/AI 漫剧方法融合进 FrameForge 的画布工作流。目标不是替代完整网文写作工具箱，而是把已经可生产的材料转成画布上的节点、连线、Prompt 和外部生成任务单。

## 边界

优先服务 FrameForge 当前产品定位：AI 影像生产画布。

- 需要写长篇网文、扫榜、封面或纯小说项目时，不使用本 skill。
- 需要整本小说改编价值评估时，只生成“原著分析/章节选择/分集候选”的画布工作流，不在本 skill 内完成整套长篇拆文。
- 需要直接操作当前画布时，先使用 `canvas` skill；如果画布未打开，使用 `open-canvas`。
- 输出默认中文；Prompt 正文也默认中文，只保留模型名、参数名、`@tag` 等技术标识。
- 所有画布节点应便于二次编辑，避免把超长内容塞进单个节点。

## 工作流

1. 判断用户输入属于哪个生产阶段；不确定时先用最小问题确认当前材料是“剧本/分镜/资产/参考图/镜头需求”哪一类。
2. 读取当前画布状态。若用户说“这个/选中节点/当前剧本”，读取选区。
3. 根据阶段创建或补齐节点：
   - 剧本或章节输入：Markdown 剧本节点或文本节点。
   - 资产拆解：人物、场景、道具资产节点。
   - 图片 Prompt：角色参考图、地点图、道具图、LookDev 风格帧节点。
   - 分镜：场次视觉计划、镜头表、关键帧 Prompt 节点。
   - 视频 Prompt：逐镜运动、表演、声音、时间线音乐规格节点。
   - 生产执行：外部生成任务单、验收与重试节点。
4. 需要形成流程图时，使用画布工具创建节点并连线；不要只在聊天里给出最终文本。
5. 长材料分批处理。默认一次只处理一集、一场或 3-8 个镜头，并报告覆盖范围和剩余范围。

## 阶段选择

按需读取 [stage-map.md](references/stage-map.md)：

| 用户意图 | 处理阶段 |
|---|---|
| 小说/章节/想法变短剧生产方案 | 开发/改编入口 |
| 已有剧本，想做角色场景道具 | 资产拆解 |
| 要角色图、场景图、道具图、LookDev | 图片 Prompt |
| 要分镜、关键帧、镜头规划 | 分镜/关键帧 |
| 要逐镜视频 Prompt、即梦任务单 | 视频 Prompt |
| 要表演更真实、动作不假 | 表演层增强 |
| 要上传到工具执行或验收结果 | 外部生产/验收 |

## Prompt 方法

写图片、分镜或视频 Prompt 时读取 [prompt-recipes.md](references/prompt-recipes.md)。核心原则：

- 资产图先锁定身份、外观、服装、材质、比例和一致性，不急着写剧情。
- 分镜先写戏剧目的、空间关系和连续性边界，再写画面。
- 视频 Prompt 写“目标、阻碍、策略、节拍变化、身体状态、镜头运动、声音”，避免只堆情绪词。
- 参考图模式要明确上传顺序、引用对象、不能改的连续性和验收标准。

## 画布输出约定

推荐节点命名：

- `剧本｜第 N 集｜标题`
- `人物资产｜角色名`
- `场景资产｜地点名`
- `道具资产｜道具名`
- `图片 Prompt｜角色名｜用途`
- `分镜表｜第 N 集`
- `关键帧 Prompt｜S01-S03`
- `视频 Prompt｜镜头 ID`
- `外部任务单｜平台｜镜头 ID`
- `验收记录｜镜头 ID`

创建批量节点时横向按阶段排列，纵向按人物/场次/镜头顺序排列。不要堆叠在同一点。

## 质量门

交付前检查：

- 是否把结果落到了画布，或明确说明当前只做文字规划的原因。
- 是否保留用户原始事实，未擅自改主角、结局、人物关系或剧情顺序。
- 是否把资产、分镜、视频 Prompt 分成可编辑节点，而不是一个巨长节点。
- 是否说明本轮覆盖了哪一集、哪一场或哪些镜头。
- 是否留下下一步可执行动作，例如“生成参考图”“进入分镜”“生成视频任务单”。
