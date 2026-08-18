import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import type { ProductionImportResult } from "@/lib/production/generated-production";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

export type ProductionCanvasProjection = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    rootNodeIds: string[];
    shotboardNodeId: string;
};

type ProjectionRecord<T> = {
    id: string;
    currentVersion: number;
    versions: Array<{ version: number; data: T }>;
};

export function projectProductionToCanvas(imported: ProductionImportResult, source: CanvasNodeData, idFactory: () => string): ProductionCanvasProjection {
    const gap = 120;
    const columnX = source.position.x + source.width + gap;
    const sceneRecords = imported.sceneRecordIds.map((id) => requiredRecord(imported.production.scenes.find((item) => item.id === id), `场景 ${id}`));
    const propRecords = imported.propRecordIds.map((id) => requiredRecord(imported.production.props.find((item) => item.id === id), `道具 ${id}`));
    const nodes: CanvasNodeData[] = [];
    const connections: CanvasConnection[] = [];
    const rootNodeIds: string[] = [];
    const sceneRootY = source.position.y;
    const propRootY = sceneRootY + groupBandHeight(sceneRecords.length, CanvasNodeType.SceneGroup, CanvasNodeType.SceneCard);
    const shotboardRootY = propRootY + groupBandHeight(propRecords.length, CanvasNodeType.PropGroup, CanvasNodeType.PropCard);

    const sceneGroup = createRecordGroup({
        source,
        type: CanvasNodeType.SceneGroup,
        title: "场景卡组",
        position: { x: columnX, y: sceneRootY },
        kind: "scene",
        recordOwnerId: imported.scriptBreakdown.id,
        records: sceneRecords,
        childType: CanvasNodeType.SceneCard,
        childTitle: (record) => record.versions.find((version) => version.version === record.currentVersion)?.data.name || "场景卡",
        idFactory,
    });
    if (sceneGroup) appendGroup(sceneGroup);

    const propGroup = createRecordGroup({
        source,
        type: CanvasNodeType.PropGroup,
        title: "道具卡组",
        position: { x: columnX, y: propRootY },
        kind: "prop",
        recordOwnerId: imported.scriptBreakdown.id,
        records: propRecords,
        childType: CanvasNodeType.PropCard,
        childTitle: (record) => record.versions.find((version) => version.version === record.currentVersion)?.data.name || "道具卡",
        idFactory,
    });
    if (propGroup) appendGroup(propGroup);

    const shotboardRootId = idFactory();
    const shotSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Shot];
    const shotboard = imported.shotboard;
    const orderedShots = shotboard.scenes
        .slice()
        .sort((a, b) => a.order - b.order)
        .flatMap((scene) => scene.shotIds.map((id) => requiredRecord(shotboard.shots.find((shot) => shot.id === id), `镜头 ${id}`)));
    const shotNodes: CanvasNodeData[] = orderedShots.map((shot, index) => ({
        id: idFactory(),
        type: CanvasNodeType.Shot,
        title: `${shot.code} · ${shot.narrativePurpose}`,
        position: childPosition({ x: columnX, y: shotboardRootY }, NODE_DEFAULT_SIZE[CanvasNodeType.Shotboard].width, index, shotSpec.width, shotSpec.height),
        width: shotSpec.width,
        height: shotSpec.height,
        metadata: {
            status: "success",
            productionKind: "shot",
            productionRecordId: shot.id,
            productionVersion: shotboard.version,
            productionRootId: shotboardRootId,
        },
    }));
    const shotboardSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Shotboard];
    const shotboardRoot: CanvasNodeData = {
        id: shotboardRootId,
        type: CanvasNodeType.Shotboard,
        title: `第 ${shotboard.episodeNumber} 集 · ${shotboard.title}`,
        position: { x: columnX, y: shotboardRootY },
        width: shotboardSpec.width,
        height: shotboardSpec.height,
        metadata: {
            status: "success",
            productionKind: "shotboard",
            productionRecordId: shotboard.id,
            productionVersion: shotboard.version,
            productionExpanded: true,
            productionChildIds: shotNodes.map((node) => node.id),
        },
    };
    nodes.push(shotboardRoot, ...shotNodes);
    rootNodeIds.push(shotboardRoot.id);
    connections.push(connection(source.id, shotboardRoot.id, idFactory), ...shotNodes.map((node) => connection(shotboardRoot.id, node.id, idFactory)));

    return { nodes, connections, rootNodeIds, shotboardNodeId: shotboardRoot.id };

    function appendGroup(group: { root: CanvasNodeData; children: CanvasNodeData[]; connections: CanvasConnection[] }) {
        nodes.push(group.root, ...group.children);
        connections.push(...group.connections);
        rootNodeIds.push(group.root.id);
    }
}

function createRecordGroup<T>({
    source,
    type,
    title,
    position,
    kind,
    recordOwnerId,
    records,
    childType,
    childTitle,
    idFactory,
}: {
    source: CanvasNodeData;
    type: CanvasNodeType.SceneGroup | CanvasNodeType.PropGroup;
    title: string;
    position: { x: number; y: number };
    kind: "scene" | "prop";
    recordOwnerId: string;
    records: Array<ProjectionRecord<T>>;
    childType: CanvasNodeType.SceneCard | CanvasNodeType.PropCard;
    childTitle: (record: ProjectionRecord<T>) => string;
    idFactory: () => string;
}) {
    if (!records.length) return null;
    const rootId = idFactory();
    const rootSpec = NODE_DEFAULT_SIZE[type];
    const childSpec = NODE_DEFAULT_SIZE[childType];
    const children: CanvasNodeData[] = records.map((record, index) => ({
        id: idFactory(),
        type: childType,
        title: childTitle(record),
        position: childPosition(position, rootSpec.width, index, childSpec.width, childSpec.height),
        width: childSpec.width,
        height: childSpec.height,
        metadata: {
            status: "success",
            productionKind: kind,
            productionRecordId: record.id,
            productionVersion: record.currentVersion,
            productionRootId: rootId,
        },
    }));
    const root: CanvasNodeData = {
        id: rootId,
        type,
        title,
        position,
        width: rootSpec.width,
        height: rootSpec.height,
        metadata: {
            status: "success",
            productionKind: kind,
            productionRecordId: recordOwnerId,
            productionRecordIds: records.map((record) => record.id),
            productionExpanded: true,
            productionChildIds: children.map((node) => node.id),
        },
    };
    return {
        root,
        children,
        connections: [connection(source.id, root.id, idFactory), ...children.map((node) => connection(root.id, node.id, idFactory))],
    };
}

function childPosition(rootPosition: { x: number; y: number }, rootWidth: number, index: number, width: number, height: number) {
    return {
        x: rootPosition.x + rootWidth + 120 + (index % 2) * (width + 36),
        y: rootPosition.y + Math.floor(index / 2) * (height + 32),
    };
}

function groupBandHeight(count: number, rootType: CanvasNodeType.SceneGroup | CanvasNodeType.PropGroup, childType: CanvasNodeType.SceneCard | CanvasNodeType.PropCard) {
    if (!count) return 0;
    const rows = Math.ceil(count / 2);
    return Math.max(NODE_DEFAULT_SIZE[rootType].height, rows * (NODE_DEFAULT_SIZE[childType].height + 32)) + 96;
}

function connection(fromNodeId: string, toNodeId: string, idFactory: () => string): CanvasConnection {
    return { id: idFactory(), fromNodeId, toNodeId };
}

function requiredRecord<T>(value: T | undefined, label: string): T {
    if (!value) throw new Error(`${label}不存在，无法创建画布节点`);
    return value;
}
