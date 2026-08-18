import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent as ReactChangeEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Group, Video } from "lucide-react";
import { saveAs } from "file-saver";

import { requestEdit, requestGeneration, requestImageQuestion } from "@/services/api/image";
import { requestAudioGeneration, storeGeneratedAudio } from "@/services/api/audio";
import { requestVideoGeneration, storeGeneratedVideo } from "@/services/api/video";
import { defaultConfig, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { resolveImageUrl } from "@/services/image-storage";
import { resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";
import { setStorageScope } from "@/services/storage-scope";
import { nanoid } from "nanoid";
import { getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useAssetStore } from "@/stores/use-asset-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { cropDataUrl, splitDataUrl, upscaleDataUrl } from "@/lib/canvas/canvas-image-data";
import { fitNodeSize, nodeSizeFromRatio } from "@/lib/canvas/canvas-node-size";
import { App, Button, Checkbox, Input, InputNumber, Modal, Segmented, Switch } from "antd";
import { NODE_DEFAULT_SIZE, getNodeSpec } from "@/constant/canvas";
import { ActiveConnectionPath, ConnectionPath } from "@/components/canvas/canvas-connections";
import { CanvasConfigComposer } from "@/components/canvas/canvas-config-composer";
import { CanvasConfigNodePanel } from "@/components/canvas/canvas-config-node-panel";
import { CanvasCharacterCardEditor } from "@/components/canvas/canvas-character-card-editor";
import { CanvasNodeContextMenu } from "@/components/canvas/canvas-context-menu";
import { CanvasNodeAngleDialog, type CanvasImageAngleParams } from "@/components/canvas/canvas-node-angle-dialog";
import { CanvasNodeCropDialog, type CanvasImageCropRect } from "@/components/canvas/canvas-node-crop-dialog";
import { CanvasNodeMaskEditDialog, type CanvasImageMaskEditPayload } from "@/components/canvas/canvas-node-mask-edit-dialog";
import { CanvasNodeSplitDialog, type CanvasImageSplitParams } from "@/components/canvas/canvas-node-split-dialog";
import { CanvasNodeUpscaleDialog, type CanvasImageUpscaleParams } from "@/components/canvas/canvas-node-upscale-dialog";
import { CanvasMarkdownReader, type CanvasMarkdownReaderLabels } from "@/components/canvas/canvas-markdown-reader";
import { buildNodeGenerationContext, buildNodeGenerationInputs, buildNodeResponseMessages, hydrateNodeGenerationContext, stripModelThinking, type NodeGenerationInput } from "@/components/canvas/canvas-node-generation";
import { CanvasNodeHoverToolbar, CanvasNodeInfoModal } from "@/components/canvas/canvas-node-hover-toolbar";
import { FrameForgeCanvas } from "@/components/canvas/frameforge";
import { Minimap } from "@/components/canvas/canvas-mini-map";
import { CanvasNode } from "@/components/canvas/canvas-node";
import { CanvasNodePromptPanel, type CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";
import { CanvasToolbar } from "@/components/canvas/canvas-toolbar";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { CanvasSidePanel } from "@/components/canvas/canvas-side-panel";
import { CanvasZoomControls } from "@/components/canvas/canvas-zoom-controls";
import { CanvasShotWorkbench } from "@/components/canvas/shot-workbench/canvas-shot-workbench";
import { CanvasShotboardWorkbench } from "@/components/canvas/shotboard-workbench/canvas-shotboard-workbench";
import { useAgentStore } from "@/stores/use-agent-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAgentBridge } from "@/pages/canvas/hooks/use-agent-bridge";
import { usePluginHost } from "@/pages/canvas/hooks/use-plugin-host";
import { buildNodeMentionReferences, type CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { splitMarkdownSections } from "@/lib/canvas/canvas-markdown";
import { onCanvasEvent } from "@/lib/canvas/canvas-event-bus";
import { autoLayoutCanvas } from "@/lib/canvas/canvas-auto-layout";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { copyImageBlobToClipboard } from "@/lib/canvas/canvas-clipboard";
import { applyNodeConfigPatch, audioMetadata, buildAudioGenerationMetadata, buildImageGenerationMetadata, createCanvasNode, imageMetadata, videoMetadata } from "@/lib/canvas/canvas-node-factory";
import { findContainingGroupId, findGroupDropTarget, getConnectionTargetAnchor, isHiddenBatchChild, isHiddenBatchConnectionEndpoint, normalizeConnection, snapNodesIntoGroup } from "@/lib/canvas/canvas-node-geometry";
import {
    audioExtension,
    buildAngleLabel,
    buildAnglePrompt,
    buildGenerationConfig,
    findRetrySourceNode,
    generationReferenceUrls,
    getGenerationCount,
    getInputSummary,
    hydrateAssistantImages,
    hydrateCanvasImages,
    imageExtension,
    isAudioFile,
    isGenerationCanceled,
    resetInterruptedGeneration,
    resolveMetadataReferences,
    sourceNodeReferenceImages,
} from "@/lib/canvas/canvas-generation-helpers";
import { getNodeDefinition, isBuiltinNodeType as isBuiltinType, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { registerBuiltinNodes } from "@/components/canvas/nodes/builtin-nodes";
import { CanvasPluginManagerModal } from "@/components/canvas/canvas-plugin-manager-modal";
import { CanvasRefreshShell } from "@/components/canvas/canvas-refresh-shell";
import { CanvasTopBar } from "@/components/canvas/canvas-top-bar";
import { ConnectionCreateMenu, NodeCreateMenu, type PendingConnectionCreate } from "@/components/canvas/canvas-create-menus";
import {
    CanvasNodeType,
    type CanvasAssistantImage,
    type CanvasAssistantSession,
    type CanvasConnection,
    type CanvasNodeData,
    type CanvasNodeMetadata,
    type CanvasNodeTypeId,
    type ConnectionHandle,
    type ContextMenuState,
    type Position,
    type SelectionBox,
    type ViewportTransform,
} from "@/types/canvas";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio } from "@/types/media";
import { createEmptyProductionProject, normalizeProductionProject, type AssetDraft, type ProductionProject, type ShotAssetKind } from "@/types/production";
import { isHiddenProductionChild, productionChildMotion } from "@/lib/canvas/canvas-production-groups";
import { syncCanvasCharacterAssets } from "@/lib/production/canvas-character-assets";
import { syncScriptBreakdownCharacterNames } from "@/lib/production/canvas-script-context";
import {
    buildProductionGenerationInput,
    buildProductionJsonRepairPrompt,
    buildShotboardGenerationPrompt,
    importGeneratedProduction,
    isRepairableProductionError,
    parseGeneratedProduction,
} from "@/lib/production/generated-production";
import { projectProductionToCanvas } from "@/lib/production/production-canvas-projection";
import { runShotPreflightBatches } from "@/lib/production/shot-preflight-runner";
import { reconcileKnownAssetBindings } from "@/lib/production/shot-preflight";
import { shotboardToMarkdown } from "@/lib/production/shotboard-markdown";
import { jimengTaskToMarkdown } from "@/lib/production/jimeng-task-compiler";
import { buildProductionPackage } from "@/lib/production/production-package";
import { addAssetDraft, adoptAssetDraft, buildAssetDraftPrompt, discardAssetDraft, findAssetDraftContext, parseAssetDraft, setAssetDraftIssueStatus, type AssetDraftAdoption } from "@/lib/production/asset-drafts";
import { compileAssetPrompt, compileStoredAssetPrompt } from "@/lib/production/asset-prompt-compiler";
import { addAssetReferenceImage, assetKindFromNodeType, assetReferenceLabel } from "@/lib/production/asset-references";
import { syncAssetReferenceToBoundShots } from "@/lib/production/shot-control-assets";
import { autoPrepareAllShots, autoPrepareShot } from "@/lib/production/shot-auto-progress";

// 内置节点注册到统一注册表(模块加载时执行一次)
registerBuiltinNodes();

type CanvasClipboard = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

type ConnectionDropTarget = {
    nodeId: string | null;
    isNearNode: boolean;
};

type CanvasHistoryEntry = Pick<CanvasClipboard, "nodes" | "connections"> & {
    production: ProductionProject;
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
};

type CanvasGenerationRequest = {
    targetNodeId: string;
    originNodeId: string;
    runningNodeId: string;
    controller: AbortController;
};

const VIDEO_NODE_MAX_WIDTH = 420;
const VIDEO_NODE_MAX_HEIGHT = 420;
// 稳定的空引用数组:避免每次渲染 `... || []` 产生新数组引用而击穿 CanvasNode 的 React.memo
const EMPTY_REFERENCES: CanvasResourceReference[] = [];
const CONNECTION_HANDLE_HIT_RADIUS = 40;
const CONNECTION_NODE_HIT_PADDING = 32;
const NODE_STATUS_IDLE = "idle" as const;
const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;
const NODE_STATUS_ERROR = "error" as const;
const DEFAULT_CHARACTER_BATCH_OPTIONS = { maxCharacters: 6, styleHint: "", includeSupportingRoles: true, excludeExtras: true };
type CharacterBatchOptions = typeof DEFAULT_CHARACTER_BATCH_OPTIONS;
const DEFAULT_CHARACTER_ASSET_OPTIONS = { styleHint: "", background: "纯白", size: "3:2", generateExpressionGrid: true, generateShotScale: true };
const ASSET_DRAFT_TIMEOUT_MS = 90_000;
type CharacterAssetOptions = typeof DEFAULT_CHARACTER_ASSET_OPTIONS;
type CharacterAssetMode = "model" | "manual";
const IMAGE_PROMPT_REVERSE_PRESET = `请根据参考图片反推一段适合用于 AI 生图的提示词。

要求：
1. 只输出提示词正文，不要解释。
2. 覆盖主体、构图、风格、光线、色彩、材质、镜头和氛围。
3. 尽量写成可直接用于生图模型的完整提示词。`;

export default function CanvasPage() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <CanvasRefreshShell />;

    return <FrameForgeCanvasPage />;
}

function FrameForgeCanvasPage() {
    const { message, modal } = App.useApp();
    // 订阅节点注册表版本,插件动态注册/卸载后驱动画布重渲染
    const nodeRegistryVersion = useNodeRegistryVersion((state) => state.version);
    const params = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const projectId = params.id || "";
    const localAgentConnected = useAgentStore((state) => state.connected);
    const localAgentActivity = useAgentStore((state) => state.activity);
    const localAgentEnabled = useAgentStore((state) => state.enabled);
    const agentPanelOpen = useAgentStore((state) => state.panelOpen);
    const toggleAgentPanel = useAgentStore((state) => state.togglePanel);
    const openAgentPanel = useAgentStore((state) => state.openPanel);
    const canvasOpenMode = searchParams.get("mode") || "";
    const hasAgentUrl = searchParams.has("agentUrl");
    const containerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<{
        nodeId?: string;
        position?: Position;
        assetReference?: { assetId: string; assetVersion: number; kind: ShotAssetKind; assetNodeId: string };
    } | null>(null);
    const clipboardRef = useRef<CanvasClipboard | null>(null);
    const historyRef = useRef<{ past: CanvasHistoryEntry[]; future: CanvasHistoryEntry[] }>({ past: [], future: [] });
    const lastHistoryRef = useRef<CanvasHistoryEntry | null>(null);
    const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const applyingHistoryRef = useRef(false);
    const historyPausedRef = useRef(false);
    const didInitialCenterRef = useRef(false);
    const rafRef = useRef<number | null>(null);
    const nodeDraggingRef = useRef(false);
    const dragRef = useRef<{
        isDraggingNode: boolean;
        hasMoved: boolean;
        startX: number;
        startY: number;
        initialSelectedNodes: { id: string; x: number; y: number }[];
    }>({
        isDraggingNode: false,
        hasMoved: false,
        startX: 0,
        startY: 0,
        initialSelectedNodes: [],
    });

    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const createProject = useCanvasStore((state) => state.createProject);
    const openProject = useCanvasStore((state) => state.openProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const renameProject = useCanvasStore((state) => state.renameProject);
    const deleteProjects = useCanvasStore((state) => state.deleteProjects);
    const flushProject = useCanvasStore((state) => state.flushProject);
    const saveStatus = useCanvasStore((state) => state.saveStatus);
    const currentProject = useCanvasStore((state) => state.projects.find((project) => project.id === projectId));
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [nodes, setNodes] = useState<CanvasNodeData[]>([]);

    useEffect(() => {
        setStorageScope({ kind: "project", ownerId: projectId });
        return () => setStorageScope({ kind: "library", ownerId: "library" });
    }, [projectId]);
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [production, setProduction] = useState<ProductionProject>(createEmptyProductionProject());
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [connectingParams, setConnectingParams] = useState<ConnectionHandle | null>(null);
    const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<string | null>(null);
    const [pendingConnectionCreate, setPendingConnectionCreate] = useState<PendingConnectionCreate | null>(null);
    const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [nodeCreatePosition, setNodeCreatePosition] = useState<Position | null>(null);
    const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>("lines");
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [projectLoaded, setProjectLoaded] = useState(false);
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    const [markdownReaderNodeId, setMarkdownReaderNodeId] = useState<string | null>(null);
    const [shotWorkbench, setShotWorkbench] = useState<{ shotboardId: string; shotId: string } | null>(null);
    const [shotboardWorkbench, setShotboardWorkbench] = useState<{ nodeId: string; shotboardId: string } | null>(null);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [editRequestNonce, setEditRequestNonce] = useState(0);
    const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
    const [pluginManagerOpen, setPluginManagerOpen] = useState(false);
    const [characterBatchScriptId, setCharacterBatchScriptId] = useState<string | null>(null);
    const [characterBatchTargetId, setCharacterBatchTargetId] = useState<string | null>(null);
    const [characterBatchOptions, setCharacterBatchOptions] = useState<CharacterBatchOptions>(DEFAULT_CHARACTER_BATCH_OPTIONS);
    const [characterBatchSectionIds, setCharacterBatchSectionIds] = useState<string[]>([]);
    const [characterAssetCardId, setCharacterAssetCardId] = useState<string | null>(null);
    const [characterAssetOptions, setCharacterAssetOptions] = useState<CharacterAssetOptions>(DEFAULT_CHARACTER_ASSET_OPTIONS);
    const [characterAssetMode, setCharacterAssetMode] = useState<CharacterAssetMode>("model");
    const [manualCharacterAssetFiles, setManualCharacterAssetFiles] = useState<Partial<Record<CharacterAssetKind, File>>>({});
    const [cropNodeId, setCropNodeId] = useState<string | null>(null);
    const [maskEditNodeId, setMaskEditNodeId] = useState<string | null>(null);
    const [splitNodeId, setSplitNodeId] = useState<string | null>(null);
    const [upscaleNodeId, setUpscaleNodeId] = useState<string | null>(null);
    const [superResolveNodeId, setSuperResolveNodeId] = useState<string | null>(null);
    const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
    const [collapsingBatchIds, setCollapsingBatchIds] = useState<Set<string>>(new Set());
    const [openingBatchIds, setOpeningBatchIds] = useState<Set<string>>(new Set());
    const [collapsingCharacterGroupIds, setCollapsingCharacterGroupIds] = useState<Set<string>>(new Set());
    const [openingCharacterGroupIds, setOpeningCharacterGroupIds] = useState<Set<string>>(new Set());
    const [collapsingCharacterAssetGroupIds, setCollapsingCharacterAssetGroupIds] = useState<Set<string>>(new Set());
    const [openingCharacterAssetGroupIds, setOpeningCharacterAssetGroupIds] = useState<Set<string>>(new Set());
    const [collapsingProductionGroupIds, setCollapsingProductionGroupIds] = useState<Set<string>>(new Set());
    const [openingProductionGroupIds, setOpeningProductionGroupIds] = useState<Set<string>>(new Set());
    const [isNodeDragging, setIsNodeDragging] = useState(false);
    const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);

    const nodesRef = useRef(nodes);
    const connectionsRef = useRef(connections);
    const productionRef = useRef(production);
    const selectedNodeIdsRef = useRef(selectedNodeIds);
    const viewportRef = useRef(viewport);
    const focusAnimRef = useRef<number | null>(null);
    const generateNodeRef = useRef<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<void>) | null>(null);
    const connectingParamsRef = useRef(connectingParams);
    const connectionTargetNodeIdRef = useRef(connectionTargetNodeId);
    const selectionBoxRef = useRef(selectionBox);
    const pendingConnectionCreateRef = useRef(pendingConnectionCreate);
    const generationRequestsRef = useRef(new Map<string, CanvasGenerationRequest>());

    const createHistoryEntry = useCallback(
        (): CanvasHistoryEntry => ({
            nodes: nodesRef.current,
            connections: connectionsRef.current,
            production: productionRef.current,
            chatSessions,
            activeChatId,
            backgroundMode,
            showImageInfo,
            viewport: viewportRef.current,
        }),
        [activeChatId, backgroundMode, chatSessions, showImageInfo],
    );

    const cleanupCanvasFiles = useCallback(
        (extra?: unknown) => {
            cleanupAssetImages({ extra, history: historyRef.current, lastHistory: lastHistoryRef.current });
        },
        [cleanupAssetImages],
    );

    const startGenerationRequest = useCallback((targetNodeId: string, originNodeId: string, runningId = originNodeId, controller = new AbortController()) => {
        const previous = generationRequestsRef.current.get(targetNodeId);
        if (previous?.controller !== controller) previous?.controller.abort();
        generationRequestsRef.current.set(targetNodeId, { targetNodeId, originNodeId, runningNodeId: runningId, controller });
        return controller;
    }, []);

    const finishGenerationRequest = useCallback((targetNodeId: string, controller: AbortController) => {
        const request = generationRequestsRef.current.get(targetNodeId);
        if (request?.controller === controller) generationRequestsRef.current.delete(targetNodeId);
    }, []);

    const stopGenerationByRunningId = useCallback((runningId: string) => {
        const affectedNodeIds = new Set<string>();
        generationRequestsRef.current.forEach((request) => {
            if (request.runningNodeId !== runningId) return;
            request.controller.abort();
            generationRequestsRef.current.delete(request.targetNodeId);
            affectedNodeIds.add(request.targetNodeId);
            affectedNodeIds.add(request.originNodeId);
        });
        setRunningNodeId((current) => (current === runningId ? null : current));
        if (!affectedNodeIds.size) return;
        setNodes((prev) => prev.map((node) => (affectedNodeIds.has(node.id) && node.metadata?.status === NODE_STATUS_LOADING ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined } } : node)));
    }, []);

    const confirmStopGeneration = useCallback(
        (nodeId: string) => {
            modal.confirm({
                title: "停止生成？",
                content: "当前生成请求会被中断，已经生成完成的内容会保留。",
                okText: "停止",
                cancelText: "继续生成",
                okButtonProps: { danger: true },
                onOk: () => stopGenerationByRunningId(nodeId),
            });
        },
        [modal, stopGenerationByRunningId],
    );

    useEffect(() => {
        if (!hydrated) return;
        setProjectLoaded(false);

        const restore = async () => {
            const project = await openProject(projectId);
            if (!project) {
                navigate("/canvas", { replace: true });
                return;
            }
            const restoredNodes = await hydrateCanvasImages(resetInterruptedGeneration(project.nodes));
            const restoredSessions = await hydrateAssistantImages(project.chatSessions || []);
            const restoredProduction = normalizeProductionProject(project.production);
            const now = new Date().toISOString();
            const synced = syncCanvasCharacterAssets(restoredProduction, restoredNodes, now);
            const reconciled = reconcileKnownAssetBindings(synced.production, now);
            const withReferences = reconciled.production.assetReferences.reduce(
                (current, reference) => syncAssetReferenceToBoundShots(current, reference, now).production,
                reconciled.production,
            );
            const prepared = autoPrepareAllShots(withReferences, now);
            setNodes(synced.nodes);
            setConnections(project.connections);
            setProduction(prepared);
            setChatSessions(restoredSessions);
            setActiveChatId(project.activeChatId || null);
            setBackgroundMode(project.backgroundMode);
            setShowImageInfo(project.showImageInfo || false);
            setViewport(project.viewport);
            historyRef.current = { past: [], future: [] };
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
            lastHistoryRef.current = {
                nodes: synced.nodes,
                connections: project.connections,
                production: prepared,
                chatSessions: restoredSessions,
                activeChatId: project.activeChatId || null,
                backgroundMode: project.backgroundMode,
                showImageInfo: project.showImageInfo || false,
                viewport: project.viewport,
            };
            setHistoryState({ canUndo: false, canRedo: false });
            setProjectLoaded(true);
        };
        void restore();
    }, [hydrated, navigate, openProject, projectId]);

    useEffect(() => {
        const warnBeforeLeave = (event: BeforeUnloadEvent) => {
            if (saveStatus !== "saving" && saveStatus !== "error" && saveStatus !== "conflict") return;
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warnBeforeLeave);
        return () => window.removeEventListener("beforeunload", warnBeforeLeave);
    }, [saveStatus]);

    useEffect(() => () => void flushProject(projectId), [flushProject, projectId]);

    useEffect(() => {
        if (saveStatus === "conflict") message.error("保存冲突，请刷新页面加载磁盘中的最新版本");
        if (saveStatus === "error") message.error("保存失败，请检查本地存储服务和磁盘状态");
    }, [message, saveStatus]);

    useEffect(() => {
        if (!projectLoaded || agentPanelOpen || hasAgentUrl || !["new", "recent", "choose"].includes(canvasOpenMode)) return;
        openAgentPanel();
    }, [agentPanelOpen, canvasOpenMode, hasAgentUrl, openAgentPanel, projectLoaded]);

    useEffect(() => {
        if (!projectLoaded || applyingHistoryRef.current || historyPausedRef.current) return;
        const next = createHistoryEntry();
        const previous = lastHistoryRef.current;
        if (
            previous?.nodes === next.nodes &&
            previous.connections === next.connections &&
            previous.production === next.production &&
            previous.chatSessions === next.chatSessions &&
            previous.activeChatId === next.activeChatId &&
            previous.backgroundMode === next.backgroundMode &&
            previous.showImageInfo === next.showImageInfo &&
            previous.viewport === next.viewport
        )
            return;

        if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = setTimeout(() => {
            const current = createHistoryEntry();
            const last = lastHistoryRef.current;
            if (!last) return;
            historyRef.current.past = [...historyRef.current.past.slice(-49), last];
            historyRef.current.future = [];
            setHistoryState({ canUndo: true, canRedo: false });
            lastHistoryRef.current = current;
            historyCommitTimerRef.current = null;
        }, 180);

        return () => {
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
        };
    }, [activeChatId, backgroundMode, chatSessions, connections, createHistoryEntry, nodes, production, projectLoaded, showImageInfo]);

    useEffect(() => {
        if (!projectLoaded || historyPausedRef.current) return;
        updateProject(projectId, { nodes, connections, chatSessions, activeChatId, backgroundMode, showImageInfo, production });
    }, [activeChatId, backgroundMode, chatSessions, connections, nodes, production, projectId, projectLoaded, showImageInfo, updateProject]);

    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId]);

    useEffect(() => {
        if (!projectLoaded) return;
        if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        viewportSaveTimerRef.current = setTimeout(() => {
            updateProject(projectId, { viewport: viewportRef.current });
            viewportSaveTimerRef.current = null;
        }, 500);
        return () => {
            if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        };
    }, [projectId, projectLoaded, updateProject, viewport]);

    useLayoutEffect(() => {
        nodesRef.current = nodes;
        connectionsRef.current = connections;
        productionRef.current = production;
        selectedNodeIdsRef.current = selectedNodeIds;
        viewportRef.current = viewport;
        connectingParamsRef.current = connectingParams;
        connectionTargetNodeIdRef.current = connectionTargetNodeId;
        pendingConnectionCreateRef.current = pendingConnectionCreate;
    }, [nodes, connections, production, selectedNodeIds, viewport, connectingParams, connectionTargetNodeId, pendingConnectionCreate]);

    useLayoutEffect(() => {
        selectionBoxRef.current = selectionBox;
    }, [selectionBox]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
            if (!didInitialCenterRef.current) {
                didInitialCenterRef.current = true;
                setViewport({ x: rect.width / 2, y: rect.height / 2, k: 1 });
            }
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, []);

    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const currentViewport = viewportRef.current;
        const localX = clientX - (rect?.left || 0);
        const localY = clientY - (rect?.top || 0);

        return {
            x: (localX - currentViewport.x) / currentViewport.k,
            y: (localY - currentViewport.y) / currentViewport.k,
        };
    }, []);

    const getCanvasCenter = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        return screenToCanvas((rect?.left || 0) + (rect?.width || size.width) / 2, (rect?.top || 0) + (rect?.height || size.height) / 2);
    }, [screenToCanvas, size.height, size.width]);

    const setConnecting = useCallback((next: ConnectionHandle | null) => {
        connectingParamsRef.current = next;
        setConnectingParams(next);
        if (!next) {
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
        }
    }, []);

    const keepNodeToolbar = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current || nodeImageSettingsOpen || !selectedNodeIdsRef.current.has(nodeId)) return;
            setToolbarNodeId(nodeId);
        },
        [nodeImageSettingsOpen],
    );

    const hideNodeToolbar = useCallback(() => {}, []);

    const connectNodes = useCallback(
        (current: ConnectionHandle, targetNodeId: string) => {
            if (current.nodeId === targetNodeId) return;

            const connection = normalizeConnection(current.nodeId, targetNodeId, nodesRef.current, current.handleType);
            if (!connection) {
                message.warning("配置节点之间不能连接");
                return;
            }
            const { fromNodeId, toNodeId } = connection;
            const exists = connectionsRef.current.some((conn) => conn.fromNodeId === fromNodeId && conn.toNodeId === toNodeId);
            if (!exists) {
                setConnections((prev) => [...prev, { id: `conn-${Date.now()}`, fromNodeId, toNodeId }]);
            }
            setContextMenu(null);
        },
        [message],
    );

    const createConnectedNode = useCallback(
        (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Video | CanvasNodeType.Audio, pending: PendingConnectionCreate) => {
            const metadata = type === CanvasNodeType.Config ? { model: effectiveConfig.imageModel || effectiveConfig.model, size: effectiveConfig.size } : undefined;
            const newNode = createCanvasNode(type, pending.position, metadata);
            const connection = normalizeConnection(pending.connection.nodeId, newNode.id, [...nodesRef.current, newNode], pending.connection.handleType);
            if (!connection) {
                message.warning("配置节点之间不能连接");
                return;
            }
            setNodes((prev) => [...prev, newNode]);
            setConnections((prev) => [...prev, { id: nanoid(), ...connection }]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio) setDialogNodeId(newNode.id);
            setPendingConnectionCreate(null);
            setConnecting(null);
        },
        [effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message, setConnecting],
    );

    const cancelPendingConnectionCreate = useCallback(() => {
        setPendingConnectionCreate(null);
        setConnecting(null);
    }, [setConnecting]);

    const getConnectionDropTarget = useCallback(
        (clientX: number, clientY: number, current: ConnectionHandle): ConnectionDropTarget => {
            const world = screenToCanvas(clientX, clientY);
            const scale = Math.max(viewportRef.current.k, 0.05);
            const padding = CONNECTION_NODE_HIT_PADDING / scale;
            const handleRadius = CONNECTION_HANDLE_HIT_RADIUS / scale;
            let isNearNode = false;
            let bestNodeId: string | null = null;
            let bestPriority = Number.POSITIVE_INFINITY;

            [...nodesRef.current]
                .filter(
                    (node) =>
                        (node.type === CanvasNodeType.CharacterCard || !isHiddenBatchChild(node, nodesRef.current)) &&
                        !isHiddenCharacterChild(node, nodesRef.current) &&
                        !isHiddenCharacterAssetChild(node, nodesRef.current) &&
                        !isHiddenProductionChild(node, nodesRef.current),
                )
                .reverse()
                .forEach((node) => {
                    const anchor = getConnectionTargetAnchor(node, current);
                    const dx = world.x - anchor.x;
                    const dy = world.y - anchor.y;
                    const hitsHandle = dx * dx + dy * dy <= handleRadius * handleRadius;
                    const hitsInside = world.x >= node.position.x && world.x <= node.position.x + node.width && world.y >= node.position.y && world.y <= node.position.y + node.height;
                    const hitsExpanded = world.x >= node.position.x - padding && world.x <= node.position.x + node.width + padding && world.y >= node.position.y - padding && world.y <= node.position.y + node.height + padding;

                    if (!hitsHandle && !hitsInside && !hitsExpanded) return;
                    isNearNode = true;
                    if (node.id === current.nodeId || !normalizeConnection(current.nodeId, node.id, nodesRef.current, current.handleType)) return;

                    const priority = hitsInside ? 0 : hitsHandle ? 1 : 2;
                    if (priority < bestPriority) {
                        bestNodeId = node.id;
                        bestPriority = priority;
                    }
                });

            return { nodeId: bestNodeId, isNearNode };
        },
        [screenToCanvas],
    );

    const visibleNodes = useMemo(() => {
        const padding = 280;
        const rect = containerRef.current?.getBoundingClientRect();
        const width = rect?.width || size.width;
        const height = rect?.height || size.height;
        const viewLeft = -viewport.x / viewport.k - padding;
        const viewTop = -viewport.y / viewport.k - padding;
        const viewRight = viewLeft + width / viewport.k + padding * 2;
        const viewBottom = viewTop + height / viewport.k + padding * 2;

        return nodes.filter(
            (node) =>
                !isHiddenBatchChild(node, nodes, collapsingBatchIds) &&
                !isHiddenCharacterChild(node, nodes, collapsingCharacterGroupIds) &&
                !isHiddenCharacterAssetChild(node, nodes, collapsingCharacterAssetGroupIds) &&
                !isHiddenProductionChild(node, nodes, collapsingProductionGroupIds) &&
                node.position.x + node.width > viewLeft &&
                node.position.x < viewRight &&
                node.position.y + node.height > viewTop &&
                node.position.y < viewBottom,
        );
    }, [collapsingBatchIds, collapsingCharacterAssetGroupIds, collapsingCharacterGroupIds, collapsingProductionGroupIds, nodes, size.height, size.width, viewport.k, viewport.x, viewport.y]);

    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    // 工具条跟随「单选节点」:点击/新建/框选/键盘选中任一节点都会显示,不再仅靠精确点中触发。
    // 多选时不显示;拖拽中由下方 isNodeDragging 守卫隐藏。
    const singleSelectedNodeId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;
    const toolbarNode = (toolbarNodeId ? nodeById.get(toolbarNodeId) || null : null) || (singleSelectedNodeId ? nodeById.get(singleSelectedNodeId) || null : null);
    const infoNode = infoNodeId ? nodeById.get(infoNodeId) || null : null;
    const cropNode = cropNodeId ? nodeById.get(cropNodeId) || null : null;
    const maskEditNode = maskEditNodeId ? nodeById.get(maskEditNodeId) || null : null;
    const splitNode = splitNodeId ? nodeById.get(splitNodeId) || null : null;
    const upscaleNode = upscaleNodeId ? nodeById.get(upscaleNodeId) || null : null;
    const superResolveNode = superResolveNodeId ? nodeById.get(superResolveNodeId) || null : null;
    const angleNode = angleNodeId ? nodeById.get(angleNodeId) || null : null;
    const previewNode = previewNodeId ? nodeById.get(previewNodeId) || null : null;
    const markdownReaderNode = useMemo(() => nodes.find((node) => node.id === markdownReaderNodeId) || null, [markdownReaderNodeId, nodes]);
    const characterBatchScript = characterBatchScriptId ? nodeById.get(characterBatchScriptId)?.metadata?.content || "" : "";
    const characterBatchSections = useMemo(() => splitMarkdownSections(characterBatchScript), [characterBatchScript]);
    const selectedCharacterBatchChars = useMemo(
        () => characterBatchSections.filter((section) => characterBatchSectionIds.includes(section.id)).reduce((sum, section) => sum + section.content.length, 0),
        [characterBatchSectionIds, characterBatchSections],
    );
    const markdownReaderLabels = useMemo(() => markdownLabelsForNode(markdownReaderNode), [markdownReaderNode]);
    const shotboardMarkdown = useMemo(() => {
        if (markdownReaderNode?.type !== CanvasNodeType.Shotboard || !markdownReaderNode.metadata?.productionRecordId) return undefined;
        try {
            return shotboardToMarkdown(production, markdownReaderNode.metadata.productionRecordId);
        } catch {
            return "";
        }
    }, [markdownReaderNode, production]);
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const activeNodeId = hasMultipleSelectedNodes ? null : hoveredNodeId || (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
    const batchChildCountById = useMemo(() => {
        const map = new Map<string, number>();
        nodes.forEach((node) => {
            if (node.metadata?.isBatchRoot) map.set(node.id, node.metadata.batchChildIds?.length || 0);
        });
        return map;
    }, [nodes]);
    const groupChildCountById = useMemo(() => {
        const map = new Map<string, number>();
        nodes.forEach((node) => {
            const groupId = node.metadata?.groupId;
            if (groupId) map.set(groupId, (map.get(groupId) || 0) + 1);
        });
        return map;
    }, [nodes]);
    const batchMotionById = useMemo(() => {
        const map = new Map<string, { x: number; y: number; index: number }>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Image) return;
            const rootId = node.metadata?.batchRootId;
            if (!rootId) return;
            const root = nodeById.get(rootId);
            const index = root?.metadata?.batchChildIds?.indexOf(node.id) ?? 0;
            const stackX = root ? root.position.x + 34 + index * 14 : node.position.x;
            const stackY = root ? root.position.y + 14 + index * 8 : node.position.y;
            map.set(node.id, { x: stackX - node.position.x, y: stackY - node.position.y, index: Math.max(index, 0) });
        });
        return map;
    }, [nodeById, nodes]);
    const characterMotionById = useMemo(() => {
        const map = new Map<string, { x: number; y: number; index: number }>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.CharacterCard) return;
            const rootId = characterRootId(node, nodes);
            if (!rootId) return;
            const root = nodeById.get(rootId);
            const index = root?.metadata?.characterChildIds?.indexOf(node.id) ?? 0;
            const stackX = root ? root.position.x + 34 + index * 14 : node.position.x;
            const stackY = root ? root.position.y + 14 + index * 8 : node.position.y;
            map.set(node.id, { x: stackX - node.position.x, y: stackY - node.position.y, index: Math.max(index, 0) });
        });
        return map;
    }, [nodeById, nodes]);
    const characterAssetMotionById = useMemo(() => {
        const map = new Map<string, { x: number; y: number; index: number }>();
        nodes.forEach((node) => {
            const rootId = characterAssetRootId(node, nodes);
            if (!rootId) return;
            const root = nodeById.get(rootId);
            const index = root?.metadata?.characterAssetChildIds?.indexOf(node.id) ?? 0;
            const stackX = root ? root.position.x + 34 + index * 14 : node.position.x;
            const stackY = root ? root.position.y + 14 + index * 8 : node.position.y;
            map.set(node.id, { x: stackX - node.position.x, y: stackY - node.position.y, index: Math.max(index, 0) });
        });
        return map;
    }, [nodeById, nodes]);
    const productionMotionById = useMemo(() => {
        const map = new Map<string, { x: number; y: number; index: number }>();
        nodes.forEach((node) => {
            const motion = productionChildMotion(node, nodes);
            if (motion) map.set(node.id, motion);
        });
        return map;
    }, [nodes]);
    const relatedHighlight = useMemo(() => {
        const nodeIds = new Set<string>();
        const connectionIds = new Set<string>();

        if (!activeNodeId) return { nodeIds, connectionIds };

        nodeIds.add(activeNodeId);
        connections.forEach((connection) => {
            if (connection.fromNodeId !== activeNodeId && connection.toNodeId !== activeNodeId) return;
            connectionIds.add(connection.id);
            nodeIds.add(connection.fromNodeId);
            nodeIds.add(connection.toNodeId);
        });

        return { nodeIds, connectionIds };
    }, [activeNodeId, connections]);

    const configInputsById = useMemo(() => {
        const map = new Map<string, NodeGenerationInput[]>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Config) return;
            map.set(node.id, buildNodeGenerationInputs(node.id, nodes, connections, production));
        });
        return map;
    }, [connections, nodes, production]);
    const mentionReferencesByNodeId = useMemo(() => {
        const map = new Map<string, ReturnType<typeof buildNodeMentionReferences>>();
        nodes.forEach((node) => map.set(node.id, buildNodeMentionReferences(node, nodes, connections, production)));
        return map;
    }, [connections, nodes, production]);
    const { applyAgentOps } = useAgentBridge({
        projectId,
        title: currentProject?.title,
        nodes,
        connections,
        selectedNodeIds,
        viewport,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        viewportRef,
        generateNodeRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setViewport,
        setContextMenu,
    });

    const { pluginHost, renderPluginPanel, buildNodeToolbarItems } = usePluginHost({
        effectiveConfig,
        isAiConfigReady,
        openConfigDialog,
        theme,
        nodesRef,
        connectionsRef,
        productionRef,
        viewportRef,
        setNodes,
        setDialogNodeId,
        applyAgentOps,
    });
    const createNode = useCallback(
        (type: CanvasNodeTypeId, position?: Position) => {
            const targetPosition = position || getCanvasCenter();
            const configMetadata =
                type === CanvasNodeType.Config
                    ? {
                          model: effectiveConfig.imageModel || effectiveConfig.model,
                          size: effectiveConfig.size,
                      }
                    : undefined;
            const newNode = createCanvasNode(type, targetPosition, configMetadata);

            setNodes((prev) => [...prev, newNode]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            const definition = getNodeDefinition(type);
            // 纯展示型插件节点(hidePanel)不弹面板;插件自定义 Panel 需显式 autoOpenPanel 才在新建时打开;
            // 声明了 useBuiltinPanel 的插件节点复用内置生成面板,新建即打开(与图片节点一致);
            // 内置的图片/视频/配置类节点保持原有「新建即打开生图面板」行为。
            const wantsPanel = definition?.hidePanel
                ? false
                : definition?.Panel
                  ? Boolean(definition.autoOpenPanel)
                  : definition?.useBuiltinPanel
                    ? true
                    : isBuiltinType(type) && type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio && type !== CanvasNodeType.Group;
            if (wantsPanel) setDialogNodeId(newNode.id);
        },
        [effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, getCanvasCenter],
    );

    const deleteNodes = useCallback(
        (ids: Set<string>) => {
            if (!ids.size) return;
            const allIds = new Set(ids);
            nodesRef.current.forEach((node) => {
                if (ids.has(node.id)) node.metadata?.batchChildIds?.forEach((childId) => allIds.add(childId));
                if (ids.has(node.id)) node.metadata?.characterChildIds?.forEach((childId) => allIds.add(childId));
                if (ids.has(node.id)) node.metadata?.characterAssetChildIds?.forEach((childId) => allIds.add(childId));
                if (ids.has(node.id)) node.metadata?.productionChildIds?.forEach((childId) => allIds.add(childId));
            });
            setNodes((prev) => {
                const next = prev.filter((node) => !allIds.has(node.id));
                return next.map((node) => {
                    const groupId = node.metadata?.groupId;
                    if (groupId && allIds.has(groupId)) return { ...node, metadata: { ...node.metadata, groupId: undefined } };
                    const productionChildIds = node.metadata?.productionChildIds?.filter((childId) => !allIds.has(childId));
                    if (productionChildIds?.length !== node.metadata?.productionChildIds?.length) {
                        return { ...node, metadata: { ...node.metadata, productionChildIds } };
                    }
                    const childIds = node.metadata?.batchChildIds?.filter((childId) => !allIds.has(childId));
                    if (!node.metadata?.isBatchRoot || childIds?.length === node.metadata.batchChildIds?.length) return node;
                    const primaryImageId = childIds?.includes(node.metadata.primaryImageId || "") ? node.metadata.primaryImageId : childIds?.[0];
                    const primaryNode = next.find((item) => item.id === primaryImageId);
                    return {
                        ...node,
                        metadata: {
                            ...node.metadata,
                            batchChildIds: childIds,
                            primaryImageId,
                            content: primaryNode?.metadata?.content || node.metadata.content,
                            naturalWidth: primaryNode?.metadata?.naturalWidth || node.metadata.naturalWidth,
                            naturalHeight: primaryNode?.metadata?.naturalHeight || node.metadata.naturalHeight,
                        },
                    };
                });
            });
            setConnections((prev) => prev.filter((conn) => !allIds.has(conn.fromNodeId) && !allIds.has(conn.toNodeId)));
            setSelectedNodeIds(new Set());
            setSelectedConnectionId(null);
            setHoveredNodeId((current) => (current && allIds.has(current) ? null : current));
            setToolbarNodeId((current) => (current && allIds.has(current) ? null : current));
            setDialogNodeId((current) => (current && allIds.has(current) ? null : current));
            setEditingNodeId((current) => (current && allIds.has(current) ? null : current));
            setInfoNodeId((current) => (current && allIds.has(current) ? null : current));
            setCropNodeId((current) => (current && allIds.has(current) ? null : current));
            setMaskEditNodeId((current) => (current && allIds.has(current) ? null : current));
            setAngleNodeId((current) => (current && allIds.has(current) ? null : current));
            setPreviewNodeId((current) => (current && allIds.has(current) ? null : current));
            setRunningNodeId((current) => (current && allIds.has(current) ? null : current));
            setContextMenu((current) => (current?.type === "node" && allIds.has(current.nodeId) ? null : current));
            cleanupCanvasFiles({ projectId, nodes: nodesRef.current.filter((node) => !allIds.has(node.id)), chatSessions });
        },
        [chatSessions, cleanupCanvasFiles, projectId],
    );

    const deleteConnection = useCallback((connectionId: string) => {
        setConnections((prev) => prev.filter((conn) => conn.id !== connectionId));
        setSelectedConnectionId((current) => (current === connectionId ? null : current));
        setContextMenu((current) => (current?.type === "connection" && current.connectionId === connectionId ? null : current));
    }, []);

    const deselectCanvas = useCallback(() => {
        cancelPendingConnectionCreate();
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setSelectionBox(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
        setEditingNodeId(null);
    }, [cancelPendingConnectionCreate]);

    const clearCanvas = useCallback(() => {
        setNodes([]);
        setConnections([]);
        const emptyProduction = createEmptyProductionProject();
        setProduction(emptyProduction);
        productionRef.current = emptyProduction;
        setInfoNodeId(null);
        setCropNodeId(null);
        setMaskEditNodeId(null);
        setAngleNodeId(null);
        setPreviewNodeId(null);
        setRunningNodeId(null);
        deselectCanvas();
        setClearConfirmOpen(false);
        cleanupCanvasFiles({ projectId, nodes: [], chatSessions: [] });
    }, [cleanupCanvasFiles, deselectCanvas, projectId]);

    const duplicateNode = useCallback((nodeId: string) => {
        const source = nodesRef.current.find((node) => node.id === nodeId);
        if (!source) return;
        if (source.metadata?.productionKind) {
            message.info("生产节点暂不支持复制");
            return;
        }

        const id = `${source.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const next: CanvasNodeData = {
            ...source,
            id,
            title: `${source.title} Copy`,
            position: { x: source.position.x + 36, y: source.position.y + 36 },
        };

        setNodes((prev) => [...prev, next]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        if (next.type !== CanvasNodeType.Group) setDialogNodeId(id);
    }, [message]);

    const copySelectedNodes = useCallback(() => {
        const selectedIds = selectedNodeIdsRef.current;
        if (!selectedIds.size) return;
        if (nodesRef.current.some((node) => selectedIds.has(node.id) && node.metadata?.productionKind)) {
            message.info("生产节点暂不支持复制");
            return;
        }

        const copiedNodes = nodesRef.current
            .filter((node) => selectedIds.has(node.id))
            .map((node) => ({
                ...node,
                position: { ...node.position },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            }));

        if (!copiedNodes.length) return;

        clipboardRef.current = {
            nodes: copiedNodes,
            connections: connectionsRef.current.filter((connection) => selectedIds.has(connection.fromNodeId) && selectedIds.has(connection.toNodeId)).map((connection) => ({ ...connection })),
        };
    }, [message]);

    const pasteCopiedNodes = useCallback(() => {
        const clipboard = clipboardRef.current;
        if (!clipboard?.nodes.length) return false;

        const center = getCanvasCenter();
        const bounds = clipboard.nodes.reduce(
            (acc, node) => ({
                left: Math.min(acc.left, node.position.x),
                top: Math.min(acc.top, node.position.y),
                right: Math.max(acc.right, node.position.x + node.width),
                bottom: Math.max(acc.bottom, node.position.y + node.height),
            }),
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        const dx = center.x - (bounds.left + bounds.right) / 2;
        const dy = center.y - (bounds.top + bounds.bottom) / 2;
        const idMap = new Map<string, string>();
        const nextNodes = clipboard.nodes.map((node, index) => {
            const id = `${node.type}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
            idMap.set(node.id, id);
            return {
                ...node,
                id,
                title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`,
                position: {
                    x: node.position.x + dx,
                    y: node.position.y + dy,
                },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            };
        });

        const pastedNodes = nextNodes.map((node) => {
            const groupId = node.metadata?.groupId;
            if (!groupId) return node;
            return { ...node, metadata: { ...node.metadata, groupId: idMap.get(groupId) } };
        });

        const nextConnections = clipboard.connections.flatMap((connection, index) => {
            const fromNodeId = idMap.get(connection.fromNodeId);
            const toNodeId = idMap.get(connection.toNodeId);
            if (!fromNodeId || !toNodeId) return [];
            return [
                {
                    ...connection,
                    id: `conn-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
                    fromNodeId,
                    toNodeId,
                },
            ];
        });

        setNodes((prev) => [...prev, ...pastedNodes]);
        setConnections((prev) => [...prev, ...nextConnections]);
        setSelectedNodeIds(new Set(pastedNodes.map((node) => node.id)));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(pastedNodes[0]?.type === CanvasNodeType.Group ? null : pastedNodes[0]?.id || null);
        return true;
    }, [getCanvasCenter]);

    const resetViewport = useCallback(() => {
        setViewport({ x: size.width / 2, y: size.height / 2, k: 1 });
        setContextMenu(null);
    }, [size.height, size.width]);

    const organizeCanvas = useCallback(() => {
        if (!nodesRef.current.length) {
            message.info("画布暂无节点");
            return;
        }
        const result = autoLayoutCanvas(nodesRef.current, connectionsRef.current, selectedNodeIdsRef.current);
        if (!result.organizedNodeIds.length) {
            message.info("没有可整理的节点");
            return;
        }
        setNodes(result.nodes);
        const organizedIdSet = new Set(result.organizedNodeIds);
        const allOrganizedNodes = result.nodes.filter((node) => organizedIdSet.has(node.id));
        const visibleOrganizedNodes = allOrganizedNodes.filter(
            (node) =>
                !isHiddenBatchChild(node, result.nodes) &&
                !isHiddenCharacterChild(node, result.nodes) &&
                !isHiddenCharacterAssetChild(node, result.nodes) &&
                !isHiddenProductionChild(node, result.nodes),
        );
        const organizedNodes = visibleOrganizedNodes.length ? visibleOrganizedNodes : allOrganizedNodes;
        const bounds = organizedNodes.reduce(
            (acc, node) => ({
                left: Math.min(acc.left, node.position.x),
                top: Math.min(acc.top, node.position.y),
                right: Math.max(acc.right, node.position.x + node.width),
                bottom: Math.max(acc.bottom, node.position.y + node.height),
            }),
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        const layoutWidth = Math.max(1, bounds.right - bounds.left);
        const layoutHeight = Math.max(1, bounds.bottom - bounds.top);
        const padding = 96;
        const nextScale = Math.min(Math.max(Math.min((size.width - padding * 2) / layoutWidth, (size.height - padding * 2) / layoutHeight, 1), 0.05), 5);
        const centerX = (bounds.left + bounds.right) / 2;
        const centerY = (bounds.top + bounds.bottom) / 2;
        const target = { x: size.width / 2 - centerX * nextScale, y: size.height / 2 - centerY * nextScale, k: nextScale };
        if (focusAnimRef.current) cancelAnimationFrame(focusAnimRef.current);
        const start = { ...viewportRef.current };
        viewportRef.current = target;
        const duration = 420;
        const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);
        let startTime: number | null = null;
        const step = (now: number) => {
            if (startTime === null) startTime = now;
            const progress = Math.min((now - startTime) / duration, 1);
            const t = easeOutCubic(progress);
            setViewport({ x: start.x + (target.x - start.x) * t, y: start.y + (target.y - start.y) * t, k: start.k + (target.k - start.k) * t });
            focusAnimRef.current = progress < 1 ? requestAnimationFrame(step) : null;
        };
        focusAnimRef.current = requestAnimationFrame(step);
        setContextMenu(null);
        message.success(`已整理 ${result.organizedNodeIds.length} 个节点`);
    }, [message, size.height, size.width]);

    const focusNode = useCallback(
        (nodeId: string) => {
            const node = nodesRef.current.find((item) => item.id === nodeId);
            if (!node) return;
            const worldX = node.position.x + node.width / 2;
            const worldY = node.position.y + node.height / 2;
            const k = Math.min(Math.max(Math.min((size.width * 0.6) / node.width, (size.height * 0.6) / node.height), 0.05), 1.5);
            const target = { x: size.width / 2 - worldX * k, y: size.height / 2 - worldY * k, k };
            setSelectedNodeIds(new Set([nodeId]));
            setSelectedConnectionId(null);
            setContextMenu(null);

            if (focusAnimRef.current) cancelAnimationFrame(focusAnimRef.current);
            const start = { ...viewportRef.current };
            const duration = 450;
            const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
            let startTime: number | null = null;
            const step = (now: number) => {
                if (startTime === null) startTime = now;
                const progress = Math.min((now - startTime) / duration, 1);
                const t = easeOutCubic(progress);
                setViewport({ x: start.x + (target.x - start.x) * t, y: start.y + (target.y - start.y) * t, k: start.k + (target.k - start.k) * t });
                focusAnimRef.current = progress < 1 ? requestAnimationFrame(step) : null;
            };
            focusAnimRef.current = requestAnimationFrame(step);
        },
        [size.height, size.width],
    );

    useEffect(() => () => void (focusAnimRef.current && cancelAnimationFrame(focusAnimRef.current)), []);

    const setZoomScale = useCallback(
        (scale: number) => {
            const nextScale = Math.min(Math.max(scale, 0.05), 5);
            setViewport((prev) => ({
                x: size.width / 2 - ((size.width / 2 - prev.x) / prev.k) * nextScale,
                y: size.height / 2 - ((size.height / 2 - prev.y) / prev.k) * nextScale,
                k: nextScale,
            }));
            setContextMenu(null);
        },
        [size.height, size.width],
    );

    const applyHistory = useCallback((entry: CanvasHistoryEntry) => {
        if (historyCommitTimerRef.current) {
            clearTimeout(historyCommitTimerRef.current);
            historyCommitTimerRef.current = null;
        }
        applyingHistoryRef.current = true;
        setNodes(entry.nodes);
        setConnections(entry.connections);
        setProduction(entry.production);
        productionRef.current = entry.production;
        setChatSessions(entry.chatSessions);
        setActiveChatId(entry.activeChatId);
        setBackgroundMode(entry.backgroundMode);
        setShowImageInfo(entry.showImageInfo);
        setViewport(entry.viewport);
        viewportRef.current = entry.viewport;
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setTimeout(() => {
            lastHistoryRef.current = entry;
            applyingHistoryRef.current = false;
            setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0 });
        });
    }, []);

    const undoCanvas = useCallback(() => {
        const previous = historyRef.current.past.pop();
        const current = lastHistoryRef.current;
        if (!previous || !current) return;
        historyRef.current.future.push(current);
        applyHistory(previous);
    }, [applyHistory]);

    const redoCanvas = useCallback(() => {
        const next = historyRef.current.future.pop();
        const current = lastHistoryRef.current;
        if (!next || !current) return;
        historyRef.current.past.push(current);
        applyHistory(next);
    }, [applyHistory]);

    const createAndOpenProject = useCallback(async () => {
        try {
            const id = await createProject(`影格工坊 ${useCanvasStore.getState().projects.length + 1}`);
            navigate(`/canvas/${id}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建画布失败");
        }
    }, [createProject, message, navigate]);

    const deleteCurrentProject = useCallback(async () => {
        try {
            await deleteProjects([projectId]);
            cleanupAssetImages();
            navigate("/canvas");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除画布失败");
        }
    }, [cleanupAssetImages, deleteProjects, message, navigate, projectId]);

    const exportCurrentProject = useCallback(async () => {
        const project = useCanvasStore.getState().projects.find((item) => item.id === projectId);
        if (!project) return message.error("未找到当前画布");
        const hide = message.loading("正在导出当前画布…", 0);
        try {
            await exportCanvasProjects([project], project.title || "影格工坊");
            message.success("已导出当前画布");
        } catch (error) {
            console.error(error);
            message.error("导出失败，请重试");
        } finally {
            hide();
        }
    }, [message, projectId]);

    const handleCanvasMouseDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            setNodeCreatePosition(null);
            if (pendingConnectionCreateRef.current) cancelPendingConnectionCreate();
            if (event.button !== 0) return;
            if (event.shiftKey) {
                setContextMenu(null);
                setHoveredNodeId(null);
                setToolbarNodeId(null);
                setDialogNodeId(null);
                setEditingNodeId(null);
            } else {
                deselectCanvas();
            }

            const world = screenToCanvas(event.clientX, event.clientY);
            const nextSelectionBox = {
                startWorldX: world.x,
                startWorldY: world.y,
                currentWorldX: world.x,
                currentWorldY: world.y,
                additive: event.shiftKey,
                initialSelectedNodeIds: event.shiftKey ? Array.from(selectedNodeIdsRef.current) : [],
            };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            if (!event.shiftKey) {
                setSelectedNodeIds(new Set());
            }

            setSelectedConnectionId(null);
        },
        [cancelPendingConnectionCreate, deselectCanvas, screenToCanvas],
    );

    // 仅处理「选中」的纯逻辑,供 body 冒泡拖拽入口与外层 capture 入口共用。
    // 返回本次点击后的单选目标 id(多选/取消时为 null),用于同步工具条。
    const selectNodeByEvent = useCallback((event: Pick<ReactMouseEvent, "shiftKey" | "metaKey" | "ctrlKey">, nodeId: string) => {
        const nextSelected = new Set(selectedNodeIdsRef.current);
        if (event.shiftKey || event.metaKey || event.ctrlKey) {
            if (nextSelected.has(nodeId)) nextSelected.delete(nodeId);
            else nextSelected.add(nodeId);
        } else if (!nextSelected.has(nodeId)) {
            nextSelected.clear();
            nextSelected.add(nodeId);
        }
        setSelectedNodeIds(nextSelected);
        const soloId = nextSelected.size === 1 && nextSelected.has(nodeId) ? nodeId : null;
        setToolbarNodeId(soloId);
        return { nextSelected, soloId };
    }, []);

    // capture 阶段选中:点击节点内部任意元素(含吞掉 mousedown 的 textarea/iframe)都能选中并弹出工具条。
    // 只做选中,不启动拖拽 —— 拖拽仍由 body 的 onMouseDown(冒泡)负责,故编辑器内选词不会拖动节点。
    // capture 必先于同一次事件的 body 冒泡触发,故把算好的选中集暂存,供紧随其后的拖拽入口复用,避免二次选中(shift 反选被抵消)。
    const pendingSelectionRef = useRef<Set<string> | null>(null);
    const handleNodeSelectCapture = useCallback(
        (event: ReactMouseEvent, nodeId: string) => {
            if (event.button !== 0) return;
            setContextMenu(null);
            setHoveredNodeId(null);
            setSelectedConnectionId(null);
            const { nextSelected } = selectNodeByEvent(event, nodeId);
            pendingSelectionRef.current = nextSelected;
        },
        [selectNodeByEvent],
    );

    const handleNodeMouseDown = useCallback((event: ReactMouseEvent, nodeId: string) => {
        event.stopPropagation();
        // 选中已由 capture 阶段完成;这里只负责建立拖拽。若因故没走 capture,则兜底再选一次。
        const currentNodes = nodesRef.current;
        const nextSelected = pendingSelectionRef.current ?? selectNodeByEvent(event, nodeId).nextSelected;
        pendingSelectionRef.current = null;
        const dragIds = new Set(nextSelected);
        currentNodes.forEach((node) => {
            if (!nextSelected.has(node.id)) return;
            node.metadata?.batchChildIds?.forEach((childId) => dragIds.add(childId));
            node.metadata?.characterChildIds?.forEach((childId) => dragIds.add(childId));
            node.metadata?.characterAssetChildIds?.forEach((childId) => dragIds.add(childId));
            node.metadata?.productionChildIds?.forEach((childId) => dragIds.add(childId));
            if (node.type === CanvasNodeType.Group) {
                currentNodes.forEach((child) => {
                    if (child.metadata?.groupId === node.id) dragIds.add(child.id);
                });
            }
        });
        dragRef.current = {
            isDraggingNode: true,
            hasMoved: false,
            startX: event.clientX,
            startY: event.clientY,
            initialSelectedNodes: currentNodes.filter((node) => dragIds.has(node.id)).map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })),
        };
        historyPausedRef.current = true;
        nodeDraggingRef.current = true;
        setIsNodeDragging(true);
    }, []);

    const finishNodeDrag = useCallback((clientX?: number, clientY?: number) => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        if (!dragRef.current.isDraggingNode) return;

        const wasClick = !dragRef.current.hasMoved && dragRef.current.initialSelectedNodes.length === 1;
        const clickedNodeId = dragRef.current.initialSelectedNodes[0]?.id;
        const currentViewport = viewportRef.current;
        const dx = clientX == null ? 0 : (clientX - dragRef.current.startX) / currentViewport.k;
        const dy = clientY == null ? 0 : (clientY - dragRef.current.startY) / currentViewport.k;
        const initialPositions = dragRef.current.initialSelectedNodes;

        historyPausedRef.current = false;
        nodeDraggingRef.current = false;
        setIsNodeDragging(false);
        setDropTargetGroupId(null);
        if (dragRef.current.hasMoved && clientX != null && clientY != null) {
            const movedIds = new Set(initialPositions.map((item) => item.id));
            setNodes((prev) => {
                const moved = prev.map((node) => {
                    const initial = initialPositions.find((item) => item.id === node.id);
                    return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                });
                const targetGroup = findGroupDropTarget(movedIds, moved);
                if (targetGroup) return snapNodesIntoGroup(movedIds, moved, targetGroup);
                return moved.map((node) => {
                    if (!movedIds.has(node.id) || node.type === CanvasNodeType.Group) return node;
                    const groupId = findContainingGroupId(node, moved);
                    if (node.metadata?.groupId === groupId) return node;
                    return { ...node, metadata: { ...node.metadata, groupId } };
                });
            });
        }

        dragRef.current.isDraggingNode = false;
        dragRef.current.hasMoved = false;
        dragRef.current.initialSelectedNodes = [];
        if (wasClick && clickedNodeId) {
            const clickedNode = nodesRef.current.find((node) => node.id === clickedNodeId);
            const clickedDefinition = clickedNode ? getNodeDefinition(clickedNode.type) : undefined;
            if (clickedNode?.type === CanvasNodeType.Text) {
                setDialogNodeId((current) => (current === clickedNodeId ? current : null));
            } else if (clickedDefinition?.hidePanel) {
                // 纯展示型插件节点:单击只选中,不弹下方面板
                setDialogNodeId((current) => (current === clickedNodeId ? current : null));
            } else if (clickedNode?.type !== CanvasNodeType.Group) {
                setDialogNodeId(clickedNodeId);
            }
        }
    }, []);

    const handleGlobalMouseMove = useCallback(
        (event: MouseEvent) => {
            const currentViewport = viewportRef.current;

            if (dragRef.current.isDraggingNode) {
                const dx = (event.clientX - dragRef.current.startX) / currentViewport.k;
                const dy = (event.clientY - dragRef.current.startY) / currentViewport.k;
                const initialPositions = dragRef.current.initialSelectedNodes;
                if (Math.abs(event.clientX - dragRef.current.startX) > 3 || Math.abs(event.clientY - dragRef.current.startY) > 3) {
                    dragRef.current.hasMoved = true;
                }

                const movedIds = new Set(initialPositions.map((item) => item.id));
                const previewNodes = nodesRef.current.map((node) => {
                    const initial = initialPositions.find((item) => item.id === node.id);
                    return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                });
                setDropTargetGroupId(findGroupDropTarget(movedIds, previewNodes)?.id || null);

                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(() => {
                    setNodes((prev) =>
                        prev.map((node) => {
                            const initial = initialPositions.find((item) => item.id === node.id);
                            return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                        }),
                    );
                    rafRef.current = null;
                });
                return;
            }

            if (connectingParamsRef.current && !pendingConnectionCreateRef.current) {
                const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, connectingParamsRef.current);
                connectionTargetNodeIdRef.current = dropTarget.nodeId;
                setConnectionTargetNodeId(dropTarget.nodeId);
                setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            }
        },
        [finishNodeDrag, getConnectionDropTarget, screenToCanvas],
    );

    const handleGlobalPointerMove = useCallback(
        (event: PointerEvent) => {
            const currentSelection = selectionBoxRef.current;
            if (!currentSelection) return;

            if (event.buttons === 0) {
                selectionBoxRef.current = null;
                setSelectionBox(null);
                return;
            }

            const world = screenToCanvas(event.clientX, event.clientY);
            const rectX = Math.min(currentSelection.startWorldX, world.x);
            const rectY = Math.min(currentSelection.startWorldY, world.y);
            const rectW = Math.abs(world.x - currentSelection.startWorldX);
            const rectH = Math.abs(world.y - currentSelection.startWorldY);
            const nextSelected = new Set<string>(currentSelection.additive ? currentSelection.initialSelectedNodeIds : []);

            nodesRef.current
                .filter(
                    (node) =>
                        !isHiddenBatchChild(node, nodesRef.current) &&
                        !isHiddenCharacterChild(node, nodesRef.current) &&
                        !isHiddenCharacterAssetChild(node, nodesRef.current) &&
                        !isHiddenProductionChild(node, nodesRef.current),
                )
                .forEach((node) => {
                    const intersects = rectX < node.position.x + node.width && rectX + rectW > node.position.x && rectY < node.position.y + node.height && rectY + rectH > node.position.y;

                    if (intersects) nextSelected.add(node.id);
                });

            const nextSelectionBox = { ...currentSelection, currentWorldX: world.x, currentWorldY: world.y };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            setSelectedNodeIds(nextSelected);
        },
        [screenToCanvas],
    );

    const handleGlobalMouseUp = useCallback(
        (event: MouseEvent) => {
            finishNodeDrag(event.clientX, event.clientY);

            selectionBoxRef.current = null;
            setSelectionBox(null);

            if (pendingConnectionCreateRef.current) return;

            const currentConnection = connectingParamsRef.current;
            if (currentConnection) {
                const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, currentConnection);
                if (dropTarget.nodeId) {
                    connectNodes(currentConnection, dropTarget.nodeId);
                    setConnecting(null);
                } else if (dropTarget.isNearNode) {
                    setConnecting(null);
                } else {
                    setMouseWorld(screenToCanvas(event.clientX, event.clientY));
                    setPendingConnectionCreate({ connection: currentConnection, position: screenToCanvas(event.clientX, event.clientY) });
                }
            }
        },
        [connectNodes, finishNodeDrag, getConnectionDropTarget, screenToCanvas, setConnecting],
    );

    useEffect(() => {
        const finishSelection = () => {
            selectionBoxRef.current = null;
            setSelectionBox(null);
        };
        const handlePointerUp = (event: PointerEvent) => {
            finishNodeDrag(event.clientX, event.clientY);
            finishSelection();
        };
        const cancelNodeDrag = () => {
            finishNodeDrag();
            finishSelection();
        };
        window.addEventListener("mousemove", handleGlobalMouseMove);
        window.addEventListener("mouseup", handleGlobalMouseUp);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", cancelNodeDrag);
        window.addEventListener("blur", cancelNodeDrag);
        window.addEventListener("pointermove", handleGlobalPointerMove);
        return () => {
            window.removeEventListener("mousemove", handleGlobalMouseMove);
            window.removeEventListener("mouseup", handleGlobalMouseUp);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", cancelNodeDrag);
            window.removeEventListener("blur", cancelNodeDrag);
            window.removeEventListener("pointermove", handleGlobalPointerMove);
        };
    }, [finishNodeDrag, handleGlobalMouseMove, handleGlobalMouseUp, handleGlobalPointerMove]);

    const createImageFileNode = useCallback(async (file: File, position: Position) => {
        const image = await uploadImage(file);
        const size = fitNodeSize(image.width, image.height);
        const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newNode: CanvasNodeData = {
            id,
            type: CanvasNodeType.Image,
            title: file.name,
            position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
            width: size.width,
            height: size.height,
            metadata: imageMetadata(image),
        };

        setNodes((prev) => [...prev, newNode]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const createVideoFileNode = useCallback(async (file: File, position: Position) => {
        const video = await uploadMediaFile(file, "video");
        const size = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
        const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setNodes((prev) => [
            ...prev,
            {
                id,
                type: CanvasNodeType.Video,
                title: file.name,
                position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
                width: size.width,
                height: size.height,
                metadata: videoMetadata(video),
            },
        ]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const createAudioFileNode = useCallback(async (file: File, position: Position) => {
        const audio = await uploadMediaFile(file, "audio");
        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
        const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setNodes((prev) => [
            ...prev,
            {
                id,
                type: CanvasNodeType.Audio,
                title: file.name,
                position: { x: position.x - spec.width / 2, y: position.y - spec.height / 2 },
                width: spec.width,
                height: spec.height,
                metadata: audioMetadata(audio),
            },
        ]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
    }, []);

    const createTextNodeFromClipboard = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return false;

            const node = {
                ...createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), { content: trimmed, status: NODE_STATUS_SUCCESS }),
                title: trimmed.slice(0, 32) || "剪切板文本",
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setContextMenu(null);
            setDialogNodeId(node.id);
            return true;
        },
        [getCanvasCenter],
    );

    const pasteSystemClipboard = useCallback(async () => {
        if (!navigator.clipboard) return;

        const items = await navigator.clipboard.read();
        const imageItem = items.find((item) => item.types.some((type) => type.startsWith("image/")));
        if (imageItem) {
            const imageType = imageItem.types.find((type) => type.startsWith("image/"));
            if (!imageType) return;
            const blob = await imageItem.getType(imageType);
            const file = new File([blob], "clipboard-image.png", { type: imageType });
            void createImageFileNode(file, getCanvasCenter());
            message.success("已从剪切板添加图片");
            return;
        }

        const text = await navigator.clipboard.readText();
        if (createTextNodeFromClipboard(text)) message.success("已从剪切板添加文本");
    }, [createImageFileNode, createTextNodeFromClipboard, getCanvasCenter, message]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true'],[data-canvas-no-zoom]")) return;

            const key = event.key.toLowerCase();
            const isModifierShortcut = event.metaKey || event.ctrlKey;

            if (isModifierShortcut && !event.altKey && key === "z") {
                event.preventDefault();
                if (event.shiftKey) redoCanvas();
                else undoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "y") {
                event.preventDefault();
                redoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "a") {
                event.preventDefault();
                setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
                setSelectedConnectionId(null);
                setContextMenu(null);
                setSelectionBox(null);
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "c") {
                event.preventDefault();
                copySelectedNodes();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "v") {
                event.preventDefault();
                if (!pasteCopiedNodes()) void pasteSystemClipboard();
                return;
            }

            if (event.key === "Delete" || event.key === "Backspace") {
                if (selectedNodeIdsRef.current.size) {
                    deleteNodes(new Set(selectedNodeIdsRef.current));
                } else if (selectedConnectionId) {
                    deleteConnection(selectedConnectionId);
                }
            }

            if (event.key === "Escape") {
                setSelectedNodeIds(new Set());
                setSelectedConnectionId(null);
                setContextMenu(null);
                setNodeCreatePosition(null);
                setSelectionBox(null);
                setConnecting(null);
                setHoveredNodeId(null);
                setToolbarNodeId(null);
                setDialogNodeId(null);
                setEditingNodeId(null);
                setInfoNodeId(null);
                setCropNodeId(null);
                setMaskEditNodeId(null);
                setPendingConnectionCreate(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [copySelectedNodes, deleteConnection, deleteNodes, pasteCopiedNodes, pasteSystemClipboard, redoCanvas, selectedConnectionId, setConnecting, undoCanvas]);

    const handleConnectStart = useCallback(
        (event: ReactMouseEvent, nodeId: string, handleType: "source" | "target") => {
            event.stopPropagation();
            setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            setConnecting({ nodeId, handleType });
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
            setSelectedConnectionId(null);
        },
        [screenToCanvas, setConnecting],
    );

    const handleNodeResize = useCallback((nodeId: string, width: number, height: number, position?: Position) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, width, height, position: position || node.position } : node)));
    }, []);

    const toggleNodeFreeResize = useCallback((nodeId: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                const freeResize = !node.metadata?.freeResize;
                if (freeResize || node.type !== CanvasNodeType.Image) return { ...node, metadata: { ...node.metadata, freeResize } };
                const ratio = (node.metadata?.naturalWidth || node.width) / (node.metadata?.naturalHeight || node.height || 1);
                const height = node.width / ratio;
                return { ...node, height, position: { x: node.position.x, y: node.position.y + node.height / 2 - height / 2 }, metadata: { ...node.metadata, freeResize } };
            }),
        );
    }, []);

    const handleNodeContentChange = useCallback((nodeId: string, content: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, content } } : node)));
    }, []);

    const handleNodeTitleChange = useCallback((nodeId: string, title: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, title } : node)));
    }, []);

    const toggleBatchExpanded = useCallback((nodeId: string) => {
        const isExpanded = Boolean(nodesRef.current.find((node) => node.id === nodeId)?.metadata?.imageBatchExpanded);
        if (isExpanded) {
            setCollapsingBatchIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setCollapsingBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 320);
        } else {
            setOpeningBatchIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setOpeningBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 260);
        }
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                return { ...node, metadata: { ...node.metadata, imageBatchExpanded: !node.metadata?.imageBatchExpanded } };
            }),
        );
    }, []);

    const toggleCharacterGroupExpanded = useCallback((nodeId: string) => {
        const isExpanded = nodesRef.current.find((node) => node.id === nodeId)?.metadata?.characterBatchExpanded !== false;
        if (isExpanded) {
            setCollapsingCharacterGroupIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setCollapsingCharacterGroupIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 320);
        } else {
            setOpeningCharacterGroupIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setOpeningCharacterGroupIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 340);
        }
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, characterBatchExpanded: !isExpanded } } : node)));
    }, []);

    const toggleCharacterAssetGroupExpanded = useCallback((nodeId: string) => {
        const isExpanded = nodesRef.current.find((node) => node.id === nodeId)?.metadata?.characterAssetExpanded !== false;
        if (isExpanded) {
            setCollapsingCharacterAssetGroupIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setCollapsingCharacterAssetGroupIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 320);
        } else {
            setOpeningCharacterAssetGroupIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setOpeningCharacterAssetGroupIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 340);
        }
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, characterAssetExpanded: !isExpanded } } : node)));
    }, []);

    const toggleProductionGroupExpanded = useCallback((nodeId: string) => {
        const root = nodesRef.current.find((node) => node.id === nodeId);
        if (!root?.metadata?.productionChildIds?.length) return;
        const isExpanded = root.metadata.productionExpanded !== false;
        const transientSetter = isExpanded ? setCollapsingProductionGroupIds : setOpeningProductionGroupIds;
        transientSetter((prev) => new Set(prev).add(nodeId));
        window.setTimeout(() => {
            transientSetter((prev) => {
                const next = new Set(prev);
                next.delete(nodeId);
                return next;
            });
        }, isExpanded ? 320 : 340);
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, productionExpanded: !isExpanded } } : node)));
    }, []);

    useEffect(
        () =>
            onCanvasEvent("character-group:toggle", (payload) => {
                if (!payload || typeof payload !== "object" || !("nodeId" in payload) || typeof payload.nodeId !== "string") return;
                toggleCharacterGroupExpanded(payload.nodeId);
            }),
        [toggleCharacterGroupExpanded],
    );
    useEffect(
        () =>
            onCanvasEvent("character-asset-group:toggle", (payload) => {
                if (!payload || typeof payload !== "object" || !("nodeId" in payload) || typeof payload.nodeId !== "string") return;
                toggleCharacterAssetGroupExpanded(payload.nodeId);
            }),
        [toggleCharacterAssetGroupExpanded],
    );
    useEffect(
        () =>
            onCanvasEvent("production-group:toggle", (payload) => {
                if (!payload || typeof payload !== "object" || !("nodeId" in payload) || typeof payload.nodeId !== "string") return;
                toggleProductionGroupExpanded(payload.nodeId);
            }),
        [toggleProductionGroupExpanded],
    );
    useEffect(
        () =>
            onCanvasEvent("shotboard:open", (payload) => {
                if (!payload || typeof payload !== "object" || !("nodeId" in payload) || typeof payload.nodeId !== "string") return;
                setDialogNodeId(null);
                setMarkdownReaderNodeId(payload.nodeId);
            }),
        [],
    );
    useEffect(
        () =>
            onCanvasEvent("shotboard-workbench:open", (payload) => {
                if (!payload || typeof payload !== "object" || !("nodeId" in payload) || typeof payload.nodeId !== "string") return;
                const node = nodesRef.current.find((item) => item.id === payload.nodeId);
                const shotboardId = node?.metadata?.productionRecordId;
                if (!shotboardId) {
                    message.error("分镜表生产数据缺失");
                    return;
                }
                const now = new Date().toISOString();
                const reconciled = reconcileKnownAssetBindings(productionRef.current, now);
                const prepared = autoPrepareAllShots(reconciled.production, now);
                if (prepared !== productionRef.current) {
                    productionRef.current = prepared;
                    setProduction(prepared);
                }
                setShotboardWorkbench({ nodeId: node.id, shotboardId });
            }),
        [message],
    );
    const runShotboardPreflight = useCallback(
        (shotboardId: string, scope: "issues" | "all", explicitShotIds?: string[]) => {
            const node = nodesRef.current.find((item) => item.type === CanvasNodeType.Shotboard && item.metadata?.productionRecordId === shotboardId);
            const scriptSynced = syncScriptBreakdownCharacterNames(productionRef.current, nodesRef.current);
            if (scriptSynced.production !== productionRef.current) {
                productionRef.current = scriptSynced.production;
                setProduction(scriptSynced.production);
            }
            const shotboard = scriptSynced.production.shotboards.find((item) => item.id === shotboardId);
            if (!node || !shotboard) {
                message.error("分镜表生产数据缺失");
                return;
            }
            const config = buildGenerationConfig(effectiveConfig, undefined, "text");
            if (!isAiConfigReady(config, config.model)) {
                openConfigDialog(true);
                return;
            }
            const targetShotIds = explicitShotIds?.length
                ? explicitShotIds
                : scope === "issues"
                    ? shotboard.shots
                          .filter((shot) => shot.preflight.status !== "ready" || shot.preflight.issues.some((issue) => issue.status === "open"))
                          .map((shot) => shot.id)
                    : undefined;
            if (targetShotIds?.length === 0) {
                message.info("当前没有需要整理的异常镜头");
                return;
            }
            const preferredAssetIds = shotboard.preflightBatches.at(-1)?.preferredAssetIds || [];
            const controller = startGenerationRequest(`preflight:${shotboardId}`, node.id, node.id);
            setRunningNodeId(node.id);
            void runShotPreflightBatches({
                production: scriptSynced.production,
                shotboardId,
                preferredAssetIds,
                targetShotIds,
                signal: controller.signal,
                onProgress: (runningProduction) => {
                    productionRef.current = runningProduction;
                    setProduction(runningProduction);
                },
                request: (preflightPrompt) =>
                    requestImageQuestion(config, [{ role: "user", content: preflightPrompt }], () => undefined, {
                        signal: controller.signal,
                    }),
            })
                .then((result) => {
                    if (controller.signal.aborted) return;
                    const prepared = autoPrepareAllShots(result.production, new Date().toISOString());
                    productionRef.current = prepared;
                    setProduction(prepared);
                    message.success(
                        `AI 检查完成：自动确认 ${result.summary.autoApproved}，需处理 ${result.summary.needsReview}，失败 ${result.summary.failed}`,
                    );
                })
                .catch((error) => {
                    if (!isGenerationCanceled(error)) message.error(error instanceof Error ? error.message : "AI 检查失败");
                })
                .finally(() => {
                    finishGenerationRequest(`preflight:${shotboardId}`, controller);
                    setRunningNodeId((current) => current === node.id ? null : current);
                });
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startGenerationRequest],
    );
    useEffect(
        () =>
            onCanvasEvent("shotboard-preflight:run", (payload) => {
                if (!payload || typeof payload !== "object") return;
                const requestedNodeId = "nodeId" in payload && typeof payload.nodeId === "string" ? payload.nodeId : undefined;
                const requestedShotboardId = "shotboardId" in payload && typeof payload.shotboardId === "string" ? payload.shotboardId : undefined;
                const node = requestedNodeId
                    ? nodesRef.current.find((item) => item.id === requestedNodeId)
                    : nodesRef.current.find((item) => item.type === CanvasNodeType.Shotboard && item.metadata?.productionRecordId === requestedShotboardId);
                const shotboardId = requestedShotboardId || node?.metadata?.productionRecordId;
                const scope = "scope" in payload && payload.scope === "issues" ? "issues" : "all";
                const explicitShotIds = "shotIds" in payload && Array.isArray(payload.shotIds) ? payload.shotIds.filter((id): id is string => typeof id === "string") : undefined;
                if (shotboardId) runShotboardPreflight(shotboardId, scope, explicitShotIds);
            }),
        [runShotboardPreflight],
    );
    useEffect(
        () =>
            onCanvasEvent("asset-draft:generate", (payload) => {
                if (!payload || typeof payload !== "object" || !("shotboardId" in payload) || typeof payload.shotboardId !== "string" || !("issueId" in payload) || typeof payload.issueId !== "string") return;
                const config = buildGenerationConfig(effectiveConfig, undefined, "text");
                if (!isAiConfigReady(config, config.model)) {
                    openConfigDialog(true);
                    return;
                }
                const shotboardId = payload.shotboardId;
                const issueId = payload.issueId;
                let context: ReturnType<typeof findAssetDraftContext>;
                try {
                    context = findAssetDraftContext(productionRef.current, shotboardId, issueId);
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "缺失资产信息不存在");
                    return;
                }
                const controller = startGenerationRequest(`asset-draft:${issueId}`, shotboardId, shotboardId);
                const generating = setAssetDraftIssueStatus(productionRef.current, shotboardId, issueId, "generating", undefined, new Date().toISOString());
                productionRef.current = generating;
                setProduction(generating);
                let timeoutId: number | undefined;
                let timedOut = false;
                const request = requestImageQuestion(config, [{ role: "user", content: buildAssetDraftPrompt(productionRef.current, shotboardId, issueId) }], () => undefined, { signal: controller.signal });
                const timeout = new Promise<never>((_, reject) => {
                    timeoutId = window.setTimeout(() => {
                        timedOut = true;
                        controller.abort();
                        reject(new Error("资产卡草案生成超时（90 秒），可复制 Prompt 到外部平台继续"));
                    }, ASSET_DRAFT_TIMEOUT_MS);
                });
                void Promise.race([request, timeout])
                    .then((answer) => {
                        if (controller.signal.aborted) return;
                        const draft = parseAssetDraft(answer, context, nanoid, new Date().toISOString());
                        const next = addAssetDraft(productionRef.current, shotboardId, draft);
                        productionRef.current = next;
                        setProduction(next);
                        message.success(`已生成${draft.name}资产卡草案`);
                    })
                    .catch((error) => {
                        if (isGenerationCanceled(error) && !timedOut) return;
                        const errorDetails = timedOut ? "资产卡草案生成超时（90 秒），可复制 Prompt 到外部平台继续" : error instanceof Error ? error.message : "资产卡草案生成失败";
                        const failed = setAssetDraftIssueStatus(productionRef.current, shotboardId, issueId, "error", errorDetails);
                        productionRef.current = failed;
                        setProduction(failed);
                        message.error(errorDetails);
                    })
                    .finally(() => {
                        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
                        finishGenerationRequest(`asset-draft:${issueId}`, controller);
                    });
            }),
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startGenerationRequest],
    );
    useEffect(
        () =>
            onCanvasEvent("asset-draft:cancel", (payload) => {
                if (!payload || typeof payload !== "object" || !("shotboardId" in payload) || typeof payload.shotboardId !== "string" || !("issueId" in payload) || typeof payload.issueId !== "string") return;
                const targetId = `asset-draft:${payload.issueId}`;
                const request = generationRequestsRef.current.get(targetId);
                request?.controller.abort();
                const next = setAssetDraftIssueStatus(productionRef.current, payload.shotboardId, payload.issueId, "idle");
                productionRef.current = next;
                setProduction(next);
                message.info("已停止资产卡生成，可重新发起或复制 Prompt 到外部平台");
            }),
        [message],
    );
    useEffect(
        () =>
            onCanvasEvent("asset-draft:discard", (payload) => {
                if (!payload || typeof payload !== "object" || !("shotboardId" in payload) || typeof payload.shotboardId !== "string" || !("draftId" in payload) || typeof payload.draftId !== "string") return;
                const next = discardAssetDraft(productionRef.current, payload.shotboardId, payload.draftId);
                productionRef.current = next;
                setProduction(next);
            }),
        [],
    );
    useEffect(
        () =>
            onCanvasEvent("asset-draft:adopt", (payload) => {
                if (!payload || typeof payload !== "object" || !("shotboardId" in payload) || typeof payload.shotboardId !== "string" || !("draftId" in payload) || typeof payload.draftId !== "string") return;
                void (async () => {
                    try {
                        const shouldGenerateImage = "generateImage" in payload && payload.generateImage === true;
                        const adoption = adoptAssetDraft(productionRef.current, payload.shotboardId, payload.draftId, new Date().toISOString(), nanoid);
                        const adoptedDraft = adoption.production.shotboards.find((item) => item.id === payload.shotboardId)?.assetDrafts.find((item) => item.id === payload.draftId);
                        const projection = projectAdoptedAssetToCanvas(adoption, nodesRef.current, nanoid);
                        productionRef.current = adoption.production;
                        nodesRef.current = projection.nodes;
                        connectionsRef.current = [...connectionsRef.current, ...projection.connections];
                        setProduction(adoption.production);
                        setNodes(projection.nodes);
                        setConnections(connectionsRef.current);
                        setSelectedNodeIds(new Set([projection.nodeId]));
                        message.success(`已采用${assetKindLabel(adoption.kind)}资产卡`);
                        if (shouldGenerateImage && adoptedDraft) {
                            const config = { ...buildGenerationConfig(effectiveConfig, undefined, "image"), size: adoptedDraft.recommendedRatio, count: "1" };
                            if (!isAiConfigReady(config, config.model)) {
                                openConfigDialog(true);
                                return;
                            }
                            try {
                                const compiledPrompt = compileAssetPrompt(adoptedDraft);
                                const image = await requestGeneration(config, compiledPrompt.positivePrompt, {}).then((items) => items[0]);
                                const uploaded = await uploadImage(image.dataUrl);
                                const imageNode = createDraftReferenceImageNode(projection.nodeId, projection.nodes, adoptedDraft, uploaded, nanoid(), compiledPrompt.positivePrompt, compiledPrompt.negativePrompt);
                                nodesRef.current = [...projection.nodes, imageNode];
                                connectionsRef.current = [...connectionsRef.current, { id: nanoid(), fromNodeId: projection.nodeId, toNodeId: imageNode.id }];
                                setNodes(nodesRef.current);
                                setConnections(connectionsRef.current);
                                setSelectedNodeIds(new Set([imageNode.id]));
                                message.success("参考图已生成并回填画板");
                            } catch (error) {
                                message.error(error instanceof Error ? `资产卡已采用，参考图生成失败：${error.message}` : "资产卡已采用，参考图生成失败");
                            }
                        }
                    } catch (error) {
                        message.error(error instanceof Error ? error.message : "采用资产卡失败");
                    }
                })();
            }),
        [effectiveConfig, isAiConfigReady, message, openConfigDialog],
    );
    useEffect(
        () =>
            onCanvasEvent("asset-reference:upload", (payload) => {
                if (!payload || typeof payload !== "object" || !("nodeId" in payload) || typeof payload.nodeId !== "string") return;
                const node = nodesRef.current.find((item) => item.id === payload.nodeId);
                const kind = node ? assetKindFromNodeType(node.type) : null;
                const assetId = node?.metadata?.productionRecordId;
                const assetVersion = node?.metadata?.productionVersion;
                if (!node || !kind || !assetId || !assetVersion) {
                    message.error("资产卡版本信息缺失，无法回填外部生成图");
                    return;
                }
                uploadTargetRef.current = { assetReference: { assetId, assetVersion, kind, assetNodeId: node.id } };
                imageInputRef.current?.click();
            }),
        [message],
    );
    useEffect(
        () =>
            onCanvasEvent("shot:open", (payload) => {
                if (!payload || typeof payload !== "object" || !("nodeId" in payload) || typeof payload.nodeId !== "string") return;
                const shotNode = nodesRef.current.find((node) => node.id === payload.nodeId);
                const rootNode = shotNode?.metadata?.productionRootId ? nodesRef.current.find((node) => node.id === shotNode.metadata?.productionRootId) : null;
                const shotId = shotNode?.metadata?.productionRecordId;
                const shotboardId = rootNode?.metadata?.productionRecordId;
                if (!shotId || !shotboardId) {
                    message.error("镜头生产数据缺失");
                    return;
                }
                const now = new Date().toISOString();
                const synced = syncCanvasCharacterAssets(productionRef.current, nodesRef.current, now);
                const reconciled = reconcileKnownAssetBindings(synced.production, now);
                const withReferences = reconciled.production.assetReferences.reduce(
                    (current, reference) => syncAssetReferenceToBoundShots(current, reference, now).production,
                    reconciled.production,
                );
                const prepared = autoPrepareShot(withReferences, shotboardId, shotId, now);
                if (prepared !== productionRef.current) {
                    productionRef.current = prepared;
                    setProduction(prepared);
                }
                if (synced.nodes !== nodesRef.current) {
                    nodesRef.current = synced.nodes;
                    setNodes(synced.nodes);
                }
                setDialogNodeId(null);
                setShotWorkbench({ shotboardId, shotId });
            }),
        [message],
    );

    const setBatchPrimary = useCallback((child: CanvasNodeData) => {
        const rootId = child.metadata?.batchRootId;
        if (!rootId || !child.metadata?.content) return;
        setNodes((prev) =>
            prev.map((node) =>
                node.id === rootId
                    ? {
                          ...node,
                          width: child.width,
                          height: child.height,
                          metadata: {
                              ...node.metadata,
                              content: child.metadata?.content,
                              primaryImageId: child.id,
                              naturalWidth: child.metadata?.naturalWidth,
                              naturalHeight: child.metadata?.naturalHeight,
                              freeResize: child.metadata?.freeResize,
                          },
                      }
                    : node,
            ),
        );
    }, []);

    const openTextEditor = useCallback((node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Text) return;
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        setDialogNodeId(node.id);
        setEditingNodeId(node.id);
        setEditRequestNonce((value) => value + 1);
    }, []);

    const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt } } : node)));
    }, []);

    const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? applyNodeConfigPatch(node, patch) : node)));
    }, []);

    const downloadNodeImage = useCallback((node: CanvasNodeData) => {
        if ((node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content) return;
        saveAs(node.metadata.content, `canvas-${node.type}-${node.id}.${node.type === CanvasNodeType.Video ? "mp4" : node.type === CanvasNodeType.Audio ? audioExtension(node.metadata.mimeType) : imageExtension(node.metadata.content)}`);
    }, []);

    const copyNodeImage = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Image || !node.metadata?.content) return message.error("没有可复制的图片");
            try {
                const response = await fetch(node.metadata.content);
                if (!response.ok) throw new Error("图片读取失败");
                await copyImageBlobToClipboard(await response.blob());
                message.success("图片已复制");
            } catch (error) {
                message.error(error instanceof Error ? `${error.message}，可改用下载` : "图片复制失败，可改用下载");
            }
        },
        [message],
    );

    const saveNodeAsset = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type === CanvasNodeType.Text || node.type === CanvasNodeType.Script || node.type === CanvasNodeType.MarkdownDocument) {
                const content = node.metadata?.content?.trim();
                if (!content) return message.error("没有可保存的文本");
                await addAsset({ kind: "text", title: node.metadata?.prompt?.slice(0, 24) || node.title || "画布文本", coverUrl: "", tags: [], source: "Canvas", data: { content }, metadata: { source: "canvas", nodeId: node.id } });
                message.success("已加入我的资产");
                return;
            }
            if (node.type === CanvasNodeType.Video) {
                if (!node.metadata?.content) return message.error("没有可保存的视频");
                await addAsset({
                    kind: "video",
                    title: node.metadata?.prompt?.slice(0, 24) || "画布视频",
                    coverUrl: "",
                    tags: [],
                    source: "Canvas",
                    data: { url: node.metadata.content, storageKey: node.metadata.storageKey, width: node.width, height: node.height, bytes: node.metadata.bytes || 0, mimeType: node.metadata.mimeType || "video/mp4" },
                    metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
                });
                message.success("已加入我的资产");
                return;
            }
            if (!node.metadata?.content) return message.error("没有可保存的图片");
            const dataUrl = node.metadata.storageKey ? "" : node.metadata.content;
            await addAsset({
                kind: "image",
                title: node.metadata?.prompt?.slice(0, 24) || "画布图片",
                coverUrl: node.metadata.content,
                tags: [],
                source: "Canvas",
                data: {
                    dataUrl,
                    storageKey: node.metadata.storageKey,
                    width: node.metadata.naturalWidth || node.width,
                    height: node.metadata.naturalHeight || node.height,
                    bytes: node.metadata.bytes || getDataUrlByteSize(dataUrl),
                    mimeType: node.metadata.mimeType || "image/png",
                },
                metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
            });
            message.success("已加入我的资产");
        },
        [addAsset, message],
    );

    const createImageReversePromptNodes = useCallback(
        (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Image || !node.metadata?.content) {
                message.warning("图片节点为空，无法反推提示词");
                return;
            }

            const gap = 96;
            const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
            const centerY = node.position.y + node.height / 2;
            const textNode = {
                ...createCanvasNode(CanvasNodeType.Text, { x: node.position.x + node.width + gap + textSpec.width / 2, y: centerY }, { content: IMAGE_PROMPT_REVERSE_PRESET, prompt: IMAGE_PROMPT_REVERSE_PRESET, status: NODE_STATUS_SUCCESS, fontSize: 14 }),
                title: "反推提示词",
            };
            const configNode = {
                ...createCanvasNode(
                    CanvasNodeType.Config,
                    { x: textNode.position.x + textNode.width + gap + configSpec.width / 2, y: centerY },
                    {
                        generationMode: "text",
                        model: effectiveConfig.textModel || effectiveConfig.model || defaultConfig.textModel,
                        count: 1,
                        composerContent: `参考图片：@[node:${node.id}]\n任务说明：@[node:${textNode.id}]`,
                    },
                ),
                title: "反推提示词配置",
            };

            setNodes((prev) => [...prev, textNode, configNode]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: configNode.id }, { id: nanoid(), fromNodeId: textNode.id, toNodeId: configNode.id }]);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
            setContextMenu(null);
        },
        [effectiveConfig.model, effectiveConfig.textModel, message],
    );

    const cropImageNode = useCallback(async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
        if (!node.metadata?.content) return;
        const cropped = await cropDataUrl(node.metadata.content, crop);
        const image = await uploadImage(cropped);
        const width = Math.min(node.width, Math.max(220, image.width));
        const childId = nanoid();
        const child: CanvasNodeData = {
            id: childId,
            type: CanvasNodeType.Image,
            title: "Cropped Image",
            position: { x: node.position.x + node.width + 96, y: node.position.y },
            width,
            height: width * (image.height / image.width),
            metadata: {
                ...imageMetadata(image),
                prompt: node.metadata?.prompt,
            },
        };
        setNodes((prev) => [...prev, child]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
        setSelectedNodeIds(new Set([childId]));
        setDialogNodeId(childId);
        setCropNodeId(null);
    }, []);

    const splitImageNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageSplitParams) => {
            if (!node.metadata?.content) return;
            setSplitNodeId(null);
            const pieces = await splitDataUrl(node.metadata.content, params);
            const gap = 16;
            const cellWidth = node.width / params.columns;
            const cellHeight = node.height / params.rows;
            const startX = node.position.x + node.width + 96;
            const startY = node.position.y;
            const childNodes = await Promise.all(
                pieces.map(async (piece) => {
                    const image = await uploadImage(piece.dataUrl);
                    const id = nanoid();
                    return {
                        id,
                        type: CanvasNodeType.Image,
                        title: `${node.title || "图片"} ${piece.row + 1}-${piece.column + 1}`,
                        position: { x: startX + piece.column * (cellWidth + gap), y: startY + piece.row * (cellHeight + gap) },
                        width: cellWidth,
                        height: cellHeight,
                        metadata: {
                            ...imageMetadata(image),
                            prompt: node.metadata?.prompt,
                        },
                    } satisfies CanvasNodeData;
                }),
            );
            setNodes((prev) => [...prev, ...childNodes]);
            setConnections((prev) => [...prev, ...childNodes.map((child) => ({ id: nanoid(), fromNodeId: node.id, toNodeId: child.id }))]);
            setSelectedNodeIds(new Set(childNodes.map((child) => child.id)));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            message.success(`已切分为 ${childNodes.length} 个子节点`);
        },
        [message],
    );

    const maskEditImageNode = useCallback(
        async (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1", size: node.metadata?.size || "auto" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const userPrompt = payload.prompt.trim();
            const prompt = `只修改蒙版透明区域，其他区域保持不变。${userPrompt}`;
            const childId = nanoid();
            const source = { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey };
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [source]);
            setMaskEditNodeId(null);
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title: userPrompt.slice(0, 32) || "局部编辑结果",
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: node.width,
                    height: node.height,
                    metadata: { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
                },
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setSelectedConnectionId(null);
            setDialogNodeId(childId);
            const controller = startGenerationRequest(childId, node.id, childId);
            try {
                const image = await requestEdit(generationConfig, prompt, [source], { id: `${node.id}-mask`, name: "mask.png", type: "image/png", dataUrl: payload.maskDataUrl }, { signal: controller.signal }).then((items) => items[0]);
                const uploaded = await uploadImage(image.dataUrl);
                const size = fitNodeSize(uploaded.width, uploaded.height, node.width, node.height);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), prompt, ...generationMetadata } } : item)));
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "局部修改失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                finishGenerationRequest(childId, controller);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startGenerationRequest],
    );

    const upscaleImageNode = useCallback(async (node: CanvasNodeData, params: CanvasImageUpscaleParams) => {
        if (!node.metadata?.content) return;
        setUpscaleNodeId(null);
        const upscaled = await upscaleDataUrl(node.metadata.content, params);
        const image = await uploadImage(upscaled);
        const size = fitNodeSize(image.width, image.height);
        const childId = nanoid();
        const child: CanvasNodeData = {
            id: childId,
            type: CanvasNodeType.Image,
            title: "Upscaled Image",
            position: { x: node.position.x + node.width + 96, y: node.position.y },
            width: size.width,
            height: size.height,
            metadata: {
                ...imageMetadata(image),
                prompt: node.metadata?.prompt,
            },
        };
        setNodes((prev) => [...prev, child]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
        setSelectedNodeIds(new Set([childId]));
        setDialogNodeId(childId);
    }, []);

    const generateAngleNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageAngleParams) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const childId = nanoid();
            const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const title = buildAngleLabel(params);
            const prompt = buildAnglePrompt(params);
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [
                { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey },
            ]);
            setAngleNodeId(null);
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title,
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: imageConfig.width,
                    height: imageConfig.height,
                    metadata: { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
                },
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setDialogNodeId(childId);
            const controller = startGenerationRequest(childId, node.id, childId);
            try {
                const image = await requestEdit(
                    generationConfig,
                    prompt,
                    [{ id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey }],
                    undefined,
                    { signal: controller.signal },
                ).then((items) => items[0]);
                const uploaded = await uploadImage(image.dataUrl);
                const size = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), prompt, ...generationMetadata } } : item)));
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                finishGenerationRequest(childId, controller);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, openConfigDialog, startGenerationRequest],
    );

    const handleFontSizeChange = useCallback((nodeId: string, fontSize: number) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, fontSize } } : node)));
    }, []);

    const handleUploadRequest = useCallback((nodeId?: string, position?: Position) => {
        uploadTargetRef.current = { nodeId, position };
        imageInputRef.current?.click();
    }, []);

    const handleImageInputChange = useCallback(
        async (event: ReactChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            const target = uploadTargetRef.current;
            if (!file || (!file.type.startsWith("image/") && !file.type.startsWith("video/") && !isAudioFile(file))) return;

            if (target?.assetReference) {
                if (!file.type.startsWith("image/")) {
                    message.error("资产参考图只能上传图片");
                    return;
                }
                try {
                    const image = await uploadImage(file);
                    const record = findAssetRecord(productionRef.current, target.assetReference.kind, target.assetReference.assetId, target.assetReference.assetVersion);
                    if (!record) throw new Error("资产版本不存在");
                    const compiled = compileStoredAssetPrompt(target.assetReference.kind, record);
                    const now = new Date().toISOString();
                    const result = addAssetReferenceImage(productionRef.current, {
                        id: nanoid(),
                        assetId: target.assetReference.assetId,
                        assetVersion: target.assetReference.assetVersion,
                        kind: "standard",
                        storageKey: image.storageKey,
                        fileName: file.name || `${record.name}.png`,
                        mimeType: image.mimeType,
                        width: image.width,
                        height: image.height,
                        prompt: compiled.positivePrompt,
                        negativePrompt: compiled.negativePrompt,
                        source: "uploaded",
                        createdAt: now,
                    });
                    const reconciled = reconcileKnownAssetBindings(result.production, now);
                    const synced = syncAssetReferenceToBoundShots(reconciled.production, result.reference, now);
                    const prepared = autoPrepareAllShots(synced.production, now);
                    const node = createAssetReferenceImageNode(target.assetReference.assetNodeId, nodesRef.current, result.reference, image, nanoid());
                    productionRef.current = prepared;
                    nodesRef.current = [...nodesRef.current, node];
                    connectionsRef.current = [...connectionsRef.current, { id: nanoid(), fromNodeId: target.assetReference.assetNodeId, toNodeId: node.id }];
                    setProduction(prepared);
                    setNodes(nodesRef.current);
                    setConnections(connectionsRef.current);
                    setSelectedNodeIds(new Set([node.id]));
                    setSelectedConnectionId(null);
                    message.success(
                        synced.updatedShotIds.length
                            ? `${record.name} ${assetReferenceLabel(result.reference.kind)}已自动接入 ${synced.updatedShotIds.length} 个镜头`
                            : reconciled.updatedShotIds.length
                              ? `${record.name}已匹配 ${reconciled.updatedShotIds.length} 个镜头，参考图会自动带入`
                            : `${record.name} ${assetReferenceLabel(result.reference.kind)}已回填，后续镜头会自动使用`,
                    );
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "外部生成图回填失败");
                } finally {
                    uploadTargetRef.current = null;
                    event.target.value = "";
                }
                return;
            }

            if (target?.nodeId) {
                if (isAudioFile(file)) {
                    const audio = await uploadMediaFile(file, "audio");
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Audio,
                                      title: file.name,
                                      position: { x: node.position.x + node.width / 2 - spec.width / 2, y: node.position.y + node.height / 2 - spec.height / 2 },
                                      width: spec.width,
                                      height: spec.height,
                                      metadata: { ...node.metadata, ...audioMetadata(audio), errorDetails: undefined },
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                if (file.type.startsWith("video/")) {
                    const video = await uploadMediaFile(file, "video");
                    const nextSize = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Video,
                                      title: file.name,
                                      position: { x: node.position.x + node.width / 2 - nextSize.width / 2, y: node.position.y + node.height / 2 - nextSize.height / 2 },
                                      width: nextSize.width,
                                      height: nextSize.height,
                                      metadata: { ...node.metadata, ...videoMetadata(video), errorDetails: undefined },
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(target.nodeId);
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                const image = await uploadImage(file);
                const size = fitNodeSize(image.width, image.height);
                setNodes((prev) =>
                    prev.map((node) =>
                        node.id === target.nodeId
                            ? {
                                  ...node,
                                  type: CanvasNodeType.Image,
                                  title: file.name,
                                  width: size.width,
                                  height: size.height,
                                  metadata: {
                                      ...node.metadata,
                                      ...imageMetadata(image),
                                      errorDetails: undefined,
                                      freeResize: false,
                                      isBatchRoot: undefined,
                                      batchRootId: undefined,
                                      batchChildIds: undefined,
                                      batchUsesReferenceImages: undefined,
                                      generationType: undefined,
                                      model: undefined,
                                      size: undefined,
                                      quality: undefined,
                                      count: undefined,
                                      references: undefined,
                                      primaryImageId: undefined,
                                      imageBatchExpanded: undefined,
                                  },
                              }
                            : node,
                    ),
                );
                setSelectedNodeIds(new Set([target.nodeId]));
                setSelectedConnectionId(null);
                setDialogNodeId(target.nodeId);
            } else {
                const position = target?.position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                void (isAudioFile(file) ? createAudioFileNode(file, position) : file.type.startsWith("video/") ? createVideoFileNode(file, position) : createImageFileNode(file, position));
            }

            uploadTargetRef.current = null;
            event.target.value = "";
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode, message, screenToCanvas, size.height, size.width],
    );

    const handleDrop = useCallback(
        (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/") || item.type.startsWith("video/") || isAudioFile(item));
            if (!file) return;

            const pos = screenToCanvas(event.clientX, event.clientY);
            void (isAudioFile(file) ? createAudioFileNode(file, pos) : file.type.startsWith("video/") ? createVideoFileNode(file, pos) : createImageFileNode(file, pos));
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode, screenToCanvas],
    );

    const startTitleEditing = useCallback(() => {
        setTitleDraft(currentProject?.title || "未命名画布");
        setTitleEditing(true);
    }, [currentProject?.title]);

    const finishTitleEditing = useCallback(async () => {
        const nextTitle = titleDraft.trim();
        if (nextTitle) await renameProject(projectId, nextTitle);
        setTitleEditing(false);
    }, [projectId, renameProject, titleDraft]);

    const preventCanvasContextMenu = useCallback((event: ReactMouseEvent) => {
        if ((event.target as HTMLElement).closest("[data-node-id]")) return;
        event.preventDefault();
        setContextMenu(null);
    }, []);

    const handleGenerateNode = useCallback(
        async (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => {
            const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
            const generationConfig = buildGenerationConfig(effectiveConfig, sourceNode, mode);
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            // 插件节点声明了 useBuiltinPanel.writeBackToSelf:复用内置面板生成,但结果写回节点自身。
            // 目前支持 image 模式(全景等展示型节点),前缀由 useBuiltinPanel.promptPrefix 指定。
            const builtinPanel = sourceNode ? getNodeDefinition(sourceNode.type)?.useBuiltinPanel : undefined;
            if (sourceNode && builtinPanel?.writeBackToSelf && builtinPanel.mode === "image") {
                const scene = prompt.trim();
                if (!scene) return;
                setRunningNodeId(nodeId);
                const controller = startGenerationRequest(nodeId, nodeId, nodeId);
                setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt: scene, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)));
                try {
                    const fullPrompt = (builtinPanel.promptPrefix || "") + scene;
                    // 上游图片节点作为参考图(图生图);无上游则纯文生图
                    const upstreamNodes = connectionsRef.current
                        .filter((conn) => conn.toNodeId === nodeId)
                        .map((conn) => nodesRef.current.find((node) => node.id === conn.fromNodeId))
                        .filter((node): node is CanvasNodeData => Boolean(node));
                    const refs = upstreamNodes.flatMap((up) =>
                        typeof up.metadata?.content === "string" && up.metadata.content && up.type !== sourceNode.type
                            ? [{ id: up.id, name: `${up.title || up.id}.png`, type: up.metadata.mimeType || "image/png", dataUrl: up.metadata.content, storageKey: up.metadata.storageKey }]
                            : [],
                    );
                    const image = refs.length
                        ? await requestEdit({ ...generationConfig, count: "1" }, fullPrompt, refs, undefined, { signal: controller.signal }).then((items) => items[0])
                        : await requestGeneration({ ...generationConfig, count: "1" }, fullPrompt, { signal: controller.signal }).then((items) => items[0]);
                    const uploaded = await uploadImage(image.dataUrl);
                    setNodes((prev) =>
                        prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...imageMetadata(uploaded), prompt: scene, model: generationConfig.model, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node)),
                    );
                    setDialogNodeId(null);
                } catch (error) {
                    if (!isGenerationCanceled(error)) {
                        const errorDetails = error instanceof Error ? error.message : "生成失败";
                        message.error(errorDetails);
                        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node)));
                    }
                } finally {
                    finishGenerationRequest(nodeId, controller);
                }
                return;
            }

            const isStructuredShotboard = mode === "text" && sourceNode?.type === CanvasNodeType.Config && sourceNode.metadata?.textOutputType === "shotboard";
            if (isStructuredShotboard) {
                setRunningNodeId(nodeId);
                const controller = startGenerationRequest(nodeId, nodeId, nodeId);
                let rawModelOutput = "";
                try {
                    const input = buildProductionGenerationInput(nodeId, nodesRef.current, connectionsRef.current, productionRef.current, sourceNode.metadata?.composerContent);
                    const directorInstruction = prompt.replace(/@\[node:[^\]]+\]/g, "").trim();
                    const generationPrompt = buildShotboardGenerationPrompt({
                        ...input,
                        directorInstructions: [...input.directorInstructions, ...(directorInstruction ? [directorInstruction] : [])],
                    });
                    rawModelOutput = await requestImageQuestion(generationConfig, [{ role: "user", content: generationPrompt }], () => undefined, { signal: controller.signal });
                    if (controller.signal.aborted) return;
                    let draft: ReturnType<typeof parseGeneratedProduction>;
                    try {
                        draft = parseGeneratedProduction(rawModelOutput, input);
                    } catch (error) {
                        if (!isRepairableProductionError(error)) throw error;
                        const repairedOutput = await requestImageQuestion(
                            generationConfig,
                            [{ role: "user", content: buildProductionJsonRepairPrompt(rawModelOutput, error) }],
                            () => undefined,
                            { signal: controller.signal },
                        );
                        if (controller.signal.aborted) return;
                        rawModelOutput = repairedOutput;
                        draft = parseGeneratedProduction(rawModelOutput, input);
                    }
                    const imported = importGeneratedProduction(productionRef.current, draft, {
                        sourceScriptNodeId: input.sourceScriptNodeId,
                        scriptMarkdown: input.scriptMarkdown,
                        characters: input.characters,
                        now: new Date().toISOString(),
                        idFactory: nanoid,
                    });
                    const projection = projectProductionToCanvas(imported, sourceNode, nanoid);
                    const nextNodes = [
                        ...nodesRef.current.map((node) =>
                            node.id === nodeId
                                ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_LOADING, prompt, rawModelOutput, errorDetails: undefined } }
                                : node,
                        ),
                        ...projection.nodes,
                    ];
                    const nextConnections = [...connectionsRef.current, ...projection.connections];
                    productionRef.current = imported.production;
                    nodesRef.current = nextNodes;
                    connectionsRef.current = nextConnections;
                    setProduction(imported.production);
                    setNodes(nextNodes);
                    setConnections(nextConnections);
                    const preferredAssetIds = [
                        ...input.characters.map((item) => item.id),
                        ...input.scenes.map((item) => item.id),
                        ...input.props.map((item) => item.id),
                    ];
                    let preflightProduction = imported.production;
                    let preflightSummary = { total: imported.shotboard.shots.length, autoApproved: 0, needsReview: 0, failed: imported.shotboard.shots.length, pending: 0 };
                    try {
                        const preflight = await runShotPreflightBatches({
                            production: imported.production,
                            shotboardId: imported.shotboard.id,
                            preferredAssetIds,
                            signal: controller.signal,
                            onProgress: (runningProduction) => {
                                productionRef.current = runningProduction;
                                setProduction(runningProduction);
                            },
                            request: (preflightPrompt) =>
                                requestImageQuestion(generationConfig, [{ role: "user", content: preflightPrompt }], () => undefined, {
                                    signal: controller.signal,
                                }),
                        });
                        if (controller.signal.aborted) return;
                        preflightProduction = preflight.production;
                        preflightSummary = preflight.summary;
                    } catch (error) {
                        if (isGenerationCanceled(error)) return;
                        message.warning("分镜已生成，AI 整理失败，可在分镜表中重试");
                    }
                    preflightProduction = autoPrepareAllShots(preflightProduction, new Date().toISOString());
                    productionRef.current = preflightProduction;
                    setProduction(preflightProduction);
                    setNodes((current) =>
                        current.map((node) =>
                            node.id === nodeId
                                ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } }
                                : node.metadata?.productionRecordId === imported.shotboard.id
                                  ? { ...node, metadata: { ...node.metadata, productionVersion: preflightProduction.shotboards.find((item) => item.id === imported.shotboard.id)?.version } }
                                  : node.type === CanvasNodeType.Shot && imported.shotboard.shots.some((shot) => shot.id === node.metadata?.productionRecordId)
                                    ? { ...node, metadata: { ...node.metadata, productionVersion: preflightProduction.shotboards.find((item) => item.id === imported.shotboard.id)?.version } }
                                    : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([projection.shotboardNodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(null);
                    message.success(
                        `已生成 ${preflightSummary.total} 个镜头：自动确认 ${preflightSummary.autoApproved}，需处理 ${preflightSummary.needsReview}，整理失败 ${preflightSummary.failed}`,
                    );
                } catch (error) {
                    if (isGenerationCanceled(error)) return;
                    const errorDetails = error instanceof Error ? error.message : "结构化分镜生成失败";
                    message.error(errorDetails);
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails, rawModelOutput: rawModelOutput || undefined } } : node,
                        ),
                    );
                } finally {
                    finishGenerationRequest(nodeId, controller);
                    setRunningNodeId(null);
                }
                return;
            }

            setRunningNodeId(nodeId);
            const runController = startGenerationRequest(nodeId, nodeId, nodeId);
            const sourceTextContent = sourceNode?.type === CanvasNodeType.Text ? sourceNode.metadata?.content?.trim() || "" : "";
            const editingTextNode = mode === "text" && Boolean(sourceTextContent);
            const generationContext = await hydrateNodeGenerationContext(
                buildNodeGenerationContext(
                    nodeId,
                    nodesRef.current,
                    connectionsRef.current,
                    mode === "text" ? withFinalAnswerOnlyInstruction(editingTextNode ? `请根据要求修改以下文本。\n\n原文：\n${sourceTextContent}\n\n修改要求：\n${prompt}` : prompt) : prompt,
                    productionRef.current,
                ),
            );
            const effectivePrompt = generationContext.prompt.trim();
            if (runController.signal.aborted) {
                finishGenerationRequest(nodeId, runController);
                setRunningNodeId(null);
                return;
            }
            const markSourceStatus = sourceNode?.type !== CanvasNodeType.Image && !editingTextNode;
            const statusPrompt = sourceNode?.type === CanvasNodeType.Config ? effectivePrompt : prompt;
            if (!effectivePrompt && (mode === "text" || mode === "audio")) {
                finishGenerationRequest(nodeId, runController);
                setRunningNodeId(null);
                return;
            }
            let pendingChildIds: string[] = [];
            if (markSourceStatus) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt: statusPrompt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)));

            try {
                if (mode === "image") {
                    const count = getGenerationCount(generationConfig.count);
                    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                    const isImageNode = sourceNode?.type === CanvasNodeType.Image;
                    const isEmptyImageNode = isImageNode && !sourceNode?.metadata?.content;
                    const sourceReference =
                        isImageNode && sourceNode?.metadata?.content
                            ? [{ id: sourceNode.id, name: `${sourceNode.title || sourceNode.id}.png`, type: sourceNode.metadata.mimeType || "image/png", dataUrl: sourceNode.metadata.content, storageKey: sourceNode.metadata.storageKey }]
                            : [];
                    const referenceImages = sourceReference.length ? sourceReference : generationContext.referenceImages;
                    const generationType = referenceImages.length ? ("edit" as const) : ("generation" as const);
                    const generationMetadata = buildImageGenerationMetadata(generationType, generationConfig, count, referenceImages);
                    const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : isImageNode ? CanvasNodeType.Image : CanvasNodeType.Text];
                    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                    const gap = 96;
                    const rowGap = 36;
                    const rootId = isEmptyImageNode ? nodeId : nanoid();
                    const childIds = count > 1 ? Array.from({ length: count }, () => nanoid()) : [];
                    const targetIds = count > 1 ? childIds : [rootId];
                    pendingChildIds = isEmptyImageNode ? childIds : [rootId, ...childIds];
                    const rootNode: CanvasNodeData = {
                        id: rootId,
                        type: CanvasNodeType.Image,
                        title: effectivePrompt.slice(0, 32) || "Generated Image",
                        position: {
                            x: isEmptyImageNode ? parentPosition.x : parentPosition.x + parentConfig.width + gap,
                            y: parentPosition.y + parentConfig.height / 2 - imageConfig.height / 2,
                        },
                        width: isEmptyImageNode ? sourceNode?.width || imageConfig.width : imageConfig.width,
                        height: isEmptyImageNode ? sourceNode?.height || imageConfig.height : imageConfig.height,
                        metadata: {
                            prompt: effectivePrompt,
                            status: NODE_STATUS_LOADING,
                            isBatchRoot: count > 1,
                            batchChildIds: count > 1 ? childIds : undefined,
                            batchUsesReferenceImages: referenceImages.length > 0,
                            ...generationMetadata,
                            imageBatchExpanded: count > 1 ? true : undefined,
                        },
                    };
                    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
                        id,
                        type: CanvasNodeType.Image,
                        title: effectivePrompt.slice(0, 32) || "Generated Image",
                        position: {
                            x: rootNode.position.x + rootNode.width + 120 + (index % 2) * (imageConfig.width + 36),
                            y: rootNode.position.y + Math.floor(index / 2) * (imageConfig.height + rowGap),
                        },
                        width: imageConfig.width,
                        height: imageConfig.height,
                        metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, batchRootId: count > 1 ? rootId : undefined, ...generationMetadata },
                    }));
                    const batchConnections = [...(isEmptyImageNode ? [] : [{ id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]), ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: rootId, toNodeId: childId }))];

                    setNodes((prev) => [
                        ...prev.map((node) =>
                            node.id === nodeId
                                ? isConfigNode
                                    ? {
                                          ...node,
                                          metadata: { ...node.metadata, prompt: effectivePrompt, status: NODE_STATUS_LOADING, errorDetails: undefined },
                                      }
                                    : isEmptyImageNode
                                      ? {
                                            ...node,
                                            position: rootNode.position,
                                            width: rootNode.width,
                                            height: rootNode.height,
                                            title: rootNode.title,
                                            metadata: { ...node.metadata, ...rootNode.metadata, errorDetails: undefined },
                                        }
                                      : isImageNode
                                        ? {
                                              ...node,
                                              metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined },
                                          }
                                        : {
                                              ...node,
                                              type: CanvasNodeType.Text,
                                              title: prompt.slice(0, 32) || "Prompt",
                                              width: parentConfig.width,
                                              height: parentConfig.height,
                                              metadata: { ...node.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS, fontSize: 14, errorDetails: undefined },
                                          }
                                : node,
                        ),
                        ...(isEmptyImageNode ? [] : [rootNode]),
                        ...childNodes,
                    ]);
                    setConnections((prev) => [...prev, ...batchConnections]);
                    setSelectedNodeIds(new Set([nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(nodeId);

                    const controller = runController;
                    targetIds.forEach((targetId) => startGenerationRequest(targetId, nodeId, nodeId, controller));
                    if (count > 1) startGenerationRequest(rootId, nodeId, nodeId, controller);
                    let hasSuccess = false;
                    let hasFailure = false;
                    await Promise.all(
                        targetIds.map(async (targetId) => {
                            try {
                                const image = referenceImages.length
                                    ? await requestEdit({ ...generationConfig, count: "1" }, effectivePrompt, referenceImages, undefined, { signal: controller.signal }).then((items) => items[0])
                                    : await requestGeneration({ ...generationConfig, count: "1" }, effectivePrompt, { signal: controller.signal }).then((items) => items[0]);
                                const uploaded = await uploadImage(image.dataUrl);
                                const imageSize = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                                setNodes((prev) => {
                                    const root = prev.find((node) => node.id === rootId);
                                    return prev.map((node) => {
                                        if (node.id !== targetId && node.id !== rootId) return node;
                                        const center = { x: node.position.x + node.width / 2, y: node.position.y + node.height / 2 };
                                        if (node.id === rootId && (targetId === rootId || !root?.metadata?.primaryImageId))
                                            return {
                                                ...node,
                                                position: { x: center.x - imageSize.width / 2, y: center.y - imageSize.height / 2 },
                                                width: imageSize.width,
                                                height: imageSize.height,
                                                metadata: { ...node.metadata, ...imageMetadata(uploaded), primaryImageId: targetId },
                                            };
                                        if (node.id === targetId)
                                            return {
                                                ...node,
                                                position: { x: center.x - imageSize.width / 2, y: center.y - imageSize.height / 2 },
                                                width: imageSize.width,
                                                height: imageSize.height,
                                                metadata: { ...node.metadata, ...imageMetadata(uploaded) },
                                            };
                                        return node;
                                    });
                                });
                                hasSuccess = true;
                                if (isConfigNode) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node)));
                                return true;
                            } catch (error) {
                                if (isGenerationCanceled(error)) return false;
                                const errorDetails = error instanceof Error ? error.message : "生成失败";
                                hasFailure = true;
                                setNodes((prev) => prev.map((node) => (node.id === targetId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node)));
                            } finally {
                                finishGenerationRequest(targetId, controller);
                            }
                            return false;
                        }),
                    );
                    if (count > 1) finishGenerationRequest(rootId, controller);
                    if (controller.signal.aborted) {
                        setNodes((prev) => prev.map((node) => (node.id === nodeId && isConfigNode && node.metadata?.status === NODE_STATUS_LOADING ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined } } : node)));
                        return;
                    }
                    if (hasFailure) message.error(hasSuccess ? "部分图片生成失败" : "全部图片生成失败");
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === nodeId && isConfigNode
                                ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : "全部图片生成失败" } }
                                : node.id === nodeId && isEmptyImageNode
                                  ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : "全部图片生成失败" } }
                                  : node.id === rootId && !hasSuccess
                                    ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: "全部图片生成失败" } }
                                    : node,
                        ),
                    );
                    return;
                }

                if (mode === "video") {
                    const spec = nodeSizeFromRatio(generationConfig.size, NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, NODE_DEFAULT_SIZE[CanvasNodeType.Video].height) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                    const isEmptyVideoNode = sourceNode?.type === CanvasNodeType.Video && !sourceNode.metadata?.content;
                    const videoId = isEmptyVideoNode ? nodeId : nanoid();
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const videoNode: CanvasNodeData = {
                        id: videoId,
                        type: CanvasNodeType.Video,
                        title: effectivePrompt.slice(0, 32) || "Generated Video",
                        position: isEmptyVideoNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y },
                        width: isEmptyVideoNode ? sourceNode.width : spec.width,
                        height: isEmptyVideoNode ? sourceNode.height : spec.height,
                        metadata: {
                            prompt: effectivePrompt,
                            status: NODE_STATUS_LOADING,
                            model: generationConfig.model,
                            size: generationConfig.size,
                            seconds: generationConfig.videoSeconds,
                            vquality: generationConfig.vquality,
                            generateAudio: generationConfig.videoGenerateAudio,
                            watermark: generationConfig.videoWatermark,
                            references: generationReferenceUrls(generationContext),
                        },
                    };
                    pendingChildIds = [videoId];
                    setNodes((prev) =>
                        isEmptyVideoNode
                            ? prev.map((node) => (node.id === nodeId ? { ...node, ...videoNode } : node))
                            : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), videoNode],
                    );
                    if (!isEmptyVideoNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: videoId }]);
                    const controller = startGenerationRequest(videoId, nodeId, nodeId, runController);
                    try {
                        const video = await storeGeneratedVideo(
                            await requestVideoGeneration(generationConfig, effectivePrompt, generationContext.referenceImages, generationContext.referenceVideos, generationContext.referenceAudios, { signal: controller.signal }),
                        );
                        const videoSize = fitNodeSize(video.width || spec.width, video.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                        setNodes((prev) =>
                            prev.map((node) =>
                                node.id === videoId
                                    ? {
                                          ...node,
                                          width: videoSize.width,
                                          height: videoSize.height,
                                          position: { x: node.position.x + node.width / 2 - videoSize.width / 2, y: node.position.y + node.height / 2 - videoSize.height / 2 },
                                          metadata: {
                                              ...node.metadata,
                                              ...videoMetadata(video),
                                              prompt: effectivePrompt,
                                              model: generationConfig.model,
                                              size: generationConfig.size,
                                              seconds: generationConfig.videoSeconds,
                                              vquality: generationConfig.vquality,
                                              generateAudio: generationConfig.videoGenerateAudio,
                                              watermark: generationConfig.videoWatermark,
                                              references: generationReferenceUrls(generationContext),
                                          },
                                      }
                                    : node,
                            ),
                        );
                    } finally {
                        finishGenerationRequest(videoId, controller);
                    }
                    return;
                }

                if (mode === "audio") {
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    const isEmptyAudioNode = sourceNode?.type === CanvasNodeType.Audio && !sourceNode.metadata?.content;
                    const audioId = isEmptyAudioNode ? nodeId : nanoid();
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const audioNode: CanvasNodeData = {
                        id: audioId,
                        type: CanvasNodeType.Audio,
                        title: effectivePrompt.slice(0, 32) || "Generated Audio",
                        position: isEmptyAudioNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y + ((sourceNode?.height || spec.height) - spec.height) / 2 },
                        width: isEmptyAudioNode ? sourceNode.width : spec.width,
                        height: isEmptyAudioNode ? sourceNode.height : spec.height,
                        metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, ...buildAudioGenerationMetadata(generationConfig) },
                    };
                    pendingChildIds = [audioId];
                    setNodes((prev) =>
                        isEmptyAudioNode
                            ? prev.map((node) => (node.id === nodeId ? { ...node, ...audioNode } : node))
                            : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), audioNode],
                    );
                    if (!isEmptyAudioNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: audioId }]);
                    const controller = startGenerationRequest(audioId, nodeId, nodeId, runController);
                    try {
                        const audio = await storeGeneratedAudio(await requestAudioGeneration(generationConfig, effectivePrompt, { signal: controller.signal }), generationConfig.audioFormat);
                        setNodes((prev) => prev.map((node) => (node.id === audioId ? { ...node, metadata: { ...node.metadata, ...audioMetadata(audio), prompt: effectivePrompt, ...buildAudioGenerationMetadata(generationConfig) } } : node)));
                    } finally {
                        finishGenerationRequest(audioId, controller);
                    }
                    return;
                }

                let streamed = "";
                const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                const textOutputType = sourceNode?.metadata?.textOutputType || "text";
                const textNodeType = textOutputType === "markdown" ? CanvasNodeType.MarkdownDocument : CanvasNodeType.Text;
                const textCount = isConfigNode && mode !== "text" ? getGenerationCount(generationConfig.count) : 1;
                const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : CanvasNodeType.Text];
                const textConfig = NODE_DEFAULT_SIZE[textNodeType];
                const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                const childIds = isConfigNode || editingTextNode ? Array.from({ length: textCount }, () => nanoid()) : [];
                pendingChildIds = childIds;
                if (isConfigNode || editingTextNode) {
                    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
                        id,
                        type: textNodeType,
                        title: textNodeType === CanvasNodeType.MarkdownDocument ? "Markdown 文档" : effectivePrompt.slice(0, 32) || "Generated Text",
                        position: {
                            x: parentPosition.x + parentConfig.width + 96,
                            y: parentPosition.y + parentConfig.height / 2 - textConfig.height / 2 + (index - (textCount - 1) / 2) * (textConfig.height + 36),
                        },
                        width: textConfig.width,
                        height: textConfig.height,
                        metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, ...(textNodeType === CanvasNodeType.Text ? { fontSize: 14 } : {}) },
                    }));
                    setNodes((prev) => [...prev.map((node) => (node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, prompt: effectivePrompt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)), ...childNodes]);
                    setConnections((prev) => [...prev, ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: nodeId, toNodeId: childId }))]);
                }

                const controller = runController;
                const textTargetIds = childIds.length ? childIds : [nodeId];
                textTargetIds.forEach((targetNodeId) => startGenerationRequest(targetNodeId, nodeId, nodeId, controller));
                const answers = await Promise.all(
                    textTargetIds.map((targetNodeId) => {
                        let localStreamed = "";
                        return requestImageQuestion(
                            generationConfig,
                            buildNodeResponseMessages({ ...generationContext, prompt: effectivePrompt }),
                            (text) => {
                                const cleanText = stripModelThinking(text);
                                localStreamed = cleanText;
                                streamed = cleanText;
                                if (isConfigNode) return;
                                setNodes((prev) => prev.map((node) => (node.id === targetNodeId ? { ...node, type: textNodeType, metadata: { ...node.metadata, content: cleanText, status: NODE_STATUS_LOADING } } : node)));
                            },
                            { signal: controller.signal },
                        )
                            .then((answer) => ({ nodeId: targetNodeId, content: stripModelThinking(answer || localStreamed) }))
                            .finally(() => finishGenerationRequest(targetNodeId, controller));
                    }),
                );
                if (controller.signal.aborted) return;
                const answerByNodeId = new Map(answers.map((item) => [item.nodeId, item.content]));
                setNodes((prev) =>
                    prev.map((node) =>
                        childIds.includes(node.id)
                            ? { ...node, metadata: { ...node.metadata, content: answerByNodeId.get(node.id) || streamed, status: NODE_STATUS_SUCCESS } }
                            : node.id === nodeId && isConfigNode
                              ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } }
                              : node.id === nodeId && !editingTextNode
                                ? { ...node, type: textNodeType, title: textNodeType === CanvasNodeType.MarkdownDocument ? "Markdown 文档" : prompt.slice(0, 32) || "Generated Text", metadata: { ...node.metadata, content: answerByNodeId.get(node.id) || streamed, status: NODE_STATUS_SUCCESS } }
                                : node,
                    ),
                );
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                message.error(errorDetails);
                setNodes((prev) =>
                    prev.map((node) => (node.id === nodeId || pendingChildIds.includes(node.id) ? (node.id === nodeId && !markSourceStatus ? node : { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } }) : node)),
                );
            } finally {
                finishGenerationRequest(nodeId, runController);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startGenerationRequest],
    );
    useEffect(() => {
        generateNodeRef.current = handleGenerateNode;
    }, [handleGenerateNode]);

    const handleRetryNode = useCallback(
        async (node: CanvasNodeData) => {
            const sourceNode = findRetrySourceNode(node.id, nodesRef.current, connectionsRef.current) || node;
            const batchRoot = node.metadata?.batchRootId ? nodesRef.current.find((item) => item.id === node.metadata?.batchRootId) : null;
            const savedImageMetadata = node.type === CanvasNodeType.Image ? { ...batchRoot?.metadata, ...node.metadata } : undefined;
            const hasSavedImageMetadata = Boolean(savedImageMetadata?.generationType);
            const generationConfig =
                hasSavedImageMetadata && savedImageMetadata
                    ? {
                          ...effectiveConfig,
                          model: savedImageMetadata.model || effectiveConfig.imageModel || effectiveConfig.model,
                          quality: savedImageMetadata.quality || effectiveConfig.quality,
                          size: savedImageMetadata.size || effectiveConfig.size,
                          background: savedImageMetadata.background ?? effectiveConfig.background,
                          count: "1",
                      }
                    : { ...buildGenerationConfig(effectiveConfig, sourceNode, node.type === CanvasNodeType.Text || node.type === CanvasNodeType.MarkdownDocument ? "text" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : "image"), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const context = hasSavedImageMetadata
                ? null
                : await hydrateNodeGenerationContext(
                      buildNodeGenerationContext(sourceNode.id, nodesRef.current, connectionsRef.current, sourceNode.metadata?.prompt || node.metadata?.prompt || "", productionRef.current),
                  );
            const prompt = (savedImageMetadata?.prompt || context?.prompt || "").trim();
            if (!prompt) {
                message.warning("找不到提示词，无法重试");
                return;
            }
            const generationType = savedImageMetadata?.generationType;
            const useReferenceImages = generationType ? generationType === "edit" : Boolean(context?.referenceImages.length);
            const retryReferenceImages =
                hasSavedImageMetadata && savedImageMetadata ? await resolveMetadataReferences(savedImageMetadata) : useReferenceImages ? (context?.referenceImages.length ? context.referenceImages : sourceNodeReferenceImages(batchRoot || sourceNode)) : [];
            if (useReferenceImages && !retryReferenceImages) {
                message.error("参考图片已丢失，无法继续重试");
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "参考图片已丢失，无法继续重试" } } : item)));
                return;
            }
            const retryImages = retryReferenceImages || [];

            setRunningNodeId(node.id);
            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } } : item)));
            const controller = startGenerationRequest(node.id, sourceNode.id, node.id);

            try {
                if (node.type === CanvasNodeType.Text) {
                    if (!context) return;
                    let streamed = "";
                    const answer = await requestImageQuestion(
                        generationConfig,
                        buildNodeResponseMessages({ ...context, prompt }),
                        (text) => {
                            streamed = stripModelThinking(text);
                            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: streamed, status: NODE_STATUS_LOADING } } : item)));
                        },
                        { signal: controller.signal },
                    );
                    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: stripModelThinking(answer || streamed), prompt, status: NODE_STATUS_SUCCESS } } : item)));
                    return;
                }
                if (node.type === CanvasNodeType.MarkdownDocument) {
                    if (!context) return;
                    let streamed = "";
                    const answer = await requestImageQuestion(
                        generationConfig,
                        buildNodeResponseMessages({ ...context, prompt }),
                        (text) => {
                            streamed = stripModelThinking(text);
                            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, content: streamed, status: NODE_STATUS_LOADING } } : item)));
                        },
                        { signal: controller.signal },
                    );
                    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, content: stripModelThinking(answer || streamed), prompt, status: NODE_STATUS_SUCCESS } } : item)));
                    return;
                }
                if (node.type === CanvasNodeType.Video) {
                    const video = await storeGeneratedVideo(await requestVideoGeneration(generationConfig, prompt, retryImages, context?.referenceVideos || [], context?.referenceAudios || [], { signal: controller.signal }));
                    const videoSize = fitNodeSize(video.width || node.width, video.height || node.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                    setNodes((prev) =>
                        prev.map((item) =>
                            item.id === node.id
                                ? {
                                      ...item,
                                      width: videoSize.width,
                                      height: videoSize.height,
                                      position: { x: item.position.x + item.width / 2 - videoSize.width / 2, y: item.position.y + item.height / 2 - videoSize.height / 2 },
                                      metadata: {
                                          ...item.metadata,
                                          ...videoMetadata(video),
                                          prompt,
                                          model: generationConfig.model,
                                          size: generationConfig.size,
                                          seconds: generationConfig.videoSeconds,
                                          vquality: generationConfig.vquality,
                                          generateAudio: generationConfig.videoGenerateAudio,
                                          watermark: generationConfig.videoWatermark,
                                      },
                                  }
                                : item,
                        ),
                    );
                    return;
                }
                if (node.type === CanvasNodeType.Audio) {
                    const audio = await storeGeneratedAudio(await requestAudioGeneration(generationConfig, prompt, { signal: controller.signal }), generationConfig.audioFormat);
                    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...audioMetadata(audio), prompt, ...buildAudioGenerationMetadata(generationConfig) } } : item)));
                    return;
                }

                const image = useReferenceImages
                    ? await requestEdit(generationConfig, prompt, retryImages, undefined, { signal: controller.signal }).then((items) => items[0])
                    : await requestGeneration(generationConfig, prompt, { signal: controller.signal }).then((items) => items[0]);
                const uploadedImage = await uploadImage(image.dataUrl);
                const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                const imageSize = fitNodeSize(uploadedImage.width, uploadedImage.height, imageConfig.width, imageConfig.height);
                const generationMetadata = savedImageMetadata?.generationType
                    ? {
                          generationType: savedImageMetadata.generationType,
                          model: generationConfig.model,
                          size: generationConfig.size,
                          quality: generationConfig.quality,
                          ...(generationConfig.background ? { background: generationConfig.background } : {}),
                          count: savedImageMetadata.count || 1,
                          references: savedImageMetadata.references,
                      }
                    : buildImageGenerationMetadata(useReferenceImages ? "edit" : "generation", generationConfig, 1, retryImages);
                setNodes((prev) =>
                    prev.map((item) =>
                        item.id === node.id
                            ? {
                                  ...item,
                                  type: CanvasNodeType.Image,
                                  width: imageSize.width,
                                  height: imageSize.height,
                                  metadata: { ...item.metadata, ...imageMetadata(uploadedImage), prompt, ...generationMetadata },
                              }
                            : item,
                    ),
                );
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                finishGenerationRequest(node.id, controller);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startGenerationRequest],
    );

    const generateImageFromTextNode = useCallback(
        (node: CanvasNodeData) => {
            const prompt = (node.metadata?.content || node.metadata?.prompt || "").trim();
            if (!prompt) {
                message.warning("文本节点为空，无法生图");
                return;
            }
            const sourceNode = nodesRef.current.find((item) => item.id === node.id);
            if (!sourceNode) return;
            const nodeSize = getNodeSpec(CanvasNodeType.Config);
            const configNode = createCanvasNode(
                CanvasNodeType.Config,
                {
                    x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
                    y: sourceNode.position.y + sourceNode.height / 2,
                },
                {
                    prompt: "",
                    model: effectiveConfig.imageModel || effectiveConfig.model,
                    size: effectiveConfig.size,
                    count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                },
            );
            const connection = { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: configNode.id };
            const nextNodes = nodesRef.current.map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS } } : item)).concat(configNode);
            const nextConnections = [...connectionsRef.current, connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message],
    );

    const insertAssistantImage = useCallback(
        async (image: CanvasAssistantImage) => {
            const storedImage = image.storageKey ? { url: image.dataUrl, storageKey: image.storageKey, width: 1, height: 1, bytes: 0, mimeType: "image/png" } : await uploadImage(image.dataUrl);
            const meta = storedImage.width === 1 && storedImage.height === 1 ? await readImageMeta(storedImage.url) : storedImage;
            const config = fitNodeSize(meta.width, meta.height);
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const node: CanvasNodeData = {
                id,
                type: CanvasNodeType.Image,
                title: image.prompt.slice(0, 32) || "Generated Image",
                position: { x: center.x - config.width / 2, y: center.y - config.height / 2 },
                width: config.width,
                height: config.height,
                metadata: { ...imageMetadata({ ...storedImage, width: meta.width, height: meta.height }), prompt: image.prompt },
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [screenToCanvas, size.height, size.width],
    );

    const insertAssistantText = useCallback(
        (text: string, title?: string) => {
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const node = {
                ...createCanvasNode(CanvasNodeType.Text, center, { content: text, status: NODE_STATUS_SUCCESS }),
                title: title || text.slice(0, 32) || "Assistant Text",
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
        },
        [screenToCanvas, size.height, size.width],
    );

    const handleAssetInsert = useCallback(
        (payload: InsertAssetPayload) => {
            if (payload.kind === "text") {
                insertAssistantText(payload.content, payload.title);
            } else if (payload.kind === "video") {
                const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const nextSize = fitNodeSize(payload.width || spec.width, payload.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                setNodes((prev) => [
                    ...prev,
                    {
                        id,
                        type: CanvasNodeType.Video,
                        title: payload.title,
                        position: { x: center.x - nextSize.width / 2, y: center.y - nextSize.height / 2 },
                        width: nextSize.width,
                        height: nextSize.height,
                        metadata: { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, naturalWidth: payload.width, naturalHeight: payload.height },
                    },
                ]);
                setSelectedNodeIds(new Set([id]));
            } else {
                insertAssistantImage({ id: `asset-${Date.now()}`, prompt: payload.title, dataUrl: payload.dataUrl, storageKey: payload.storageKey });
            }
            setAssetPickerOpen(false);
        },
        [insertAssistantImage, insertAssistantText, screenToCanvas, size.height, size.width],
    );

    // --- 传给 CanvasNode 的回调/渲染函数统一 memo 化 ---
    // CanvasNode 是 React.memo,但只要这些 prop 每次渲染都是新引用,memo 就失效,
    // 导致点击/悬停/移动视角时全部节点跟着重渲染(markdown 尤其明显)。全部 useCallback 后,
    // 未变化的节点不再重渲染。依赖里的 map/handler 均已 memo 化,纯交互时保持稳定。
    const handleNodeHoverStart = useCallback((nodeId: string) => {
        if (nodeDraggingRef.current) return;
        setHoveredNodeId(nodeId);
    }, []);
    const handleNodeHoverEnd = useCallback((nodeId: string) => {
        setHoveredNodeId((current) => (current === nodeId ? null : current));
    }, []);
    const handleNodeViewImage = useCallback((node: CanvasNodeData) => setPreviewNodeId(node.id), []);
    const openCharacterBatchDialog = useCallback((node: CanvasNodeData) => {
        const sourceNode = node.type === CanvasNodeType.CharacterGroup && node.metadata?.sourceScriptNodeId ? nodesRef.current.find((item) => item.id === node.metadata?.sourceScriptNodeId) : node;
        const sections = splitMarkdownSections(sourceNode?.metadata?.content || "");
        if (!sourceNode || sourceNode.type !== CanvasNodeType.Script || !sourceNode.metadata?.content?.trim()) {
            message.error("剧本节点为空，无法整理角色设定");
            return;
        }
        setCharacterBatchScriptId(sourceNode.id);
        setCharacterBatchTargetId(node.type === CanvasNodeType.CharacterGroup ? node.id : null);
        setCharacterBatchOptions({
            maxCharacters: node.metadata?.maxCharacters || DEFAULT_CHARACTER_BATCH_OPTIONS.maxCharacters,
            styleHint: node.metadata?.styleHint || DEFAULT_CHARACTER_BATCH_OPTIONS.styleHint,
            includeSupportingRoles: node.metadata?.includeSupportingRoles ?? DEFAULT_CHARACTER_BATCH_OPTIONS.includeSupportingRoles,
            excludeExtras: node.metadata?.excludeExtras ?? DEFAULT_CHARACTER_BATCH_OPTIONS.excludeExtras,
        });
        setCharacterBatchSectionIds([sections[0].id]);
    }, [message]);
    const handleNodeRetry = useCallback((node: CanvasNodeData) => {
        if (node.type === CanvasNodeType.CharacterGroup) return openCharacterBatchDialog(node);
        void handleRetryNode(node);
    }, [handleRetryNode, openCharacterBatchDialog]);
    const openCharacterAssetDialog = useCallback((node: CanvasNodeData) => {
        setCharacterAssetCardId(node.id);
        setCharacterAssetOptions(DEFAULT_CHARACTER_ASSET_OPTIONS);
        setCharacterAssetMode("model");
        setManualCharacterAssetFiles({});
    }, []);
    const openMarkdownReader = useCallback((node: CanvasNodeData) => {
        setDialogNodeId(null);
        setMarkdownReaderNodeId(node.id);
    }, []);
    const closeMarkdownReader = useCallback(() => setMarkdownReaderNodeId(null), []);
    const handleMarkdownContentChange = useCallback((nodeId: string, content: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, content } } : node)));
    }, []);
    const handleCharacterCardChange = useCallback((nodeId: string, patch: CanvasNodeData["metadata"]) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...patch } } : node)));
    }, []);
    const applyWorkbenchProduction = useCallback((nextProduction: ProductionProject) => {
        productionRef.current = nextProduction;
        setProduction(nextProduction);
        setNodes((prev) =>
            prev.map((node) => {
                if (!node.metadata?.productionRecordId) return node;
                if (node.type === CanvasNodeType.Shotboard) {
                    const shotboard = nextProduction.shotboards.find((item) => item.id === node.metadata?.productionRecordId);
                    return shotboard ? { ...node, title: `第 ${shotboard.episodeNumber} 集 · ${shotboard.title}`, metadata: { ...node.metadata, productionVersion: shotboard.version } } : node;
                }
                if (node.type === CanvasNodeType.Shot) {
                    const shotboard = nextProduction.shotboards.find((item) => item.shots.some((shot) => shot.id === node.metadata?.productionRecordId));
                    const shot = shotboard?.shots.find((item) => item.id === node.metadata?.productionRecordId);
                    return shot && shotboard
                        ? { ...node, title: `${shot.code} · ${shot.narrativePurpose}`, metadata: { ...node.metadata, productionVersion: shotboard.version } }
                        : node;
                }
                return node;
            }),
        );
    }, []);
    const pinControlAssetToCanvas = useCallback(
        async (shotId: string, recordId: string, versionNumber: number) => {
            const existing = nodesRef.current.find(
                (node) =>
                    node.metadata?.productionKind === "control-asset" &&
                    node.metadata.productionRecordId === recordId &&
                    node.metadata.productionVersion === versionNumber,
            );
            if (existing) {
                focusNode(existing.id);
                message.info("该控制资产版本已固定到画布");
                return;
            }
            const shotNode = nodesRef.current.find((node) => node.type === CanvasNodeType.Shot && node.metadata?.productionRecordId === shotId);
            const shot = productionRef.current.shotboards.flatMap((shotboard) => shotboard.shots).find((item) => item.id === shotId);
            const record = shot?.controlAssets.find((item) => item.id === recordId);
            const version = record?.versions.find((item) => item.version === versionNumber);
            if (!shotNode || !record || !version) {
                message.error("控制资产数据缺失");
                return;
            }
            const url = await resolveImageUrl(version.storageKey);
            if (!url) {
                message.error("控制资产文件不存在");
                return;
            }
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const node: CanvasNodeData = {
                id: nanoid(),
                type: CanvasNodeType.Image,
                title: record.label,
                position: { x: shotNode.position.x + shotNode.width + 96, y: shotNode.position.y },
                width: spec.width,
                height: spec.height,
                metadata: {
                    content: url,
                    storageKey: version.storageKey,
                    mimeType: version.mimeType,
                    naturalWidth: version.width,
                    naturalHeight: version.height,
                    status: "success",
                    productionKind: "control-asset",
                    productionRecordId: record.id,
                    productionVersion: version.version,
                },
            };
            setNodes((prev) => [...prev, node]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: shotNode.id, toNodeId: node.id }]);
            setSelectedNodeIds(new Set([node.id]));
        },
        [focusNode, message],
    );
    const pinJimengTaskToCanvas = useCallback(
        (shotId: string, taskId: string) => {
            const existing = nodesRef.current.find((node) => node.metadata?.productionKind === "jimeng-task" && node.metadata.productionRecordId === taskId);
            if (existing) {
                focusNode(existing.id);
                message.info("该任务单已固定到画布");
                return;
            }
            const shotNode = nodesRef.current.find((node) => node.type === CanvasNodeType.Shot && node.metadata?.productionRecordId === shotId);
            const task = productionRef.current.shotboards.flatMap((shotboard) => shotboard.shots).flatMap((shot) => shot.jimengTasks).find((item) => item.id === taskId);
            if (!shotNode || !task) {
                message.error("任务单数据缺失");
                return;
            }
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.MarkdownDocument];
            const node: CanvasNodeData = {
                id: nanoid(),
                type: CanvasNodeType.MarkdownDocument,
                title: "外部生成任务",
                position: { x: shotNode.position.x + shotNode.width + 96, y: shotNode.position.y + 80 },
                width: spec.width,
                height: spec.height,
                metadata: {
                    content: jimengTaskToMarkdown(task),
                    status: "success",
                    productionKind: "jimeng-task",
                    productionRecordId: task.id,
                    productionVersion: task.version,
                },
            };
            setNodes((prev) => [...prev, node]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: shotNode.id, toNodeId: node.id }]);
            setSelectedNodeIds(new Set([node.id]));
        },
        [focusNode, message],
    );
    const pinCandidateToCanvas = useCallback(
        async (shotId: string, candidateId: string) => {
            const existing = nodesRef.current.find((node) => node.metadata?.productionKind === "shot-candidate" && node.metadata.productionRecordId === candidateId);
            if (existing) {
                focusNode(existing.id);
                message.info("该候选已固定到画布");
                return;
            }
            const shotNode = nodesRef.current.find((node) => node.type === CanvasNodeType.Shot && node.metadata?.productionRecordId === shotId);
            const candidate = productionRef.current.shotboards.flatMap((board) => board.shots).flatMap((shot) => shot.candidates).find((item) => item.id === candidateId);
            if (!shotNode || !candidate || candidate.status !== "approved") {
                message.error("已采用候选数据缺失");
                return;
            }
            const url = await resolveMediaUrl(candidate.storageKey);
            if (!url) {
                message.error("候选视频文件不存在");
                return;
            }
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
            const node: CanvasNodeData = {
                id: nanoid(),
                type: CanvasNodeType.Video,
                title: `采用镜头 · ${candidate.fileName}`,
                position: { x: shotNode.position.x + shotNode.width + 96, y: shotNode.position.y + 160 },
                width: spec.width,
                height: spec.height,
                metadata: {
                    content: url,
                    storageKey: candidate.storageKey,
                    mimeType: candidate.mimeType,
                    durationMs: candidate.durationMs,
                    status: "success",
                    productionKind: "shot-candidate",
                    productionRecordId: candidate.id,
                    productionVersion: candidate.sourceTaskVersion,
                },
            };
            setNodes((prev) => [...prev, node]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: shotNode.id, toNodeId: node.id }]);
            setSelectedNodeIds(new Set([node.id]));
        },
        [focusNode, message],
    );
    const exportProductionPackage = useCallback(
        async (shotboardId: string, mode: "work" | "jimeng" | "final") => {
            try {
                const zip = await buildProductionPackage(productionRef.current, shotboardId, mode);
                const shotboard = productionRef.current.shotboards.find((item) => item.id === shotboardId);
                saveAs(zip, `${shotboard?.title || "AI漫剧"}-${mode === "work" ? "工作包" : mode === "jimeng" ? "即梦任务包" : "最终剪辑包"}.zip`);
                message.success("生产包已导出");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "生产包导出失败");
            }
        },
        [message],
    );
    const handleNodeContextMenu = useCallback((event: ReactMouseEvent, nodeId: string) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId });
    }, []);
    const generateCharacterBatch = useCallback(async () => {
        const scriptNode = nodesRef.current.find((node) => node.id === characterBatchScriptId);
        const script = scriptNode?.metadata?.content || "";
        const sections = splitMarkdownSections(script);
        const selectedSections = sections.filter((section) => characterBatchSectionIds.includes(section.id));
        const selectedScript = selectedSections.map((section) => section.content).join("\n\n").trim();
        if (!scriptNode || !script.trim()) {
            message.error("剧本节点为空，无法整理角色设定");
            return;
        }
        if (!selectedScript) {
            message.warning("请至少选择一个章节");
            return;
        }
        const config = buildGenerationConfig(effectiveConfig, undefined, "text");
        if (!isAiConfigReady(config, config.model)) {
            openConfigDialog(true);
            return;
        }
        setCharacterBatchScriptId(null);
        const targetNode = characterBatchTargetId ? nodesRef.current.find((node) => node.id === characterBatchTargetId && node.type === CanvasNodeType.CharacterGroup) : null;
        const rootId = targetNode?.id || nanoid();
        const rootSpec = NODE_DEFAULT_SIZE[CanvasNodeType.CharacterGroup];
        const cardSpec = NODE_DEFAULT_SIZE[CanvasNodeType.CharacterCard];
        const rootNode: CanvasNodeData = {
            id: rootId,
            type: CanvasNodeType.CharacterGroup,
            title: "角色设定",
            position: targetNode?.position || { x: scriptNode.position.x + scriptNode.width + 120, y: scriptNode.position.y },
            width: targetNode?.width || rootSpec.width,
            height: targetNode?.height || rootSpec.height,
            metadata: {
                ...targetNode?.metadata,
                status: NODE_STATUS_LOADING,
                errorDetails: undefined,
                rawModelOutput: undefined,
                sourceScriptNodeId: scriptNode.id,
                ...characterBatchOptions,
                selectedScriptSections: selectedSections.map((section) => ({ id: section.id, title: section.title })),
                characterBatchExpanded: true,
                characterChildIds: [],
            },
        };
        setCharacterBatchTargetId(null);
        setNodes((prev) => targetNode ? prev.map((node) => node.id === rootId ? rootNode : node) : [...prev, rootNode]);
        if (!targetNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: scriptNode.id, toNodeId: rootId }]);
        setSelectedNodeIds(new Set([rootId]));
        setRunningNodeId(rootId);
        const controller = startGenerationRequest(rootId, scriptNode.id, rootId);
        let rawModelOutput = "";
        try {
            const prompt = buildCharacterBatchPrompt(selectedScript, characterBatchOptions);
            const answer = await requestImageQuestion(config, [{ role: "user", content: prompt }], () => undefined, { signal: controller.signal });
            const clean = stripModelThinking(answer);
            rawModelOutput = clean;
            const result = parseCharacterBatchResult(clean);
            const characters = result.characters.slice(0, characterBatchOptions.maxCharacters);
            const childNodes: CanvasNodeData[] = characters.map((character, index) => ({
                id: nanoid(),
                type: CanvasNodeType.CharacterCard,
                title: character.name || "角色设定",
                position: {
                    x: rootNode.position.x + rootNode.width + 120 + (index % 2) * (cardSpec.width + 36),
                    y: rootNode.position.y + Math.floor(index / 2) * (cardSpec.height + 32),
                },
                width: cardSpec.width,
                height: cardSpec.height,
                metadata: {
                    ...character,
                    status: NODE_STATUS_SUCCESS,
                    characterRootId: rootId,
                    sourceScriptNodeId: scriptNode.id,
                    rawCharacterJson: character,
                },
            }));
            const baseNodes = nodesRef.current.some((node) => node.id === rootId) ? nodesRef.current.map((node) => node.id === rootId ? rootNode : node) : [...nodesRef.current, rootNode];
            const completedNodes: CanvasNodeData[] = baseNodes
                .map((node) =>
                    node.id === rootId
                        ? {
                              ...node,
                              metadata: {
                                  ...node.metadata,
                                  status: NODE_STATUS_SUCCESS,
                                  characterChildIds: childNodes.map((child) => child.id),
                                  skippedCharacters: result.skipped,
                                  rawModelOutput: clean,
                              },
                          }
                        : node,
                )
                .concat(childNodes);
            const synced = syncCanvasCharacterAssets(productionRef.current, completedNodes, new Date().toISOString());
            nodesRef.current = synced.nodes;
            productionRef.current = synced.production;
            setNodes(synced.nodes);
            setProduction(synced.production);
            setConnections((prev) => [...prev, ...childNodes.map((child) => ({ id: nanoid(), fromNodeId: rootId, toNodeId: child.id }))]);
            message.success(`已整理 ${childNodes.length} 个角色设定`);
        } catch (error) {
            const errorDetails = error instanceof Error ? error.message : "角色设定整理失败";
            message.error(errorDetails);
            setNodes((prev) => prev.map((node) => (node.id === rootId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails, rawModelOutput } } : node)));
        } finally {
            finishGenerationRequest(rootId, controller);
            setRunningNodeId(null);
        }
    }, [characterBatchOptions, characterBatchScriptId, characterBatchSectionIds, characterBatchTargetId, effectiveConfig, isAiConfigReady, message, openConfigDialog]);
    const generateCharacterAssets = useCallback(async () => {
        const characterNode = nodesRef.current.find((node) => node.id === characterAssetCardId);
        if (!characterNode || characterNode.type !== CanvasNodeType.CharacterCard) {
            message.error("找不到角色设定");
            return;
        }
        const config = { ...buildGenerationConfig(effectiveConfig, characterNode, "image"), size: characterAssetOptions.size, count: "1" };
        if (!isAiConfigReady(config, config.model)) {
            openConfigDialog(true);
            return;
        }
        setCharacterAssetCardId(null);
        const rootNode = createCharacterAssetGroupNode(characterNode, characterAssetOptions);
        const rootId = rootNode.id;
        const imageSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
        const selectedKinds = rootNode.metadata?.assetKinds || ["three-view"];
        setNodes((prev) => [...prev, rootNode]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: characterNode.id, toNodeId: rootId }]);
        setSelectedNodeIds(new Set([rootId]));
        setRunningNodeId(rootId);
        const controller = startGenerationRequest(rootId, characterNode.id, rootId);
        const generatedNodes: CanvasNodeData[] = [];
        try {
            const productionRecordId = characterNode.metadata?.productionRecordId || characterNode.id;
            const productionVersion = characterNode.metadata?.productionVersion || 1;
            const standardReference = productionRef.current.assetReferences
                .filter((item) => item.assetId === productionRecordId && item.assetVersion === productionVersion && item.kind === "standard")
                .at(-1);
            const threeViewPrompt = buildCharacterAssetPrompt(characterNode, "three-view", characterAssetOptions);
            const threeViewImage = standardReference
                ? await requestEdit(
                      config,
                      threeViewPrompt,
                      [
                          {
                              id: standardReference.id,
                              name: `${characterNode.metadata?.name || characterNode.title} 标准参考图.png`,
                              type: standardReference.mimeType,
                              dataUrl: await resolveImageUrl(standardReference.storageKey),
                              storageKey: standardReference.storageKey,
                          },
                      ],
                      undefined,
                      { signal: controller.signal },
                  ).then((items) => items[0])
                : await requestGeneration(config, threeViewPrompt, { signal: controller.signal }).then((items) => items[0]);
            const uploadedThreeView = await uploadImage(threeViewImage.dataUrl);
            const threeViewNode = createCharacterAssetImageNode({
                id: nanoid(),
                rootNode,
                index: generatedNodes.length,
                spec: imageSpec,
                uploaded: uploadedThreeView,
                kind: "three-view",
                title: `${characterNode.metadata?.name || characterNode.title} 三视图`,
                prompt: threeViewPrompt,
                characterCardId: characterNode.id,
                referenceImageNodeId: standardReference?.id,
            });
            generatedNodes.push(threeViewNode);
            setNodes((prev) => prev.concat(threeViewNode).map((node) => (node.id === rootId ? updateCharacterAssetRoot(node, generatedNodes) : node)));
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: rootId, toNodeId: threeViewNode.id }]);

            const reference: ReferenceImage = {
                id: threeViewNode.id,
                name: `${threeViewNode.title}.png`,
                type: threeViewNode.metadata?.mimeType || "image/png",
                dataUrl: threeViewNode.metadata?.content || "",
                storageKey: threeViewNode.metadata?.storageKey,
            };
            for (const kind of selectedKinds.filter((item) => item !== "three-view")) {
                const prompt = buildCharacterAssetPrompt(characterNode, kind, characterAssetOptions);
                const image = await requestEdit(config, prompt, [reference], undefined, { signal: controller.signal }).then((items) => items[0]);
                const uploaded = await uploadImage(image.dataUrl);
                const childNode = createCharacterAssetImageNode({
                    id: nanoid(),
                    rootNode,
                    index: generatedNodes.length,
                    spec: imageSpec,
                    uploaded,
                    kind,
                    title: `${characterNode.metadata?.name || characterNode.title} ${characterAssetLabel(kind)}`,
                    prompt,
                    characterCardId: characterNode.id,
                    referenceImageNodeId: threeViewNode.id,
                });
                generatedNodes.push(childNode);
                setNodes((prev) => prev.concat(childNode).map((node) => (node.id === rootId ? updateCharacterAssetRoot(node, generatedNodes) : node)));
                setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: rootId, toNodeId: childNode.id }]);
            }
            setNodes((prev) =>
                prev.map((node) => {
                    if (node.id !== rootId) return node;
                    const updated = updateCharacterAssetRoot(node, generatedNodes);
                    return { ...updated, metadata: { ...updated.metadata, status: NODE_STATUS_SUCCESS } };
                }),
            );
            message.success(`已准备 ${generatedNodes.length} 项视觉参考`);
        } catch (error) {
            const errorDetails = error instanceof Error ? error.message : "视觉参考准备失败";
            message.error(errorDetails);
            setNodes((prev) => prev.map((node) => (node.id === rootId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails, characterAssetChildIds: generatedNodes.map((item) => item.id) } } : node)));
        } finally {
            finishGenerationRequest(rootId, controller);
            setRunningNodeId(null);
        }
    }, [characterAssetCardId, characterAssetOptions, effectiveConfig, isAiConfigReady, message, openConfigDialog]);
    const importManualCharacterAssets = useCallback(async () => {
        const characterNode = nodesRef.current.find((node) => node.id === characterAssetCardId);
        if (!characterNode || characterNode.type !== CanvasNodeType.CharacterCard) {
            message.error("找不到角色设定");
            return;
        }
        if (!manualCharacterAssetFiles["three-view"]) {
            message.error("请先上传三视图");
            return;
        }
        const rootNode = createCharacterAssetGroupNode(characterNode, characterAssetOptions);
        const imageSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
        const selectedKinds = rootNode.metadata?.assetKinds || ["three-view"];
        const childNodes: CanvasNodeData[] = [];
        for (const kind of selectedKinds) {
            const file = manualCharacterAssetFiles[kind];
            if (!file) continue;
            const uploaded = await uploadImage(file);
            childNodes.push(
                createCharacterAssetImageNode({
                    id: nanoid(),
                    rootNode,
                    index: childNodes.length,
                    spec: imageSpec,
                    uploaded,
                    kind,
                    title: `${characterNode.metadata?.name || characterNode.title} ${characterAssetLabel(kind)}`,
                    prompt: buildCharacterAssetPrompt(characterNode, kind, characterAssetOptions),
                    characterCardId: characterNode.id,
                    referenceImageNodeId: kind === "three-view" ? undefined : childNodes.find((node) => node.metadata?.assetKind === "three-view")?.id,
                }),
            );
        }
        const completedRoot = updateCharacterAssetRoot(rootNode, childNodes);
        completedRoot.metadata = { ...completedRoot.metadata, status: NODE_STATUS_SUCCESS };
        setNodes((prev) => [...prev, completedRoot, ...childNodes]);
        setConnections((prev) => [
            ...prev,
            { id: nanoid(), fromNodeId: characterNode.id, toNodeId: completedRoot.id },
            ...childNodes.map((child) => ({ id: nanoid(), fromNodeId: completedRoot.id, toNodeId: child.id })),
        ]);
        setSelectedNodeIds(new Set([completedRoot.id]));
        setCharacterAssetCardId(null);
        setManualCharacterAssetFiles({});
            message.success(`已导入 ${childNodes.length} 项视觉参考`);
    }, [characterAssetCardId, characterAssetOptions, manualCharacterAssetFiles, message]);

    const renderNodePanel = useCallback(
        (panelNode: CanvasNodeData) =>
            getNodeDefinition(panelNode.type)?.Panel ? (
                renderPluginPanel(panelNode)
            ) : panelNode.type === CanvasNodeType.CharacterCard ? (
                <CanvasCharacterCardEditor node={panelNode} onChange={handleCharacterCardChange} onClose={() => setDialogNodeId(null)} />
            ) : panelNode.type === CanvasNodeType.Config ? (
                <CanvasConfigComposer
                    value={panelNode.metadata?.composerContent ?? panelNode.metadata?.prompt ?? ""}
                    inputs={configInputsById.get(panelNode.id) || []}
                    onChange={(composerContent) => handleConfigNodeChange(panelNode.id, { composerContent })}
                    onClose={() => setDialogNodeId(null)}
                />
            ) : (
                <CanvasNodePromptPanel
                    node={panelNode}
                    isRunning={runningNodeId === panelNode.id}
                    mentionReferences={mentionReferencesByNodeId.get(panelNode.id) || EMPTY_REFERENCES}
                    onPromptChange={handleNodePromptChange}
                    onConfigChange={handleConfigNodeChange}
                    onGenerate={handleGenerateNode}
                    onStop={confirmStopGeneration}
                    modeOverride={getNodeDefinition(panelNode.type)?.useBuiltinPanel?.mode}
                    onImageSettingsOpenChange={(open) => {
                        setNodeImageSettingsOpen(open);
                        if (open) setToolbarNodeId(null);
                    }}
                />
            ),
        [configInputsById, confirmStopGeneration, handleCharacterCardChange, handleConfigNodeChange, handleGenerateNode, handleNodePromptChange, mentionReferencesByNodeId, renderPluginPanel, runningNodeId],
    );

    const renderNodeContentPanel = useCallback(
        (contentNode: CanvasNodeData) => (
            <CanvasConfigNodePanel
                node={contentNode}
                isRunning={runningNodeId === contentNode.id}
                inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}
                onConfigChange={handleConfigNodeChange}
                onComposerToggle={() => setDialogNodeId((current) => (current === contentNode.id ? null : contentNode.id))}
                onStop={confirmStopGeneration}
                onGenerate={(nodeId) => {
                    const target = nodesRef.current.find((item) => item.id === nodeId);
                    void handleGenerateNode(nodeId, target?.metadata?.generationMode || "image", target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                }}
            />
        ),
        [configInputsById, confirmStopGeneration, handleConfigNodeChange, handleGenerateNode, runningNodeId],
    );

    if (!projectLoaded) return <CanvasRefreshShell />;

    return (
        <main className="flex h-full min-h-0 overflow-hidden" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <CanvasSidePanel nodes={nodes} production={production} selectedNodeIds={selectedNodeIds} onFocusNode={focusNode} onInsertAsset={handleAssetInsert} />
            <section className="relative min-w-0 flex-1 overflow-hidden">
                <CanvasTopBar
                    title={currentProject?.title || "未命名画布"}
                    titleDraft={titleDraft}
                    isTitleEditing={titleEditing}
                    onTitleDraftChange={setTitleDraft}
                    onStartTitleEditing={startTitleEditing}
                    onFinishTitleEditing={() => void finishTitleEditing()}
                    onCancelTitleEditing={() => setTitleEditing(false)}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    onHome={() => navigate("/")}
                    onProjects={() => navigate("/canvas")}
                    onCreateProject={() => void createAndOpenProject()}
                    onDeleteProject={() => void deleteCurrentProject()}
                    onExportProject={exportCurrentProject}
                    onImportImage={() => handleUploadRequest()}
                    onOpenPlugins={() => setPluginManagerOpen(true)}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    agentOpen={agentPanelOpen}
                    compactAgentStatus={{ connected: localAgentConnected, enabled: localAgentEnabled, activity: localAgentActivity }}
                    saveStatus={saveStatus}
                    onToggleAgent={toggleAgentPanel}
                />

                <FrameForgeCanvas
                    containerRef={containerRef}
                    viewport={viewport}
                    backgroundMode={backgroundMode}
                    onViewportChange={(next) => {
                        setViewport(next);
                        setContextMenu(null);
                    }}
                    onCanvasMouseDown={handleCanvasMouseDown}
                    onCanvasDeselect={deselectCanvas}
                    onCanvasDoubleClick={(event) => {
                        setContextMenu(null);
                        setNodeCreatePosition(screenToCanvas(event.clientX, event.clientY));
                    }}
                    onContextMenu={preventCanvasContextMenu}
                    onDrop={handleDrop}
                >
                    <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", transform: "translateZ(0)", zIndex: 0 }}>
                        {connections
                            .filter((connection) => {
                                const from = nodeById.get(connection.fromNodeId);
                                const to = nodeById.get(connection.toNodeId);
                                return Boolean(
                                    from &&
                                        to &&
                                        !isHiddenBatchConnectionEndpoint(from, nodes) &&
                                        !isHiddenBatchConnectionEndpoint(to, nodes) &&
                                        !isHiddenCharacterChild(from, nodes, collapsingCharacterGroupIds) &&
                                        !isHiddenCharacterChild(to, nodes, collapsingCharacterGroupIds) &&
                                        !isHiddenCharacterAssetChild(from, nodes, collapsingCharacterAssetGroupIds) &&
                                        !isHiddenCharacterAssetChild(to, nodes, collapsingCharacterAssetGroupIds) &&
                                        !isHiddenProductionChild(from, nodes, collapsingProductionGroupIds) &&
                                        !isHiddenProductionChild(to, nodes, collapsingProductionGroupIds),
                                );
                            })
                            .map((connection) => {
                                const from = nodeById.get(connection.fromNodeId);
                                const to = nodeById.get(connection.toNodeId);
                                if (!from || !to) return null;

                                return (
                                    <ConnectionPath
                                        key={connection.id}
                                        connection={connection}
                                        from={from}
                                        to={to}
                                        active={selectedConnectionId === connection.id || relatedHighlight.connectionIds.has(connection.id)}
                                        onSelect={() => {
                                            setSelectedConnectionId(connection.id);
                                            setSelectedNodeIds(new Set());
                                            setContextMenu(null);
                                        }}
                                        onContextMenu={(event) => {
                                            setSelectedConnectionId(connection.id);
                                            setSelectedNodeIds(new Set());
                                            setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId: connection.id });
                                        }}
                                    />
                                );
                            })}
                        {connectingParams ? <ActiveConnectionPath node={nodeById.get(connectingParams.nodeId)} handle={connectingParams} mouseWorld={mouseWorld} target={connectionTargetNodeId ? nodeById.get(connectionTargetNodeId) : undefined} /> : null}
                    </svg>

                    {visibleNodes.map((node) => (
                        <CanvasNode
                            key={node.id}
                            data={node}
                            scale={viewport.k}
                            isSelected={selectedNodeIds.has(node.id)}
                            isRelated={relatedHighlight.nodeIds.has(node.id)}
                            isFocusRelated={activeNodeId === node.id}
                            isConnectionTarget={connectionTargetNodeId === node.id}
                            isConnecting={Boolean(connectingParams)}
                            editRequestNonce={editingNodeId === node.id ? editRequestNonce : 0}
                            showPanel={dialogNodeId === node.id && !selectionBox && !getNodeDefinition(node.type)?.hidePanel}
                            batchCount={batchChildCountById.get(node.id) || 0}
                            groupChildCount={groupChildCountById.get(node.id) || 0}
                            isGroupDropTarget={dropTargetGroupId === node.id}
                            batchExpanded={Boolean(node.metadata?.imageBatchExpanded)}
                            batchClosing={Boolean(
                                (node.metadata?.batchRootId && collapsingBatchIds.has(node.metadata.batchRootId)) ||
                                    (characterRootId(node, nodes) && collapsingCharacterGroupIds.has(characterRootId(node, nodes)!)) ||
                                    (characterAssetRootId(node, nodes) && collapsingCharacterAssetGroupIds.has(characterAssetRootId(node, nodes)!)) ||
                                    (node.metadata?.productionRootId && collapsingProductionGroupIds.has(node.metadata.productionRootId)),
                            )}
                            batchOpening={openingBatchIds.has(node.id) || openingCharacterGroupIds.has(node.id) || openingCharacterAssetGroupIds.has(node.id) || openingProductionGroupIds.has(node.id)}
                            batchRecovering={collapsingBatchIds.has(node.id) || collapsingCharacterGroupIds.has(node.id) || collapsingCharacterAssetGroupIds.has(node.id) || collapsingProductionGroupIds.has(node.id)}
                            batchMotion={batchMotionById.get(node.id) || characterMotionById.get(node.id) || characterAssetMotionById.get(node.id) || productionMotionById.get(node.id)}
                            showImageInfo={showImageInfo}
                            mentionReferences={mentionReferencesByNodeId.get(node.id) || EMPTY_REFERENCES}
                            pluginHost={pluginHost}
                            registryVersion={nodeRegistryVersion}
                            renderPanel={renderNodePanel}
                            renderNodeContent={renderNodeContentPanel}
                            onMouseDown={handleNodeMouseDown}
                            onSelectCapture={handleNodeSelectCapture}
                            onHoverStart={handleNodeHoverStart}
                            onHoverEnd={handleNodeHoverEnd}
                            onConnectStart={handleConnectStart}
                            onResize={handleNodeResize}
                            onContentChange={handleNodeContentChange}
                            onTitleChange={handleNodeTitleChange}
                            onToggleBatch={toggleBatchExpanded}
                            onToggleCharacterGroup={toggleCharacterGroupExpanded}
                            onToggleCharacterAssetGroup={toggleCharacterAssetGroupExpanded}
                            onSetBatchPrimary={setBatchPrimary}
                            onRetry={handleNodeRetry}
                            onGenerateImage={generateImageFromTextNode}
                            onViewImage={handleNodeViewImage}
                            onOpenMarkdownReader={openMarkdownReader}
                            onContextMenu={handleNodeContextMenu}
                        />
                    ))}

                    {selectionBox ? (
                        <div
                            className="pointer-events-none absolute z-[100] border"
                            style={{
                                left: Math.min(selectionBox.startWorldX, selectionBox.currentWorldX),
                                top: Math.min(selectionBox.startWorldY, selectionBox.currentWorldY),
                                width: Math.abs(selectionBox.currentWorldX - selectionBox.startWorldX),
                                height: Math.abs(selectionBox.currentWorldY - selectionBox.startWorldY),
                                borderColor: theme.canvas.selectionStroke,
                                background: theme.canvas.selectionFill,
                            }}
                        />
                    ) : null}
                    {pendingConnectionCreate ? <ConnectionCreateMenu pending={pendingConnectionCreate} onCreate={(type) => createConnectedNode(type, pendingConnectionCreate)} onClose={cancelPendingConnectionCreate} /> : null}
                    {nodeCreatePosition ? (
                        <NodeCreateMenu
                            position={nodeCreatePosition}
                            onCreate={(type) => {
                                createNode(type, nodeCreatePosition);
                                setNodeCreatePosition(null);
                            }}
                            onClose={() => setNodeCreatePosition(null)}
                        />
                    ) : null}
                </FrameForgeCanvas>

                <CanvasNodeHoverToolbar
                    node={isNodeDragging || nodeImageSettingsOpen ? null : toolbarNode}
                    viewport={viewport}
                    extraTools={toolbarNode ? buildNodeToolbarItems(toolbarNode) : undefined}
                    onKeep={keepNodeToolbar}
                    onLeave={hideNodeToolbar}
                    onInfo={(node) => setInfoNodeId(node.id)}
                    onEditText={openTextEditor}
                    onDecreaseFont={(node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2))}
                    onIncreaseFont={(node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2))}
                    onToggleDialog={(node) => setDialogNodeId((current) => (current === node.id ? null : node.id))}
                    onGenerateImage={generateImageFromTextNode}
                    onUpload={(node) => handleUploadRequest(node.id)}
                    onCopyImage={(node) => void copyNodeImage(node)}
                    onDownload={downloadNodeImage}
                    onSaveAsset={(node) => void saveNodeAsset(node)}
                    onMaskEdit={(node) => setMaskEditNodeId(node.id)}
                    onCrop={(node) => setCropNodeId(node.id)}
                    onSplit={(node) => setSplitNodeId(node.id)}
                    onUpscale={(node) => setUpscaleNodeId(node.id)}
                    onSuperResolve={(node) => setSuperResolveNodeId(node.id)}
                    onAngle={(node) => setAngleNodeId(node.id)}
                    onViewImage={(node) => setPreviewNodeId(node.id)}
                    onReversePrompt={createImageReversePromptNodes}
                    onGenerateCharacters={openCharacterBatchDialog}
                    onGenerateCharacterAssets={openCharacterAssetDialog}
                    onRetry={handleNodeRetry}
                    onToggleFreeResize={(node) => toggleNodeFreeResize(node.id)}
                    onDelete={(node) => deleteNodes(new Set([node.id]))}
                />

                <CanvasToolbar
                    selectedCount={selectedNodeIds.size}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    backgroundMode={backgroundMode}
                    showImageInfo={showImageInfo}
                    onAddImage={() => createNode(CanvasNodeType.Image)}
                    onAddVideo={() => createNode(CanvasNodeType.Video)}
                    onAddAudio={() => createNode(CanvasNodeType.Audio)}
                    onAddText={() => createNode(CanvasNodeType.Text)}
                    onAddConfig={() => createNode(CanvasNodeType.Config)}
                    onAddGroup={() => createNode(CanvasNodeType.Group)}
                    onOrganize={organizeCanvas}
                    onAddExtensionNode={(type) => createNode(type)}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    onUpload={() => handleUploadRequest()}
                    onDelete={() => deleteNodes(new Set(selectedNodeIds))}
                    onClear={() => setClearConfirmOpen(true)}
                    onDeselect={deselectCanvas}
                    onBackgroundModeChange={setBackgroundMode}
                    onShowImageInfoChange={setShowImageInfo}
                />

                {isMiniMapOpen ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} onViewportChange={setViewport} /> : null}

                <CanvasZoomControls scale={viewport.k} onScaleChange={setZoomScale} onReset={resetViewport} isMiniMapOpen={isMiniMapOpen} onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)} />

                {contextMenu ? (
                    <CanvasNodeContextMenu
                        menu={contextMenu}
                        onClose={() => setContextMenu(null)}
                        onDuplicate={() => {
                            if (contextMenu.type !== "node") return;
                            duplicateNode(contextMenu.nodeId);
                            setContextMenu(null);
                        }}
                        onDelete={() => {
                            if (contextMenu.type === "node") {
                                deleteNodes(new Set([contextMenu.nodeId]));
                            } else {
                                deleteConnection(contextMenu.connectionId);
                            }
                            setContextMenu(null);
                        }}
                    />
                ) : null}

                <input ref={imageInputRef} type="file" accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" className="hidden" onChange={handleImageInputChange} />

                <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={() => setInfoNodeId(null)} />
                <CanvasPluginManagerModal open={pluginManagerOpen} onClose={() => setPluginManagerOpen(false)} />
                <CanvasMarkdownReader
                    node={markdownReaderNode}
                    labels={markdownReaderLabels}
                    contentOverride={shotboardMarkdown}
                    readOnly={markdownReaderNode?.type === CanvasNodeType.Shotboard}
                    onChange={handleMarkdownContentChange}
                    onClose={closeMarkdownReader}
                />
                {shotWorkbench ? (
                    <CanvasShotWorkbench
                        production={production}
                        shotboardId={shotWorkbench.shotboardId}
                        initialShotId={shotWorkbench.shotId}
                        onChange={applyWorkbenchProduction}
                        onPinControlAsset={(shotId, recordId, version) => void pinControlAssetToCanvas(shotId, recordId, version)}
                        onPinTask={pinJimengTaskToCanvas}
                        onPinCandidate={(shotId, candidateId) => void pinCandidateToCanvas(shotId, candidateId)}
                        onClose={() => setShotWorkbench(null)}
                    />
                ) : null}
                {shotboardWorkbench ? (
                    <CanvasShotboardWorkbench
                        production={production}
                        shotboardId={shotboardWorkbench.shotboardId}
                        onChange={applyWorkbenchProduction}
                        onRunPreflight={(scope) => runShotboardPreflight(shotboardWorkbench.shotboardId, scope)}
                        isPreflighting={runningNodeId === shotboardWorkbench.nodeId}
                        onOpenShot={(shotId) => {
                            setShotWorkbench({ shotboardId: shotboardWorkbench.shotboardId, shotId });
                            setShotboardWorkbench(null);
                        }}
                        onOpenMarkdown={() => {
                            setMarkdownReaderNodeId(shotboardWorkbench.nodeId);
                            setShotboardWorkbench(null);
                        }}
                        onExport={(mode) => void exportProductionPackage(shotboardWorkbench.shotboardId, mode)}
                        onClose={() => setShotboardWorkbench(null)}
                    />
                ) : null}
                <Modal
                    title="整理角色设定"
                    open={Boolean(characterBatchScriptId)}
                    centered
                    onCancel={() => {
                        setCharacterBatchScriptId(null);
                        setCharacterBatchTargetId(null);
                    }}
                    footer={
                        <>
                            <Button onClick={() => {
                                setCharacterBatchScriptId(null);
                                setCharacterBatchTargetId(null);
                            }}>取消</Button>
                            <Button type="primary" disabled={!characterBatchSectionIds.length} onClick={() => void generateCharacterBatch()}>
                                生成
                            </Button>
                        </>
                    }
                    width={620}
                >
                    <div className="space-y-4 text-sm">
                        <div>
                            <div className="mb-2 flex items-center gap-3">
                                <span className="font-medium">选择发送章节</span>
                                <span className="text-xs opacity-50">已选 {characterBatchSectionIds.length}/{characterBatchSections.length} · {selectedCharacterBatchChars.toLocaleString()} 字符</span>
                                <button
                                    type="button"
                                    className="ml-auto text-xs opacity-60 transition hover:opacity-100"
                                    onClick={() => setCharacterBatchSectionIds(characterBatchSectionIds.length === characterBatchSections.length ? [] : characterBatchSections.map((section) => section.id))}
                                >
                                    {characterBatchSectionIds.length === characterBatchSections.length ? "清空" : "全选"}
                                </button>
                            </div>
                            <Checkbox.Group value={characterBatchSectionIds} className="thin-scrollbar grid max-h-60 w-full gap-1 overflow-y-auto rounded-lg border p-2" style={{ borderColor: theme.toolbar.border }} onChange={(values) => setCharacterBatchSectionIds(values.map(String))}>
                                {characterBatchSections.map((section) => (
                                    <Checkbox key={section.id} value={section.id} className="m-0 flex w-full items-start rounded-md px-2 py-1.5 transition hover:bg-black/5 dark:hover:bg-white/10">
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span className="truncate">{section.title}</span>
                                            <span className="shrink-0 text-xs opacity-40">{section.content.length.toLocaleString()} 字符</span>
                                        </span>
                                    </Checkbox>
                                ))}
                            </Checkbox.Group>
                            <div className="mt-2 text-xs opacity-50">只会把勾选章节发送给当前文本模型，默认选择第一章。</div>
                        </div>
                        <label className="flex items-center justify-between gap-4">
                            <span>最多主要角色数</span>
                            <InputNumber min={1} max={12} value={characterBatchOptions.maxCharacters} onChange={(value) => setCharacterBatchOptions((current) => ({ ...current, maxCharacters: Number(value) || 6 }))} />
                        </label>
                        <label className="block">
                            <span className="mb-2 block">风格补充</span>
                            <Input.TextArea rows={3} value={characterBatchOptions.styleHint} placeholder="例如：玄幻短剧、偏暗黑、半写实动漫" onChange={(event) => setCharacterBatchOptions((current) => ({ ...current, styleHint: event.target.value }))} />
                        </label>
                        <label className="flex items-center justify-between gap-4">
                            <span>包含重要配角</span>
                            <Switch checked={characterBatchOptions.includeSupportingRoles} onChange={(checked) => setCharacterBatchOptions((current) => ({ ...current, includeSupportingRoles: checked }))} />
                        </label>
                        <label className="flex items-center justify-between gap-4">
                            <span>排除群演/无名人物</span>
                            <Switch checked={characterBatchOptions.excludeExtras} onChange={(checked) => setCharacterBatchOptions((current) => ({ ...current, excludeExtras: checked }))} />
                        </label>
                    </div>
                </Modal>
                <Modal
                    title="准备视觉参考"
                    open={Boolean(characterAssetCardId)}
                    centered
                    onCancel={() => setCharacterAssetCardId(null)}
                    footer={
                        <>
                            <Button onClick={() => setCharacterAssetCardId(null)}>取消</Button>
                            <Button type="primary" onClick={() => void (characterAssetMode === "model" ? generateCharacterAssets() : importManualCharacterAssets())}>
                                {characterAssetMode === "model" ? "开始生成" : "导入画板"}
                            </Button>
                        </>
                    }
                    width={characterAssetMode === "manual" ? 760 : 520}
                >
                    <div className="space-y-4 text-sm">
                        <Segmented
                            block
                            value={characterAssetMode}
                            onChange={(value) => setCharacterAssetMode(value as CharacterAssetMode)}
                            options={[
                                { value: "model", label: "模型生成" },
                                { value: "manual", label: "外部制作" },
                            ]}
                        />
                        <div className="rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke }}>
                            <div className="font-medium">三视图</div>
                            <div className="mt-1 text-xs opacity-60">{characterAssetMode === "model" ? "固定先生成，作为后续资产的视觉母版" : "必须先在外部平台完成并上传，后续资产应引用它生成"}</div>
                        </div>
                        <label className="block">
                            <span className="mb-2 block">风格补充</span>
                            <Input.TextArea rows={3} value={characterAssetOptions.styleHint} placeholder="例如：3D 国漫、半写实、暗黑玄幻" onChange={(event) => setCharacterAssetOptions((current) => ({ ...current, styleHint: event.target.value }))} />
                        </label>
                        <label className="flex items-center justify-between gap-4">
                            <span>背景</span>
                            <Segmented
                                value={characterAssetOptions.background}
                                onChange={(value) => setCharacterAssetOptions((current) => ({ ...current, background: String(value) }))}
                                options={["纯白", "浅灰"]}
                            />
                        </label>
                        <label className="flex items-center justify-between gap-4">
                            <span>比例</span>
                            <Segmented
                                value={characterAssetOptions.size}
                                onChange={(value) => setCharacterAssetOptions((current) => ({ ...current, size: String(value) }))}
                                options={["3:2", "16:9"]}
                            />
                        </label>
                        <label className="flex items-center justify-between gap-4">
                            <span>表情九宫格</span>
                            <Switch checked={characterAssetOptions.generateExpressionGrid} onChange={(checked) => setCharacterAssetOptions((current) => ({ ...current, generateExpressionGrid: checked }))} />
                        </label>
                        <label className="flex items-center justify-between gap-4">
                            <span>景别参考</span>
                            <Switch checked={characterAssetOptions.generateShotScale} onChange={(checked) => setCharacterAssetOptions((current) => ({ ...current, generateShotScale: checked }))} />
                        </label>
                        {characterAssetMode === "manual" ? (
                            <ManualCharacterAssetWorkflow
                                characterNode={nodes.find((node) => node.id === characterAssetCardId) || null}
                                options={characterAssetOptions}
                                files={manualCharacterAssetFiles}
                                onFileChange={(kind, file) => setManualCharacterAssetFiles((current) => ({ ...current, [kind]: file }))}
                                onCopy={(prompt) => {
                                    void navigator.clipboard.writeText(prompt);
                                    message.success("Prompt 已复制");
                                }}
                            />
                        ) : null}
                    </div>
                </Modal>

                {cropNode?.metadata?.content ? <CanvasNodeCropDialog dataUrl={cropNode.metadata.content} open={Boolean(cropNode)} onClose={() => setCropNodeId(null)} onConfirm={(crop) => void cropImageNode(cropNode!, crop)} /> : null}

                {maskEditNode?.metadata?.content ? (
                    <CanvasNodeMaskEditDialog dataUrl={maskEditNode.metadata.content} open={Boolean(maskEditNode)} onClose={() => setMaskEditNodeId(null)} onConfirm={(payload) => void maskEditImageNode(maskEditNode!, payload)} />
                ) : null}

                {splitNode?.metadata?.content ? <CanvasNodeSplitDialog dataUrl={splitNode.metadata.content} open={Boolean(splitNode)} onClose={() => setSplitNodeId(null)} onConfirm={(params) => void splitImageNode(splitNode!, params)} /> : null}

                {upscaleNode?.metadata?.content ? (
                    <CanvasNodeUpscaleDialog dataUrl={upscaleNode.metadata.content} open={Boolean(upscaleNode)} onClose={() => setUpscaleNodeId(null)} onConfirm={(params) => void upscaleImageNode(upscaleNode!, params)} />
                ) : null}

                <Modal title="AI 超分" open={Boolean(superResolveNode?.metadata?.content)} centered footer={null} onCancel={() => setSuperResolveNodeId(null)}>
                    <div className="py-8 text-center text-base font-medium">暂未实现</div>
                </Modal>

                {angleNode?.metadata?.content ? <CanvasNodeAngleDialog dataUrl={angleNode.metadata.content} open={Boolean(angleNode)} onClose={() => setAngleNodeId(null)} onConfirm={(params) => void generateAngleNode(angleNode!, params)} /> : null}

                <Modal
                    title="图片详情"
                    open={Boolean(previewNode?.metadata?.content)}
                    centered
                    onCancel={() => setPreviewNodeId(null)}
                    footer={null}
                    width="auto"
                    styles={{ body: { padding: 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "80vh" } }}
                >
                    {previewNode?.metadata?.content ? <img src={previewNode.metadata.content} alt={previewNode.title || "图片"} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }} /> : null}
                </Modal>

                <Modal
                    title="清空画布？"
                    open={clearConfirmOpen}
                    centered
                    onCancel={() => setClearConfirmOpen(false)}
                    footer={
                        <>
                            <Button onClick={() => setClearConfirmOpen(false)}>取消</Button>
                            <Button danger type="primary" onClick={clearCanvas}>
                                清空
                            </Button>
                        </>
                    }
                >
                    <p className="text-sm opacity-60">这会删除当前画布上的所有节点和连线。</p>
                </Modal>

                <AssetPickerModal open={assetPickerOpen} onInsert={handleAssetInsert} onClose={() => setAssetPickerOpen(false)} />
            </section>
        </main>
    );
}

function markdownLabelsForNode(node: CanvasNodeData | null): CanvasMarkdownReaderLabels {
    if (node?.type === CanvasNodeType.Script) {
        return {
            fallbackTitle: "剧本",
            emptyTitle: "粘贴 Markdown 剧本",
            emptyHint: "点击进入编辑模式",
            editorPlaceholder: "# 第1集：标题\n\n## 0-3s Hook\n\n在这里粘贴 Markdown 剧本...",
        };
    }
    if (node?.type === CanvasNodeType.Shotboard) {
        return {
            fallbackTitle: "分镜表",
            emptyTitle: "分镜数据缺失",
            emptyHint: "关闭后检查分镜表记录",
            editorPlaceholder: "",
        };
    }
    return {
        fallbackTitle: "文档",
        emptyTitle: "粘贴 Markdown 文档",
        emptyHint: "点击进入编辑模式",
        editorPlaceholder: "# 文档标题\n\n## 小节\n\n在这里粘贴 Markdown 文档...",
    };
}

function withFinalAnswerOnlyInstruction(prompt: string) {
    return `${prompt.trim()}\n\n输出要求：只输出最终内容，不要输出思考过程、分析过程或 <think> 标签。`;
}

type CharacterAssetKind = "three-view" | "expression-grid" | "shot-scale";

function selectedCharacterAssetKinds(options: CharacterAssetOptions): CharacterAssetKind[] {
    return ["three-view", ...(options.generateExpressionGrid ? (["expression-grid"] as const) : []), ...(options.generateShotScale ? (["shot-scale"] as const) : [])];
}

function createCharacterAssetGroupNode(characterNode: CanvasNodeData, options: CharacterAssetOptions): CanvasNodeData {
    const rootSpec = NODE_DEFAULT_SIZE[CanvasNodeType.CharacterAssetGroup];
    return {
        id: nanoid(),
        type: CanvasNodeType.CharacterAssetGroup,
        title: `${characterNode.metadata?.name || characterNode.title} 视觉参考`,
        position: { x: characterNode.position.x + characterNode.width + 120, y: characterNode.position.y },
        width: rootSpec.width,
        height: rootSpec.height,
        metadata: {
            status: NODE_STATUS_LOADING,
            characterCardId: characterNode.id,
            characterAssetExpanded: true,
            characterAssetChildIds: [],
            assetKinds: selectedCharacterAssetKinds(options),
            styleHint: options.styleHint,
            size: options.size,
        },
    };
}

function buildCharacterAssetPrompt(characterNode: CanvasNodeData, kind: CharacterAssetKind, options: CharacterAssetOptions) {
    const metadata = characterNode.metadata || {};
    const identity = [
        metadata.positivePrompt,
        metadata.ageRange ? `年龄：${metadata.ageRange}` : "",
        metadata.gender ? `性别：${metadata.gender}` : "",
        metadata.body ? `身形：${metadata.body}` : "",
        metadata.face ? `脸型与五官：${metadata.face}` : "",
        metadata.hair ? `发型：${metadata.hair}` : "",
        metadata.clothing ? `服装：${metadata.clothing}` : "",
        metadata.colors?.length ? `主色：${metadata.colors.join("、")}` : "",
        metadata.props?.length ? `关键道具：${metadata.props.join("、")}` : "",
        metadata.consistencyLocks?.length ? `一致性锁定：${metadata.consistencyLocks.join("、")}` : "",
    ]
        .filter(Boolean)
        .join("\n");
    const common = `同一个角色，严格保持相同脸型、五官、年龄、发型、服装、颜色、身体比例和关键道具。\n角色设定：\n${identity}\n风格：${options.styleHint || "高质量 AI 漫剧角色设定图"}\n背景：${options.background}，均匀柔光，干净无杂物。\n负面要求：${metadata.negativePrompt || "不同人物，不同服装，不同发型，不同年龄，复杂背景，多余肢体，五官变形，文字，水印"}。`;
    if (kind === "three-view") {
        return `角色设定三视图，正面、左侧面、背面横向排列，全身自然站立，双臂微微离开身体，中性表情，无动作，无透视夸张，三个视图保持相同身高和比例，高清细节。\n${common}`;
    }
    if (kind === "expression-grid") {
        return `基于参考图中的同一个角色，生成 3x3 表情九宫格，九个清晰头像或胸像，依次包含：中性、开心、愤怒、悲伤、震惊、恐惧、轻蔑、隐忍、爆发。每格保持相同脸型、发型、服装和角色身份，表情差异清楚，适合 AI 漫剧近景与反应镜头。\n${common}`;
    }
    return `基于参考图中的同一个角色，生成角色景别参考图，横向展示四个视图：正面大特写、胸像、半身、全身。每个视图保持相同脸型、发型、服装、身体比例和中性表情，构图标准，适合 AI 漫剧分镜生图参考。\n${common}`;
}

function characterAssetLabel(kind: CharacterAssetKind) {
    if (kind === "three-view") return "三视图";
    if (kind === "expression-grid") return "表情九宫格";
    return "景别参考";
}

function createCharacterAssetImageNode({
    id,
    rootNode,
    index,
    spec,
    uploaded,
    kind,
    title,
    prompt,
    characterCardId,
    referenceImageNodeId,
}: {
    id: string;
    rootNode: CanvasNodeData;
    index: number;
    spec: (typeof NODE_DEFAULT_SIZE)[CanvasNodeType.Image];
    uploaded: UploadedImage;
    kind: CharacterAssetKind;
    title: string;
    prompt: string;
    characterCardId: string;
    referenceImageNodeId?: string;
}): CanvasNodeData {
    return {
        id,
        type: CanvasNodeType.Image,
        title,
        position: {
            x: rootNode.position.x + rootNode.width + 120 + (index % 2) * (spec.width + 36),
            y: rootNode.position.y + Math.floor(index / 2) * (spec.height + 32),
        },
        width: spec.width,
        height: spec.height,
        metadata: {
            ...imageMetadata(uploaded),
            prompt,
            assetKind: kind,
            characterCardId,
            characterAssetRootId: rootNode.id,
            referenceImageNodeId,
        },
    };
}

function updateCharacterAssetRoot(root: CanvasNodeData, children: CanvasNodeData[]) {
    return {
        ...root,
        metadata: {
            ...root.metadata,
            characterAssetChildIds: children.map((child) => child.id),
        },
    };
}

function ManualCharacterAssetWorkflow({
    characterNode,
    options,
    files,
    onFileChange,
    onCopy,
}: {
    characterNode: CanvasNodeData | null;
    options: CharacterAssetOptions;
    files: Partial<Record<CharacterAssetKind, File>>;
    onFileChange: (kind: CharacterAssetKind, file: File) => void;
    onCopy: (prompt: string) => void;
}) {
    if (!characterNode) return null;
    const kinds = selectedCharacterAssetKinds(options);
    return (
        <div className="space-y-3 border-t pt-4">
            <div className="text-xs leading-5 opacity-65">
                操作流程：复制三视图 Prompt 到外部平台生成并下载；再把三视图作为参考图，分别使用后续 Prompt 生成表情九宫格和景别参考；完成后在这里上传，点击“导入画板”。
            </div>
            {kinds.map((kind, index) => {
                const prompt = buildCharacterAssetPrompt(characterNode, kind, options);
                return (
                    <div key={kind} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="font-medium">
                                    {index + 1}. {characterAssetLabel(kind)}
                                </div>
                                {kind !== "three-view" ? <div className="mt-1 text-xs opacity-55">生成时上传第 1 步三视图作为参考图</div> : null}
                            </div>
                            <Button size="small" onClick={() => onCopy(prompt)}>
                                复制 Prompt
                            </Button>
                        </div>
                        <pre className="thin-scrollbar mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-black/5 p-2 text-xs leading-5 dark:bg-white/5">{prompt}</pre>
                        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2">
                            <span className="truncate text-xs">{files[kind]?.name || `上传${characterAssetLabel(kind)}`}</span>
                            <span className="text-xs font-medium">选择图片</span>
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file) onFileChange(kind, file);
                                    event.currentTarget.value = "";
                                }}
                            />
                        </label>
                    </div>
                );
            })}
        </div>
    );
}

type CharacterBatchResult = {
    characters: Array<NonNullable<CanvasNodeData["metadata"]>>;
    skipped: Array<{ name: string; reason: string }>;
};

function buildCharacterBatchPrompt(script: string, options: CharacterBatchOptions) {
    return `你是 AI 漫剧角色设计师。请基于用户选择的剧本章节，识别需要后续视觉复用的主要角色，并整理稳定的角色设定。

这是信息提取任务，不是续写任务。禁止续写、改写或补写剧本。
只生成主要角色卡，最多 ${options.maxCharacters} 个。
${options.includeSupportingRoles ? "可以包含重要配角。" : "只生成主角、主要反派和核心角色。"}
${options.excludeExtras ? "不要为群演、路人、宾客甲乙、无名弟子、纯背景人物生成卡片。" : "低复用角色放入 skipped，不要直接建卡。"}
如果角色外观没有明确描述，可以根据身份合理推断，但必须在 sourceNote 标注。
每个角色必须可用于后续三视图生成。
一致性锁定词必须具体可视化，不要写抽象性格。
不要输出思考过程、分析过程或 <think> 标签。
响应的第一个字符必须是 {，最后一个字符必须是 }。
只输出符合下方格式的严格 JSON，不要输出 Markdown、标题、解释、代码围栏或任何额外文字。

风格补充：
${options.styleHint || "无"}

JSON 格式：
{
  "characters": [
    {
      "name": "",
      "role": "",
      "importance": "主角",
      "storyFunction": "",
      "ageRange": "",
      "gender": "男",
      "body": "",
      "face": "",
      "hair": "",
      "clothing": "",
      "colors": [],
      "temperament": "",
      "defaultExpression": "",
      "props": [],
      "relationships": "",
      "positivePrompt": "",
      "negativePrompt": "",
      "consistencyLocks": [],
      "sourceNote": ""
    }
  ],
  "skipped": [
    { "name": "", "reason": "" }
  ]
}

剧本：
${script}`;
}

function parseCharacterBatchResult(text: string): CharacterBatchResult {
    const jsonText = extractJsonText(text);
    let data: { characters?: unknown; skipped?: unknown };
    try {
        data = JSON.parse(jsonText) as { characters?: unknown; skipped?: unknown };
    } catch {
        throw new Error("模型未按要求返回角色 JSON，请调整所选章节后重试");
    }
    if (!Array.isArray(data.characters)) throw new Error("模型未返回 characters 数组");
    return {
        characters: data.characters.map(normalizeCharacterCard).filter((item) => item.name),
        skipped: Array.isArray(data.skipped)
            ? data.skipped
                  .map((item) => (item && typeof item === "object" ? { name: stringField(item, "name"), reason: stringField(item, "reason") } : null))
                  .filter((item): item is { name: string; reason: string } => Boolean(item?.name))
            : [],
    };
}

function extractJsonText(text: string) {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
    if (fenced?.[1]) return fenced[1].trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return text.slice(start, end + 1);
    return text.trim();
}

function normalizeCharacterCard(value: unknown): NonNullable<CanvasNodeData["metadata"]> {
    const source = value && typeof value === "object" ? value : {};
    return {
        name: stringField(source, "name"),
        role: stringField(source, "role"),
        importance: stringField(source, "importance") || "重要角色",
        storyFunction: stringField(source, "storyFunction"),
        ageRange: stringField(source, "ageRange"),
        gender: stringField(source, "gender") || "未知",
        body: stringField(source, "body"),
        face: stringField(source, "face"),
        hair: stringField(source, "hair"),
        clothing: stringField(source, "clothing"),
        colors: stringArrayField(source, "colors"),
        temperament: stringField(source, "temperament"),
        defaultExpression: stringField(source, "defaultExpression"),
        props: stringArrayField(source, "props"),
        relationships: stringField(source, "relationships"),
        positivePrompt: stringField(source, "positivePrompt"),
        negativePrompt: stringField(source, "negativePrompt"),
        consistencyLocks: stringArrayField(source, "consistencyLocks"),
        sourceNote: stringField(source, "sourceNote"),
    };
}

function stringField(source: object, key: string) {
    const value = (source as Record<string, unknown>)[key];
    return typeof value === "string" ? value.trim() : "";
}

function stringArrayField(source: object, key: string) {
    const value = (source as Record<string, unknown>)[key];
    return Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean) : [];
}

function projectAdoptedAssetToCanvas(
    adoption: AssetDraftAdoption,
    nodes: CanvasNodeData[],
    idFactory: () => string,
): { nodes: CanvasNodeData[]; connections: CanvasConnection[]; nodeId: string } {
    const groupType = adoption.kind === "character" ? CanvasNodeType.CharacterGroup : adoption.kind === "scene" ? CanvasNodeType.SceneGroup : CanvasNodeType.PropGroup;
    const cardType = adoption.kind === "character" ? CanvasNodeType.CharacterCard : adoption.kind === "scene" ? CanvasNodeType.SceneCard : CanvasNodeType.PropCard;
    let root = nodes.find((node) => node.type === groupType);
    const rootId = root?.id || idFactory();
    const rootSpec = NODE_DEFAULT_SIZE[groupType];
    const cardSpec = NODE_DEFAULT_SIZE[cardType];
    const existingChildIds = root?.metadata?.characterChildIds || root?.metadata?.productionChildIds || [];
    const childId = idFactory();
    if (adoption.kind === "character") {
        adoption.production = {
            ...adoption.production,
            characters: adoption.production.characters.map((record) =>
                record.id === adoption.recordId
                    ? {
                          ...record,
                          versions: record.versions.map((version) =>
                              version.version === adoption.version ? { ...version, data: { ...version.data, sourceNodeId: childId } } : version,
                          ),
                      }
                    : record,
            ),
        };
        adoption.data = { ...adoption.data, sourceNodeId: childId };
    }
    const rootPosition = root?.position || nextAssetGroupPosition(nodes);
    const index = existingChildIds.length;
    const child: CanvasNodeData = {
        id: childId,
        type: cardType,
        title: adoption.data.name,
        position: {
            x: rootPosition.x + rootSpec.width + 120 + (index % 2) * (cardSpec.width + 36),
            y: rootPosition.y + Math.floor(index / 2) * (cardSpec.height + 32),
        },
        width: cardSpec.width,
        height: cardSpec.height,
        metadata:
            adoption.kind === "character" && "appearance" in adoption.data
                ? {
                      status: NODE_STATUS_SUCCESS,
                      name: adoption.data.name,
                      role: adoption.data.role,
                      clothing: adoption.data.clothing,
                      props: adoption.data.props,
                      positivePrompt: adoption.data.positivePrompt,
                      negativePrompt: adoption.data.negativePrompt,
                      consistencyLocks: adoption.data.consistencyLocks,
                      characterRootId: rootId,
                      productionRecordId: adoption.recordId,
                      productionVersion: adoption.version,
                  }
                : {
                      status: NODE_STATUS_SUCCESS,
                      productionKind: adoption.kind,
                      productionRecordId: adoption.recordId,
                      productionVersion: adoption.version,
                      productionRootId: rootId,
                  },
    };
    if (!root) {
        root = {
            id: rootId,
            type: groupType,
            title: adoption.kind === "character" ? "角色设定" : adoption.kind === "scene" ? "场景卡组" : "道具卡组",
            position: rootPosition,
            width: rootSpec.width,
            height: rootSpec.height,
            metadata:
                adoption.kind === "character"
                    ? { status: NODE_STATUS_SUCCESS, characterBatchExpanded: true, characterChildIds: [childId] }
                    : {
                          status: NODE_STATUS_SUCCESS,
                          productionKind: adoption.kind,
                          productionRecordIds: [adoption.recordId],
                          productionExpanded: true,
                          productionChildIds: [childId],
                      },
        };
        return { nodes: [...nodes, root, child], connections: [{ id: idFactory(), fromNodeId: root.id, toNodeId: child.id }], nodeId: child.id };
    }
    const updatedRoot: CanvasNodeData = {
        ...root,
        metadata:
            adoption.kind === "character"
                ? { ...root.metadata, characterChildIds: [...existingChildIds, childId], characterBatchExpanded: true }
                : {
                      ...root.metadata,
                      productionRecordIds: [...(root.metadata?.productionRecordIds || []), adoption.recordId],
                      productionChildIds: [...existingChildIds, childId],
                      productionExpanded: true,
                  },
    };
    return {
        nodes: [...nodes.map((node) => node.id === rootId ? updatedRoot : node), child],
        connections: [{ id: idFactory(), fromNodeId: rootId, toNodeId: childId }],
        nodeId: childId,
    };
}

function nextAssetGroupPosition(nodes: CanvasNodeData[]) {
    const maxX = nodes.reduce((value, node) => Math.max(value, node.position.x + node.width), 0);
    const minY = nodes.reduce((value, node) => Math.min(value, node.position.y), 0);
    return { x: maxX + 120, y: Number.isFinite(minY) ? minY : 0 };
}
function assetKindLabel(kind: AssetDraftAdoption["kind"]) {
    return kind === "character" ? "人物" : kind === "scene" ? "场景" : "道具";
}

function createDraftReferenceImageNode(
    assetNodeId: string,
    nodes: CanvasNodeData[],
    draft: AssetDraft,
    uploaded: UploadedImage,
    id: string,
    prompt: string,
    negativePrompt: string,
): CanvasNodeData {
    const assetNode = nodes.find((node) => node.id === assetNodeId);
    if (!assetNode) throw new Error("资产卡节点不存在");
    const size = fitNodeSize(uploaded.width, uploaded.height);
    return {
        id,
        type: CanvasNodeType.Image,
        title: `${draft.name} 参考图`,
        position: { x: assetNode.position.x + assetNode.width + 120, y: assetNode.position.y },
        width: size.width,
        height: size.height,
        metadata: {
            ...imageMetadata(uploaded),
            status: NODE_STATUS_SUCCESS,
            prompt,
            negativePrompt,
            productionKind: `${draft.kind}-reference`,
            productionRecordId: draft.id,
        },
    };
}

function createAssetReferenceImageNode(
    assetNodeId: string,
    nodes: CanvasNodeData[],
    reference: import("@/types/production").AssetReferenceImage,
    uploaded: UploadedImage,
    id: string,
): CanvasNodeData {
    const assetNode = nodes.find((node) => node.id === assetNodeId);
    if (!assetNode) throw new Error("资产卡节点不存在");
    const size = fitNodeSize(uploaded.width, uploaded.height);
    return {
        id,
        type: CanvasNodeType.Image,
        title: `${assetNode.title} ${assetReferenceLabel(reference.kind)}`,
        position: { x: assetNode.position.x + assetNode.width + 120, y: assetNode.position.y + (reference.version - 1) * (size.height + 24) },
        width: size.width,
        height: size.height,
        metadata: {
            ...imageMetadata(uploaded),
            prompt: reference.prompt,
            negativePrompt: reference.negativePrompt,
            productionKind: "asset-reference",
            productionRecordId: reference.id,
            productionVersion: reference.version,
            assetReferenceAssetId: reference.assetId,
            assetReferenceAssetVersion: reference.assetVersion,
            assetReferenceKind: reference.kind,
        },
    };
}

function findAssetRecord(
    production: ProductionProject,
    kind: ShotAssetKind,
    assetId: string,
    assetVersion: number,
) {
    const records = kind === "character" ? production.characters : kind === "scene" ? production.scenes : production.props;
    const data = records.find((record) => record.id === assetId)?.versions.find((version) => version.version === assetVersion)?.data;
    return data || null;
}

function characterRootId(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    if (node.type !== CanvasNodeType.CharacterCard) return null;
    const rootId = node.metadata?.characterRootId || node.metadata?.batchRootId;
    if (!rootId) return null;
    const root = nodes.find((item) => item.id === rootId);
    return root?.type === CanvasNodeType.CharacterGroup ? rootId : null;
}

function isHiddenCharacterChild(node: CanvasNodeData, nodes: CanvasNodeData[], collapsingCharacterGroupIds?: Set<string>) {
    const rootId = characterRootId(node, nodes);
    if (!rootId) return false;
    if (collapsingCharacterGroupIds?.has(rootId)) return false;
    const root = nodes.find((item) => item.id === rootId);
    return root?.metadata?.characterBatchExpanded === false;
}

function characterAssetRootId(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    if (node.type !== CanvasNodeType.Image || !node.metadata?.characterAssetRootId) return null;
    const root = nodes.find((item) => item.id === node.metadata?.characterAssetRootId);
    return root?.type === CanvasNodeType.CharacterAssetGroup ? root.id : null;
}

function isHiddenCharacterAssetChild(node: CanvasNodeData, nodes: CanvasNodeData[], collapsingCharacterAssetGroupIds?: Set<string>) {
    const rootId = characterAssetRootId(node, nodes);
    if (!rootId) return false;
    if (collapsingCharacterAssetGroupIds?.has(rootId)) return false;
    const root = nodes.find((item) => item.id === rootId);
    return root?.metadata?.characterAssetExpanded === false;
}
