import type { PluginStorage } from "@/types/canvas-plugin";
import { localApi } from "@/services/local-api";

// 画布内轻量事件总线,供节点/插件互相通信
type Handler = (payload: unknown) => void;
const handlers = new Map<string, Set<Handler>>();

export function emitCanvasEvent(event: string, payload?: unknown) {
    handlers.get(event)?.forEach((handler) => {
        try {
            handler(payload);
        } catch (error) {
            console.error(`[canvas-event] handler for "${event}" failed`, error);
        }
    });
}

export function onCanvasEvent(event: string, handler: Handler) {
    let set = handlers.get(event);
    if (!set) {
        set = new Set();
        handlers.set(event, set);
    }
    set.add(handler);
    return () => {
        set!.delete(handler);
    };
}

// 插件私有存储,按 pluginId 命名空间隔离
export function createPluginStorage(pluginId: string): PluginStorage {
    return {
        get: async <T = unknown>(key: string) => (await localApi.getState("settings", await pluginStorageKey(pluginId, key))) as T | null,
        set: async (key, value) => {
            await localApi.putState("settings", await pluginStorageKey(pluginId, key), value);
        },
        remove: async (key) => {
            await localApi.removeState("settings", await pluginStorageKey(pluginId, key));
        },
    };
}

async function pluginStorageKey(pluginId: string, key: string) {
    const bytes = new TextEncoder().encode(`${pluginId}\0${key}`);
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return `plugin-storage:${Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
