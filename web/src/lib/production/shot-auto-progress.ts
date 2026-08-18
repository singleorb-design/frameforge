import { autoApproveUploadedControlAssets, syncAssetReferenceToBoundShots } from "@/lib/production/shot-control-assets";
import { confirmShotPlan, recommendShotMode } from "@/lib/production/shot-mode-recommender";
import { approveShot, findShotContext, validateShot } from "@/lib/production/shotboard-editor";
import type { ProductionProject } from "@/types/production";

export function autoPrepareShot(production: ProductionProject, shotboardId: string, shotId: string, now: string) {
    const { shot } = findShotContext(production, shotboardId, shotId);
    const hasBlockingIssue = shot.preflight.issues.some((issue) => issue.status === "open" && issue.severity === "blocking");
    if (hasBlockingIssue || validateShot(production, shotboardId, shotId).some((blocker) => blocker.severity === "error")) return production;

    let next = production;
    if (!shot.generationPlan || shot.generationPlan.status !== "approved") {
        const approved = shot.status === "shot-approved" || shot.status === "plan-approved"
            ? next
            : approveShot(next, shotboardId, shotId, now);
        const recommendation = recommendShotMode(approved, shotboardId, shotId, now);
        next = confirmShotPlan(approved, shotboardId, shotId, recommendation.mode, now);
    }
    next = next.assetReferences.reduce(
        (current, reference) => syncAssetReferenceToBoundShots(current, reference, now).production,
        next,
    );
    return autoApproveUploadedControlAssets(next, shotboardId, shotId, now);
}

export function autoPrepareAllShots(production: ProductionProject, now: string) {
    return production.shotboards.reduce(
        (current, shotboard) =>
            shotboard.shots.reduce(
                (next, shot) => autoPrepareShot(next, shotboard.id, shot.id, now),
                current,
            ),
        production,
    );
}
