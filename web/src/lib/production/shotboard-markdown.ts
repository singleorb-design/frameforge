import type { ProductionProject } from "@/types/production";

export function shotboardToMarkdown(production: ProductionProject, shotboardId: string) {
    const shotboard = production.shotboards.find((item) => item.id === shotboardId);
    if (!shotboard) throw new Error("分镜表不存在");
    const shotById = new Map(shotboard.shots.map((shot) => [shot.id, shot]));
    const lines = [
        `# ${shotboard.title}`,
        "",
        `- 集数：第 ${shotboard.episodeNumber} 集`,
        `- 目标时长：${formatDuration(shotboard.targetDurationMs)}`,
        `- 画幅：${shotboard.targetRatio}`,
        `- 场次数：${shotboard.scenes.length}`,
        `- 镜头数：${shotboard.shots.length}`,
        "",
    ];

    shotboard.scenes
        .slice()
        .sort((a, b) => a.order - b.order)
        .forEach((scene) => {
            lines.push(`## 场次 ${scene.order}：${scene.heading}`, "", scene.dramaticPurpose, "");
            scene.shotIds.forEach((shotId) => {
                const shot = shotById.get(shotId);
                if (!shot) return;
                lines.push(
                    `### ${shot.code} · ${shot.narrativePurpose}`,
                    "",
                    `- 类型：${shot.shotCategory}`,
                    `- 景别 / 角度：${shot.framing.shotSize} / ${shot.framing.cameraAngle}`,
                    `- 构图：${shot.framing.composition}`,
                    `- 运镜：${shot.framing.cameraMovement}`,
                    `- 开始状态：${shot.startState}`,
                    `- 动作：${shot.action}`,
                    `- 结束状态：${shot.endState}`,
                    `- 时长：${formatDuration(shot.targetDurationMs)}`,
                    "",
                );
            });
        });
    return lines.join("\n").trim();
}

function formatDuration(durationMs: number) {
    const seconds = durationMs / 1000;
    return Number.isInteger(seconds) ? `${seconds} 秒` : `${seconds.toFixed(1)} 秒`;
}
