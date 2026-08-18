import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { seedanceReferenceLabel } from "@/lib/seedance-video";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import type { ProductionProject } from "@/types/production";

export type CanvasResourceKind = "image" | "video" | "audio" | "text";

export type CanvasResourceReference = {
    id: string;
    nodeId: string;
    kind: CanvasResourceKind;
    label: string;
    title: string;
    previewUrl?: string;
    text?: string;
    active: boolean;
};

export function buildNodeMentionReferences(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[], production?: ProductionProject) {
    return labelResourceNodes(getMentionResourceNodes(node.id, nodes, connections, production), nodes, true, production);
}

export function getMentionResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], production?: ProductionProject) {
    const configInputs = getConnectedConfigResourceNodes(nodeId, nodes, connections, production);
    if (configInputs.length) return configInputs;
    const ownInputs = getContextResourceNodes(nodeId, nodes, connections, production);
    if (ownInputs.length) return ownInputs;
    const node = nodes.find((item) => item.id === nodeId);
    return node && isResourceNode(node, production) ? [node] : [];
}

export function getGenerationResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], production?: ProductionProject) {
    const configInputs = getConnectedConfigResourceNodes(nodeId, nodes, connections, production);
    if (configInputs.length) return configInputs;
    const ownInputs = getContextResourceNodes(nodeId, nodes, connections, production);
    if (ownInputs.length) return ownInputs;
    return [];
}

export function getCanvasNodeResourceText(node: CanvasNodeData, nodes: CanvasNodeData[], production?: ProductionProject): string | undefined {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt;
    if (node.type === CanvasNodeType.CharacterGroup) {
        const characters = (node.metadata?.characterChildIds || []).flatMap((id) => {
            const child = nodes.find((item) => item.id === id);
            if (!child?.metadata?.name) return [];
            return [
                {
                    id: child.metadata.productionRecordId || child.id,
                    sourceNodeId: child.id,
                    version: child.metadata.productionVersion || 1,
                    name: child.metadata.name,
                    role: child.metadata.role || "",
                    appearance: [child.metadata.body, child.metadata.face, child.metadata.hair].filter(Boolean).join("，"),
                    clothing: child.metadata.clothing || "",
                    props: child.metadata.props || [],
                    positivePrompt: child.metadata.positivePrompt || "",
                    negativePrompt: child.metadata.negativePrompt || "",
                    consistencyLocks: child.metadata.consistencyLocks || [],
                },
            ];
        });
        return characters.length ? JSON.stringify(characters, null, 2) : undefined;
    }
    const resource = getNodeDefinition(node.type)?.resource?.(node, production);
    return resource?.kind === "text" ? resource.text : undefined;
}

function getContextResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], production?: ProductionProject) {
    return connections
        .filter((connection) => connection.toNodeId === nodeId)
        .map((connection) => nodes.find((node) => node.id === connection.fromNodeId))
        .filter((node): node is CanvasNodeData => Boolean(node && isResourceNode(node, production)));
}

function getConnectedConfigResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], production?: ProductionProject) {
    const configConnection = connections.find((connection) => connection.fromNodeId === nodeId && nodes.find((node) => node.id === connection.toNodeId)?.type === CanvasNodeType.Config);
    if (!configConnection) return [];
    return getContextResourceNodes(configConnection.toNodeId, nodes, connections, production).filter((node) => node.id !== nodeId);
}

function labelResourceNodes(resourceNodes: CanvasNodeData[], allNodes: CanvasNodeData[], active: boolean, production?: ProductionProject) {
    const counts: Record<CanvasResourceKind, number> = { image: 0, video: 0, audio: 0, text: 0 };
    return resourceNodes.flatMap((node): CanvasResourceReference[] => {
        const kind = resourceKind(node, production);
        if (!kind) return [];
        const index = counts[kind]++;
        const label = labelForKind(kind, index);
        return [
            {
                id: node.id,
                nodeId: node.id,
                kind,
                label,
                title: node.title || label,
                previewUrl: node.metadata?.content,
                text: getCanvasNodeResourceText(node, allNodes, production),
                active,
            },
        ];
    });
}

function labelForKind(kind: CanvasResourceKind, index: number) {
    if (kind === "image") return imageReferenceLabel(index);
    if (kind === "video") return seedanceReferenceLabel("video", index);
    if (kind === "audio") return seedanceReferenceLabel("audio", index);
    return `文本${index + 1}`;
}

function isResourceNode(node: CanvasNodeData, production?: ProductionProject) {
    return Boolean(resourceKind(node, production));
}

function resourceKind(node: CanvasNodeData, production?: ProductionProject): CanvasResourceKind | null {
    if (node.type === CanvasNodeType.Image && node.metadata?.content) return "image";
    if (node.type === CanvasNodeType.Video && node.metadata?.content) return "video";
    if (node.type === CanvasNodeType.Audio && node.metadata?.content) return "audio";
    if (node.type === CanvasNodeType.Text && (node.metadata?.content || node.metadata?.prompt)) return "text";
    if (node.type === CanvasNodeType.CharacterGroup && node.metadata?.characterChildIds?.length) return "text";
    // 插件节点通过 definition.resource 声明可作为输入
    return getNodeDefinition(node.type)?.resource?.(node, production)?.kind || null;
}
