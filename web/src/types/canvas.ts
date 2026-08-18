export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Script = "script",
    MarkdownDocument = "markdown-document",
    CharacterGroup = "character-group",
    CharacterCard = "character-card",
    CharacterAssetGroup = "character-asset-group",
    SceneGroup = "scene-group",
    SceneCard = "scene-card",
    PropGroup = "prop-group",
    PropCard = "prop-card",
    Shotboard = "shotboard",
    Shot = "shot",
    Config = "config",
    Video = "video",
    Audio = "audio",
    Group = "group",
}

// 节点类型放开为字符串,内置类型用 CanvasNodeType,插件类型为 "<pluginId>:<name>"
export type CanvasNodeTypeId = CanvasNodeType | (string & {});

export type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio";
export type CanvasImageGenerationType = "generation" | "edit";

export type CanvasNodeMetadata = {
    content?: string;
    composerContent?: string;
    prompt?: string;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    textOutputType?: "text" | "markdown" | "shotboard";
    model?: string;
    size?: string;
    quality?: string;
    background?: string;
    count?: number;
    seconds?: string;
    vquality?: string;
    generateAudio?: string;
    watermark?: string;
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
    references?: string[];
    naturalWidth?: number;
    naturalHeight?: number;
    freeResize?: boolean;
    isBatchRoot?: boolean;
    batchRootId?: string;
    batchChildIds?: string[];
    batchUsesReferenceImages?: boolean;
    primaryImageId?: string;
    imageBatchExpanded?: boolean;
    storageKey?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
    groupId?: string;
    sourceScriptNodeId?: string;
    characterRootId?: string;
    maxCharacters?: number;
    styleHint?: string;
    includeSupportingRoles?: boolean;
    excludeExtras?: boolean;
    selectedScriptSections?: Array<{ id: string; title: string }>;
    characterChildIds?: string[];
    characterBatchExpanded?: boolean;
    skippedCharacters?: Array<{ name: string; reason: string }>;
    rawModelOutput?: string;
    name?: string;
    role?: string;
    importance?: string;
    storyFunction?: string;
    ageRange?: string;
    gender?: string;
    body?: string;
    face?: string;
    hair?: string;
    clothing?: string;
    colors?: string[];
    temperament?: string;
    defaultExpression?: string;
    props?: string[];
    relationships?: string;
    positivePrompt?: string;
    negativePrompt?: string;
    consistencyLocks?: string[];
    sourceNote?: string;
    rawCharacterJson?: unknown;
    characterCardId?: string;
    characterAssetRootId?: string;
    characterAssetChildIds?: string[];
    characterAssetExpanded?: boolean;
    assetKinds?: Array<"three-view" | "expression-grid" | "shot-scale">;
    assetKind?: "three-view" | "expression-grid" | "shot-scale";
    referenceImageNodeId?: string;
    productionRecordId?: string;
    productionRecordIds?: string[];
    productionVersion?: number;
    productionRootId?: string;
    productionChildIds?: string[];
    productionExpanded?: boolean;
    productionKind?: "scene" | "prop" | "shotboard" | "shot" | "control-asset" | "jimeng-task" | "shot-candidate" | "asset-reference";
    assetReferenceAssetId?: string;
    assetReferenceAssetVersion?: number;
    assetReferenceKind?: "standard" | "turnaround" | "expression" | "shot-reference";
    interactive?: boolean; // 插件节点「交互 ⇄ 移动」开关状态(见 CanvasNodeDefinition.interactionToggle)
};

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeTypeId;
    title: string;
    position: Position;
    width: number;
    height: number;
    metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
};

export type CanvasAssistantReference = {
    id: string;
    type: CanvasNodeTypeId;
    title: string;
    dataUrl?: string;
    storageKey?: string;
    text?: string;
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
};

export type CanvasAssistantMessage = {
    id: string;
    role: "user" | "assistant" | "system" | "tool" | "error";
    title?: string;
    text: string;
    meta?: string;
    detail?: unknown;
    references?: CanvasAssistantReference[];
};

export type CanvasAssistantSession = {
    id: string;
    title: string;
    messages: CanvasAssistantMessage[];
    createdAt: string;
    updatedAt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
};

export type SelectionBox = {
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
    additive: boolean;
    initialSelectedNodeIds: string[];
};

export type ContextMenuState =
    | {
          type: "node";
          x: number;
          y: number;
          nodeId: string;
      }
    | {
          type: "connection";
          x: number;
          y: number;
          connectionId: string;
      };
