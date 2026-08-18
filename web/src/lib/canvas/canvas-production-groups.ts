import type { CanvasNodeData } from "@/types/canvas";

export function productionGroupChildIds(node: CanvasNodeData) {
    return node.metadata?.productionChildIds || [];
}

export function productionGroupRootId(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    const rootId = node.metadata?.productionRootId;
    if (!rootId) return null;
    const root = nodes.find((item) => item.id === rootId);
    return root?.metadata?.productionChildIds?.includes(node.id) ? root.id : null;
}

export function isHiddenProductionChild(node: CanvasNodeData, nodes: CanvasNodeData[], collapsingIds?: Set<string>) {
    const rootId = productionGroupRootId(node, nodes);
    if (!rootId) return false;
    if (collapsingIds?.has(rootId)) return false;
    const root = nodes.find((item) => item.id === rootId);
    return Boolean(root && root.metadata?.productionExpanded === false);
}

export function productionChildMotion(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    const rootId = productionGroupRootId(node, nodes);
    if (!rootId) return null;
    const root = nodes.find((item) => item.id === rootId);
    if (!root) return null;
    const index = productionGroupChildIds(root).indexOf(node.id);
    const stackX = root.position.x + 34 + Math.max(index, 0) * 14;
    const stackY = root.position.y + 14 + Math.max(index, 0) * 8;
    return { x: stackX - node.position.x, y: stackY - node.position.y, index: Math.max(index, 0) };
}
