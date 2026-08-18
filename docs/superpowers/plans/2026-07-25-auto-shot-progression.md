# Auto Shot Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让镜头在没有真实阻塞时自动完成确认、采用 AI 推荐方案并接入已有视觉参考，用户只处理缺失素材、首帧和外部生成结果。

**Architecture:** 在生产领域层新增单一自动推进函数，复用现有镜头校验、方案推荐和参考图同步能力。镜头工作台打开或切换镜头时调用该函数；准备画面上传后直接标记可用，默认界面不再暴露“确认镜头”“确认方案”“通过参考图”等内部状态动作。

**Tech Stack:** Vite、React、TypeScript、Ant Design、Tailwind、现有 production helpers。

## Global Constraints

- 中文界面；外部平台生成是主路径，画布不生成视频。
- 仅真实阻塞异常中断流程；警告不阻塞自动推进。
- 已有角色、场景、道具视觉参考自动接入，不要求再次确认。
- 主流程不展示版本、修订、资产快照和方案确认术语。
- 不新增依赖；按项目约束不执行构建、类型检查或测试。

---

### Task 1: 自动准备镜头

**Files:**
- Create: `web/src/lib/production/shot-auto-progress.ts`
- Modify: `web/src/pages/canvas/project.tsx`
- Modify: `web/src/components/canvas/shot-workbench/canvas-shot-workbench.tsx`

**Interfaces:**
- Produces: `autoPrepareShot(production, shotboardId, shotId, now)`。
- Behavior: 无阻塞时确认镜头、采用推荐模式、同步全部已有参考图；有阻塞时原样返回。

- [ ] 新增自动推进函数，统一复用 `validateShot`、`approveShot`、`recommendShotMode`、`confirmShotPlan`。
- [ ] 打开镜头和工作台切换镜头时调用自动推进函数。
- [ ] 移除默认界面的确认区域与确认按钮，生成方式保留在“更多调整”并在选择后立即应用。

### Task 2: 自动采用准备画面

**Files:**
- Modify: `web/src/lib/production/shot-control-assets.ts`
- Modify: `web/src/components/canvas/shot-workbench/control-asset-panel.tsx`

**Interfaces:**
- `addControlAssetVersion` 支持上传后直接标记为可用。
- 已有正式视觉参考保持自动接入和自动通过。

- [ ] 首帧、尾帧和关键帧上传后直接标记为可用。
- [ ] 移除“通过/退回”主流程操作，保留重新上传和固定到画布。
- [ ] 满足必需画面后直接显示“生成外部任务”。

### Task 3: 下一步文案

**Files:**
- Modify: `web/src/components/canvas/shot-workbench/shot-preflight-summary.tsx`
- Modify: `web/src/components/canvas/shot-workbench/canvas-shot-workbench.tsx`
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Modify: `docs/content/docs/progress/ai-comic-production-acceptance.mdx`

- [ ] 将“确认后自动带入”改为“已自动带入”或“解决阻塞后自动带入”。
- [ ] 右栏只显示当前下一步和真实阻塞，不再显示内部确认理由。
- [ ] 更新可验收行为与变更记录。

### Task 4: 静态验证

- [ ] 运行 `git diff --check`。
- [ ] 用 Vite 请求 `/canvas` 和所有变更模块，要求 HTTP `200`。
- [ ] 用领域层最小数据脚本验证：无阻塞镜头自动获得 approved 方案和视觉参考；有阻塞镜头不推进。
