import { jimengTaskToMarkdown } from "@/lib/production/jimeng-task-compiler";
import { shotboardToMarkdown } from "@/lib/production/shotboard-markdown";
import type { ProductionProject, Shot, ShotboardRecord } from "@/types/production";

export function shotboardToCsv(shotboard: ShotboardRecord) {
    const headers = ["scene", "shot", "purpose", "size", "angle", "start", "action", "end", "duration_ms", "status"];
    return [headers, ...orderedShots(shotboard).map(({ scene, shot }) => [scene.heading, shot.code, shot.narrativePurpose, shot.framing.shotSize, shot.framing.cameraAngle, shot.startState, shot.action, shot.endState, shot.targetDurationMs, shot.status])].map(csvRow).join("\n");
}

export function jianyingEditPlanCsv(shotboard: ShotboardRecord) {
    const headers = ["order", "scene", "shot", "file", "in_ms", "out_ms", "target_ms", "speed", "freeze", "crop", "interpolation", "transition", "grading", "notes"];
    return [headers, ...orderedShots(shotboard).map(({ scene, shot }, index) => {
        const candidate = shot.candidates.find((item) => item.id === shot.approvedCandidateId);
        return [index + 1, scene.heading, shot.code, candidate?.fileName || "", candidate?.inMs || "", candidate?.outMs || "", candidate?.targetDurationMs || shot.targetDurationMs, candidate?.editDirectives.speed || "", candidate?.editDirectives.freeze || "", candidate?.editDirectives.crop || "", candidate?.editDirectives.interpolation || "", candidate?.editDirectives.transition || shot.editRelation, candidate?.editDirectives.grading || "", candidate?.editNotes || ""];
    })].map(csvRow).join("\n");
}

export function dialogueVoiceoverMarkdown(production: ProductionProject, shotboard: ShotboardRecord) {
    const breakdown = production.scriptBreakdowns.find((item) => item.id === shotboard.sourceScriptRevision);
    if (!breakdown) return "# 对白与旁白\n\n来源剧本版本缺失";
    const dialogues = new Map(breakdown.dialogueCues.map((item) => [item.id, item]));
    const voiceovers = new Map(breakdown.voiceoverCues.map((item) => [item.id, item]));
    const lines = ["# 对白与旁白", ""];
    orderedShots(shotboard).forEach(({ scene, shot }) => {
        lines.push(`## ${scene.heading} · ${shot.code}`, "");
        shot.dialogueCueIds.forEach((id) => { const cue = dialogues.get(id); if (cue) lines.push(`- 对白｜${cue.speaker}：${cue.text}`); });
        shot.voiceoverCueIds.forEach((id) => { const cue = voiceovers.get(id); if (cue) lines.push(`- 旁白｜${cue.speaker}：${cue.text}`); });
        lines.push("");
    });
    return lines.join("\n");
}

export function subtitlesSrt(production: ProductionProject, shotboard: ShotboardRecord) {
    const breakdown = production.scriptBreakdowns.find((item) => item.id === shotboard.sourceScriptRevision);
    if (!breakdown) return "";
    const dialogues = new Map(breakdown.dialogueCues.map((item) => [item.id, item]));
    const voiceovers = new Map(breakdown.voiceoverCues.map((item) => [item.id, item]));
    let cursor = 0;
    let index = 1;
    const blocks: string[] = [];
    orderedShots(shotboard).forEach(({ shot }) => {
        const candidate = shot.candidates.find((item) => item.id === shot.approvedCandidateId);
        const duration = candidate?.targetDurationMs || shot.targetDurationMs;
        const cues = [...shot.dialogueCueIds.map((id) => dialogues.get(id)).filter(Boolean), ...shot.voiceoverCueIds.map((id) => voiceovers.get(id)).filter(Boolean)];
        if (cues.length) {
            const part = duration / cues.length;
            cues.forEach((cue, cueIndex) => {
                blocks.push(`${index++}\n${srtTime(cursor + cueIndex * part)} --> ${srtTime(cursor + (cueIndex + 1) * part)}\n${cue!.speaker}：${cue!.text}`);
            });
        }
        cursor += duration;
    });
    return blocks.join("\n\n");
}

export function audioCueSheetCsv(shotboard: ShotboardRecord) {
    return [["shot", "cue", "type", "note"], ...orderedShots(shotboard).flatMap(({ shot }) => shot.soundCues.map((cue) => [shot.code, cue, "SFX/环境声", "后期统一在剪映完成"]))].map(csvRow).join("\n");
}

export function productionIssues(production: ProductionProject, shotboard: ShotboardRecord) {
    const issues: string[] = [];
    if (!shotboard.continuityCheckedAt) issues.push("尚未运行跨镜连续性检查");
    shotboard.shots.forEach((shot) => {
        if (!shot.approvedCandidateId) issues.push(`${shot.code} 缺少采用视频`);
        if (!shot.generationPlan || shot.generationPlan.status !== "approved") issues.push(`${shot.code} 生成方案未确认`);
        const currentTask = shot.jimengTasks.find((task) => task.id === shot.currentJimengTaskId);
        if (!currentTask) issues.push(`${shot.code} 缺少当前即梦任务单`);
        else if (currentTask.status === "stale") issues.push(`${shot.code} 即梦任务单已过期`);
        shot.blockers.filter((item) => item.severity === "error").forEach((item) => issues.push(`${shot.code} ${item.message}`));
    });
    shotboard.continuityFindings.filter((item) => item.severity === "error" || !item.acknowledged).forEach((item) => issues.push(`连续性 ${item.message}`));
    if (!production.scriptBreakdowns.some((item) => item.id === shotboard.sourceScriptRevision)) issues.push("来源剧本版本缺失");
    return issues;
}

export function manifestJson(production: ProductionProject, shotboard: ShotboardRecord, files: Array<{ path: string; storageKey?: string; bytes?: number; mimeType?: string }>) {
    return JSON.stringify({ app: "frameforge", kind: "ai-comic-production-package", version: 1, exportedAt: new Date().toISOString(), shotboardId: shotboard.id, shotboardVersion: shotboard.version, sourceScriptRevision: shotboard.sourceScriptRevision, continuityCheckedAt: shotboard.continuityCheckedAt, files, productionSchemaVersion: production.schemaVersion }, null, 2);
}

export function taskFiles(shotboard: ShotboardRecord, includeHistory = false) {
    return shotboard.shots.flatMap((shot) =>
        shot.jimengTasks
            .filter((task) => includeHistory || task.status === "published")
            .map((task) => ({ name: `jimeng-tasks/${shot.code}-v${task.version}-${task.status}.md`, data: jimengTaskToMarkdown(task) })),
    );
}

export function shotboardFiles(production: ProductionProject, shotboard: ShotboardRecord) {
    return [
        { name: "shotboard.json", data: JSON.stringify(shotboard, null, 2) },
        { name: "shotboard.md", data: shotboardToMarkdown(production, shotboard.id) },
        { name: "shotboard.csv", data: shotboardToCsv(shotboard) },
        { name: "jianying-edit-plan.csv", data: jianyingEditPlanCsv(shotboard) },
        { name: "dialogue-voiceover.md", data: dialogueVoiceoverMarkdown(production, shotboard) },
        { name: "subtitles.srt", data: subtitlesSrt(production, shotboard) },
        { name: "audio-cue-sheet.csv", data: audioCueSheetCsv(shotboard) },
    ];
}

function orderedShots(shotboard: ShotboardRecord) {
    const shotById = new Map(shotboard.shots.map((shot) => [shot.id, shot]));
    return shotboard.scenes.slice().sort((a, b) => a.order - b.order).flatMap((scene) => scene.shotIds.map((id) => shotById.get(id)).filter((shot): shot is Shot => Boolean(shot)).map((shot) => ({ scene, shot })));
}

function csvRow(values: unknown[]) {
    return values.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",");
}

function srtTime(ms: number) {
    const total = Math.max(0, Math.round(ms));
    const hours = Math.floor(total / 3_600_000);
    const minutes = Math.floor((total % 3_600_000) / 60_000);
    const seconds = Math.floor((total % 60_000) / 1000);
    const millis = total % 1000;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${String(millis).padStart(3, "0")}`;
}

function pad(value: number) {
    return String(value).padStart(2, "0");
}
