# 本地磁盘持久化设计

## 背景

当前应用已经通过 `localForage` 将画布、素材、配置、个人提示词、插件和生成记录保存在浏览器本地，并将图片、视频、音频等 Blob 存入 IndexedDB。该方案可以在同一浏览器和同一站点地址下自动恢复，但存在以下边界：

- 清理浏览器网站数据后内容会丢失。
- 更换浏览器或访问地址后无法读取原数据。
- 上传和生成的媒体不在项目目录中，用户无法直接检查、备份或复制。
- 浏览器存储不是项目的可见事实源，难以独立恢复。

本设计将仓库根目录下的 `data/` 改为应用唯一数据源。每次通过 `make` 启动项目时，应用从磁盘加载所有画布和内容，并在编辑过程中自动写回磁盘。

## 已确认决策

1. 新增仅限本机访问的 Bun 存储服务，并由 `make` 与 Vite 一起启动。
2. `data/` 是画布、素材、生成记录、设置和媒体文件的唯一数据源。
3. 不读取、不迁移、不清理现有浏览器 IndexedDB 数据。
4. 本地上传媒体直接复制到 `data/`；AI 生成媒体也直接保存到 `data/`。
5. 图片、视频、音频和附件保持原始字节，不转 Base64、不转码、不降低质量。
6. 不使用 ZIP、gzip 或任何其他压缩格式。
7. API Key、Base URL、模型和插件配置保存到磁盘。
8. `data/` 加入 `.gitignore`，防止敏感配置和私人内容进入 Git。
9. 本地存储服务不可用时不回退到 IndexedDB。
10. 远程提示词仓库缓存可以重新下载，不纳入磁盘事实源。

## 目标

- 重启浏览器、重启开发服务或更换浏览器后，仍能恢复同一份画布和全部内容。
- 用户可以直接在 `data/` 中找到项目 JSON 和原始媒体文件。
- 删除浏览器网站数据不会影响磁盘项目。
- 连续编辑时自动保存，异常退出时尽量避免损坏已保存数据。
- 多标签页同时编辑时不静默覆盖较新的磁盘版本。
- 磁盘错误、权限错误和存储服务故障必须明确暴露，不制造虚假的“已保存”状态。

## 非目标

- 不迁移旧 IndexedDB 数据。
- 不删除旧 IndexedDB 数据。
- 不兼容没有本地存储服务的纯静态部署。
- 不实现历史版本管理、云同步或多人协同。
- 不加密 `settings.json`；API Key 以明文保存在本机磁盘。
- 不把远程提示词仓库缓存写入项目数据。
- 不为旧的浏览器存储结构提供兼容或回退分支。

## 数据目录

```text
data/
├── settings.json
├── app.json
├── projects/
│   ├── index.json
│   └── <project-id>/
│       ├── project.json
│       └── assets/
│           ├── images/
│           ├── videos/
│           ├── audio/
│           └── files/
├── library/
│   ├── library.json
│   └── assets/
│       ├── images/
│       ├── videos/
│       ├── audio/
│       └── files/
└── workbenches/
    ├── image/
    │   └── records.json
    ├── video/
    │   └── records.json
    └── audio/
        └── records.json
```

### `settings.json`

保存全局配置：

- AI API Key、Base URL 和 API 格式。
- 模型渠道和模型列表。
- 当前图片、视频、文本和音频模型选择。
- 模型调用脚本和参数默认值。
- WebDAV 配置。
- 已安装插件的元数据、源码和启用状态。
- 个人提示词和用户配置的提示词源。

文件包含明文敏感信息，只允许本机服务读取和更新。

### `app.json`

保存轻量应用状态：

- 主题。
- 最近打开的项目 ID。
- 项目列表排序等全局界面偏好。

临时弹窗、当前 hover、选区和请求中状态不持久化。

### `projects/index.json`

保存项目索引，不重复保存完整画布：

```ts
type ProjectIndex = {
    version: 1;
    projects: Array<{
        id: string;
        title: string;
        createdAt: string;
        updatedAt: string;
    }>;
};
```

项目列表由该文件恢复，完整内容按需从对应的 `project.json` 读取。

### `projects/<project-id>/project.json`

保存一个 `CanvasProject` 的完整业务数据：

- 节点、连线和视口。
- 助手会话。
- 背景和显示设置。
- AI 漫剧制作数据。
- 项目媒体引用。
- 保存版本号。

媒体引用只保存稳定媒体 ID、相对路径、原文件名、MIME 类型、大小和 SHA-256，不保存 `blob:` URL 或 Base64。

### `library/`

“我的素材”是独立于单个项目的全局素材库：

- `library.json` 保存素材元数据。
- `assets/` 保存素材原文件。

项目删除不得删除素材库文件。项目引用素材库媒体时保存素材 ID，不把素材复制进项目目录。

### `workbenches/`

保存生图、视频和音频工作台生成记录。记录引用的媒体必须先写入对应的磁盘媒体目录，记录 JSON 不保存 Base64 或临时 `blob:` URL。

## 媒体文件规则

### 本地上传

1. 用户在浏览器中选择本地文件。
2. 浏览器将原始 `File` 字节发送给 Bun 存储服务。
3. 服务根据归属写入项目目录或素材库目录。
4. 原始磁盘文件不移动、不修改；服务复制一份到 `data/`。
5. 服务写完并校验后返回媒体引用。
6. 前端收到成功结果后，才把引用加入项目或素材 JSON。

### AI 生成

1. 前端从 AI 服务获得图片、视频或音频 Blob。
2. Blob 立即以原始响应字节发送给本机存储服务。
3. 服务写入 `data/` 后返回媒体引用。
4. 前端只在磁盘写入成功后创建生成结果节点或记录。

### 文件命名

磁盘文件名使用稳定媒体 ID 和从原文件名或 MIME 类型推导的扩展名：

```text
image_<media-id>.png
video_<media-id>.mp4
audio_<media-id>.mp3
file_<media-id>.bin
```

用户可见的原文件名保存在 JSON 元数据中。文件名不得直接使用未经清理的用户输入。

### 不压缩约束

媒体存储链路禁止：

- ZIP 打包。
- gzip、Brotli 或其他内容压缩。
- Base64 持久化。
- 图片重新编码或降低质量。
- 视频、音频转码。
- 为节省空间改变原始响应字节。

HTTP 传输也不主动启用压缩中间件。JSON 以普通 UTF-8 文本保存。

## 本地存储服务

本地存储是应用运行的基础能力，不并入可选的 `canvas-agent`：

- `canvas-agent` 继续负责 Agent、MCP 和网页操作。
- 新服务只负责磁盘数据和媒体读写。
- 两者可以独立启动和演进。

服务仅监听 `127.0.0.1`，数据根目录固定为仓库根目录的 `data/`。

### 主要接口

```text
GET    /local-api/health
GET    /local-api/bootstrap
PUT    /local-api/settings
PUT    /local-api/app

POST   /local-api/projects
GET    /local-api/projects/:id
PUT    /local-api/projects/:id
DELETE /local-api/projects/:id

POST   /local-api/projects/:id/assets
GET    /local-api/projects/:id/assets/:assetId
DELETE /local-api/projects/:id/assets/:assetId

GET    /local-api/library
PUT    /local-api/library
POST   /local-api/library/assets
GET    /local-api/library/assets/:assetId
DELETE /local-api/library/assets/:assetId

GET    /local-api/workbenches/:kind
PUT    /local-api/workbenches/:kind
```

`bootstrap` 一次返回应用启动必需的设置、应用状态和项目索引，不返回所有项目正文和媒体字节。

### 媒体上传协议

媒体上传使用原始二进制请求体，不使用 Base64 JSON。元数据通过受控请求头或查询参数传递：

- 原文件名。
- MIME 类型。
- 媒体类型。
- 归属项目。

服务端处理顺序：

1. 校验项目、媒体类型和文件名。
2. 创建同目录 `.part` 文件。
3. 流式写入原始请求字节并计算 SHA-256。
4. 刷新并关闭文件。
5. 原子重命名为正式文件。
6. 返回媒体 ID、相对路径、原文件名、MIME 类型、字节数和 SHA-256。

失败时删除 `.part`，不返回可用媒体引用。

### 媒体读取

前端通过本地 API URL 展示媒体，不直接暴露任意磁盘路径。读取接口只接受服务端已经登记的媒体 ID，并支持浏览器播放视频和音频需要的 Range 请求。

## 启动方式

根目录执行：

```bash
make
```

`make` 同时启动：

- Vite 前端，默认访问地址为 `http://localhost:3000`。
- Bun 本地存储服务，仅监听 `127.0.0.1` 的内部端口。

退出 `make` 时两个子进程一起停止。任一必需进程退出时，启动脚本终止另一进程并返回失败。

开发环境由 Vite 将 `/local-api/*` 代理到本地存储服务。代理附加每次启动生成的服务令牌，浏览器代码不持有该令牌。

## 启动与恢复流程

1. 存储服务确认 `data/` 目录和基础 JSON 文件存在。
2. 前端请求 `/local-api/health`。
3. 前端请求 `/local-api/bootstrap`。
4. 应用恢复设置、主题、项目索引和最近项目。
5. 应用按需读取最近项目的 `project.json`。
6. 媒体节点根据稳定媒体 ID 生成本地 API URL。
7. 页面进入可编辑状态。

若存储服务不可用或启动数据无法读取，应用显示阻塞错误页，不创建空数据覆盖磁盘，也不回退 IndexedDB。

## 自动保存

### 项目保存

- 画布操作先更新前端 Zustand 状态。
- 项目修改采用短延迟合并保存，连续拖动和输入不会逐事件写盘。
- 页面显示 `正在保存`、`已保存`、`保存失败` 或 `版本冲突`。
- 页面关闭前仍有未完成保存时触发离开确认。

每个项目维护递增 `revision`。前端保存时提交自己加载的 revision：

```ts
type ProjectWrite = {
    expectedRevision: number;
    project: CanvasProject;
};
```

服务只接受与磁盘当前 revision 一致的写入，并在成功后返回新 revision。版本不一致时返回冲突，前端不能静默覆盖。

### 设置和其他 JSON

设置、应用状态、素材库和工作台记录分别合并保存，避免一个大文件的无关写入互相阻塞。每类数据由服务端串行写入。

## 原子写入与恢复

JSON 更新遵循：

1. 将完整 JSON 写入同目录 `.part`。
2. 确保写入成功。
3. 将当前正式文件复制为唯一的 `.bak`。
4. 原子重命名 `.part` 为正式文件。

只保留上一版未压缩备份，不实现历史版本系统。

启动时：

- 清理遗留 `.part` 文件。
- 正式 JSON 解析失败时不覆盖原文件。
- 将损坏文件保留并改名为 `.corrupt`。
- 若 `.bak` 可解析，提供从上一版恢复；否则显示阻塞错误。

## 删除规则

- 删除节点默认只删除节点对媒体的引用。
- 只有媒体没有被同一归属域的任何其他记录引用时，才允许删除磁盘文件。
- 删除项目时删除整个项目目录，但不删除素材库文件。
- 删除素材库条目前检查项目引用；存在引用时拒绝删除或要求用户先解除引用。
- 所有路径删除都由服务根据已登记 ID 计算，不接受前端传入任意绝对路径。

## 安全

- 服务只监听 `127.0.0.1`。
- Vite 代理使用启动令牌访问服务。
- 服务拒绝缺失或错误令牌的写接口。
- 项目 ID 和媒体 ID只允许安全字符。
- 拒绝绝对路径、`..`、空字节和路径分隔符注入。
- 解析后的绝对路径必须仍位于 `data/` 下。
- 不跟随能逃逸 `data/` 的符号链接。
- API 响应和日志不得输出 API Key、WebDAV 密码或完整 `settings.json`。
- `data/` 必须保持在 `.gitignore` 中。

`settings.json` 是本机明文文件。该风险在配置界面中明确提示，但本设计不增加密钥加密和系统钥匙串集成。

## 前端状态调整

Zustand 继续承担页面运行时状态，但不再使用 `persist` 将业务数据写入浏览器：

- 画布 store 从本地 API 加载项目索引和当前项目。
- 素材 store 从本地 API 加载素材库。
- 配置、主题、个人提示词、提示词源和插件 store 从磁盘加载并写回。
- 图片和媒体服务改为上传磁盘文件、生成本地媒体 URL。
- 生图、视频和音频工作台记录改为磁盘记录。
- 远程提示词缓存可继续使用浏览器缓存，因为它不是用户事实数据且可重新下载。

新版本不得从旧 IndexedDB hydrate 业务 store，也不得在后台执行迁移或清理。

## 错误处理

| 场景 | 行为 |
| --- | --- |
| 存储服务未启动 | 阻塞错误页，提示通过 `make` 启动 |
| `data/` 无写权限 | 显示保存失败，保留内存中的未保存编辑 |
| 磁盘空间不足 | 中止写入，删除 `.part`，不更新 JSON 引用 |
| 媒体上传中断 | 删除 `.part`，不创建节点或记录 |
| JSON 损坏 | 保留 `.corrupt`，尝试上一版 `.bak` |
| 项目版本冲突 | 停止自动覆盖，提示刷新磁盘版本 |
| 媒体文件缺失 | 节点显示缺失媒体状态和相对路径，不删除节点 |
| 服务意外退出 | 页面变为保存失败，不回退浏览器存储 |

## 测试策略

### 服务单元测试

- 安全路径解析拒绝目录逃逸。
- JSON 原子写入产生正式文件和唯一 `.bak`。
- 损坏 JSON 可以保留 `.corrupt` 并检测可用备份。
- 媒体流写入保持输入字节和 SHA-256 完全一致。
- `.part` 在失败和重启清理时被删除。
- revision 冲突不会覆盖新版本。
- 未引用媒体判断覆盖项目和素材库引用。

### 前端测试

- bootstrap 成功后恢复设置、项目索引和最近项目。
- 项目编辑按延迟合并保存。
- 媒体磁盘写入成功后才创建节点或生成记录。
- 媒体写入失败时不创建无效引用。
- 保存冲突、服务离线和磁盘错误显示正确状态。
- 业务 store 不再从 IndexedDB hydrate。

### 端到端验收

1. 新建画布，添加节点、连线和制作数据，刷新后完整恢复。
2. 停止并重新执行 `make`，自动恢复上次项目。
3. 上传图片、视频和音频，在 `data/` 找到字节一致的原始副本。
4. AI 生成媒体后，在 `data/` 找到原始响应文件。
5. 删除浏览器网站数据后重新打开，仍能从磁盘恢复。
6. 使用另一个浏览器访问同一应用，看到相同项目。
7. 两个标签页编辑同一 revision，后提交的旧版本收到冲突。
8. 模拟写入中断，正式 JSON 保持可解析且不引用半成品媒体。
9. 确认媒体文件没有 ZIP、gzip、Base64 持久化、转码或质量压缩。
10. 确认 API Key 写入 `data/settings.json` 且 `git status` 不显示 `data/`。

## 文档影响

实现完成后需要同步更新：

- `README.md`：快速开始改为根目录 `make`，说明项目内容保存在 `data/`。
- `docs/content/docs/development/local-development.mdx`：补充前端和本地存储服务。
- `docs/content/docs/development/canvas-data-structure.mdx`：将 IndexedDB 说明改为磁盘目录结构。
- `docs/content/docs/overview/features.mdx`：用户确认验收后再更新正式功能说明。
- `docs/content/docs/progress/todo.mdx`：完成对应待办时移除。
- `docs/content/docs/progress/pending-test.mdx`：记录实际可测试变更。
- `CHANGELOG.md`：在 `Unreleased` 中增加一条 `[调整]` 版本级说明。

## 成功标准

- `data/` 成为全部用户业务数据的唯一事实源。
- 每次通过 `make` 启动都能恢复之前的画布和全部内容。
- 用户上传及 AI 生成媒体均以原始字节直接保存到磁盘。
- 不依赖、迁移或清理旧浏览器 IndexedDB 数据。
- 浏览器存储清理和浏览器切换不影响磁盘项目。
- 保存中断、多标签页冲突和磁盘故障不会静默破坏较新的数据。
- 所有敏感配置和私人内容均被 Git 忽略。
