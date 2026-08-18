import type { AssetReferenceImage, ProductionProject, ShotAssetKind } from "@/types/production";

export function addAssetReferenceImage(
    production: ProductionProject,
    input: Omit<AssetReferenceImage, "id" | "version" | "createdAt"> & { id: string; createdAt: string },
) {
    const version =
        production.assetReferences
            .filter((item) => item.assetId === input.assetId && item.assetVersion === input.assetVersion && item.kind === input.kind)
            .reduce((highest, item) => Math.max(highest, item.version), 0) + 1;
    const reference: AssetReferenceImage = { ...input, version };
    return { production: { ...production, assetReferences: [...production.assetReferences, reference] }, reference };
}

export function assetReferenceLabel(kind: AssetReferenceImage["kind"]) {
    if (kind === "standard") return "标准参考图";
    if (kind === "turnaround") return "三视图";
    if (kind === "expression") return "表情参考图";
    return "镜头参考图";
}

export function assetKindFromNodeType(type: string): ShotAssetKind | null {
    if (type === "character-card") return "character";
    if (type === "scene-card") return "scene";
    if (type === "prop-card") return "prop";
    return null;
}
