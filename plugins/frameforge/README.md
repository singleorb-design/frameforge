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
