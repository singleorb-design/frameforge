import { readImageMeta } from "@/lib/image-utils";
import { localApi, mediaUrl } from "@/services/local-api";
import { getStorageScope, type StorageScope } from "@/services/storage-scope";

export type UploadedImage = {
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

export async function uploadImage(input: string | Blob, explicitScope?: StorageScope): Promise<UploadedImage> {
    const blob = typeof input === "string" ? await (await fetch(input)).blob() : input;
    const temporaryUrl = URL.createObjectURL(blob);
    const meta = await readImageMeta(temporaryUrl).finally(() => URL.revokeObjectURL(temporaryUrl));
    const scope = explicitScope || getStorageScope();
    const stored = await localApi.uploadMedia(blob, { scope: scope.kind, ownerId: scope.ownerId, prefix: "image", originalName: input instanceof File ? input.name : `image.${extension(blob.type)}` });
    return { url: mediaUrl(stored.storageKey), storageKey: stored.storageKey, width: meta.width, height: meta.height, bytes: stored.bytes, mimeType: stored.mimeType || meta.mimeType };
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    return mediaUrl(storageKey, fallback);
}

export async function getImageBlob(storageKey: string) {
    const response = await fetch(mediaUrl(storageKey));
    return response.ok ? response.blob() : null;
}

export async function setImageBlob(storageKey: string, blob: Blob, explicitScope?: StorageScope) {
    const scope = explicitScope || getStorageScope();
    const stored = await localApi.uploadMedia(blob, { scope: scope.kind, ownerId: scope.ownerId, prefix: "image", originalName: `${storageKey}.${extension(blob.type)}`, storageKey });
    return mediaUrl(stored.storageKey);
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }) {
    const url = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!url || url.startsWith("data:")) return url;
    return blobToDataUrl(await (await fetch(url)).blob());
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(Array.from(new Set(keys)).map((key) => localApi.deleteMedia(key)));
}

export async function cleanupUnusedImages(usedData: unknown) {
    collectImageStorageKeys(usedData);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(blob);
    });
}

function extension(mimeType: string) {
    if (mimeType.includes("jpeg")) return "jpg";
    return mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
}
