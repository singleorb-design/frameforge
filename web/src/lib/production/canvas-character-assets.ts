import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import type { CharacterCardSnapshot, ProductionProject, VersionedRecord } from "@/types/production";

export function syncCanvasCharacterAssets(production: ProductionProject, nodes: CanvasNodeData[], now: string) {
    let characters = production.characters;
    let productionChanged = false;
    let nodesChanged = false;
    const nextNodes = nodes.map((node) => {
        if (node.type !== CanvasNodeType.CharacterCard || !node.metadata?.name?.trim()) return node;
        const id = node.metadata.productionRecordId || node.id;
        const snapshot = characterSnapshot(node);
        const existing = characters.find((record) => record.id === id);
        let version = existing?.currentVersion || 1;
        if (!existing) {
            characters = [...characters, versionedCharacter(id, version, snapshot, now)];
            productionChanged = true;
        } else {
            const current = existing.versions.find((item) => item.version === existing.currentVersion);
            if (!current || JSON.stringify(current.data) !== JSON.stringify(snapshot)) {
                version = Math.max(0, ...existing.versions.map((item) => item.version)) + 1;
                characters = characters.map((record) =>
                    record.id === id
                        ? { ...record, currentVersion: version, versions: [...record.versions, { version, data: snapshot, createdAt: now }] }
                        : record,
                );
                productionChanged = true;
            }
        }
        if (node.metadata.productionRecordId === id && node.metadata.productionVersion === version) return node;
        nodesChanged = true;
        return { ...node, metadata: { ...node.metadata, productionRecordId: id, productionVersion: version } };
    });
    return {
        production: productionChanged ? { ...production, characters } : production,
        nodes: nodesChanged ? nextNodes : nodes,
    };
}

function characterSnapshot(node: CanvasNodeData): CharacterCardSnapshot {
    return {
        sourceNodeId: node.id,
        name: node.metadata?.name?.trim() || node.title,
        role: node.metadata?.role?.trim() || "",
        appearance: [node.metadata?.body, node.metadata?.face, node.metadata?.hair].filter(Boolean).join("，"),
        clothing: node.metadata?.clothing?.trim() || "",
        props: node.metadata?.props || [],
        positivePrompt: node.metadata?.positivePrompt?.trim() || "",
        negativePrompt: node.metadata?.negativePrompt?.trim() || "",
        consistencyLocks: node.metadata?.consistencyLocks || [],
    };
}

function versionedCharacter(
    id: string,
    version: number,
    data: CharacterCardSnapshot,
    createdAt: string,
): VersionedRecord<CharacterCardSnapshot> {
    return { id, currentVersion: version, versions: [{ version, data, createdAt }] };
}
