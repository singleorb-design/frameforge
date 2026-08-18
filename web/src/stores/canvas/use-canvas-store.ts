import { create } from "zustand";

import { nanoid } from "nanoid";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import { getAppPreference, setAppPreference } from "@/services/app-preferences";
import { LocalApiError, localApi, type ProjectSummary } from "@/services/local-api";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "@/types/canvas";
import { createEmptyProductionProject, normalizeProductionProject, type ProductionProject } from "@/types/production";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
    production: ProductionProject;
};

type CanvasStore = {
    hydrated: boolean;
    projects: CanvasProject[];
    recentProjectId: string;
    loadedProjectIds: Set<string>;
    saveStatus: "idle" | "saving" | "saved" | "error" | "conflict";
    saveError: string;
    hydrateIndex: () => Promise<void>;
    createProject: (title?: string) => Promise<string>;
    importProject: (project: Partial<CanvasProject>) => Promise<string>;
    openProject: (id: string, remember?: boolean) => Promise<CanvasProject | null>;
    renameProject: (id: string, title: string) => Promise<void>;
    deleteProjects: (ids: string[]) => Promise<void>;
    replaceProjects: (projects: CanvasProject[]) => Promise<void>;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport" | "production">>) => void;
    flushProject: (id: string) => Promise<void>;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const saveQueues = new Map<string, Promise<void>>();
const revisions = new Map<string, number>();
const changeVersions = new Map<string, number>();

export const useCanvasStore = create<CanvasStore>((set, get) => ({
    hydrated: false,
    projects: [],
    recentProjectId: "",
    loadedProjectIds: new Set(),
    saveStatus: "idle",
    saveError: "",
    hydrateIndex: async () => {
        try {
            revisions.clear();
            changeVersions.clear();
            const [summaries, recentProjectId] = await Promise.all([localApi.listProjects(), getAppPreference("last-project-id", "")]);
            const projects = summaries.map(projectFromSummary);
            set({ projects, recentProjectId: projects.some((project) => project.id === recentProjectId) ? recentProjectId : projects[0]?.id || "", hydrated: true, loadedProjectIds: new Set(), saveStatus: "idle", saveError: "" });
        } catch (error) {
            set({ hydrated: true, saveStatus: "error", saveError: error instanceof Error ? error.message : "读取画布失败" });
            throw error;
        }
    },
    createProject: async (title = "未命名画布") => {
        const project = createProject(title);
        const stored = await localApi.createProject(project);
        revisions.set(project.id, stored.revision);
        changeVersions.set(project.id, 0);
        set((state) => ({ projects: [stored.project, ...state.projects], recentProjectId: project.id, loadedProjectIds: new Set(state.loadedProjectIds).add(project.id), saveStatus: "saved", saveError: "" }));
        await rememberRecentProject(project.id);
        return project.id;
    },
    importProject: async (source) => {
        const project = createImportedProject(source);
        const stored = await localApi.createProject(project);
        revisions.set(project.id, stored.revision);
        changeVersions.set(project.id, 0);
        set((state) => ({ projects: [stored.project, ...state.projects], recentProjectId: project.id, loadedProjectIds: new Set(state.loadedProjectIds).add(project.id), saveStatus: "saved", saveError: "" }));
        await rememberRecentProject(project.id);
        return project.id;
    },
    openProject: async (id, remember = true) => {
        const current = get().projects.find((item) => item.id === id);
        if (!current) return null;
        if (get().loadedProjectIds.has(id)) {
            if (remember) {
                set({ recentProjectId: id });
                await rememberRecentProject(id);
            }
            return current;
        }
        try {
            const stored = await localApi.readProject<CanvasProject>(id);
            const project = { ...stored.project, production: normalizeProductionProject(stored.project.production) };
            revisions.set(id, stored.revision);
            changeVersions.set(id, 0);
            set((state) => ({
                projects: remember ? [project, ...state.projects.filter((item) => item.id !== id)] : state.projects.map((item) => (item.id === id ? project : item)),
                recentProjectId: remember ? id : state.recentProjectId,
                loadedProjectIds: new Set(state.loadedProjectIds).add(id),
            }));
            if (remember) await rememberRecentProject(id);
            return project;
        } catch (error) {
            set({ saveStatus: "error", saveError: error instanceof Error ? error.message : "读取画布失败" });
            return null;
        }
    },
    renameProject: async (id, title) => {
        if (!get().loadedProjectIds.has(id) && !(await get().openProject(id))) throw new Error("未找到画布");
        set((state) => ({ projects: state.projects.map((project) => (project.id === id ? { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() } : project)), saveStatus: "saving", saveError: "" }));
        changeVersions.set(id, (changeVersions.get(id) || 0) + 1);
        await get().flushProject(id);
    },
    deleteProjects: async (ids) => {
        ids.forEach((id) => {
            clearTimeout(saveTimers.get(id));
            saveTimers.delete(id);
        });
        await Promise.all(ids.map((id) => saveQueues.get(id)?.catch(() => undefined)));
        await Promise.all(ids.map((id) => localApi.deleteProject(id)));
        ids.forEach((id) => {
            revisions.delete(id);
            changeVersions.delete(id);
        });
        set((state) => ({
            projects: state.projects.filter((project) => !ids.includes(project.id)),
            recentProjectId: ids.includes(state.recentProjectId) ? state.projects.find((project) => !ids.includes(project.id))?.id || "" : state.recentProjectId,
            loadedProjectIds: new Set([...state.loadedProjectIds].filter((id) => !ids.includes(id))),
        }));
        await rememberRecentProject(get().recentProjectId);
    },
    replaceProjects: async (projects) => {
        const existing = new Set(get().projects.map((project) => project.id));
        const incoming = new Set(projects.map((project) => project.id));
        const stored = await Promise.all(
            projects.map(async (project) => {
                if (!existing.has(project.id)) return localApi.createProject(project);
                const current = await localApi.readProject<CanvasProject>(project.id);
                return localApi.writeProject(project.id, current.revision, project);
            }),
        );
        await Promise.all([...existing].filter((id) => !incoming.has(id)).map((id) => localApi.deleteProject(id)));
        stored.forEach((item) => revisions.set(item.project.id, item.revision));
        stored.forEach((item) => changeVersions.set(item.project.id, 0));
        const recentProjectId = stored[0]?.project.id || "";
        set({ projects: stored.map((item) => item.project), recentProjectId, loadedProjectIds: new Set(projects.map((project) => project.id)), saveStatus: "saved", saveError: "" });
        await rememberRecentProject(recentProjectId);
    },
    updateProject: (id, patch) => {
        set((state) => {
            const current = state.projects.find((project) => project.id === id);
            if (!current) return state;
            const project = { ...current, ...patch, updatedAt: new Date().toISOString() };
            return { projects: [project, ...state.projects.filter((item) => item.id !== id)], saveStatus: "saving", saveError: "" };
        });
        changeVersions.set(id, (changeVersions.get(id) || 0) + 1);
        clearTimeout(saveTimers.get(id));
        saveTimers.set(id, setTimeout(() => void get().flushProject(id), 400));
    },
    flushProject: async (id) => {
        clearTimeout(saveTimers.get(id));
        saveTimers.delete(id);
        const previous = saveQueues.get(id) || Promise.resolve();
        const next = previous.catch(() => undefined).then(async () => {
            const project = get().projects.find((item) => item.id === id);
            const revision = revisions.get(id);
            const changeVersion = changeVersions.get(id) || 0;
            if (!project || revision == null || !get().loadedProjectIds.has(id)) return;
            set({ saveStatus: "saving", saveError: "" });
            try {
                const stored = await localApi.writeProject(id, revision, project);
                revisions.set(id, stored.revision);
                if ((changeVersions.get(id) || 0) === changeVersion) set({ saveStatus: "saved", saveError: "" });
            } catch (error) {
                const conflict = error instanceof LocalApiError && error.status === 409;
                set({ saveStatus: conflict ? "conflict" : "error", saveError: error instanceof Error ? error.message : "保存画布失败" });
            }
        });
        saveQueues.set(id, next);
        await next.finally(() => {
            if (saveQueues.get(id) === next) saveQueues.delete(id);
        });
    },
}));

function projectFromSummary(summary: ProjectSummary): CanvasProject {
    return {
        ...summary,
        nodes: [],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: initialViewport,
        production: createEmptyProductionProject(),
    };
}

function createProject(title: string): CanvasProject {
    const now = new Date().toISOString();
    return { ...projectFromSummary({ id: nanoid(), title, createdAt: now, updatedAt: now }) };
}

function createImportedProject(source: Partial<CanvasProject>): CanvasProject {
    const now = new Date().toISOString();
    return {
        id: nanoid(),
        title: source.title || "导入画布",
        createdAt: source.createdAt || now,
        updatedAt: now,
        nodes: source.nodes || [],
        connections: source.connections || [],
        chatSessions: source.chatSessions || [],
        activeChatId: source.activeChatId || null,
        backgroundMode: source.backgroundMode || "lines",
        showImageInfo: source.showImageInfo || false,
        viewport: source.viewport || initialViewport,
        production: normalizeProductionProject(source.production),
    };
}

async function rememberRecentProject(id: string) {
    await setAppPreference("last-project-id", id).catch(() => undefined);
}
