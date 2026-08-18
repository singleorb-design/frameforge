import type { RequiredControlAsset, ShotGenerationMode, ShotProductionStatus } from "@/types/production";

export const shotModeLabels: Record<ShotGenerationMode, string> = {
    "first-frame": "首帧",
    "first-last-frame": "首尾帧",
    "multi-frame": "智能多帧",
    "omni-reference": "全能参考",
};

export const shotStatusLabels: Record<ShotProductionStatus, string> = {
    draft: "需要处理",
    "shot-approved": "正在准备",
    "plan-approved": "准备画面",
    "control-assets-ready": "可外部生成",
    "task-published": "等待回传",
    "external-generating": "外部生成中",
    "candidate-review": "候选待验收",
    "edit-ready": "剪辑就绪",
    blocked: "已阻塞",
};

export const controlAssetLabels: Record<RequiredControlAsset["kind"], string> = {
    "first-frame": "首帧",
    "last-frame": "尾帧",
    keyframes: "关键帧序列",
    "identity-reference": "人物参考",
    "scene-reference": "场景参考",
    "prop-reference": "道具参考",
    "action-reference": "动作参考",
    "camera-reference": "运镜参考",
    "audio-reference": "音频参考",
};
