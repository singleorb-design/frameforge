import { applyShotPreflight, markShotPreflightFailed, markShotPreflightRunning, summarizeShotPreflight } from "@/lib/production/shot-preflight";
import {
    buildShotPreflightBatches,
    buildShotPreflightPrompt,
    parseShotPreflightOutput,
    type ShotPreflightRequestBatch,
} from "@/lib/production/shot-preflight-prompt";
import type { ProductionProject } from "@/types/production";

export type ShotPreflightRunResult = {
    production: ProductionProject;
    summary: ReturnType<typeof summarizeShotPreflight>;
};

export async function runShotPreflightBatches({
    production,
    shotboardId,
    preferredAssetIds,
    targetShotIds,
    request,
    signal,
    onProgress,
}: {
    production: ProductionProject;
    shotboardId: string;
    preferredAssetIds: string[];
    targetShotIds?: string[];
    request: (prompt: string, batch: ShotPreflightRequestBatch) => Promise<string>;
    signal?: AbortSignal;
    onProgress?: (production: ProductionProject) => void;
}): Promise<ShotPreflightRunResult> {
    const batches = buildShotPreflightBatches(production, shotboardId, preferredAssetIds, targetShotIds);
    let current = markShotPreflightRunning(
        production,
        shotboardId,
        batches.flatMap((batch) => batch.shots.map((item) => item.shot.id)),
        batches[0]?.id || `preflight-${shotboardId}`,
        new Date().toISOString(),
    );
    onProgress?.(current);
    const results: Array<
        | { batch: ShotPreflightRequestBatch; patches: ReturnType<typeof parseShotPreflightOutput> }
        | { batch: ShotPreflightRequestBatch; error: string }
    > = new Array(batches.length);
    let cursor = 0;
    const worker = async () => {
        while (cursor < batches.length) {
            if (signal?.aborted) throw new DOMException("请求已取消", "AbortError");
            const index = cursor;
            cursor += 1;
            const batch = batches[index];
            try {
                const output = await request(buildShotPreflightPrompt(batch), batch);
                results[index] = { batch, patches: parseShotPreflightOutput(output, batch) };
            } catch (error) {
                if (signal?.aborted) throw error;
                results[index] = { batch, error: error instanceof Error ? error.message : "AI 整理失败" };
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(2, batches.length) }, () => worker()));

    results.forEach((result) => {
        const now = new Date().toISOString();
        if ("error" in result) {
            current = markShotPreflightFailed(
                current,
                shotboardId,
                result.batch.shots.map((item) => item.shot.id),
                result.batch.id,
                result.error,
                now,
            );
            return;
        }
        current = applyShotPreflight(
            current,
            shotboardId,
            result.patches,
            now,
            result.batch.id,
            preferredAssetIds,
        ).production;
    });
    const shotboard = current.shotboards.find((item) => item.id === shotboardId);
    if (!shotboard) throw new Error("分镜表不存在");
    return { production: current, summary: summarizeShotPreflight(shotboard) };
}
