import type { AssetDraft, CharacterCardSnapshot, PropCard, SceneCard, ShotAssetKind } from "@/types/production";

export type AssetPromptPurpose = "standard" | "turnaround" | "shot-reference";

export type CompiledAssetPrompt = {
    positivePrompt: string;
    negativePrompt: string;
    ratio: string;
    use: string;
    workflow: string[];
};

const THREE_D_STYLE =
    "high-quality stylized 3D animation character design for Chinese fantasy AI comic drama, cinematic 3D rendering, detailed PBR materials, clean topology, rich layered costume, studio-quality soft key light, crisp silhouette, consistent character design";

const THREE_D_NEGATIVE =
    "2D flat illustration, anime cel shading, photoreal human, realistic live-action face, chibi, low poly, toy plastic look, distorted anatomy, bad hands, extra fingers, multiple people, cropped body, text, watermark, logo, blur, overexposure, unrelated modern elements";

export function compileAssetPrompt(draft: Pick<AssetDraft, "kind" | "name" | "data" | "imagePrompt" | "negativePrompt" | "recommendedRatio">, purpose: AssetPromptPurpose = "standard"): CompiledAssetPrompt {
    if (draft.kind === "character" && isCharacter(draft.data)) return compileCharacter(draft.data, draft, purpose);
    if (draft.kind === "scene" && isScene(draft.data)) return compileScene(draft.data, draft, purpose);
    if (draft.kind === "prop" && isProp(draft.data)) return compileProp(draft.data, draft, purpose);
    return {
        positivePrompt: `${draft.name}, ${THREE_D_STYLE}, clean production reference`,
        negativePrompt: THREE_D_NEGATIVE,
        ratio: draft.recommendedRatio || "3:2",
        use: "标准设定图",
        workflow: ["生成一张无文字、主体清晰的标准参考图。"],
    };
}

export function compileStoredAssetPrompt(
    kind: ShotAssetKind,
    data: CharacterCardSnapshot | SceneCard | PropCard,
    purpose: AssetPromptPurpose = "standard",
): CompiledAssetPrompt {
    return compileAssetPrompt(
        {
            kind,
            name: data.name,
            data,
            imagePrompt: data.positivePrompt,
            negativePrompt: data.negativePrompt,
            recommendedRatio: kind === "character" ? "3:2" : kind === "scene" ? "16:9" : "1:1",
        },
        purpose,
    );
}

function compileCharacter(data: CharacterCardSnapshot, draft: Pick<AssetDraft, "name" | "imagePrompt" | "negativePrompt" | "recommendedRatio">, purpose: AssetPromptPurpose): CompiledAssetPrompt {
    const base = [
        `Character: ${data.name}`,
        data.role && `narrative role: ${data.role}`,
        data.appearance && `appearance: ${data.appearance}`,
        data.clothing && `costume: ${data.clothing}`,
        data.props.length && `signature props: ${data.props.join(", ")}`,
        data.consistencyLocks.length && `strict consistency locks: ${data.consistencyLocks.join(", ")}`,
        draft.imagePrompt,
        THREE_D_STYLE,
    ]
        .filter(Boolean)
        .join(", ");
    if (purpose === "turnaround") {
        return {
            positivePrompt: `${base}, full body character turnaround sheet, four equal panels in one image: front view, left side view, back view, right side view, same neutral expression, same costume and body proportion in every panel, clean light gray studio background, no labels, no text`,
            negativePrompt: combineNegative(data.negativePrompt, draft.negativePrompt, "different face between panels, inconsistent costume between panels"),
            ratio: "3:2",
            use: "人物三视图 / 多角度母版",
            workflow: ["先生成这张多角度母版。", "后续表情图、景别图和镜头参考图均上传此图作为人物参考。"],
        };
    }
    if (purpose === "shot-reference") {
        return {
            positivePrompt: `${base}, single full body character reference, three-quarter front view, neutral standing pose, complete body visible, hands visible, clean muted studio background, no text`,
            negativePrompt: combineNegative(data.negativePrompt, draft.negativePrompt),
            ratio: "9:16",
            use: "镜头参考图",
            workflow: ["生成后作为镜头控制帧的人物身份参考。", "如镜头已有三视图，优先上传三视图再生成此图。"],
        };
    }
    return {
        positivePrompt: `${base}, single character full body key design sheet, three-quarter front view, calm neutral standing pose, complete body visible from head to toe, clear face and hair, costume material and accessories readable, clean muted studio background, no text`,
        negativePrompt: combineNegative(data.negativePrompt, draft.negativePrompt),
        ratio: draft.recommendedRatio || "3:2",
        use: "人物标准设定图",
        workflow: ["先生成此标准设定图并确认脸型、发型、服装和主色。", "确认后再生成三视图、表情和景别参考。"],
    };
}

function compileScene(data: SceneCard, draft: Pick<AssetDraft, "name" | "imagePrompt" | "negativePrompt" | "recommendedRatio">, purpose: AssetPromptPurpose): CompiledAssetPrompt {
    const base = [
        `Environment: ${data.name}`,
        data.narrativeFunction && `story function: ${data.narrativeFunction}`,
        data.era && `era: ${data.era}`,
        data.locationType && `location type: ${data.locationType}`,
        data.spatialLayout && `spatial layout: ${data.spatialLayout}`,
        data.materials.length && `materials: ${data.materials.join(", ")}`,
        data.palette.length && `palette: ${data.palette.join(", ")}`,
        data.defaultLighting && `lighting: ${data.defaultLighting}`,
        data.timeVariants.length && `time: ${data.timeVariants.join(", ")}`,
        data.weatherVariants.length && `weather: ${data.weatherVariants.join(", ")}`,
        data.continuityLocks.length && `strict continuity locks: ${data.continuityLocks.join(", ")}`,
        draft.imagePrompt,
        "high-quality stylized 3D animation environment for Chinese fantasy AI comic drama, cinematic composition, detailed PBR architecture materials, production-ready layout reference",
    ]
        .filter(Boolean)
        .join(", ");
    return {
        positivePrompt: `${base}, empty environment, no people, no characters, wide establishing composition, complete architecture and circulation visible, clean readable foreground midground background layering, no text`,
        negativePrompt: combineNegative(data.negativePrompt, draft.negativePrompt, "people, crowd, character close-up, cropped architecture"),
        ratio: purpose === "shot-reference" ? "9:16" : draft.recommendedRatio || "16:9",
        use: purpose === "shot-reference" ? "镜头场景参考图" : "场景标准参考图",
        workflow: ["先锁定空间布局、主材质、主光源和时间状态。", "后续镜头生图上传此场景图，并以镜头 Prompt 补充人物和动作。"],
    };
}

function compileProp(data: PropCard, draft: Pick<AssetDraft, "name" | "imagePrompt" | "negativePrompt" | "recommendedRatio">, purpose: AssetPromptPurpose): CompiledAssetPrompt {
    const base = [
        `Prop: ${data.name}`,
        data.narrativeFunction && `story function: ${data.narrativeFunction}`,
        data.shape && `shape: ${data.shape}`,
        data.material && `material: ${data.material}`,
        data.colors.length && `colors: ${data.colors.join(", ")}`,
        data.scale && `scale: ${data.scale}`,
        data.handlingRules.length && `handling rules: ${data.handlingRules.join(", ")}`,
        data.states.length && `states: ${data.states.map((state) => `${state.name}: ${state.description}`).join("; ")}`,
        data.continuityLocks.length && `strict continuity locks: ${data.continuityLocks.join(", ")}`,
        draft.imagePrompt,
        "high-quality stylized 3D animation prop design for Chinese fantasy AI comic drama, detailed PBR material, product-level modeling, crisp silhouette",
    ]
        .filter(Boolean)
        .join(", ");
    if (purpose === "turnaround") {
        return {
            positivePrompt: `${base}, multi-angle prop turnaround sheet, front, side, back and top three-quarter views in four equal panels, same prop design in each panel, centered, clean neutral background, no hands, no text`,
            negativePrompt: combineNegative(data.negativePrompt, draft.negativePrompt, "hands, person, inconsistent prop between panels"),
            ratio: "3:2",
            use: "道具多角度母版",
            workflow: ["先生成多角度母版。", "后续状态图和镜头特写引用此图。"],
        };
    }
    return {
        positivePrompt: `${base}, single prop key design, centered isolated object, three-quarter front view, complete object visible, no hands, no people, clean dark neutral background, no text`,
        negativePrompt: combineNegative(data.negativePrompt, draft.negativePrompt, "hands, person, multiple objects"),
        ratio: purpose === "shot-reference" ? "9:16" : draft.recommendedRatio || "1:1",
        use: purpose === "shot-reference" ? "镜头道具参考图" : "道具标准设定图",
        workflow: ["先确认道具形状、材质、颜色和状态变化。", "特写镜头使用同一参考图锁定外观。"],
    };
}

function combineNegative(...values: Array<string | false | undefined>) {
    return Array.from(new Set([THREE_D_NEGATIVE, ...values.filter((value): value is string => Boolean(value))].join(", ").split(",").map((item) => item.trim()).filter(Boolean))).join(", ");
}

function isCharacter(data: AssetDraft["data"]): data is CharacterCardSnapshot {
    return "appearance" in data;
}

function isScene(data: AssetDraft["data"]): data is SceneCard {
    return "spatialLayout" in data;
}

function isProp(data: AssetDraft["data"]): data is PropCard {
    return "states" in data;
}
