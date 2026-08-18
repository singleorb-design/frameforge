import { findShotContext } from "@/lib/production/shotboard-editor";
import { syncAssetReferenceToBoundShots } from "@/lib/production/shot-control-assets";
import { controlAssetLabels, shotModeLabels } from "@/lib/production/shot-mode-labels";
import type { ProductionProject, RequiredControlAsset, Shot, ShotGenerationMode, ShotGenerationPlan } from "@/types/production";

const modes: ShotGenerationMode[] = ["first-frame", "first-last-frame", "omni-reference", "multi-frame"];

export function recommendShotMode(production: ProductionProject, shotboardId: string, shotId: string, now: string): ShotGenerationPlan {
    const { shot } = findShotContext(production, shotboardId, shotId);
    const scored = modes.map((mode) => scoreMode(mode, shot)).sort((a, b) => b.score - a.score || modes.indexOf(a.mode) - modes.indexOf(b.mode));
    const winner = scored[0];
    const margin = winner.score - (scored[1]?.score || 0);
    return {
        version: (shot.generationPlan?.version || 0) + 1,
        mode: winner.mode,
        status: "recommended",
        confidence: margin >= 3 ? "high" : margin >= 1 ? "medium" : "low",
        reasons: winner.reasons.length ? winner.reasons : ["该模式约束最少，适合作为当前镜头的起始方案"],
        rejectedModes: scored.slice(1).map((item) => ({ mode: item.mode, reason: item.reasons[0] ? `当前信号更支持其他模式：${item.reasons[0]}` : "当前镜头缺少该模式的明显触发条件" })),
        requiredAssets: requiredAssetsForMode(winner.mode, shot),
        risks: risksForMode(winner.mode, shot),
        updatedAt: now,
    };
}

export function confirmShotPlan(production: ProductionProject, shotboardId: string, shotId: string, mode: ShotGenerationMode, now: string) {
    const { shotboard, shot } = findShotContext(production, shotboardId, shotId);
    if (shot.status !== "shot-approved" && shot.status !== "plan-approved") throw new Error("请先确认镜头，再确认生成方案");
    const recommendation = recommendShotMode(production, shotboardId, shotId, now);
    const previousPlans = shot.generationPlan?.status === "approved" ? [...shot.planHistory, shot.generationPlan].slice(-20) : shot.planHistory;
    const plan: ShotGenerationPlan = {
        ...recommendation,
        version: (shot.generationPlan?.version || 0) + 1,
        mode,
        status: "approved",
        reasons: mode === recommendation.mode ? recommendation.reasons : [`用户根据生产需要改选为${shotModeLabels[mode]}`],
        requiredAssets: requiredAssetsForMode(mode, shot),
        risks: risksForMode(mode, shot),
        confirmedAt: now,
        updatedAt: now,
    };
    const nextShot = { ...shot, status: "plan-approved" as const, generationPlan: plan, planHistory: previousPlans, updatedAt: now };
    const nextProduction: ProductionProject = {
        ...production,
        shotboards: production.shotboards.map((item) =>
            item.id === shotboard.id ? { ...item, version: item.version + 1, updatedAt: now, shots: item.shots.map((current) => (current.id === shot.id ? nextShot : current)) } : item,
        ),
    };
    return production.assetReferences.reduce(
        (current, reference) => syncAssetReferenceToBoundShots(current, reference, now).production,
        nextProduction,
    );
}

export function requiredAssetsForMode(mode: ShotGenerationMode, shot: Shot): RequiredControlAsset[] {
    const assets: RequiredControlAsset[] = [];
    if (mode === "first-frame" || mode === "first-last-frame") assets.push(required("first-frame", "锁定镜头开始构图"));
    if (mode === "first-last-frame") assets.push(required("last-frame", "锁定镜头动作和构图落点"));
    if (mode === "multi-frame") assets.push(required("keyframes", "控制单个片段中的多个必要视觉阶段"));
    if (shot.characterBindings.length) assets.push(optional("identity-reference", "保持角色外观、服装和状态"));
    if (shot.sceneBinding) assets.push(optional("scene-reference", "保持空间结构和光线"));
    if (shot.propBindings.length) assets.push(optional("prop-reference", "锁定关键道具外观和状态"));
    if (mode === "omni-reference") {
        assets.push(optional("action-reference", "需要时参考动作路径和节奏"));
        assets.push(optional("camera-reference", "需要时参考摄像机轨迹"));
        assets.push(optional("audio-reference", "需要时参考节奏、口型或声音驱动动作"));
    }
    return assets;
}

function scoreMode(mode: ShotGenerationMode, shot: Shot) {
    let score = 0;
    const reasons: string[] = [];
    const actionClauses = shot.action.split(/随后|然后|接着|最终|；|;/).filter((item) => item.trim()).length;
    const explicitEnding = /最终|落在|变为|睁眼|起身|打开|关闭|转身|停在/.test(`${shot.action}${shot.endState}`);
    const process = /变身|觉醒|仪式|过程|逐渐|依次|连续/.test(`${shot.narrativePurpose}${shot.action}`);
    const referenceNotes = shot.continuityNotes.join(" ");

    if (mode === "first-frame") {
        if (["reaction", "emotion-closeup", "prop-detail"].includes(shot.shotCategory)) {
            score += 3;
            reasons.push("镜头属于反应、情绪近景或道具特写，适合从单张定稿构图起动");
        }
        if (actionClauses <= 1) {
            score += 2;
            reasons.push("镜头只有一个主要动作");
        }
        if (shot.editRelation === "continuous" || explicitEnding) score -= 3;
    }
    if (mode === "first-last-frame") {
        if (shot.editRelation === "continuous" || shot.editRelation === "match-cut") {
            score += 4;
            reasons.push("镜头需要连续或匹配剪辑，结束状态必须可控");
        }
        if (explicitEnding) {
            score += 3;
            reasons.push("动作或结束状态包含明确落点");
        }
        if (shot.shotCategory === "reveal" || shot.shotCategory === "action") {
            score += 2;
            reasons.push("揭示或动作镜头适合锁定起止状态");
        }
    }
    if (mode === "multi-frame") {
        if (actionClauses >= 3) {
            score += 4;
            reasons.push("动作包含三个以上必要阶段");
        }
        if (process) {
            score += 3;
            reasons.push("镜头描述包含变身、觉醒、仪式或连续过程");
        }
        if (/多机位|切换机位|反打/.test(`${shot.framing.cameraMovement}${referenceNotes}`)) score -= 4;
    }
    if (mode === "omni-reference") {
        if (shot.characterBindings.length >= 2) {
            score += 2;
            reasons.push("镜头包含多角色外观约束");
        }
        if (shot.sceneBinding && shot.propBindings.length) {
            score += 2;
            reasons.push("镜头同时需要场景和道具参考");
        }
        if (/动作参考|运镜参考|音频参考/.test(referenceNotes)) {
            score += 3;
            reasons.push("连续性说明明确要求多模态参考");
        }
    }
    return { mode, score, reasons };
}

function risksForMode(mode: ShotGenerationMode, shot: Shot) {
    const risks: string[] = [];
    if (mode === "first-frame" && (shot.editRelation === "continuous" || /最终|落在|停在/.test(shot.endState))) risks.push("首帧模式无法精确保证结束构图");
    if (mode === "first-last-frame" && shot.targetDurationMs < 2000) risks.push("时长较短，首尾状态差异过大时容易产生瞬移");
    if (mode === "multi-frame" && /多机位|切换机位|反打/.test(`${shot.framing.cameraMovement}${shot.continuityNotes.join(" ")}`)) risks.push("智能多帧不应代替正常剪辑和机位切换");
    if (mode === "omni-reference" && !shot.characterBindings.length && !shot.sceneBinding && !shot.propBindings.length) risks.push("缺少明确参考资产，全能参考没有实际约束来源");
    if (shot.characterBindings.length > 3) risks.push("人物数量较多，外观和动作稳定性风险较高");
    return risks;
}

function required(kind: RequiredControlAsset["kind"], reason: string): RequiredControlAsset {
    return { kind, label: controlAssetLabels[kind], required: true, reason };
}

function optional(kind: RequiredControlAsset["kind"], reason: string): RequiredControlAsset {
    return { kind, label: controlAssetLabels[kind], required: false, reason };
}
