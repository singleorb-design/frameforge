import { BookOpenText, Clapperboard, FileText, FileType, Group, Image as ImageIcon, Images, Map, Music2, Package, ScrollText, Settings2, UsersRound, UserRound, Video } from "lucide-react";

import { NODE_SPECS } from "@/constant/canvas";
import { CanvasCharacterAssetGroupContent } from "@/components/canvas/canvas-character-asset-group-content";
import { CanvasCharacterNodeContent } from "@/components/canvas/canvas-character-node-content";
import { CanvasMarkdownNodeContent } from "@/components/canvas/canvas-markdown-node-content";
import { CanvasProductionNodeContent } from "@/components/canvas/canvas-production-node-content";
import { registerNodeDefinitions } from "@/lib/canvas/node-registry";
import { shotboardToMarkdown } from "@/lib/production/shotboard-markdown";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import type { CanvasNodeContext } from "@/types/canvas-plugin";
import type { CanvasNodeDefinition, CanvasNodeResource } from "@/types/canvas-plugin";
import type { ProductionProject } from "@/types/production";

// 内置节点的可扩展元数据(尺寸/初始 metadata 复用 NODE_SPECS)。
// 多数内置节点仍由 canvas-node 内部渲染器负责,部分内置节点可提供注册 Content。
function builtinResource(node: CanvasNodeData, production?: ProductionProject): CanvasNodeResource | null {
    if (node.type === CanvasNodeType.Image && node.metadata?.content) return { kind: "image", url: node.metadata.content };
    if (node.type === CanvasNodeType.Video && node.metadata?.content) return { kind: "video", url: node.metadata.content };
    if (node.type === CanvasNodeType.Audio && node.metadata?.content) return { kind: "audio", url: node.metadata.content };
    if (node.type === CanvasNodeType.Text && (node.metadata?.content || node.metadata?.prompt)) return { kind: "text", text: node.metadata.content || node.metadata.prompt };
    if (node.type === CanvasNodeType.Script && node.metadata?.content) return { kind: "text", text: node.metadata.content };
    if (node.type === CanvasNodeType.MarkdownDocument && node.metadata?.content) return { kind: "text", text: node.metadata.content };
    if (node.type === CanvasNodeType.CharacterCard && node.metadata?.name) return { kind: "text", text: characterCardResourceText(node) };
    if (production && node.type === CanvasNodeType.SceneGroup) return { kind: "text", text: productionGroupResourceText(node, production, "scene") };
    if (production && node.type === CanvasNodeType.PropGroup) return { kind: "text", text: productionGroupResourceText(node, production, "prop") };
    if (production && node.type === CanvasNodeType.Shotboard && node.metadata?.productionRecordId && production.shotboards.some((item) => item.id === node.metadata?.productionRecordId)) {
        return { kind: "text", text: shotboardToMarkdown(production, node.metadata.productionRecordId) };
    }
    if (production && node.type === CanvasNodeType.SceneCard) return { kind: "text", text: productionCardResourceText(node, production, "scene") };
    if (production && node.type === CanvasNodeType.PropCard) return { kind: "text", text: productionCardResourceText(node, production, "prop") };
    if (production && node.type === CanvasNodeType.Shot) return { kind: "text", text: shotResourceText(node, production) };
    return null;
}

const iconClass = "size-5";
const scriptIcon = <BookOpenText className={iconClass} />;
const markdownDocumentIcon = <FileType className={iconClass} />;

function ScriptNodeContent({ ctx }: { ctx: CanvasNodeContext }) {
    return <CanvasMarkdownNodeContent ctx={ctx} icon={scriptIcon} labels={{ fallbackTitle: "剧本", emptyTitle: "Markdown 剧本", emptyBody: "双击全屏粘贴 Markdown 剧本" }} />;
}

function MarkdownDocumentNodeContent({ ctx }: { ctx: CanvasNodeContext }) {
    return <CanvasMarkdownNodeContent ctx={ctx} icon={markdownDocumentIcon} labels={{ fallbackTitle: "文档", emptyTitle: "Markdown 文档", emptyBody: "双击全屏粘贴 Markdown 文档" }} />;
}

const BUILTIN_DEFINITIONS: CanvasNodeDefinition[] = [
    { type: CanvasNodeType.Text, title: "文本", icon: <FileText className={iconClass} />, minimapColor: undefined, resource: builtinResource },
    { type: CanvasNodeType.Script, title: "剧本", icon: scriptIcon, minimapColor: "#f59e0b", Content: ScriptNodeContent, hidePanel: true, resource: builtinResource },
    { type: CanvasNodeType.MarkdownDocument, title: "文档", icon: markdownDocumentIcon, minimapColor: "#38bdf8", Content: MarkdownDocumentNodeContent, hidePanel: true, resource: builtinResource },
    { type: CanvasNodeType.CharacterGroup, title: "角色设定", icon: <UsersRound className={iconClass} />, minimapColor: "#ec4899", Content: CanvasCharacterNodeContent, hidePanel: true, showInCreateMenu: false },
    { type: CanvasNodeType.CharacterCard, title: "角色设定", icon: <UserRound className={iconClass} />, minimapColor: "#f43f5e", Content: CanvasCharacterNodeContent, showInCreateMenu: false, resource: builtinResource },
    { type: CanvasNodeType.CharacterAssetGroup, title: "视觉参考", icon: <Images className={iconClass} />, minimapColor: "#8b5cf6", Content: CanvasCharacterAssetGroupContent, hidePanel: true, showInCreateMenu: false },
    {
        type: CanvasNodeType.SceneGroup,
        title: "场景卡组",
        icon: <Map className={iconClass} />,
        minimapColor: "#14b8a6",
        Content: CanvasProductionNodeContent,
        hidePanel: true,
        showInCreateMenu: false,
        resource: builtinResource,
        onDoubleClick: toggleProductionGroup,
    },
    { type: CanvasNodeType.SceneCard, title: "场景卡", icon: <Map className={iconClass} />, minimapColor: "#2dd4bf", Content: CanvasProductionNodeContent, hidePanel: true, showInCreateMenu: false, resource: builtinResource },
    {
        type: CanvasNodeType.PropGroup,
        title: "道具卡组",
        icon: <Package className={iconClass} />,
        minimapColor: "#eab308",
        Content: CanvasProductionNodeContent,
        hidePanel: true,
        showInCreateMenu: false,
        resource: builtinResource,
        onDoubleClick: toggleProductionGroup,
    },
    { type: CanvasNodeType.PropCard, title: "道具卡", icon: <Package className={iconClass} />, minimapColor: "#facc15", Content: CanvasProductionNodeContent, hidePanel: true, showInCreateMenu: false, resource: builtinResource },
    {
        type: CanvasNodeType.Shotboard,
        title: "分镜表",
        icon: <ScrollText className={iconClass} />,
        minimapColor: "#0ea5e9",
        Content: CanvasProductionNodeContent,
        hidePanel: true,
        showInCreateMenu: false,
        resource: builtinResource,
        onDoubleClick: (ctx) => {
            ctx.emit("shotboard-workbench:open", { nodeId: ctx.node.id });
            return true;
        },
    },
    {
        type: CanvasNodeType.Shot,
        title: "镜头",
        icon: <Clapperboard className={iconClass} />,
        minimapColor: "#f59e0b",
        Content: CanvasProductionNodeContent,
        hidePanel: true,
        showInCreateMenu: false,
        resource: builtinResource,
        onDoubleClick: (ctx) => {
            ctx.emit("shot:open", { nodeId: ctx.node.id });
            return true;
        },
    },
    { type: CanvasNodeType.Image, title: "图片", icon: <ImageIcon className={iconClass} />, minimapColor: "#10b981", keepAspectRatio: (node: CanvasNodeData) => !node.metadata?.freeResize, resource: builtinResource },
    { type: CanvasNodeType.Video, title: "视频", icon: <Video className={iconClass} />, minimapColor: "#f97316", keepAspectRatio: () => true, resource: builtinResource },
    { type: CanvasNodeType.Audio, title: "音频", icon: <Music2 className={iconClass} />, minimapColor: "#a855f7", resource: builtinResource },
    { type: CanvasNodeType.Config, title: "生成配置", icon: <Settings2 className={iconClass} />, minimapColor: "#60a5fa" },
    { type: CanvasNodeType.Group, title: "组", icon: <Group className={iconClass} />, minimapColor: "#94a3b8" },
].map((def) => {
    const spec = NODE_SPECS[def.type];
    return { ...def, title: spec.title, defaultSize: { width: spec.width, height: spec.height }, defaultMetadata: spec.metadata };
});

let registered = false;
export function registerBuiltinNodes() {
    if (registered) return;
    registered = true;
    registerNodeDefinitions(BUILTIN_DEFINITIONS, "builtin");
}

function characterCardResourceText(node: CanvasNodeData) {
    const metadata = node.metadata || {};
    return [
        `角色名：${metadata.name || node.title || "未命名角色"}`,
        metadata.role ? `角色定位：${metadata.role}` : "",
        metadata.positivePrompt ? `正向提示词：${metadata.positivePrompt}` : "",
        metadata.negativePrompt ? `负向提示词：${metadata.negativePrompt}` : "",
        metadata.consistencyLocks?.length ? `一致性锁定：${metadata.consistencyLocks.join("、")}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}

function productionGroupResourceText(_node: CanvasNodeData, production: ProductionProject, kind: "scene" | "prop") {
    const memberIds = new Set(_node.metadata?.productionRecordIds || []);
    const records = (kind === "scene" ? production.scenes : production.props).filter((record) => memberIds.has(record.id));
    return JSON.stringify(
        records.flatMap((record) => {
            const version = record.versions.find((item) => item.version === record.currentVersion);
            return version ? [{ id: record.id, version: version.version, ...version.data }] : [];
        }),
        null,
        2,
    );
}

function productionCardResourceText(node: CanvasNodeData, production: ProductionProject, kind: "scene" | "prop") {
    if (kind === "scene") {
        const record = production.scenes.find((item) => item.id === node.metadata?.productionRecordId);
        const version = record?.versions.find((item) => item.version === node.metadata?.productionVersion);
        return version ? JSON.stringify({ id: record.id, version: version.version, ...version.data }, null, 2) : "";
    }
    const record = production.props.find((item) => item.id === node.metadata?.productionRecordId);
    const version = record?.versions.find((item) => item.version === node.metadata?.productionVersion);
    return version ? JSON.stringify({ id: record.id, version: version.version, ...version.data }, null, 2) : "";
}

function shotResourceText(node: CanvasNodeData, production: ProductionProject) {
    const shot = production.shotboards.flatMap((shotboard) => shotboard.shots).find((item) => item.id === node.metadata?.productionRecordId);
    return shot ? JSON.stringify(shot, null, 2) : "";
}

function toggleProductionGroup(ctx: CanvasNodeContext) {
    ctx.emit("production-group:toggle", { nodeId: ctx.node.id });
    return true;
}
