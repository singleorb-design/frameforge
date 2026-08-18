import { copyFile, readdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { assertSafeId, cleanupPartFiles, createStorageKey, ensureDirectory, fileExists, readJson, relativePath, resolveInsideRoot, safeExtension, safeFileStem, writeJsonAtomic, writeStreamAtomic } from "./filesystem";
import type { BootstrapData, DiskArea, MediaIndex, MediaRecord, MediaWriteInput, ProjectIndex, ProjectSummary, StateDocument, StoredProject, WorkbenchDocument, WorkbenchKind } from "./types";

const EMPTY_STATE: StateDocument = {};
const EMPTY_PROJECTS: ProjectIndex = { version: 1, projects: [] };
const EMPTY_WORKBENCH: WorkbenchDocument = { version: 1, records: {} };
const EMPTY_MEDIA: MediaIndex = { version: 1, files: {} };

export type AppStorage = ReturnType<typeof createAppStorage>;

export function createAppStorage(rootDir: string) {
    const dataRoot = resolveInsideRoot(rootDir);
    const locks = new Map<string, Promise<unknown>>();
    let initialized = false;
    let initializationPromise: Promise<void> | null = null;
    const statePaths: Record<DiskArea, string> = {
        settings: resolveInsideRoot(dataRoot, "settings.json"),
        app: resolveInsideRoot(dataRoot, "app.json"),
        library: resolveInsideRoot(dataRoot, "library", "library.json"),
    };
    const projectIndexPath = resolveInsideRoot(dataRoot, "projects", "index.json");
    const mediaIndexPath = resolveInsideRoot(dataRoot, "media-index.json");

    const withLock = <T>(key: string, action: () => Promise<T>) => {
        const previous = locks.get(key) || Promise.resolve();
        const next = previous.catch(() => undefined).then(action);
        locks.set(key, next);
        return next.finally(() => {
            if (locks.get(key) === next) locks.delete(key);
        });
    };

    const workbenchPath = (kind: WorkbenchKind) => resolveInsideRoot(dataRoot, "workbenches", assertWorkbenchKind(kind), "records.json");
    const projectPath = (id: string) => resolveInsideRoot(dataRoot, "projects", assertSafeId(id), "project.json");

    async function initialize() {
        if (initialized) return;
        initializationPromise ||= (async () => {
            await ensureDirectory(dataRoot);
            await cleanupPartFiles(dataRoot);
            await Promise.all([
                ensureJson(statePaths.settings, EMPTY_STATE),
                ensureJson(statePaths.app, EMPTY_STATE),
                ensureJson(statePaths.library, EMPTY_STATE),
                ensureJson(projectIndexPath, EMPTY_PROJECTS),
                ensureJson(mediaIndexPath, EMPTY_MEDIA),
                ensureJson(workbenchPath("image"), EMPTY_WORKBENCH),
                ensureJson(workbenchPath("video"), EMPTY_WORKBENCH),
                ensureJson(workbenchPath("audio"), EMPTY_WORKBENCH),
            ]);
            await rebuildProjectIndex();
            await cleanupUnindexedMediaFiles();
            await cleanupUnusedMedia();
            initialized = true;
        })();
        try {
            await initializationPromise;
        } catch (error) {
            initializationPromise = null;
            throw error;
        }
    }

    async function bootstrap(): Promise<BootstrapData> {
        await initialize();
        await rebuildProjectIndex();
        const [settings, app, projects] = await Promise.all([readJson(statePaths.settings, EMPTY_STATE), readJson(statePaths.app, EMPTY_STATE), readJson(projectIndexPath, EMPTY_PROJECTS)]);
        return { settings, app, projects: projects.projects };
    }

    async function getState(area: DiskArea, key: string) {
        assertSafeId(key);
        return (await readJson(statePaths[area], EMPTY_STATE))[key] ?? null;
    }

    async function putState(area: DiskArea, key: string, value: unknown) {
        assertSafeId(key);
        return withLock(`state:${area}`, async () => {
            const document = await readJson(statePaths[area], EMPTY_STATE);
            document[key] = value;
            await writeJsonAtomic(statePaths[area], document);
            return value;
        });
    }

    async function removeState(area: DiskArea, key: string) {
        assertSafeId(key);
        return withLock(`state:${area}`, async () => {
            const document = await readJson(statePaths[area], EMPTY_STATE);
            delete document[key];
            await writeJsonAtomic(statePaths[area], document);
        });
    }

    async function listProjects() {
        return (await readJson(projectIndexPath, EMPTY_PROJECTS)).projects;
    }

    async function rebuildProjectIndex() {
        const projectsRoot = resolveInsideRoot(dataRoot, "projects");
        const entries = await readdir(projectsRoot, { withFileTypes: true });
        const projects = (
            await Promise.all(
                entries
                    .filter((entry) => entry.isDirectory())
                    .map(async (entry) => {
                        const path = projectPath(entry.name);
                        if (!(await fileExists(path))) return null;
                        const stored = await readJson<StoredProject<ProjectSummary>>(path, null as never);
                        assertProject(stored.project);
                        return summary(stored.project);
                    }),
            )
        )
            .filter((project): project is ProjectSummary => Boolean(project))
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        const current = await readJson(projectIndexPath, EMPTY_PROJECTS).catch(() => EMPTY_PROJECTS);
        if (JSON.stringify(current.projects) !== JSON.stringify(projects)) await writeJsonAtomic(projectIndexPath, { version: 1, projects });
    }

    async function readProject<T = unknown>(id: string): Promise<StoredProject<T>> {
        const path = projectPath(id);
        if (!(await fileExists(path))) throw new Error("PROJECT_NOT_FOUND");
        return readJson(path, null as never);
    }

    async function createProject<T extends ProjectSummary>(project: T): Promise<StoredProject<T>> {
        assertProject(project);
        return withLock(`project:${project.id}`, async () => {
            if (await fileExists(projectPath(project.id))) throw new Error("PROJECT_EXISTS");
            const stored: StoredProject<T> = { version: 1, revision: 1, project };
            await writeJsonAtomic(projectPath(project.id), stored);
            await updateProjectIndex(summary(project)).catch(() => undefined);
            return stored;
        });
    }

    async function writeProject<T extends ProjectSummary>(id: string, expectedRevision: number, project: T): Promise<StoredProject<T>> {
        assertSafeId(id);
        assertProject(project);
        if (project.id !== id) throw new Error("PROJECT_ID_MISMATCH");
        return withLock(`project:${id}`, async () => {
            const current = await readProject<T>(id);
            if (current.revision !== expectedRevision) throw new Error("PROJECT_REVISION_CONFLICT");
            const stored: StoredProject<T> = { version: 1, revision: current.revision + 1, project };
            await writeJsonAtomic(projectPath(id), stored);
            await updateProjectIndex(summary(project)).catch(() => undefined);
            return stored;
        });
    }

    async function deleteProject(id: string) {
        assertSafeId(id);
        await withLock(`project:${id}`, async () => {
            await rm(dirname(projectPath(id)), { recursive: true, force: true });
            await withLock("project-index", async () => {
                const index = await readJson(projectIndexPath, EMPTY_PROJECTS);
                index.projects = index.projects.filter((project) => project.id !== id);
                await writeJsonAtomic(projectIndexPath, index);
            }).catch(() => undefined);
            await removeMediaRecords((record) => record.scope === "project" && record.ownerId === id).catch(() => undefined);
        });
    }

    async function listWorkbenchRecords(kind: WorkbenchKind) {
        return (await readJson(workbenchPath(kind), EMPTY_WORKBENCH)).records;
    }

    async function setWorkbenchRecord(kind: WorkbenchKind, id: string, value: unknown) {
        assertSafeId(id);
        await withLock(`workbench:${kind}`, async () => {
            const document = await readJson(workbenchPath(kind), EMPTY_WORKBENCH);
            document.records[id] = value;
            await writeJsonAtomic(workbenchPath(kind), document);
        });
    }

    async function removeWorkbenchRecord(kind: WorkbenchKind, id: string) {
        assertSafeId(id);
        await withLock(`workbench:${kind}`, async () => {
            const document = await readJson(workbenchPath(kind), EMPTY_WORKBENCH);
            delete document.records[id];
            await writeJsonAtomic(workbenchPath(kind), document);
        });
    }

    async function replaceWorkbenchRecords(kind: WorkbenchKind, records: Record<string, unknown>) {
        await withLock(`workbench:${kind}`, () => writeJsonAtomic(workbenchPath(kind), { version: 1, records }));
    }

    async function writeMedia(input: MediaWriteInput): Promise<MediaRecord> {
        assertSafeId(input.ownerId);
        assertSafeId(input.prefix);
        const storageKey = input.requestedStorageKey ? assertSafeId(input.requestedStorageKey) : createStorageKey(input.prefix);
        const mediaIndex = await readJson(mediaIndexPath, EMPTY_MEDIA);
        const existing = mediaIndex.files[storageKey];
        const directory = mediaDirectory(input.scope, input.ownerId, input.prefix);
        const filePath = resolveInsideRoot(directory, `${safeFileStem(storageKey)}${safeExtension(input.originalName, input.mimeType)}`);
        if (existing && (await fileExists(resolveInsideRoot(dataRoot, existing.relativePath)))) {
            if (existing.scope !== input.scope || existing.ownerId !== input.ownerId) throw new Error("MEDIA_KEY_CONFLICT");
            const duplicatePath = `${filePath}.duplicate`;
            const written = await writeStreamAtomic(duplicatePath, input.body);
            await rm(duplicatePath, { force: true });
            if (written.sha256 !== existing.sha256 || written.bytes !== existing.bytes) throw new Error("MEDIA_KEY_CONFLICT");
            return existing;
        }
        const written = await writeStreamAtomic(filePath, input.body);
        const record: MediaRecord = {
            storageKey,
            scope: input.scope,
            ownerId: input.ownerId,
            prefix: input.prefix,
            relativePath: relativePath(dataRoot, filePath),
            originalName: input.originalName || `${input.prefix}${safeExtension("", input.mimeType)}`,
            mimeType: input.mimeType || "application/octet-stream",
            bytes: written.bytes,
            sha256: written.sha256,
            createdAt: new Date().toISOString(),
        };
        await withLock("media-index", async () => {
            const current = await readJson(mediaIndexPath, EMPTY_MEDIA);
            current.files[storageKey] = record;
            await writeJsonAtomic(mediaIndexPath, current);
        });
        return record;
    }

    async function readMedia(storageKey: string) {
        const record = await mediaRecord(storageKey);
        const path = resolveInsideRoot(dataRoot, record.relativePath);
        if (!(await fileExists(path))) throw new Error("MEDIA_NOT_FOUND");
        const info = await stat(path);
        return { record, path, size: info.size };
    }

    async function projectReferences(storageKey: string) {
        const projects = await listProjects();
        const encoded = JSON.stringify(assertSafeId(storageKey));
        const references: string[] = [];
        for (const project of projects) {
            const path = projectPath(project.id);
            if ((await fileExists(path)) && (await readFile(path, "utf8")).includes(encoded)) references.push(project.id);
        }
        return references;
    }

    async function deleteMedia(storageKey: string) {
        const record = await mediaRecord(storageKey);
        if (record.scope === "library" && (await projectReferences(storageKey)).length) throw new Error("MEDIA_IN_USE");
        if (record.scope !== "library" && (await mediaIsReferenced(storageKey))) throw new Error("MEDIA_IN_USE");
        await rm(resolveInsideRoot(dataRoot, record.relativePath), { force: true });
        await withLock("media-index", async () => {
            const index = await readJson(mediaIndexPath, EMPTY_MEDIA);
            delete index.files[storageKey];
            await writeJsonAtomic(mediaIndexPath, index);
        });
    }

    async function cleanupUnusedMedia() {
        const documents = await persistedDocumentContents();
        await withLock("media-index", async () => {
            const index = await readJson(mediaIndexPath, EMPTY_MEDIA);
            for (const [storageKey, record] of Object.entries(index.files)) {
                if (Date.now() - Date.parse(record.createdAt || "") < 300_000) continue;
                if (documents.some((document) => referencesStorageKey(document, storageKey))) continue;
                await rm(resolveInsideRoot(dataRoot, record.relativePath), { force: true });
                delete index.files[storageKey];
            }
            await writeJsonAtomic(mediaIndexPath, index);
        });
    }

    async function cleanupUnindexedMediaFiles() {
        const index = await readJson(mediaIndexPath, EMPTY_MEDIA);
        const indexedPaths = new Set(Object.values(index.files).map((record) => record.relativePath));
        const files = await allFilePaths(dataRoot);
        await Promise.all(
            files.map(async (path) => {
                const relative = relativePath(dataRoot, path);
                if (indexedPaths.has(relative) || isDataDocument(path)) return;
                const info = await stat(path);
                if (Date.now() - info.mtimeMs >= 300_000) await rm(path, { force: true });
            }),
        );
    }

    async function copyMediaToLibrary(storageKey: string) {
        const source = await mediaRecord(storageKey);
        if (!(await fileExists(resolveInsideRoot(dataRoot, source.relativePath)))) throw new Error("MEDIA_NOT_FOUND");
        if (source.scope === "library") return source;
        const copiedKey = createStorageKey(source.prefix);
        const directory = mediaDirectory("library", "library", source.prefix);
        await ensureDirectory(directory);
        const destination = resolveInsideRoot(directory, `${safeFileStem(copiedKey)}${safeExtension(source.originalName, source.mimeType)}`);
        await copyFile(resolveInsideRoot(dataRoot, source.relativePath), destination);
        const record: MediaRecord = {
            ...source,
            storageKey: copiedKey,
            scope: "library",
            ownerId: "library",
            relativePath: relativePath(dataRoot, destination),
            createdAt: new Date().toISOString(),
        };
        await withLock("media-index", async () => {
            const index = await readJson(mediaIndexPath, EMPTY_MEDIA);
            index.files[copiedKey] = record;
            await writeJsonAtomic(mediaIndexPath, index);
        });
        return record;
    }

    async function mediaRecord(storageKey: string) {
        assertSafeId(storageKey);
        const record = (await readJson(mediaIndexPath, EMPTY_MEDIA)).files[storageKey];
        if (!record) throw new Error("MEDIA_NOT_FOUND");
        return record;
    }

    async function mediaIsReferenced(storageKey: string) {
        return (await persistedDocumentContents()).some((document) => referencesStorageKey(document, storageKey));
    }

    async function persistedDocumentContents() {
        const paths = await documentPaths(dataRoot);
        return Promise.all(paths.filter((path) => path !== mediaIndexPath && !path.startsWith(`${mediaIndexPath}.`)).map((path) => readFile(path, "utf8").catch(() => "")));
    }

    async function updateProjectIndex(item: ProjectSummary) {
        await withLock("project-index", async () => {
            const index = await readJson(projectIndexPath, EMPTY_PROJECTS);
            const rest = index.projects.filter((project) => project.id !== item.id);
            index.projects = [item, ...rest];
            await writeJsonAtomic(projectIndexPath, index);
        });
    }

    async function removeMediaRecords(filter: (record: MediaRecord) => boolean) {
        await withLock("media-index", async () => {
            const index = await readJson(mediaIndexPath, EMPTY_MEDIA);
            Object.entries(index.files).forEach(([key, record]) => {
                if (filter(record)) delete index.files[key];
            });
            await writeJsonAtomic(mediaIndexPath, index);
        });
    }

    function mediaDirectory(scope: MediaWriteInput["scope"], ownerId: string, prefix: string) {
        const category = prefix === "image" ? "images" : prefix === "video" ? "videos" : prefix === "audio" ? "audio" : "files";
        if (scope === "project") return resolveInsideRoot(dataRoot, "projects", assertSafeId(ownerId), "assets", category);
        if (scope === "library") return resolveInsideRoot(dataRoot, "library", "assets", category);
        return resolveInsideRoot(dataRoot, "workbenches", assertWorkbenchKind(ownerId), "assets", category);
    }

    return {
        rootDir: dataRoot,
        initialize,
        bootstrap,
        getState,
        putState,
        removeState,
        listProjects,
        readProject,
        createProject,
        writeProject,
        deleteProject,
        listWorkbenchRecords,
        setWorkbenchRecord,
        removeWorkbenchRecord,
        replaceWorkbenchRecords,
        writeMedia,
        readMedia,
        projectReferences,
        deleteMedia,
        cleanupUnusedMedia,
        copyMediaToLibrary,
    };
}

async function documentPaths(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const paths = await Promise.all(
        entries.map(async (entry) => {
            const path = join(directory, entry.name);
            if (entry.isSymbolicLink()) return [];
            if (entry.isDirectory()) return documentPaths(path);
            return entry.name.endsWith(".json") || entry.name.includes(".json.") ? [path] : [];
        }),
    );
    return paths.flat();
}

async function allFilePaths(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const paths = await Promise.all(
        entries.map(async (entry) => {
            const path = join(directory, entry.name);
            if (entry.isSymbolicLink()) return [];
            return entry.isDirectory() ? allFilePaths(path) : [path];
        }),
    );
    return paths.flat();
}

function isDataDocument(path: string) {
    return /(?:settings|app|media-index|index|project|library|records)\.json(?:\.(?:bak|corrupt|part))?$/.test(path);
}

function referencesStorageKey(document: string, storageKey: string) {
    return document.includes(JSON.stringify(storageKey)) || document.includes(encodeURIComponent(storageKey));
}

function assertWorkbenchKind(value: string): WorkbenchKind {
    if (value !== "image" && value !== "video" && value !== "audio") throw new Error("UNSAFE_ID");
    return value;
}

function assertProject(value: unknown): asserts value is ProjectSummary {
    if (!value || typeof value !== "object") throw new Error("INVALID_PROJECT");
    const project = value as Record<string, unknown>;
    for (const field of ["id", "title", "createdAt", "updatedAt"]) if (typeof project[field] !== "string") throw new Error("INVALID_PROJECT");
    assertSafeId(project.id as string);
}

function summary(project: ProjectSummary): ProjectSummary {
    return { id: project.id, title: project.title, createdAt: project.createdAt, updatedAt: project.updatedAt };
}

async function ensureJson<T>(path: string, fallback: T) {
    if (!(await fileExists(path))) await writeJsonAtomic(path, fallback);
}
