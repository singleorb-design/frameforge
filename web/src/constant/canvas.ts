import { CanvasNodeType } from "@/types/canvas";
import type { CanvasNodeMetadata } from "@/types/canvas";
import { getNodeSpec as getRegistryNodeSpec } from "@/lib/canvas/node-registry";

type CanvasNodeSpec = {
    width: number;
    height: number;
    title: string;
    metadata?: CanvasNodeMetadata;
};

export const NODE_DEFAULT_SIZE = {
    [CanvasNodeType.Image]: { width: 340, height: 240, title: "图片" },
    [CanvasNodeType.Text]: { width: 340, height: 240, title: "文本" },
    [CanvasNodeType.Script]: { width: 380, height: 260, title: "剧本" },
    [CanvasNodeType.MarkdownDocument]: { width: 380, height: 260, title: "文档" },
    [CanvasNodeType.CharacterGroup]: { width: 360, height: 240, title: "人物卡组" },
    [CanvasNodeType.CharacterCard]: { width: 320, height: 220, title: "人物卡" },
    [CanvasNodeType.CharacterAssetGroup]: { width: 360, height: 240, title: "角色资产包" },
    [CanvasNodeType.SceneGroup]: { width: 360, height: 220, title: "场景卡组" },
    [CanvasNodeType.SceneCard]: { width: 320, height: 220, title: "场景卡" },
    [CanvasNodeType.PropGroup]: { width: 360, height: 220, title: "道具卡组" },
    [CanvasNodeType.PropCard]: { width: 320, height: 220, title: "道具卡" },
    [CanvasNodeType.Shotboard]: { width: 380, height: 240, title: "分镜表" },
    [CanvasNodeType.Shot]: { width: 320, height: 220, title: "镜头" },
    [CanvasNodeType.Config]: { width: 340, height: 240, title: "生成配置" },
    [CanvasNodeType.Video]: { width: 420, height: 236, title: "视频" },
    [CanvasNodeType.Audio]: { width: 340, height: 120, title: "音频" },
    [CanvasNodeType.Group]: { width: 760, height: 480, title: "组" },
} satisfies Record<CanvasNodeType, { width: number; height: number; title: string }>;

export const NODE_SPECS = {
    [CanvasNodeType.Image]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Image],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Text]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Text],
        metadata: { content: "", status: "idle", fontSize: 14 },
    },
    [CanvasNodeType.Script]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Script],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.MarkdownDocument]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.MarkdownDocument],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.CharacterGroup]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.CharacterGroup],
        metadata: { status: "idle", characterBatchExpanded: true, characterChildIds: [] },
    },
    [CanvasNodeType.CharacterCard]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.CharacterCard],
        metadata: { status: "idle" },
    },
    [CanvasNodeType.CharacterAssetGroup]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.CharacterAssetGroup],
        metadata: { status: "idle", characterAssetExpanded: true, characterAssetChildIds: [], assetKinds: ["three-view", "expression-grid", "shot-scale"] },
    },
    [CanvasNodeType.SceneGroup]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.SceneGroup],
        metadata: { status: "idle", productionKind: "scene", productionExpanded: true, productionChildIds: [] },
    },
    [CanvasNodeType.SceneCard]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.SceneCard],
        metadata: { status: "idle", productionKind: "scene" },
    },
    [CanvasNodeType.PropGroup]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.PropGroup],
        metadata: { status: "idle", productionKind: "prop", productionExpanded: true, productionChildIds: [] },
    },
    [CanvasNodeType.PropCard]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.PropCard],
        metadata: { status: "idle", productionKind: "prop" },
    },
    [CanvasNodeType.Shotboard]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Shotboard],
        metadata: { status: "idle", productionKind: "shotboard", productionExpanded: true, productionChildIds: [] },
    },
    [CanvasNodeType.Shot]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Shot],
        metadata: { status: "idle", productionKind: "shot" },
    },
    [CanvasNodeType.Config]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Config],
        metadata: { content: "", status: "idle", generationMode: "image", textOutputType: "text" },
    },
    [CanvasNodeType.Video]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Video],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Audio]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Audio],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Group]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Group],
        metadata: { status: "idle" },
    },
} satisfies Record<CanvasNodeType, CanvasNodeSpec>;

// 内置类型返回内置 spec;插件类型从注册表解析
export function getNodeSpec(type: string) {
    if ((Object.values(CanvasNodeType) as string[]).includes(type)) return NODE_SPECS[type as CanvasNodeType];
    const spec = getRegistryNodeSpec(type);
    return { width: spec.width, height: spec.height, title: spec.title, metadata: spec.metadata };
}
