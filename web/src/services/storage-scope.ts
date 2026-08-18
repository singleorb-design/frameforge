export type StorageScope =
    | { kind: "library"; ownerId: "library" }
    | { kind: "project"; ownerId: string }
    | { kind: "workbench"; ownerId: "image" | "video" | "audio" };

let currentScope: StorageScope = { kind: "library", ownerId: "library" };

export function setStorageScope(scope: StorageScope) {
    currentScope = scope;
}

export function getStorageScope() {
    return currentScope;
}
