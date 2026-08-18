# AI 漫剧结构化分镜与即梦生产交接设计

## 背景

当前画布已具备以下能力：

- Markdown 剧本节点。
- 从剧本批量生成主要人物卡。
- 人物卡组、人物卡和角色视觉资产包。
- 通用文本、Markdown、图片、视频和音频节点。
- 配置节点读取直接连接的文本和媒体资源。
- 生成结果回写画布及本地持久化。

当前分镜生成链路是：

```text
剧本节点 ───────┐
文本要求节点 ───┤ -> 生成配置节点（文本模式）
                ↓
          Markdown 分镜文档
```

该设计解决了分镜的阅读问题，但没有解决镜头生产问题。Markdown 中的“镜头 025”不可被稳定寻址，也不能可靠绑定人物、场景、道具、首帧、尾帧、关键帧、即梦设置、提示词版本、外部候选和剪辑状态。

此前的 Markdown 文档规格已经明确：当产品需要镜头级状态、拆镜头和批量生产时，应升级为专用分镜能力。当前需求已经满足升级条件。

## 产品边界

### 画布负责

- 管理剧本、人物、场景、道具、分镜和控制资产之间的关系。
- 调用文本模型生成结构化分镜。
- 推荐每个镜头的即梦生成模式。
- 生成首帧、尾帧或关键帧图片。
- 接受用户上传的外部控制资产和即梦候选视频。
- 编译可直接执行的即梦任务单。
- 验收并记录采用视频、采用区间和连续性。
- 导出整集标准生产包和剪映时间线执行单。

### 画布不负责

- 不调用即梦或其他模型直接生成视频。
- 不轮询视频生成任务。
- 不在镜头工作台中提供视频模型 API 配置。
- 不自动登录、操作或抓取即梦网页。
- 不直接执行剪辑、配音、字幕合成、调色或成片导出。
- 不逆向生成剪映私有草稿或依赖未公开的工程格式。

画布中的视频节点继续支持上传、预览、保存资产和固定外部候选，但不提供“生成视频”入口。独立的视频工作台不属于本设计范围。

## 已确认决策

1. 画布采用两层结构：
   - 分镜表主节点。
   - 镜头子节点。
   - 场次保存在 Shotboard 中并在全屏工作台中分章，不创建场次画布节点。
2. 复用现有配置节点，新增“结构化分镜”文本输出类型。
3. Shotboard JSON 是分镜唯一事实来源，Markdown 是派生阅读报告。
4. 镜头模式采用“系统推荐并解释，人工确认”。
5. 统一门禁是“镜头生成方案审核”，不是“首帧审核”。
6. 首帧、尾帧、关键帧、任务单和候选默认收纳在镜头工作台。
7. 用户可按需把重要控制帧或候选固定为普通画布节点。
8. 人物、场景、道具和风格绑定使用版本化资产快照。
9. 资产更新不自动改变已发布任务单；用户同步后重新审核和编译。
10. 整集导出标准生产包，不生成剪映私有草稿。
11. 默认声音策略：
    - 即梦主要生成可剪辑画面。
    - 对白、旁白、环境声、动作音效和 BGM 默认在剪映完成。
    - 只有口型表演、声音驱动动作或必须同期声的镜头，才在任务单中启用即梦原生音频。

## 成功标准

- 任意镜头都可通过稳定 ID 独立编辑、引用、审核和导出。
- 任意即梦任务单都能追溯到确定的镜头版本、资产版本、平台能力版本和 Prompt 版本。
- 所有镜头都定义开始状态、动作过程和结束状态。
- 需要精确落点的镜头可以同时管理首帧和尾帧。
- 四种即梦控制模式有明确、不同的资产门禁。
- 修改人物、场景或道具不会静默污染已发布任务单。
- 用户上传即梦结果后可以保留多个候选并显式指定采用版本和采用区间。
- 一集可以导出完整、可移交、可审计的生产包。
- 画布不会因为 30 个镜头自动增加数百个控制资产节点。

## 总体流程

```text
Markdown 剧本
  ↓
剧本结构化：场次 / 节拍 / 对白 / 旁白 / 动作
  ↓
人物卡与人物视觉资产
场景卡与场景视觉资产
道具卡与道具视觉资产
  ↓
结构化 Shotboard
  ↓
声音时长与静态 Animatic 节奏检查
  ↓
逐镜生成模式推荐
  ↓ 人工确认
控制资产准备：首帧 / 尾帧 / 关键帧 / 全能参考
  ↓ 审核通过
即梦任务单
  ↓ 用户在即梦操作
外部候选上传与镜头验收
  ↓
采用视频与采用区间
  ↓
剪映时间线执行单
  ↓
标准生产包
```

## 画布节点设计

### 新增节点类型

```ts
CanvasNodeType.SceneGroup = "scene-group";
CanvasNodeType.SceneCard = "scene-card";
CanvasNodeType.SceneAssetGroup = "scene-asset-group";
CanvasNodeType.PropGroup = "prop-group";
CanvasNodeType.PropCard = "prop-card";
CanvasNodeType.PropAssetGroup = "prop-asset-group";
CanvasNodeType.Shotboard = "shotboard";
CanvasNodeType.Shot = "shot";
```

### 分镜表主节点

用途：

- 表达一集结构化分镜。
- 管理镜头子节点的展开和折叠。
- 展示整集生产进度和阻塞问题。
- 打开整集生产工作台。
- 导出 Markdown 分镜和标准生产包。

卡片摘要：

```text
第 1 集 · 退婚当夜
3 场 · 31 镜 · 预计 88.5 秒
21 镜剪辑就绪 · 3 个阻塞问题
```

交互：

- 双击展开或折叠所有镜头子节点。
- 选择后在下方面板展示整集进度。
- 双击标题区或点击详情操作进入全屏生产工作台。

建议 metadata 只保存画布投影信息：

```ts
type ShotboardNodeMetadata = {
  productionId: string;
  shotboardId: string;
  shotChildIds: string[];
  shotboardExpanded: boolean;
};
```

不要把完整 Shotboard JSON 塞入通用 `CanvasNodeMetadata`。

### 镜头子节点

用途：

- 表达可寻址的单个镜头。
- 展示缩略图、模式、时长、状态和缺口。
- 连接用户固定到画布的控制帧和候选视频。
- 双击进入镜头工作台。

卡片摘要：

```text
025 · 沈夜猛然睁眼
首尾帧 · 3.0s · 9:16
控制帧待审核
```

建议 metadata：

```ts
type ShotNodeMetadata = {
  productionId: string;
  shotboardId: string;
  shotId: string;
  shotRootId: string;
};
```

镜头标题、状态、缩略图等展示信息从 Shotboard store 订阅读取，不在节点 metadata 中复制。

### 折叠与布局

- 分镜表与镜头复用人物卡组、角色资产包已经验证的主子展开动画。
- 折叠时镜头子节点隐藏并飞回主节点堆叠位置。
- 展开时按场次顺序和镜头顺序排列。
- 场次可通过行间间距或小型分组标题表达，不创建场次节点。
- 一键整理将整个分镜表视为一个布局单元，展开时内部镜头重新排布但不交给 Dagre 单独拆散。

## 正式资产模型

### 人物资产

延续当前结构：

```text
人物卡组
  └─ 人物卡
      └─ 角色资产包
          ├─ 三视图
          ├─ 表情参考
          ├─ 景别参考
          └─ 变装状态
```

现有人物卡与资产包需要补充版本字段和“定稿版本”概念。

### 场景资产

```text
场景卡组
  └─ 场景卡
      └─ 场景资产包
          ├─ 建立全景
          ├─ 主机位
          ├─ 反打机位
          ├─ 空镜与细节
          └─ 时间 / 天气 / 灯光变体
```

场景卡核心字段：

```ts
type SceneCard = {
  id: string;
  version: number;
  name: string;
  narrativeFunction: string;
  era: string;
  locationType: string;
  spatialLayout: string;
  materials: string[];
  palette: string[];
  defaultLighting: string;
  timeVariants: string[];
  weatherVariants: string[];
  continuityLocks: string[];
  positivePrompt: string;
  negativePrompt: string;
  sourceNote: string;
};
```

### 道具资产

```text
道具卡组
  └─ 道具卡
      └─ 道具资产包
          ├─ 正面 / 背面
          ├─ 尺寸和持有关系
          ├─ 材质细节
          ├─ 开启 / 关闭状态
          └─ 完整 / 损坏 / 觉醒状态
```

只为关键叙事道具和高复用道具创建正式卡片。普通桌椅、背景装饰不自动建卡。

道具卡核心字段：

```ts
type PropCard = {
  id: string;
  version: number;
  name: string;
  narrativeFunction: string;
  ownerCharacterId?: string;
  shape: string;
  material: string;
  colors: string[];
  scale: string;
  handlingRules: string[];
  states: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  continuityLocks: string[];
  positivePrompt: string;
  negativePrompt: string;
  sourceNote: string;
};
```

## Shotboard 深模块

### 模块职责

`Shotboard` 是一个深模块：调用方使用少量稳定接口，镜头验证、版本、连续性、模式推荐、Prompt 编译和失效传播集中在内部实现。

外部接口概念：

```ts
type ShotboardModule = {
  importGeneratedShotboard(input: GeneratedShotboardInput): ImportResult;
  updateShot(shotboardId: string, shotId: string, patch: ShotPatch): Shot;
  bindAssetVersions(shotboardId: string, shotId: string, bindings: AssetBindingInput[]): Shot;
  recommendGenerationPlan(shotboardId: string, shotId: string): PlanRecommendation;
  confirmGenerationPlan(shotboardId: string, shotId: string, plan: GenerationPlanInput): Shot;
  compileJimengTask(shotboardId: string, shotId: string, profileId: string): JimengTask;
  addCandidate(shotboardId: string, shotId: string, candidate: CandidateInput): ShotCandidate;
  approveCandidate(shotboardId: string, shotId: string, approval: CandidateApprovalInput): Shot;
  exportEpisodePackage(shotboardId: string, mode: PackageMode): Promise<Blob>;
};
```

接口实际可根据项目函数式风格实现，不要求使用 class。

### 项目数据位置

扩展 `CanvasProject`：

```ts
type CanvasProject = {
  // 现有字段
  production?: ProductionProject;
};
```

建议领域根：

```ts
type ProductionProject = {
  schemaVersion: 1;
  projectProfile: ProductionProfile;
  scriptBreakdowns: ScriptBreakdown[];
  characters: CharacterRecord[];
  scenes: SceneRecord[];
  props: PropRecord[];
  styleBibles: StyleBible[];
  shotboards: ShotboardRecord[];
  platformProfiles: PlatformCapabilityProfile[];
};
```

- 结构化元数据随画布项目保存在 localforage。
- 图片、视频和音频继续使用当前媒体 store。
- 领域记录引用媒体 `storageKey`，不直接保存 base64。
- 项目导出包同时导出 production 数据和被引用的媒体文件。
- 项目未上线，导入导出版本可直接提升，不为旧的不存在字段增加兼容分支。

### 剧本结构版本

原始 Markdown 仍保存在剧本节点。生产数据增加从该 Markdown 派生的结构化版本：

```ts
type ScriptBreakdown = {
  id: string;
  sourceScriptNodeId: string;
  revision: string;
  markdownHash: string;
  episodeNumber: number;
  title: string;
  scenes: ScriptScene[];
  beats: ScriptBeat[];
  dialogueCues: DialogueCue[];
  voiceoverCues: VoiceoverCue[];
  createdAt: string;
};
```

- `revision` 在剧本 Markdown 重新确认后变化。
- `markdownHash` 用于检测剧本节点内容是否已修改。
- 每个剧情节拍有稳定 ID。
- Shotboard 的每个镜头至少引用一个 `sourceBeatId`。
- 剧本修改后不自动重写镜头，只标记受影响镜头“剧本有更新”。
- 用户同步剧本版本后，受影响镜头回到 `draft` 或 `shot-approved` 之前的适当状态，并使当前任务单过期。

首次从原始剧本生成结构化分镜时，文本模型在同一次请求中返回 `ScriptBreakdown + Shotboard`，两者必须一起通过 schema 和领域校验后才写入项目。已有有效 `ScriptBreakdown` 时，后续重写镜头只引用该结构化版本。

## Shotboard 数据契约

```ts
type ShotboardRecord = {
  id: string;
  version: number;
  sourceScriptNodeId: string;
  sourceScriptRevision: string;
  episodeNumber: number;
  title: string;
  targetDurationMs: number;
  targetRatio: "9:16" | "16:9" | "1:1" | "4:3" | "3:4";
  styleBibleVersionId?: string;
  scenes: StoryScene[];
  shots: Shot[];
  generatedAt: string;
  updatedAt: string;
};
```

### 场次

```ts
type StoryScene = {
  id: string;
  order: number;
  heading: string;
  locationAssetId?: string;
  timeOfDay: string;
  dramaticPurpose: string;
  beatSummary: string;
  shotIds: string[];
};
```

### 镜头

```ts
type Shot = {
  id: string;
  sceneId: string;
  order: number;
  code: string;
  sourceBeatIds: string[];

  narrativePurpose: string;
  emotionalBeat: string;
  informationGain: string;
  shotCategory:
    | "establishing"
    | "dialogue"
    | "emotion-closeup"
    | "reaction"
    | "prop-detail"
    | "action"
    | "reveal"
    | "transition";

  framing: {
    shotSize: string;
    cameraAngle: string;
    composition: string;
    lensIntent: string;
    screenDirection: string;
    cameraMovement: string;
  };

  startState: string;
  action: string;
  endState: string;
  continuityNotes: string[];

  characterBindings: CharacterShotBinding[];
  sceneBinding: SceneShotBinding;
  propBindings: PropShotBinding[];

  dialogue: DialogueCue[];
  voiceover: VoiceoverCue[];
  soundCues: SoundCue[];

  targetDurationMs: number;
  editRelation: EditRelation;
  generation: ShotGeneration;
  status: ShotProductionStatus;

  createdAt: string;
  updatedAt: string;
};
```

### 资产绑定

镜头绑定资产的具体版本：

```ts
type AssetVersionBinding = {
  assetId: string;
  version: number;
  visualAssetIds: string[];
  role: string;
};
```

人物绑定还需包含：

- 当前变装或受伤状态。
- 表情目标。
- 画面位置。
- 视线方向。
- 持有道具和左右手。

场景绑定还需包含：

- 时间、天气和光线变体。
- 使用机位。
- 空间连续性要求。

道具绑定还需包含：

- 道具状态。
- 持有人。
- 左右手或空间位置。

## 结构化分镜生成

### 配置节点输出类型

文本模式新增：

```ts
textOutputType?: "text" | "markdown" | "shotboard";
```

配置节点连接：

```text
剧本节点 ────────┐
导演要求文本 ────┤
人物卡组 ────────┤ -> 配置节点（输出：结构化分镜）
场景卡组 ────────┤
道具卡组 ────────┘
```

保持现有显式输入原则：

- 只读取直接连接的资源。
- 不递归吞入上游的上游。
- 输入摘要明确显示剧本、人物、场景和道具数量。
- 用户通过 `@` 引用可以限制实际进入上下文的资源。

三类资产卡组都通过节点 `resource()` 输出结构化文本摘要：

- 人物卡组：只输出已定稿的人物卡 ID、版本、角色状态和一致性锁。
- 场景卡组：只输出已定稿的场景卡 ID、版本、空间、光线和连续性锁。
- 道具卡组：只输出已定稿的道具卡 ID、版本、状态和持有规则。

卡组资源不包含全部三视图或媒体二进制，只包含可供文本模型理解和引用的资产目录。具体视觉文件在后续控制资产阶段选择。

### 输出和解析

模型必须输出严格 JSON，不输出 Markdown 表格。

处理顺序：

1. 清理 `<think>`。
2. 提取纯 JSON 或 JSON code fence。
3. 使用成熟 schema 校验器验证。
4. 验证稳定 ID、顺序、时长、引用和枚举。
5. 运行领域校验。
6. 只有全部通过才创建 Shotboard 和画布节点。

领域校验至少包括：

- 每个镜头都有 `startState`、`action`、`endState`。
- 每个镜头至少引用一个当前剧本版本中的剧情节拍。
- `targetDurationMs` 大于 0。
- 场次和镜头顺序唯一。
- 引用的人物、场景和道具存在。
- 对白和旁白时间估算不超过镜头或场次可用时长。
- 镜头总时长与目标集长偏差超过阈值时给出警告。
- 复杂群体动作、多机位或多个叙事事件塞入单镜时给出拆镜建议。

失败时：

- 不创建半成品 Shotboard。
- 配置节点标记错误。
- 保存清洗后的原始模型输出和校验错误路径。
- 提供“复制错误”“查看原始输出”“重新生成”。
- 后续可增加人工 JSON 修复入口，但不在首期实施中手写复杂修复器。

### 局部再生成

结构化分镜创建后支持：

- 重写选中镜头。
- 重写选中场次。
- 插入镜头。
- 删除镜头。
- 拆分镜头。
- 合并相邻镜头。

局部再生成只提交：

- 当前镜头或场次。
- 相邻镜头摘要。
- 被绑定资产。
- 用户修改要求。

已人工确认的其他镜头不被覆盖。

### Markdown 派生报告

Markdown 从结构化 Shotboard 单向生成，内容包括：

- 基本信息。
- 场次分章。
- 镜号、景别、角度、画面、开始/结束状态、对白、声音和时长。
- 人物、场景和道具绑定。
- 模式、生产状态和风险。

允许复制和导出 Markdown，但不把用户自由修改后的 Markdown 反向解析回 Shotboard。编辑镜头必须在镜头工作台完成。

## 镜头工作台

双击镜头节点进入全屏工作台，`Esc` 退出。

### 布局

- 左栏：按场次分组的镜头列表、状态、搜索和筛选。
- 中栏：镜头定义、控制帧、即梦任务单和候选对比。
- 右栏：资产绑定、状态机、连续性问题和历史版本。

### 镜头定义

用户可编辑：

- 剧情目的和情绪节拍。
- 景别、机位、构图和运镜。
- 开始状态、动作过程和结束状态。
- 人物、场景和道具。
- 对白、旁白、音效。
- 目标时长和剪辑关系。

任何影响生成结果的字段变化都使当前“已发布任务单”过期，但不删除旧版本。

## 镜头生成模式

### 统一原则

所有镜头都必须定义：

```text
开始状态 -> 动作过程 -> 结束状态
```

并非所有镜头都必须上传尾帧，但需要精确控制结束状态的镜头必须使用首尾帧或多帧模式。

### 首帧模式

适用：

- 单一主体的小动作。
- 情绪近景、反应镜头、道具特写。
- 结束姿态不需要像素级或构图级锁定。

门禁：

- 已审核首帧。
- 结束状态文字。
- 人物、场景和道具一致性要求。

### 首尾帧模式

适用：

- 动作有明确起点和落点。
- 变身、转身、开门、起身等状态转换。
- 需要精确最终构图。
- 当前镜头尾部是下一连续镜头的入口。
- 匹配剪辑或循环镜头。

门禁：

- 已审核首帧。
- 已审核尾帧。
- 首尾比例一致。
- 人物身份、服装、道具状态、场景几何和光线相容。
- 起止差异在目标时长内可自然完成。

### 智能多帧模式

适用：

- 一个连续片段存在三个以上必须保留的视觉阶段。
- 单机位内的连续仪式、产品展示或受控姿态变化。

门禁：

- 有序关键帧。
- 每帧剧情职责。
- 每帧目标时间点或停留区间。
- 帧间状态可达。

禁止：

- 用多帧模式代替正常的多镜头剪辑。
- 把多个场景、多个机位和多个叙事事件硬塞进一个生成片段。

### 全能参考模式

适用：

- 人物、场景、道具、动作、运镜或声音分别来自不同参考。
- 首尾构图不是主要约束，多参考组合执行才是重点。

门禁：

- 参考资产完整。
- 每个参考有明确职责。
- 上传顺序和任务单引用一致。
- 提示词使用 `@` 引用说明用途。
- 参考之间不存在身份、服装、场景或光线冲突。

示例：

```text
@角色A 只参考脸、发型、服装和体型。
@场景1 只参考空间结构、材质、光线和色调。
@道具1 锁定形状、材质、颜色和持有方式。
@动作参考 只参考身体路径和节奏，不复制人物身份。
@运镜参考 只参考摄像机轨迹。
```

## 模式推荐与人工确认

### 推荐输入

- 开始状态与结束状态差异。
- 必须保留的中间阶段数量。
- 是否需要精确动作落点。
- 是否与下一镜连续。
- 是否存在人物、场景、道具以外的动作/运镜/音频参考。
- 当前控制资产完整度。
- 镜头时长和复杂度。

### 推荐输出

```ts
type PlanRecommendation = {
  recommendedMode: ShotGenerationMode;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  rejectedModes: Array<{
    mode: ShotGenerationMode;
    reason: string;
  }>;
  requiredAssets: RequiredControlAsset[];
  missingAssets: RequiredControlAsset[];
  risks: string[];
};
```

用户必须显式确认。用户改选模式后：

- 重新计算必需资产。
- 清除旧模式的“审核通过”状态。
- 保留旧模式历史版本。
- 当前任务单标记过期。

## 控制资产

### 类型

```ts
type ControlAssetKind =
  | "first-frame"
  | "last-frame"
  | "keyframe"
  | "identity-reference"
  | "scene-reference"
  | "prop-reference"
  | "action-reference"
  | "camera-reference"
  | "audio-reference";
```

### 创建方式

每项控制资产支持：

1. 使用画布图片生成能力创建。
2. 从已有图片、视频或音频节点选择。
3. 从“我的资产”选择。
4. 用户在外部平台制作后上传。

控制帧图片生成应读取镜头和被绑定的正式资产，不直接读取整篇剧本，避免剧情文本污染视觉锁定。

### 审核

控制资产状态：

```ts
type ControlAssetStatus = "draft" | "review" | "approved" | "rejected";
```

设为定稿时记录：

- 审核时间。
- 使用的资产版本。
- 来源节点或 storageKey。
- 用户备注。
- 构图、身份、场景、道具和连续性检查结果。

## 即梦平台能力档案

即梦 Web、Dreamina Web 和火山方舟 API 即使使用同系列模型，也可能拥有不同：

- 模型名称。
- 会员权限。
- 生成模式。
- 参考数量。
- 文件规格。
- 比例、分辨率和时长选项。
- 原生音频能力。
- 真人脸限制。

不能把当前平台参数写死在 Shot 数据中。

```ts
type PlatformCapabilityProfile = {
  id: string;
  platform: "jimeng-web" | "dreamina-web" | "volcengine-api" | "custom";
  displayName: string;
  profileVersion: number;
  verifiedAt?: string;
  models: PlatformModelCapability[];
};
```

首期默认提供“即梦 Web”档案，并允许用户查看和覆盖可变参数。任务单编译时保存所用能力档案快照。

若用户选择的设置不被当前档案支持：

- 阻止发布任务单。
- 明确指出冲突参数。
- 提供可选替代设置。

## 即梦任务单

### 数据结构

```ts
type JimengTask = {
  id: string;
  version: number;
  shotId: string;
  shotVersion: number;
  platformProfileSnapshot: PlatformCapabilitySnapshot;
  assetSnapshots: AssetVersionBinding[];
  mode: ShotGenerationMode;
  settings: {
    model: string;
    ratio: string;
    durationMs: number;
    resolution: string;
    nativeAudio: boolean;
  };
  uploadSteps: UploadStep[];
  referenceMap: ReferenceInstruction[];
  prompt: string;
  negativeInstructions: string[];
  operationSteps: string[];
  acceptanceCriteria: string[];
  retryPlaybook: RetryRule[];
  status: "draft" | "published" | "stale" | "archived";
  createdAt: string;
};
```

### Prompt 编译顺序

最终 Prompt 按固定语义层编译：

1. 镜头目标。
2. 主体身份和状态。
3. 场景和光线。
4. 开始状态。
5. 动作过程。
6. 结束状态。
7. 运镜。
8. 节奏与速度。
9. 参考资产职责。
10. 一致性和禁止项。
11. 原生音频要求，仅在启用时加入。

Prompt 应可读、可复制，不输出模型内部字段名。

### 操作单

任务单必须包含：

- 打开即梦哪个入口。
- 选择哪个模型和模式。
- 按什么顺序上传哪些文件。
- 每个文件在平台中对应什么角色。
- 如何使用 `@` 引用。
- 比例、分辨率、时长和声音设置。
- 复制哪个 Prompt。
- 建议生成多少候选。
- 如何验收。
- 失败时一次只修改哪个变量。

### 发布与失效

只有门禁全部通过才能“发布任务单”。

以下变化使任务单变为 `stale`：

- 镜头定义变化。
- 镜头同步到新的剧本结构版本。
- 模式变化。
- 控制资产变化。
- 资产绑定版本变化。
- 用户将镜头同步到新的平台能力档案。
- 设置或声音策略变化。

失效不会删除任务单。用户可继续查看、复制和回滚旧版本，但 UI 必须显示其不是当前版本。

新的正式资产版本或平台能力档案发布时，只显示“有更新可同步”，不直接改变任务单状态。只有用户接受新版本并更新当前镜头绑定后，任务单才变为 `stale`。

## 外部候选回填

用户从即梦下载结果后，在镜头工作台上传。

```ts
type ShotCandidate = {
  id: string;
  shotId: string;
  sourceTaskId: string;
  sourceTaskVersion: number;
  storageKey: string;
  fileName: string;
  durationMs?: number;
  notes: string;
  status: "candidate" | "approved" | "rejected";
  review?: ShotCandidateReview;
  createdAt: string;
};
```

### 候选验收

至少检查：

- 人物身份、服装和表情。
- 场景、光线和空间关系。
- 道具形状、状态、持有者和左右手。
- 开始和结束状态。
- 动作完整度和自然度。
- 运镜方向和速度。
- 手脸畸变、穿模、闪烁、物体增减和文字水印。
- 与前后镜头的屏幕方向、视线、动作、时间和声音连续性。

用户指定采用版本时还需填写：

- 采用入点。
- 采用出点。
- 是否需要变速、定格、裁切或补帧。
- 剪辑备注。

候选上传不等于采用，必须显式审核。

## 固定到画布

控制资产、任务单和候选默认只存在于镜头工作台。

用户点击“固定到画布”后：

- 图片创建普通图片节点。
- 候选视频创建普通视频节点。
- 任务单可创建 Markdown 文档节点。
- 新节点连接到对应镜头。
- 节点 metadata 保存领域记录 ID 和版本。

固定节点是视觉投影：

- 删除固定节点不删除 Shotboard 中的资产或候选。
- Shotboard 记录删除时，固定节点显示“来源已删除”，由用户决定是否保留媒体。
- 同一记录和版本默认只固定一次，避免重复节点。

## 声音与 Animatic

### 默认声音策略

- 对白、旁白、环境声、动作音效和 BGM 默认进入剪映。
- 即梦任务单默认关闭或不要求原生对白。
- 口型特写、歌唱、声音驱动动作和必须同期声的镜头可单独启用原生音频。
- 即梦原生音频仍视为候选音轨，最终是否采用由剪辑阶段决定。

### Animatic

最终视频生产前，整集工作台需要计算：

- 每句对白和旁白的预计时长。
- 每个镜头的目标时长。
- 场次和整集总时长。
- 静态控制帧组成的分镜时间线。

首期不要求在画布内播放完整 Animatic，但必须提供时间线预览和时长冲突提示。

## 镜头生产状态机

```ts
type ShotProductionStatus =
  | "draft"
  | "shot-approved"
  | "plan-approved"
  | "control-assets-ready"
  | "task-published"
  | "external-generating"
  | "candidate-review"
  | "edit-ready"
  | "blocked";
```

状态推进：

```text
draft
  -> shot-approved
  -> plan-approved
  -> control-assets-ready
  -> task-published
  -> external-generating
  -> candidate-review
  -> edit-ready
```

`external-generating` 由用户手动标记，不代表系统与即梦建立连接。

阻塞原因单独记录：

```ts
type ProductionBlocker = {
  code: string;
  message: string;
  fieldPath?: string;
  assetId?: string;
  severity: "warning" | "error";
};
```

只要存在 `error` 级 blocker，就不能推进到下一门禁。

## 连续性检查

连续性分为：

### 同一长动作拆段

- 前一片段尾帧可作为下一片段首帧候选。
- 或在平台支持时选择视频延长。
- 必须保持角色、道具、背景几何和运动方向。

### 正常剪切换机位

不要求像素一致，但必须检查：

- 人物姿态和位置。
- 道具左右手。
- 视线方向。
- 屏幕运动方向。
- 服装、伤口和道具状态。
- 时间、天气和主光方向。
- 对白和音效衔接。

检查结果分为：

- 自动通过。
- 警告，允许人工确认。
- 阻塞，必须修复。

首期以规则检查和人工清单为主，不实现图像相似度模型。

## 整集生产看板

分镜表全屏工作台展示：

- 按场次分组的镜头序列。
- 每镜模式和生产状态。
- 缺失控制资产。
- 过期任务单和资产版本。
- 即梦候选和采用状态。
- 预计场次/整集时长。
- 连续性问题。
- 导出准备度。

支持筛选：

- 待确认分镜。
- 待确认模式。
- 缺控制资产。
- 任务单过期。
- 候选待验收。
- 剪辑就绪。
- 被阻塞。

## 剪映时间线执行单

每个镜头输出：

- 素材文件名。
- 候选/采用版本。
- 入点、出点和目标时长。
- 轨道建议。
- 变速、定格、裁切和关键帧缩放。
- 转场或硬切要求。
- 对白、旁白、环境声、SFX 和 BGM cue。
- 字幕文本、说话人、入点、出点和强调词。
- 镜头级调色修正。
- 连续性修复说明。

推荐剪辑顺序：

1. 对白和旁白主轨。
2. 画面粗剪和反应镜头。
3. 动作音效和环境声。
4. BGM 与对白闪避。
5. 字幕和强调字。
6. 连续性修复、变速和转场。
7. 镜头匹配调色和全片调色。
8. 响度、画质和导出验收。

## 标准生产包

### 包内容

```text
episode-01-production.zip
├── manifest.json
├── shotboard.json
├── shotboard.md
├── shotboard.csv
├── jimeng-tasks/
│   ├── shot-001.md
│   └── shot-025.md
├── control-frames/
├── selected-clips/
├── jianying-edit-plan.csv
├── dialogue-voiceover.md
├── subtitles.srt
├── audio-cue-sheet.csv
└── issues.md
```

### 文件名

建议统一：

```text
ep01-sc06-sh025-first-v003.png
ep01-sc06-sh025-last-v002.png
ep01-sc06-sh025-candidate-01.mp4
ep01-sc06-sh025-approved-v001.mp4
```

### 导出模式

#### 工作包

- 随时可导出。
- 允许未完成镜头。
- 所有问题写入 `issues.md`。

#### 即梦任务包

- 只包含 `task-published` 及之后状态的镜头。
- 过期任务单不进入默认目录，可放入 archive。

#### 最终剪辑包

必须满足：

- 所有必需镜头有采用视频。
- 入点、出点和目标时长已确认。
- 对白、旁白和字幕存在。
- 音效/BGM 计划存在。
- 没有 error 级连续性问题。

#### 成片验收单

只有字幕、响度、画幅、调色和导出规格全部确认后生成。

## 错误与恢复

### 生成分镜失败

- 不创建半成品。
- 保存原始输出和字段错误。
- 允许重新生成。

### 控制资产缺失

- 镜头保持当前状态。
- 在镜头卡和整集看板显示缺口。
- 阻止发布任务单。

### 资产更新

- 已发布任务单变为“有新资产可同步”，不自动 stale。
- 只有用户执行同步后，当前镜头采用新版本并使任务单 stale。
- 旧任务单和旧候选继续可复现。

### 外部生成失败

- 用户在候选区记录失败原因。
- 任务单提供按失败类型分类的重试建议。
- 重试时默认只修改一个变量。

### 媒体文件丢失

- 领域记录保留。
- 状态变为 blocked。
- 展示原文件名、storageKey 和重新上传入口。

### 刷新和恢复

- 所有领域状态和版本持久化。
- `external-generating` 刷新后仍保留，但明确显示为用户手动状态。
- 不把外部任务误标为系统正在运行。

## 模块与文件边界

建议新增：

```text
web/src/types/production.ts
web/src/lib/production/shotboard.ts
web/src/lib/production/shotboard-schema.ts
web/src/lib/production/shot-mode-recommender.ts
web/src/lib/production/jimeng-task-compiler.ts
web/src/lib/production/continuity-validator.ts
web/src/lib/production/production-package.ts
web/src/components/canvas/canvas-shotboard-content.tsx
web/src/components/canvas/canvas-shot-content.tsx
web/src/components/canvas/shot-workbench/
web/src/components/canvas/shotboard-workbench/
```

`ProductionProject` 只保存在 `CanvasProject.production` 中，并随现有 Canvas store 持久化、同步、导入和导出。Shotboard 模块接收领域数据并返回新数据，不维护第二份可持久化状态。

`project.tsx` 只负责：

- 打开工作台。
- 创建画布投影节点。
- 连接节点。
- 调用 Shotboard 模块。

不要继续把完整分镜解析、状态机、Prompt 编译和导出逻辑堆入 `project.tsx`。

## 分阶段实施

本设计规模较大，应拆成独立规格和实施计划。

### 阶段 1：生产数据基础与结构化分镜

- `ProductionProject` 数据根。
- 剧本结构版本和剧情节拍 ID。
- 场景卡/道具卡基础类型。
- Shotboard schema、解析和领域校验。
- 配置节点“结构化分镜”输出。
- 分镜表与镜头两层节点。
- Markdown 派生报告。

### 阶段 2：镜头工作台与模式推荐

- 镜头全屏工作台。
- 开始/动作/结束状态编辑。
- 资产版本绑定。
- 四种模式推荐、解释和人工确认。
- 生产状态机和 blocker。

### 阶段 3：控制资产与即梦任务单

- 首帧、尾帧和关键帧版本管理。
- 全能参考职责映射。
- 即梦平台能力档案。
- Prompt 编译器。
- 完整操作单、发布和失效。
- 按需固定到画布。

### 阶段 4：候选回填、连续性和整集交付

- 多候选上传、验收和采用区间。
- 跨镜连续性检查。
- 整集生产看板。
- Animatic 时长预览。
- 剪映执行单。
- 标准生产包。

场景卡与道具卡的批量生成、视觉资产包 UI 可分别形成独立规格，但其数据契约和版本接口必须在阶段 1 先确定。

## 测试与验收

### 单元测试

- Shotboard JSON schema 成功和失败路径。
- ID、顺序、时长和资产引用校验。
- 四种模式推荐规则。
- 模式切换后的门禁重算。
- 资产版本同步和任务单失效。
- Prompt 编译顺序和 `@` 引用映射。
- 连续性规则。
- CSV、SRT、Markdown 和 manifest 导出。

### 集成测试

- 直接连接剧本、人物、场景、道具后生成 Shotboard。
- 校验失败不创建画布节点。
- 成功后创建分镜表与镜头子节点及连线。
- 折叠、展开、一键整理和撤销。
- 编辑镜头导致任务单过期。
- 上传首尾帧并审核后发布任务单。
- 上传多个候选并指定采用版本。
- 固定媒体到画布后删除投影不影响领域记录。
- 导出项目后重新导入，版本、媒体和状态完整。

### 人工生产验收

用一集完整 Markdown 剧本走通：

1. 生成人物、场景和道具。
2. 生成 20 个以上结构化镜头。
3. 至少覆盖四种即梦模式。
4. 至少一个首尾帧连续镜头。
5. 至少一个智能多帧镜头。
6. 至少一个全能参考镜头。
7. 更新人物资产并验证旧任务单未被污染。
8. 上传多个外部候选并指定采用区间。
9. 导出工作包和最终剪辑包。
10. 按剪映执行单人工完成一版粗剪。

## 文档与版本记录

每个实施阶段完成后：

- 更新 `CHANGELOG.md` 的 `Unreleased`。
- 将本阶段可测试项写入 `pending-test.mdx`。
- 检查并更新 `todo.mdx`。
- 用户确认后再更新正式功能说明。

本设计和调研底稿的关系：

- 生产事实与平台调研见 `docs/superpowers/research/2026-07-25-ai-comic-video-and-editing-workflow.md`。
- 本文负责项目内的产品与技术设计。

## 非目标与后续项

本设计不包含：

- 自动生成视频。
- 自动登录或操作即梦。
- 剪映私有草稿导出。
- 图像相似度或人脸一致性模型。
- 多人协作和云审核。
- 成本核算和供应商调度。
- 自动发布短视频平台。

后续可独立设计：

- 系列圣经和跨集角色/场景状态。
- 多集批量生产队列。
- 实际留存数据回流到镜头策略。
- 其他平台任务单适配器，例如可灵、Dreamina 或火山方舟。
