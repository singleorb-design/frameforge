import { isInvalidCharacterCandidate } from "@/lib/production/character-name-filter";
import { isTrustedCharacterIssue } from "@/lib/production/shot-preflight";

export type VersionedRecord<T> = {
    id: string;
    currentVersion: number;
    versions: Array<{
        version: number;
        data: T;
        createdAt: string;
    }>;
};

export type ProductionProject = {
    schemaVersion: 1;
    scriptBreakdowns: ScriptBreakdown[];
    characters: Array<VersionedRecord<CharacterCardSnapshot>>;
    scenes: Array<VersionedRecord<SceneCard>>;
    props: Array<VersionedRecord<PropCard>>;
    assetReferences: AssetReferenceImage[];
    styleBibles: Array<VersionedRecord<StyleBible>>;
    shotboards: ShotboardRecord[];
    platformProfiles: PlatformCapabilityProfile[];
};

export type ScriptBreakdown = {
    id: string;
    sourceScriptNodeId: string;
    revision: string;
    markdownHash: string;
    episodeNumber: number;
    title: string;
    characterNames: string[];
    scenes: ScriptScene[];
    beats: ScriptBeat[];
    dialogueCues: DialogueCue[];
    voiceoverCues: VoiceoverCue[];
    createdAt: string;
};

export type ScriptScene = {
    id: string;
    order: number;
    heading: string;
    location: string;
    timeOfDay: string;
    beatIds: string[];
};

export type ScriptBeat = {
    id: string;
    sceneId: string;
    order: number;
    summary: string;
    dramaticFunction: string;
};

export type DialogueCue = {
    id: string;
    beatId: string;
    characterId?: string;
    speaker: string;
    text: string;
};

export type VoiceoverCue = {
    id: string;
    beatId: string;
    speaker: string;
    text: string;
};

export type CharacterCardSnapshot = {
    sourceNodeId: string;
    name: string;
    role: string;
    appearance: string;
    clothing: string;
    props: string[];
    positivePrompt: string;
    negativePrompt: string;
    consistencyLocks: string[];
};

export type SceneCard = {
    name: string;
    narrativeFunction: string;
    era: string;
    locationType: string;
    spatialLayout: string;
    materials: string[];
    palette: string[];
    defaultLighting: string;
    timeVariants: string[];
    weatherVariants: string[];
    continuityLocks: string[];
    positivePrompt: string;
    negativePrompt: string;
    sourceNote: string;
};

export type PropState = {
    id: string;
    name: string;
    description: string;
};

export type PropCard = {
    name: string;
    narrativeFunction: string;
    ownerCharacterId?: string;
    shape: string;
    material: string;
    colors: string[];
    scale: string;
    handlingRules: string[];
    states: PropState[];
    continuityLocks: string[];
    positivePrompt: string;
    negativePrompt: string;
    sourceNote: string;
};

export type StyleBible = {
    name: string;
    visualStyle: string;
    palette: string[];
    lightingRules: string[];
    compositionRules: string[];
    negativeRules: string[];
};

export type AssetReferenceImage = {
    id: string;
    assetId: string;
    assetVersion: number;
    version: number;
    kind: "standard" | "turnaround" | "expression" | "shot-reference";
    storageKey: string;
    fileName: string;
    mimeType: string;
    width: number;
    height: number;
    prompt: string;
    negativePrompt: string;
    source: "uploaded" | "generated";
    createdAt: string;
};

export type StoryScene = {
    id: string;
    order: number;
    heading: string;
    locationAssetId?: string;
    timeOfDay: string;
    dramaticPurpose: string;
    beatSummary: string;
    shotIds: string[];
};

export type ShotCategory = "establishing" | "dialogue" | "emotion-closeup" | "reaction" | "prop-detail" | "action" | "reveal" | "transition";

export type ShotProductionStatus = "draft" | "shot-approved" | "plan-approved" | "control-assets-ready" | "task-published" | "external-generating" | "candidate-review" | "edit-ready" | "blocked";
export type ShotGenerationMode = "first-frame" | "first-last-frame" | "multi-frame" | "omni-reference";

export type ProductionBlocker = {
    code: string;
    message: string;
    fieldPath?: string;
    assetId?: string;
    severity: "warning" | "error";
};

export type RequiredControlAsset = {
    kind: "first-frame" | "last-frame" | "keyframes" | "identity-reference" | "scene-reference" | "prop-reference" | "action-reference" | "camera-reference" | "audio-reference";
    label: string;
    required: boolean;
    reason: string;
};

export type ShotGenerationPlan = {
    version: number;
    mode: ShotGenerationMode;
    status: "recommended" | "approved";
    confidence: "high" | "medium" | "low";
    reasons: string[];
    rejectedModes: Array<{ mode: ShotGenerationMode; reason: string }>;
    requiredAssets: RequiredControlAsset[];
    risks: string[];
    confirmedAt?: string;
    updatedAt: string;
};

export type ControlAssetKind =
    | "first-frame"
    | "last-frame"
    | "keyframe"
    | "identity-reference"
    | "scene-reference"
    | "prop-reference"
    | "action-reference"
    | "camera-reference"
    | "audio-reference";
export type ControlAssetStatus = "draft" | "review" | "approved" | "rejected";

export type AssetVersionSnapshot = {
    assetId: string;
    version: number;
    role: string;
};

export type ShotControlAssetVersion = {
    version: number;
    storageKey: string;
    source: "generated" | "uploaded" | "canvas";
    fileName: string;
    mimeType: string;
    width?: number;
    height?: number;
    durationMs?: number;
    purpose: string;
    status: ControlAssetStatus;
    assetSnapshots: AssetVersionSnapshot[];
    reviewedAt?: string;
    reviewNote?: string;
    createdAt: string;
};

export type ShotControlAssetRecord = {
    id: string;
    kind: ControlAssetKind;
    label: string;
    required: boolean;
    order: number;
    selectedVersion: number;
    versions: ShotControlAssetVersion[];
};

export type PlatformModelCapability = {
    id: string;
    label: string;
    modes: ShotGenerationMode[];
    ratios: string[];
    resolutions: string[];
    durationsSeconds: number[];
    nativeAudio: boolean;
    referenceLimits: { images: number; videos: number; audios: number; keyframes: number };
    notes: string[];
};

export type PlatformCapabilityProfile = {
    id: string;
    platform: "jimeng-web";
    displayName: string;
    profileVersion: number;
    verifiedAt: string;
    models: PlatformModelCapability[];
};

export type JimengTask = {
    id: string;
    version: number;
    shotId: string;
    shotRevision: number;
    planVersion: number;
    profileSnapshot: PlatformCapabilityProfile;
    assetSnapshots: AssetVersionSnapshot[];
    controlAssetVersions: Array<{ recordId: string; version: number; storageKey: string; kind: ControlAssetKind }>;
    mode: ShotGenerationMode;
    settings: { model: string; ratio: string; durationSeconds: number; resolution: string; nativeAudio: boolean };
    uploadSteps: Array<{ order: number; fileName: string; role: string; referenceName?: string }>;
    referenceMap: Array<{ referenceName: string; purpose: string; recordId: string; version: number }>;
    prompt: string;
    negativeInstructions: string[];
    operationSteps: string[];
    acceptanceCriteria: string[];
    retryPlaybook: Array<{ symptom: string; action: string }>;
    status: "draft" | "published" | "stale" | "archived";
    createdAt: string;
};

export type CandidateReviewItem = {
    key: "identity" | "scene" | "prop" | "start-end" | "action" | "camera" | "artifacts" | "continuity";
    passed: boolean;
    note: string;
};

export type ShotEditDirectives = {
    speed: string;
    freeze: string;
    crop: string;
    interpolation: string;
    transition: string;
    grading: string;
};

export type ShotCandidate = {
    id: string;
    sourceTaskId: string;
    sourceTaskVersion: number;
    storageKey: string;
    fileName: string;
    mimeType: string;
    durationMs: number;
    status: "candidate" | "approved" | "rejected" | "stale";
    review: CandidateReviewItem[];
    inMs: number;
    outMs: number;
    targetDurationMs: number;
    editNotes: string;
    editDirectives: ShotEditDirectives;
    createdAt: string;
    reviewedAt?: string;
};

export type ShotAssetBinding = {
    assetId: string;
    version: number;
    role: string;
    state?: string;
};

export type ShotPreflightConfidence = "high" | "medium" | "low";
export type ShotPreflightIssueSeverity = "blocking" | "review" | "optional";
export type ShotAssetKind = "character" | "scene" | "prop";

export type ShotFieldSource = {
    fieldPath: string;
    source: "script" | "dialogue" | "connected-asset" | "canvas-asset" | "rule" | "ai" | "user";
    sourceId?: string;
    confidence: ShotPreflightConfidence;
    reason: string;
};

export type AssetDraftPrompt = {
    positivePrompt: string;
    negativePrompt: string;
    recommendedRatio: string;
};

export type ShotPreflightIssue = {
    id: string;
    kind:
        | "missing-character"
        | "missing-scene"
        | "missing-prop"
        | "ambiguous-character"
        | "ambiguous-asset"
        | "state-conflict"
        | "stale-version"
        | "insufficient-context"
        | "invalid-ai-patch";
    severity: ShotPreflightIssueSeverity;
    message: string;
    shotIds: string[];
    assetKind?: ShotAssetKind;
    suggestedName?: string;
    candidateAssetIds?: string[];
    prompt?: AssetDraftPrompt;
    status: "open" | "resolved" | "ignored";
    assetDraftStatus?: "idle" | "generating" | "ready" | "error";
    assetDraftError?: string;
    assetDraftStartedAt?: string;
};

export type ShotPreflightState = {
    status: "pending" | "running" | "ready" | "needs-review" | "failed" | "user-locked";
    confidence: ShotPreflightConfidence;
    batchId?: string;
    summary?: string;
    fieldSources: ShotFieldSource[];
    lockedFieldPaths: string[];
    issues: ShotPreflightIssue[];
    lastRunAt?: string;
    error?: string;
};

export type ShotEditableFields = {
    narrativePurpose: string;
    emotionalBeat: string;
    informationGain: string;
    shotCategory: ShotCategory;
    framing: {
        shotSize: string;
        cameraAngle: string;
        composition: string;
        lensIntent: string;
        screenDirection: string;
        cameraMovement: string;
    };
    startState: string;
    action: string;
    endState: string;
    continuityNotes: string[];
    characterBindings: ShotAssetBinding[];
    sceneBinding?: ShotAssetBinding;
    propBindings: ShotAssetBinding[];
    dialogueCueIds: string[];
    voiceoverCueIds: string[];
    soundCues: string[];
    targetDurationMs: number;
    editRelation: "cut" | "match-cut" | "continuous" | "transition";
};

export type ShotRevision = {
    revision: number;
    snapshot: ShotEditableFields;
    preflight?: ShotPreflightState;
    savedAt: string;
};

export type Shot = ShotEditableFields & {
    id: string;
    sceneId: string;
    order: number;
    code: string;
    sourceBeatIds: string[];
    revision: number;
    history: ShotRevision[];
    status: ShotProductionStatus;
    blockers: ProductionBlocker[];
    generationPlan?: ShotGenerationPlan;
    planHistory: ShotGenerationPlan[];
    controlAssets: ShotControlAssetRecord[];
    jimengTasks: JimengTask[];
    currentJimengTaskId?: string;
    candidates: ShotCandidate[];
    approvedCandidateId?: string;
    preflight: ShotPreflightState;
    createdAt: string;
    updatedAt: string;
};

export type ShotPreflightFields = Omit<
    Partial<ShotEditableFields>,
    "framing" | "characterBindings" | "sceneBinding" | "propBindings" | "dialogueCueIds" | "voiceoverCueIds"
> & {
    framing?: Partial<ShotEditableFields["framing"]>;
};

export type ShotPreflightPatch = {
    shotId: string;
    summary?: string;
    fields: ShotPreflightFields;
    fieldSources: ShotFieldSource[];
    assetMatches: Array<ShotAssetBinding & { kind: ShotAssetKind; confidence: ShotPreflightConfidence; reason: string }>;
    issues: ShotPreflightIssue[];
    confidence: ShotPreflightConfidence;
};

export type ShotPreflightBatch = {
    id: string;
    sourceScriptRevision: string;
    preferredAssetIds: string[];
    assetVersions: Array<{ assetId: string; version: number }>;
    shotIds: string[];
    autoApprovedCount: number;
    reviewCount: number;
    failedCount: number;
    createdAt: string;
};

export type AssetDraft = {
    id: string;
    kind: ShotAssetKind;
    name: string;
    sourceShotIds: string[];
    sourceBeatIds: string[];
    data: CharacterCardSnapshot | SceneCard | PropCard;
    imagePrompt: string;
    negativePrompt: string;
    recommendedRatio: string;
    status: "draft" | "adopted" | "discarded";
    createdAt: string;
};

export type ShotboardRecord = {
    id: string;
    version: number;
    sourceScriptNodeId: string;
    sourceScriptRevision: string;
    episodeNumber: number;
    title: string;
    targetDurationMs: number;
    targetRatio: "9:16" | "16:9" | "1:1" | "4:3" | "3:4";
    scenes: StoryScene[];
    shots: Shot[];
    continuityFindings: ContinuityFinding[];
    preflightBatches: ShotPreflightBatch[];
    assetDrafts: AssetDraft[];
    continuityCheckedAt?: string;
    generatedAt: string;
    updatedAt: string;
};

export type ContinuityFinding = {
    id: string;
    fromShotId: string;
    toShotId: string;
    code: string;
    message: string;
    severity: "warning" | "error";
    acknowledged: boolean;
};

export function createEmptyProductionProject(): ProductionProject {
    return {
        schemaVersion: 1,
        scriptBreakdowns: [],
        characters: [],
        scenes: [],
        props: [],
        assetReferences: [],
        styleBibles: [],
        shotboards: [],
        platformProfiles: [createDefaultJimengProfile()],
    };
}

export function createDefaultJimengProfile(): PlatformCapabilityProfile {
    return {
        id: "jimeng-web-default",
        platform: "jimeng-web",
        displayName: "即梦 Web",
        profileVersion: 1,
        verifiedAt: "2026-07-25",
        models: [
            {
                id: "seedance-current-standard",
                label: "Seedance 当前标准模型",
                modes: ["first-frame", "first-last-frame", "multi-frame", "omni-reference"],
                ratios: ["9:16", "16:9", "1:1", "4:3", "3:4"],
                resolutions: ["720p", "1080p"],
                durationsSeconds: [3, 4, 5, 6, 8, 10, 12, 15],
                nativeAudio: true,
                referenceLimits: { images: 12, videos: 3, audios: 3, keyframes: 10 },
                notes: ["即梦页面能力会变化，发布任务前请核对当前模型页面。", "真人脸、会员档位和参考上限以即梦当前界面为准。"],
            },
        ],
    };
}

export function normalizeProductionProject(production?: ProductionProject): ProductionProject {
    const base = production || createEmptyProductionProject();
    return {
        ...base,
        platformProfiles: base.platformProfiles?.length ? base.platformProfiles : [createDefaultJimengProfile()],
        assetReferences: base.assetReferences || [],
        shotboards: base.shotboards.map((shotboard) => ({
            ...shotboard,
            continuityFindings: shotboard.continuityFindings || [],
            preflightBatches: shotboard.preflightBatches || [],
            assetDrafts: shotboard.assetDrafts || [],
            shots: shotboard.shots.map((shot) => ({
                ...shot,
                revision: shot.revision || 1,
                history: shot.history || [],
                status: shot.status || "draft",
                blockers: shot.blockers || [],
                planHistory: shot.planHistory || [],
                controlAssets: (shot.controlAssets || []).map((record, index) => ({ ...record, order: record.order || index + 1 })),
                jimengTasks: shot.jimengTasks || [],
                candidates: shot.candidates || [],
                preflight: normalizeShotPreflight(base, shotboard.id, shot.preflight),
            })),
        })),
        scriptBreakdowns: base.scriptBreakdowns.map((breakdown) => ({
            ...breakdown,
            characterNames: (breakdown.characterNames || []).filter((name) => !isInvalidCharacterCandidate(name)),
        })),
    };
}

function normalizeShotPreflight(production: ProductionProject, shotboardId: string, preflight?: ShotPreflightState): ShotPreflightState {
    const base = preflight || {
        status: "pending" as const,
        confidence: "low" as const,
        fieldSources: [],
        lockedFieldPaths: [],
        issues: [],
    };
    return {
        ...base,
        issues: base.issues
            .filter((issue) => isTrustedCharacterIssue(production, shotboardId, issue))
            .map((issue) =>
                issue.assetDraftStatus === "generating"
                    ? {
                          ...issue,
                          assetDraftStatus: "error" as const,
                          assetDraftError: "页面刷新导致资产卡生成中断，可重新生成或复制 Prompt 到外部平台",
                      }
                    : issue,
            ),
    };
}
