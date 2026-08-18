import { create } from "zustand";

import { nanoid } from "nanoid";
import { resolveImageUrl } from "@/services/image-storage";
import { resolveMediaUrl } from "@/services/file-storage";
import { localApi, mediaUrl } from "@/services/local-api";

export type AssetKind = "text" | "image" | "video";
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type Asset = TextAsset | ImageAsset | VideoAsset;

type AssetBase<T extends AssetKind> = {
    id: string;
    kind: T;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
};

type AssetStore = {
    hydrated: boolean;
    assets: Asset[];
    hydrate: () => Promise<void>;
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => Promise<string>;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => Promise<void>;
    removeAsset: (id: string) => Promise<void>;
    replaceAssets: (assets: Asset[]) => Promise<void>;
    cleanupImages: (extra?: unknown) => void;
};

const ASSET_STORE_KEY = "frameforge:asset_store";
let saveQueue = Promise.resolve();
let mutationQueue = Promise.resolve();

export const useAssetStore = create<AssetStore>((set, get) => ({
    hydrated: false,
    assets: [],
    hydrate: async () => {
        const stored = await localApi.getState("library", ASSET_STORE_KEY) as { assets?: Asset[] } | null;
        const assets = await Promise.all((stored?.assets || []).map(hydrateAsset));
        set({ assets, hydrated: true });
    },
    addAsset: (asset) =>
        queueMutation(async () => {
        const now = new Date().toISOString();
        const id = nanoid();
        const adopted = await adoptLibraryMedia({ ...asset, id, createdAt: now, updatedAt: now } as Asset);
        const assets = [adopted, ...get().assets];
        await saveAssets(assets);
        set({ assets });
        return id;
        }),
    updateAsset: (id, patch) =>
        queueMutation(async () => {
        const current = get().assets.find((asset) => asset.id === id);
        if (!current) return;
        const updated = await adoptLibraryMedia({ ...current, ...patch, updatedAt: new Date().toISOString() } as Asset);
        const assets = get().assets.map((asset) => (asset.id === id ? updated : asset));
        await saveAssets(assets);
        set({ assets });
        }),
    removeAsset: (id) =>
        queueMutation(async () => {
        const asset = get().assets.find((item) => item.id === id);
        const storageKey = asset && asset.kind !== "text" ? asset.data.storageKey : undefined;
        if (storageKey && (await localApi.mediaProjectReferences(storageKey)).length) throw new Error("该素材仍被画布引用，请先解除引用");
        const assets = get().assets.filter((asset) => asset.id !== id);
        await saveAssets(assets);
        set({ assets });
        get().cleanupImages({ assets });
        }),
    replaceAssets: (assets) =>
        queueMutation(async () => {
        const adopted = await Promise.all(assets.map(adoptLibraryMedia));
        await saveAssets(adopted);
        set({ assets: adopted });
        }),
    cleanupImages: () => {
        window.setTimeout(() => void localApi.cleanupMedia().catch((error) => console.error("清理本地媒体失败", error)), 0);
    },
}));

async function saveAssets(assets: Asset[]) {
    const write = saveQueue.catch(() => undefined).then(() => localApi.putState("library", ASSET_STORE_KEY, { assets }));
    saveQueue = write.then(() => undefined);
    await write;
}

function queueMutation<T>(mutation: () => Promise<T>) {
    const next = mutationQueue.catch(() => undefined).then(mutation);
    mutationQueue = next.then(() => undefined, () => undefined);
    return next;
}

async function hydrateAsset(asset: Asset): Promise<Asset> {
    if (asset.kind === "video" && asset.data.storageKey) return { ...asset, data: { ...asset.data, url: await resolveMediaUrl(asset.data.storageKey, asset.data.url) } };
    if (asset.kind !== "image" || !asset.data.storageKey) return asset;
    const dataUrl = await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl);
    const coverUrl = !asset.coverUrl || asset.coverUrl.startsWith("blob:") || asset.coverUrl.startsWith("/local-api/media") ? dataUrl : asset.coverUrl;
    return { ...asset, coverUrl, data: { ...asset.data, dataUrl } };
}

async function adoptLibraryMedia(asset: Asset): Promise<Asset> {
    if (asset.kind === "text" || !asset.data.storageKey) return asset;
    const media = await localApi.copyMediaToLibrary(asset.data.storageKey);
    if (asset.kind === "video") return { ...asset, data: { ...asset.data, url: mediaUrl(media.storageKey), storageKey: media.storageKey, bytes: media.bytes, mimeType: media.mimeType } };
    const dataUrl = mediaUrl(media.storageKey);
    return { ...asset, coverUrl: dataUrl, data: { ...asset.data, dataUrl, storageKey: media.storageKey, bytes: media.bytes, mimeType: media.mimeType } };
}
