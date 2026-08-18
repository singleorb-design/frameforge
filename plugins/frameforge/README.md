# FrameForge Codex Plugin

让 Codex 可以打开并操作影格工坊 (FrameForge)。

## 安装

macOS / Linux：

```bash
git clone https://github.com/basketikun/frameforge.git
cd frameforge
codex plugin marketplace add "$(pwd)"
codex plugin add frameforge@frameforge-local
```

Windows PowerShell：

```powershell
git clone https://github.com/basketikun/frameforge.git
cd frameforge
codex plugin marketplace add "$PWD"
codex plugin add frameforge@frameforge-local
```

Windows CMD 将 `$PWD` 替换为 `%cd%`。

安装后新建一个 Codex 任务，然后输入：

```text
帮我打开并连接到 FrameForge
```

## 内置 Skills

- `canvas`：读取和操作当前 FrameForge 画布。
- `open-canvas`：打开在线版或本地版 FrameForge 并连接本地 Canvas Agent。
- `drama-production`：把短剧、AI 漫剧、剧本、分镜、资产和视频 Prompt 转成 FrameForge 画布生产流程。
