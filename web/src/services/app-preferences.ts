import { localApi } from "@/services/local-api";

export async function getAppPreference<T>(key: string, fallback: T) {
    return ((await localApi.getState("app", key)) as T | null) ?? fallback;
}

export async function setAppPreference<T>(key: string, value: T) {
    await localApi.putState("app", key, value);
}
