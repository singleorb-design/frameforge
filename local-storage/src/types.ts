export type DiskArea = "settings" | "app" | "library";
export type WorkbenchKind = "image" | "video" | "audio";
export type MediaScope = "project" | "library" | "workbench";

export type StateDocument = {
    [key: string]: unknown;
};

export type ProjectSummary = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
};

export type ProjectIndex = {
    version: 1;
    projects: ProjectSummary[];
};

export type StoredProject<T = unknown> = {
    version: 1;
    revision: number;
    project: T;
};

export type WorkbenchDocument = {
    version: 1;
    records: Record<string, unknown>;
};

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

export type MediaIndex = {
    version: 1;
    files: Record<string, MediaRecord>;
};

export type MediaWriteInput = {
    scope: MediaScope;
    ownerId: string;
    prefix: string;
    originalName: string;
    mimeType: string;
    requestedStorageKey?: string;
    body: ReadableStream<Uint8Array>;
};

export type BootstrapData = {
    settings: StateDocument;
    app: StateDocument;
    projects: ProjectSummary[];
};
