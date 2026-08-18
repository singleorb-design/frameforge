import { localApi, mediaUrl } from "@/services/local-api";
import { getStorageScope, type StorageScope } from "@/services/storage-scope";

export type UploadedFile = { url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };

export async function uploadMediaFile(input: string | Blob, prefix = "file", explicitScope?: StorageScope): Promise<UploadedFile> {
    const blob = typeof input === "string" ? await (await fetch(input)).blob() : input;
    const temporaryUrl = URL.createObjectURL(blob);
    const meta = await (blob.type.startsWith("video/") ? readVideoMeta(temporaryUrl) : blob.type.startsWith("audio/") ? readAudioMeta(temporaryUrl) : Promise.resolve({})).finally(() => URL.revokeObjectURL(temporaryUrl));
    const scope = explicitScope || getStorageScope();
    const stored = await localApi.uploadMedia(blob, { scope: scope.kind, ownerId: scope.ownerId, prefix, originalName: input instanceof File ? input.name : `${prefix}.${extension(blob.type)}` });
    return { url: mediaUrl(stored.storageKey), storageKey: stored.storageKey, bytes: stored.bytes, mimeType: stored.mimeType, ...meta };
}

export async function resolveMediaUrl(storageKey?: string, fallback = "") {
    return mediaUrl(storageKey, fallback);
}

export async function getMediaBlob(storageKey: string) {
    const response = await fetch(mediaUrl(storageKey));
    return response.ok ? response.blob() : null;
}

export async function setMediaBlob(storageKey: string, blob: Blob, explicitScope?: StorageScope) {
    const scope = explicitScope || getStorageScope();
    const prefix = storageKey.split(":")[0] || "file";
    const stored = await localApi.uploadMedia(blob, { scope: scope.kind, ownerId: scope.ownerId, prefix, originalName: `${prefix}.${extension(blob.type)}`, storageKey });
    return mediaUrl(stored.storageKey);
}

export async function deleteStoredMedia(keys: Iterable<string>) {
    await Promise.all(Array.from(new Set(keys)).map((key) => localApi.deleteMedia(key)));
}

export async function cleanupUnusedMedia(usedData: unknown) {
    collectMediaStorageKeys(usedData);
    await localApi.cleanupMedia();
}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
}

function readVideoMeta(url: string) {
    return new Promise<{ width: number; height: number; durationMs?: number }>((resolve) => {
        const video = document.createElement("video");
        const done = () => resolve({ width: video.videoWidth || 1280, height: video.videoHeight || 720, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined });
        video.onloadedmetadata = done;
        video.onerror = done;
        video.src = url;
    });
}

function readAudioMeta(url: string) {
    return new Promise<{ durationMs?: number }>((resolve) => {
        const audio = document.createElement("audio");
        const done = () => resolve({ durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined });
        audio.onloadedmetadata = done;
        audio.onerror = done;
        audio.src = url;
    });
}

function extension(mimeType: string) {
    if (mimeType.includes("mpeg")) return "mp3";
    return mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
}
