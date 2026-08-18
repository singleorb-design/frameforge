import type { ContinuityFinding, ProductionProject, Shot, ShotboardRecord } from "@/types/production";

export function validateShotboardContinuity(production: ProductionProject, shotboardId: string) {
    const shotboard = production.shotboards.find((item) => item.id === shotboardId);
    if (!shotboard) throw new Error("分镜表不存在");
    const existingAcknowledged = new Set(shotboard.continuityFindings.filter((item) => item.acknowledged).map((item) => findingKey(item)));
    const shotById = new Map(shotboard.shots.map((shot) => [shot.id, shot]));
    const ordered = shotboard.scenes.slice().sort((a, b) => a.order - b.order).flatMap((scene) => scene.shotIds.map((id) => shotById.get(id)).filter((shot): shot is Shot => Boolean(shot)));
    const findings: ContinuityFinding[] = [];
    for (let index = 0; index < ordered.length - 1; index += 1) {
        findings.push(...compareShots(ordered[index], ordered[index + 1], index));
    }
    return findings.map((item) => ({ ...item, acknowledged: existingAcknowledged.has(findingKey(item)) }));
}

export function runContinuityValidation(production: ProductionProject, shotboardId: string, now: string): ProductionProject {
    const findings = validateShotboardContinuity(production, shotboardId);
    return {
        ...production,
        shotboards: production.shotboards.map((shotboard) => shotboard.id === shotboardId ? { ...shotboard, version: shotboard.version + 1, continuityFindings: findings, continuityCheckedAt: now, updatedAt: now } : shotboard),
    };
}

export function acknowledgeContinuityFinding(production: ProductionProject, shotboardId: string, findingId: string, now: string) {
    const shotboard = production.shotboards.find((item) => item.id === shotboardId);
    if (!shotboard) throw new Error("分镜表不存在");
    const finding = shotboard.continuityFindings.find((item) => item.id === findingId);
    if (!finding) throw new Error("连续性问题不存在");
    if (finding.severity === "error") throw new Error("错误级连续性问题不能直接忽略");
    return {
        ...production,
        shotboards: production.shotboards.map((item) => item.id === shotboardId ? { ...item, version: item.version + 1, updatedAt: now, continuityFindings: item.continuityFindings.map((current) => current.id === findingId ? { ...current, acknowledged: true } : current) } : item),
    };
}

function compareShots(from: Shot, to: Shot, index: number) {
    const findings: ContinuityFinding[] = [];
    const add = (code: string, message: string, severity: "warning" | "error") => findings.push({ id: `${from.id}-${to.id}-${code}-${index}`, fromShotId: from.id, toShotId: to.id, code, message, severity, acknowledged: false });
    const fromCharacters = new Map(from.characterBindings.map((item) => [item.assetId, item]));
    to.characterBindings.forEach((binding) => {
        const previous = fromCharacters.get(binding.assetId);
        if (!previous) return;
        if (previous.version !== binding.version) add("character-version", `相邻镜头人物 ${binding.assetId} 版本从 v${previous.version} 变为 v${binding.version}`, "error");
        if ((previous.state || "") !== (binding.state || "")) add("character-state", `相邻镜头人物 ${binding.assetId} 状态发生变化`, "warning");
    });
    if (from.sceneBinding && to.sceneBinding && from.sceneBinding.assetId !== to.sceneBinding.assetId && (to.editRelation === "continuous" || to.editRelation === "match-cut")) add("scene-change", "连续或匹配剪辑中场景资产发生变化", "error");
    if (from.framing.screenDirection && to.framing.screenDirection && from.framing.screenDirection !== to.framing.screenDirection && to.editRelation === "continuous") add("screen-direction", "连续镜头屏幕方向不一致", "warning");
    const fromProps = new Map(from.propBindings.map((item) => [item.assetId, item]));
    to.propBindings.forEach((binding) => {
        const previous = fromProps.get(binding.assetId);
        if (previous && (previous.state || "") !== (binding.state || "")) add("prop-state", `道具 ${binding.assetId} 状态在相邻镜头间变化`, "warning");
    });
    if ((to.editRelation === "continuous" || to.editRelation === "match-cut") && (!from.continuityNotes.length || !to.continuityNotes.length)) add("missing-notes", "连续/匹配剪辑缺少两侧连续性说明", "warning");
    if (to.editRelation === "continuous" && !sharesKeywords(from.endState, to.startState)) add("end-start", "前镜结束状态与后镜开始状态缺少可识别共同锚点", "warning");
    return findings;
}

function sharesKeywords(left: string, right: string) {
    const tokens = (value: string) => new Set(value.split(/[，。；、\s]/).map((item) => item.trim()).filter((item) => item.length >= 2));
    const a = tokens(left);
    return Array.from(tokens(right)).some((item) => a.has(item));
}

function findingKey(item: Pick<ContinuityFinding, "fromShotId" | "toShotId" | "code">) {
    return `${item.fromShotId}:${item.toShotId}:${item.code}`;
}
