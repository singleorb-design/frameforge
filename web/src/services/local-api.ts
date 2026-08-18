import type { StateStorage } from "zustand/middleware";

export type DiskArea = "settings" | "app" | "library";
export type WorkbenchKind = "image" | "video" | "audio";
export type MediaScope = "project" | "library" | "workbench";
export type ProjectSummary = { id: string; title: string; createdAt: string; updatedAt: string };
export type StoredProject<T> = { version: 1; revision: number; project: T };
export type MediaRecord = {
    storageKey: string;
    scope: MediaScope;
    ownerId: string;
    prefix: string;
    relativePath: string;
    originalName: string;
    mimeType: string;
    bytes: number;
    sha256: string;
    createdAt: string;
};
export type BootstrapData = {
    settings: Record<string, unknown>;
    app: Record<string, unknown>;
    projects: ProjectSummary[];
};

let bootstrapPromise: Promise<BootstrapData> | null = null;
const stateWriteQueues = new Map<string, Promise<unknown>>();

export const localApi = {
    health: () => request<{ ok: true }>("/health"),
    bootstrap: getBootstrap,
    resetBootstrap: () => {
        bootstrapPromise = null;
    },
    getState: async (area: DiskArea, key: string) => {
        const bootstrap = await getBootstrap();
        if (area === "settings" || area === "app") return bootstrap[area][key] ?? null;
        return request<{ value: unknown }>(`/state/${area}?key=${encodeURIComponent(key)}`).then((result) => result.value);
    },
    putState: (area: DiskArea, key: string, value: unknown) => queueStateWrite(`${area}:${key}`, () =>
        request<{ value: unknown }>(`/state/${area}?key=${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ value }) }).then((result) => {
            if (area === "settings" || area === "app") bootstrapPromise = null;
            return result.value;
        })),
    removeState: (area: DiskArea, key: string) => queueStateWrite(`${area}:${key}`, async () => {
        await request<void>(`/state/${area}?key=${encodeURIComponent(key)}`, { method: "DELETE" });
        if (area === "settings" || area === "app") bootstrapPromise = null;
    }),
    listProjects: () => getBootstrap().then((result) => result.projects),
    readProject: <T>(id: string) => request<StoredProject<T>>(`/projects/${encodeURIComponent(id)}`),
    createProject: async <T>(project: T) => {
        const stored = await request<StoredProject<T>>("/projects", { method: "POST", body: JSON.stringify({ project }) });
        bootstrapPromise = null;
        return stored;
    },
    writeProject: async <T>(id: string, expectedRevision: number, project: T) => {
        const stored = await request<StoredProject<T>>(`/projects/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ expectedRevision, project }) });
        bootstrapPromise = null;
        return stored;
    },
    deleteProject: async (id: string) => {
        await request<void>(`/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
        bootstrapPromise = null;
    },
    workbenchRecords: <T>(kind: WorkbenchKind) => request<{ records: Record<string, T> }>(`/workbenches/${kind}`).then((result) => result.records),
    setWorkbenchRecord: <T>(kind: WorkbenchKind, id: string, value: T) => request<void>(`/workbenches/${kind}?id=${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ value }) }),
    removeWorkbenchRecord: (kind: WorkbenchKind, id: string) => request<void>(`/workbenches/${kind}?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    replaceWorkbenchRecords: <T>(kind: WorkbenchKind, records: Record<string, T>) => request<void>(`/workbenches/${kind}`, { method: "PUT", body: JSON.stringify({ records }) }),
    uploadMedia: (blob: Blob, input: { scope: MediaScope; ownerId: string; prefix: string; originalName: string; storageKey?: string }) =>
        request<MediaRecord>("/media", {
            method: "POST",
            headers: {
                "content-type": blob.type || "application/octet-stream",
                "x-media-scope": input.scope,
                "x-media-owner": input.ownerId,
                "x-media-prefix": input.prefix,
                "x-media-name": encodeURIComponent(input.originalName),
                ...(input.storageKey ? { "x-media-storage-key": input.storageKey } : {}),
            },
            body: blob,
        }),
    copyMediaToLibrary: (storageKey: string) => request<MediaRecord>("/media/copy-to-library", { method: "POST", body: JSON.stringify({ storageKey }) }),
    mediaProjectReferences: (storageKey: string) => request<{ projectIds: string[] }>(`/media/project-references?storageKey=${encodeURIComponent(storageKey)}`).then((result) => result.projectIds),
    deleteMedia: (storageKey: string) => request<void>(`/media?storageKey=${encodeURIComponent(storageKey)}`, { method: "DELETE" }),
    cleanupMedia: () => request<void>("/media/cleanup", { method: "POST" }),
};

export function createLocalStateStorage(area: DiskArea): StateStorage {
    return {
        getItem: async (key) => {
            const value = await localApi.getState(area, key);
            return value == null ? null : JSON.stringify(value);
        },
        setItem: async (key, value) => void (await localApi.putState(area, key, JSON.parse(value))),
        removeItem: async (key) => void (await localApi.removeState(area, key)),
    };
}

export function mediaUrl(storageKey?: string, fallback = "") {
    return storageKey ? `/local-api/media?storageKey=${encodeURIComponent(storageKey)}` : fallback;
}

export class LocalApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code?: string,
    ) {
        super(message);
    }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    if (init?.body && !(init.body instanceof Blob)) headers.set("content-type", "application/json");
    const response = await fetch(`/local-api${path}`, { ...init, headers });
    if (response.ok) return response.status === 204 ? (undefined as T) : response.json();
    const body = await response.json().catch(() => ({ error: "本地存储请求失败" })) as { error?: string; code?: string };
    throw new LocalApiError(body.error || "本地存储请求失败", response.status, body.code);
}

function getBootstrap() {
    bootstrapPromise ||= request<BootstrapData>("/bootstrap");
    return bootstrapPromise;
}

function queueStateWrite<T>(key: string, write: () => Promise<T>) {
    const previous = stateWriteQueues.get(key) || Promise.resolve();
    const next = previous.catch(() => undefined).then(write);
    stateWriteQueues.set(key, next);
    return next.finally(() => {
        if (stateWriteQueues.get(key) === next) stateWriteQueues.delete(key);
    });
}
