import { extractScriptCharacterNames } from "@/lib/production/generated-production";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import type { ProductionProject } from "@/types/production";

export function syncScriptBreakdownCharacterNames(production: ProductionProject, nodes: CanvasNodeData[]) {
    const scripts = new Map(
        nodes
            .filter((node) => node.type === CanvasNodeType.Script && node.metadata?.content)
            .map((node) => [node.id, node.metadata?.content || ""]),
    );
    let changed = false;
    const scriptBreakdowns = production.scriptBreakdowns.map((breakdown) => {
        if (breakdown.characterNames.length) return breakdown;
        const characterNames = extractScriptCharacterNames(scripts.get(breakdown.sourceScriptNodeId) || "");
        if (!characterNames.length) return breakdown;
        changed = true;
        return { ...breakdown, characterNames };
    });
    return { production: changed ? { ...production, scriptBreakdowns } : production };
}
