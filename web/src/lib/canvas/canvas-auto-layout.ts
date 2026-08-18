import { Graph, layout } from "@dagrejs/dagre";

import { nodeBounds } from "@/lib/canvas/canvas-node-geometry";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

type LayoutUnit = {
    id: string;
    root: CanvasNodeData;
    members: CanvasNodeData[];
    layoutBounds: ReturnType<typeof nodeBounds>;
    relativePositions?: Map<string, { x: number; y: number }>;
};

export type CanvasAutoLayoutResult = {
    nodes: CanvasNodeData[];
    organizedNodeIds: string[];
};

export function autoLayoutCanvas(nodes: CanvasNodeData[], connections: CanvasConnection[], selectedNodeIds: Set<string>): CanvasAutoLayoutResult {
    const scopeIds = resolveScopeIds(nodes, selectedNodeIds);
    if (!scopeIds.size) return { nodes, organizedNodeIds: [] };

    const units = buildLayoutUnits(nodes, scopeIds);
    if (!units.length) return { nodes, organizedNodeIds: [] };

    const unitByNodeId = new Map<string, string>();
    units.forEach((unit) => unit.members.forEach((node) => unitByNodeId.set(node.id, unit.id)));
    const graph = new Graph({ multigraph: true }).setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: "LR", ranksep: 120, nodesep: 56, edgesep: 20, marginx: 0, marginy: 0, ranker: "network-simplex" });
    units.forEach((unit) => graph.setNode(unit.id, { width: unit.layoutBounds.right - unit.layoutBounds.left, height: unit.layoutBounds.bottom - unit.layoutBounds.top }));

    connections.forEach((connection) => {
        const from = unitByNodeId.get(connection.fromNodeId);
        const to = unitByNodeId.get(connection.toNodeId);
        if (!from || !to || from === to) return;
        graph.setEdge(from, to, {}, connection.id);
    });
    layout(graph);

    const originalBounds = nodeBounds(units.flatMap((unit) => unit.members));
    const layoutPositions = new Map<string, { x: number; y: number }>();
    units.forEach((unit) => {
        const result = graph.node(unit.id);
        layoutPositions.set(unit.id, { x: result.x - result.width / 2, y: result.y - result.height / 2 });
    });
    const minX = Math.min(...Array.from(layoutPositions.values()).map((position) => position.x));
    const minY = Math.min(...Array.from(layoutPositions.values()).map((position) => position.y));

    const nextPositions = new Map<string, { x: number; y: number }>();
    units.forEach((unit) => {
        const layoutPosition = layoutPositions.get(unit.id)!;
        const nextLeft = originalBounds.left + layoutPosition.x - minX;
        const nextTop = originalBounds.top + layoutPosition.y - minY;
        const dx = nextLeft - unit.layoutBounds.left;
        const dy = nextTop - unit.layoutBounds.top;
        unit.members.forEach((node) => {
            const relative = unit.relativePositions?.get(node.id);
            nextPositions.set(node.id, relative ? { x: nextLeft + relative.x, y: nextTop + relative.y } : { x: node.position.x + dx, y: node.position.y + dy });
        });
    });

    return {
        nodes: nodes.map((node) => {
            const position = nextPositions.get(node.id);
            return position ? { ...node, position } : node;
        }),
        organizedNodeIds: Array.from(nextPositions.keys()),
    };
}

function resolveScopeIds(nodes: CanvasNodeData[], selectedNodeIds: Set<string>) {
    if (!selectedNodeIds.size) return new Set(nodes.map((node) => node.id));
    const ids = new Set(selectedNodeIds);
    nodes.forEach((node) => {
        if (!ids.has(node.id)) return;
        node.metadata?.batchChildIds?.forEach((id) => ids.add(id));
        node.metadata?.characterChildIds?.forEach((id) => ids.add(id));
        node.metadata?.characterAssetChildIds?.forEach((id) => ids.add(id));
        node.metadata?.productionChildIds?.forEach((id) => ids.add(id));
        if (node.type === CanvasNodeType.Group) nodes.forEach((child) => child.metadata?.groupId === node.id && ids.add(child.id));
    });
    return ids;
}

function buildLayoutUnits(nodes: CanvasNodeData[], scopeIds: Set<string>) {
    const scopedNodes = nodes.filter((node) => scopeIds.has(node.id));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const claimedIds = new Set<string>();
    const units: LayoutUnit[] = [];

    scopedNodes.forEach((node) => {
        if (claimedIds.has(node.id) || isOwnedChild(node, nodeById)) return;
        const memberIds = new Set([node.id]);
        if (node.type === CanvasNodeType.Group) nodes.forEach((child) => child.metadata?.groupId === node.id && scopeIds.has(child.id) && memberIds.add(child.id));
        node.metadata?.batchChildIds?.forEach((id) => scopeIds.has(id) && memberIds.add(id));
        node.metadata?.characterChildIds?.forEach((id) => scopeIds.has(id) && memberIds.add(id));
        node.metadata?.characterAssetChildIds?.forEach((id) => scopeIds.has(id) && memberIds.add(id));
        node.metadata?.productionChildIds?.forEach((id) => scopeIds.has(id) && memberIds.add(id));
        const members = Array.from(memberIds)
            .map((id) => nodeById.get(id))
            .filter((item): item is CanvasNodeData => Boolean(item));
        const includeChildrenInLayout =
            node.type === CanvasNodeType.Group ||
            (node.metadata?.batchChildIds?.length ? node.metadata.imageBatchExpanded !== false : false) ||
            (node.metadata?.characterChildIds?.length ? node.metadata.characterBatchExpanded !== false : false) ||
            (node.metadata?.characterAssetChildIds?.length ? node.metadata.characterAssetExpanded !== false : false) ||
            (node.metadata?.productionChildIds?.length ? node.metadata.productionExpanded !== false : false);
        const relativePositions = includeChildrenInLayout && node.type !== CanvasNodeType.Group ? normalizeBatchMembers(node, members) : undefined;
        const layoutMembers = includeChildrenInLayout ? applyRelativePositions(node, members, relativePositions) : [node];
        members.forEach((member) => claimedIds.add(member.id));
        units.push({ id: node.id, root: node, members, layoutBounds: nodeBounds(layoutMembers), relativePositions });
    });

    scopedNodes.forEach((node) => {
        if (claimedIds.has(node.id)) return;
        claimedIds.add(node.id);
        units.push({ id: node.id, root: node, members: [node], layoutBounds: nodeBounds([node]) });
    });
    return units;
}

function isOwnedChild(node: CanvasNodeData, nodeById: Map<string, CanvasNodeData>) {
    if (node.metadata?.groupId && nodeById.get(node.metadata.groupId)?.type === CanvasNodeType.Group) return true;
    if (node.type === CanvasNodeType.Image && node.metadata?.batchRootId && nodeById.get(node.metadata.batchRootId)?.type === CanvasNodeType.Image) return true;
    const characterRootId = node.metadata?.characterRootId || (node.type === CanvasNodeType.CharacterCard ? node.metadata?.batchRootId : undefined);
    if (characterRootId && nodeById.get(characterRootId)?.type === CanvasNodeType.CharacterGroup) return true;
    if (node.metadata?.characterAssetRootId && nodeById.get(node.metadata.characterAssetRootId)?.type === CanvasNodeType.CharacterAssetGroup) return true;
    if (node.metadata?.productionRootId && nodeById.get(node.metadata.productionRootId)?.metadata?.productionChildIds?.includes(node.id)) return true;
    return false;
}

function normalizeBatchMembers(root: CanvasNodeData, members: CanvasNodeData[]) {
    const positions = new Map<string, { x: number; y: number }>();
    positions.set(root.id, { x: 0, y: 0 });
    const children = orderedChildren(root, members);
    if (!children.length) return positions;
    const gapX = 120;
    const gapY = 32;
    const columns = 2;
    const childStartX = root.width + gapX;
    children.forEach((child, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const previousColumnWidth = column === 0 ? 0 : Math.max(...children.filter((_, childIndex) => childIndex % columns === 0).map((item) => item.width), 0) + gapY;
        const rowHeights = Array.from({ length: row }, (_, rowIndex) =>
            Math.max(...children.filter((_, childIndex) => Math.floor(childIndex / columns) === rowIndex).map((item) => item.height), 0),
        );
        positions.set(child.id, {
            x: childStartX + previousColumnWidth,
            y: rowHeights.reduce((sum, height) => sum + height + gapY, 0),
        });
    });
    return positions;
}

function orderedChildren(root: CanvasNodeData, members: CanvasNodeData[]) {
    const memberById = new Map(members.map((node) => [node.id, node]));
    const ids = root.metadata?.batchChildIds || root.metadata?.characterChildIds || root.metadata?.characterAssetChildIds || root.metadata?.productionChildIds || [];
    return ids.map((id) => memberById.get(id)).filter((node): node is CanvasNodeData => Boolean(node));
}

function applyRelativePositions(root: CanvasNodeData, members: CanvasNodeData[], positions?: Map<string, { x: number; y: number }>) {
    if (!positions) return members;
    return members.map((node) => {
        const relative = positions.get(node.id);
        return relative ? { ...node, position: { x: root.position.x + relative.x, y: root.position.y + relative.y } } : node;
    });
}
