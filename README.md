# 影格工坊 (FrameForge)

影格工坊是一个面向 AI 短剧、漫剧和影像创作的本地生产画布。它把剧本、角色资产、场景道具、分镜、镜头方案、外部生成任务和素材沉淀放在同一个工作台里，适合个人创作者用来管理从故事到镜头交付的完整流程。

项目代码、插件、MCP、导出格式、本地存储 key 与目录命名均统一使用 `frameforge`。

## 核心能力

- 生产画布：多画布项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出。
- 剧本工作流：Markdown 剧本节点、章节分页阅读、章节选择式 AI 提取，适合长剧本和多集内容。
- 资产结构：人物卡、角色视觉参考、场景卡、道具卡和版本化参考图，帮助锁定角色与镜头连续性。
- 分镜与镜头：从剧本生成结构化分镜表，拆出镜头节点，并在镜头工作台里处理阻塞项、控制资产、生成方案和候选验收。
- 外部生成协作：面向即梦等外部 AI 视频工具生成任务单、Prompt、上传顺序、验收标准和重试建议。
- AI 生成入口：支持 OpenAI 兼容文本、图片、视频、音频接口，也支持自定义接口调用脚本。
- 本地素材库：画布、素材、生成记录、配置和原始媒体可保存到仓库下的 `data/`。
- 本地 Agent：通过 Canvas Agent 连接 Hermes / Codex / MCP，让 Agent 读取和操作当前画布，写操作仍由网页侧确认。
- 插件系统：支持动态安装画布节点插件，并提供 TypeScript SDK 开发自定义节点。

## 快速开始

```bash
git clone git@github.com:basketikun/frameforge.git
cd frameforge
bun install --cwd web
make
```

运行后访问：

```text
http://localhost:3000
```

首次打开后，进入右上角配置，填入自己的 OpenAI 兼容 `Base URL`、`API Key` 和模型名。

## 本地运行说明

当前完整模式需要同时启动三个本机服务：

- Web UI：`http://localhost:3000`
- Canvas Agent：`http://127.0.0.1:17371`
- Local Storage：`http://127.0.0.1:17372`

直接在仓库根目录执行 `make` 或 `make start` 会启动完整本地栈。

## 数据与安全

- `data/` 目录保存画布项目、素材、生成记录、配置和原始媒体，并已被 Git 忽略。
- AI API Key 会以本机明文配置保存，只适合个人可信环境。
- 浏览器前端会直连你配置的 AI 服务；如需私有化或公网部署，请先评估密钥、跨域、插件和本地文件访问风险。
- 第三方节点插件会在页面内运行代码，只应安装可信来源。

## 文档入口

- [快速开始](docs/content/docs/overview/quick-start.mdx)
- [功能介绍](docs/content/docs/overview/features.mdx)
- [画布节点操作手册](docs/content/docs/canvas/canvas-node-manual.mdx)
- [本地 Agent 连接画布原理](docs/content/docs/development/local-codex-canvas.mdx)
- [待测试事项](docs/content/docs/progress/pending-test.mdx)
- [TODO](docs/content/docs/progress/todo.mdx)

## 开发命令

```bash
make start     # 启动完整本地栈
make dev       # 启动前端与本机存储
make storage   # 只启动本机存储服务
```

前端单独开发：

```bash
bun install --cwd web
bun run --cwd web dev
```

## 开源协议

本项目使用 GNU Affero General Public License v3.0，见 [LICENSE](LICENSE)。
