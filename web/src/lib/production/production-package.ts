import { createZip } from "@/lib/zip";
import { manifestJson, productionIssues, shotboardFiles, taskFiles } from "@/lib/production/production-artifacts";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import type { ProductionProject } from "@/types/production";

export async function buildProductionPackage(production: ProductionProject, shotboardId: string, mode: "work" | "jimeng" | "final") {
    const shotboard = production.shotboards.find((item) => item.id === shotboardId);
    if (!shotboard) throw new Error("分镜表不存在");
    const issues =
        mode === "jimeng"
            ? shotboard.shots.flatMap((shot) => {
                  const currentTask = shot.jimengTasks.find((task) => task.id === shot.currentJimengTaskId);
                  return !currentTask ? [`${shot.code} 缺少当前即梦任务单`] : currentTask.status !== "published" ? [`${shot.code} 当前即梦任务单不是已发布状态`] : [];
              })
            : productionIssues(production, shotboard);
    if (mode === "final" && issues.length) throw new Error(`最终剪辑包仍有 ${issues.length} 个阻塞问题`);
    const files: Array<{ name: string; data: BlobPart }> = [];
    const manifestFiles: Array<{ path: string; storageKey?: string; bytes?: number; mimeType?: string }> = [];
    if (mode !== "jimeng") files.push(...shotboardFiles(production, shotboard));
    files.push(...taskFiles(shotboard, mode === "work"));
    for (const shot of shotboard.shots) {
        for (const record of shot.controlAssets) {
            const version = record.versions.find((item) => item.version === record.selectedVersion);
            if (!version || (mode !== "work" && version.status !== "approved")) continue;
            const blob = version.storageKey.startsWith("image:") ? await getImageBlob(version.storageKey) : await getMediaBlob(version.storageKey);
            if (!blob) { issues.push(`${shot.code} 控制资产文件缺失：${version.fileName}`); continue; }
            const path = `control-frames/${safeName(shot.code)}-${safeName(record.kind)}-${record.order}-v${version.version}.${extension(version.mimeType)}`;
            files.push({ name: path, data: blob });
            manifestFiles.push({ path, storageKey: version.storageKey, bytes: blob.size, mimeType: blob.type });
        }
        if (mode !== "jimeng") {
            const candidate = shot.candidates.find((item) => item.id === shot.approvedCandidateId);
            if (!candidate) continue;
            const blob = await getMediaBlob(candidate.storageKey);
            if (!blob) { issues.push(`${shot.code} 采用视频文件缺失：${candidate.fileName}`); continue; }
            const path = `selected-clips/${safeName(shot.code)}-approved.${extension(candidate.mimeType)}`;
            files.push({ name: path, data: blob });
            manifestFiles.push({ path, storageKey: candidate.storageKey, bytes: blob.size, mimeType: blob.type });
        }
    }
    if (mode === "final" && issues.length) throw new Error(`最终剪辑包仍有 ${issues.length} 个阻塞问题`);
    files.push({ name: "issues.md", data: ["# 生产问题", "", ...(issues.length ? issues.map((item) => `- ${item}`) : ["无"])].join("\n") });
    files.push({ name: "manifest.json", data: manifestJson(production, shotboard, manifestFiles) });
    return createZip(files);
}

function safeName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_");
}

function extension(mimeType: string) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("quicktime")) return "mov";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("mpeg")) return "mp3";
    return "bin";
}
