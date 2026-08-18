# Local Disk Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `data/` the only source of truth for canvases, settings, library assets, workbench records, and uncompressed media, with automatic restore every time the project starts through `make`.

**Architecture:** A required Bun service owns all filesystem access under `data/`; Vite proxies `/local-api` to that service with a per-launch token. Zustand remains runtime state, but its persisted stores use local API adapters instead of browser storage. Canvas projects use an indexed, revisioned save path; media APIs keep the existing frontend service surface while writing original bytes into project, library, or workbench directories.

**Tech Stack:** Bun, TypeScript, Bun.serve, React 19, Zustand, Vite proxy, local filesystem JSON and binary files.

## Global Constraints

- data/ is the only source of truth for user business data.
- Do not read, migrate, delete, or fall back to existing IndexedDB business data.
- Save uploads and AI-generated media as original bytes.
- Do not use ZIP, gzip, Brotli, Base64 persistence, image re-encoding, video transcoding, or audio transcoding in the persistence path.
- Save API keys and model settings as plaintext in `data/settings.json`; keep `data/` ignored by Git.
- Bind the storage service to `127.0.0.1` only.
- Reject path traversal, absolute paths, unsafe identifiers, and writes without the launch token.
- Use `.part` plus atomic rename for new files and keep one uncompressed `.bak` for overwritten JSON.
- Do not run syntax checks, builds, or broad validation commands; the repository instructions reserve those for the user.

---

## File Structure

- Create `local-storage/src/types.ts`: disk document and media types shared by service modules.
- Create `local-storage/src/filesystem.ts`: safe paths, atomic JSON writes, backup recovery, media streaming, media index.
- Create `local-storage/src/app-storage.ts`: settings, app, library, workbench, and revisioned project operations.
- Create `local-storage/src/server.ts`: authenticated Bun HTTP routes, range media responses, and error mapping.
- Create `local-storage/src/index.ts`: service entrypoint.
- Create `local-storage/src/filesystem.test.ts`: focused filesystem and revision tests.
- Create `scripts/dev.ts`: starts storage and Vite together and tears both down together.
- Modify `Makefile`: delegate default `dev` target to `scripts/dev.ts`.
- Modify `web/vite.config.ts`: proxy `/local-api` and attach the launch token.
- Create `web/src/services/local-api.ts`: typed local API client, bootstrap cache, Zustand storage adapters, media helpers.
- Create `web/src/components/layout/local-storage-gate.tsx`: blocks the app until disk bootstrap succeeds.
- Modify `web/src/components/layout/app-providers.tsx`: place the storage gate before runtime initialization.
- Modify persisted stores under `web/src/stores/`: replace browser storage with local API storage.
- Modify `web/src/stores/canvas/use-canvas-store.ts`: index hydration, lazy project load, revisions, debounced save, save status.
- Modify canvas pages/components and Agent site tools for asynchronous project operations.
- Modify `web/src/services/image-storage.ts` and `web/src/services/file-storage.ts`: preserve public functions but use disk media APIs.
- Create `web/src/services/storage-scope.ts`: page-local project/library/workbench media ownership.
- Modify project, library, image, and video pages to set media scope.
- Modify `web/src/stores/use-asset-store.ts`: disk library persistence and library adoption of referenced media.
- Create `web/src/services/workbench-records.ts`: disk-backed image/video/audio record operations.
- Modify image/video pages and `web/src/services/app-sync.ts` to use workbench record APIs.
- Modify user docs, pending-test notes, and `CHANGELOG.md`.

---

### Task 1: Filesystem Core and Revisioned Documents

**Files:**
- Create: `local-storage/src/types.ts`
- Create: `local-storage/src/filesystem.ts`
- Create: `local-storage/src/app-storage.ts`
- Test: `local-storage/src/filesystem.test.ts`

**Interfaces:**
- Produces: `createAppStorage(rootDir: string): AppStorage`.
- Produces: `AppStorage.bootstrap()`, `readProject(id)`, `createProject(project)`, `writeProject(id, expectedRevision, project)`, `deleteProject(id)`.
- Produces: `writeMedia({ scope, ownerId, prefix, originalName, mimeType, requestedStorageKey, body })`.
- Produces: `readMedia(storageKey)`, `deleteMedia(storageKey)`, `copyMediaToLibrary(storageKey)`.

- [ ] **Step 1: Write focused filesystem tests**

```ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppStorage } from "./app-storage";

describe("local disk storage", () => {
    test("writes JSON atomically and keeps one backup", async () => {
        const root = await mkdtemp(join(tmpdir(), "frameforge-"));
        const storage = createAppStorage(root);
        await storage.putState("settings", "config", { state: { value: 1 } });
        await storage.putState("settings", "config", { state: { value: 2 } });
        expect(JSON.parse(await readFile(join(root, "settings.json"), "utf8")).stores.config.state.value).toBe(2);
        expect(JSON.parse(await readFile(join(root, "settings.json.bak"), "utf8")).stores.config.state.value).toBe(1);
    });

    test("rejects a stale project revision", async () => {
        const root = await mkdtemp(join(tmpdir(), "frameforge-"));
        const storage = createAppStorage(root);
        const created = await storage.createProject({ id: "project-a", title: "A", createdAt: "1", updatedAt: "1" });
        await storage.writeProject("project-a", created.revision, { ...created.project, title: "B" });
        await expect(storage.writeProject("project-a", created.revision, { ...created.project, title: "C" })).rejects.toThrow("PROJECT_REVISION_CONFLICT");
    });

    test("stores media bytes without modification", async () => {
        const root = await mkdtemp(join(tmpdir(), "frameforge-"));
        const storage = createAppStorage(root);
        const bytes = new Uint8Array([0, 1, 2, 3, 254, 255]);
        const media = await storage.writeMedia({
            scope: "project",
            ownerId: "project-a",
            prefix: "image",
            originalName: "原图.png",
            mimeType: "image/png",
            body: new Blob([bytes]).stream(),
        });
        expect(new Uint8Array(await (await storage.readMedia(media.storageKey)).blob.arrayBuffer())).toEqual(bytes);
    });

    test("never resolves a path outside the data root", async () => {
        const root = await mkdtemp(join(tmpdir(), "frameforge-"));
        const storage = createAppStorage(root);
        await expect(storage.readProject("../escape")).rejects.toThrow("UNSAFE_ID");
        await writeFile(join(root, "settings.json.part"), "partial");
        await storage.initialize();
        expect(await Bun.file(join(root, "settings.json.part")).exists()).toBe(false);
    });
});
```

- [ ] **Step 2: Define disk types**

```ts
export type DiskArea = "settings" | "app" | "library";
export type MediaScope = "project" | "library" | "workbench";
export type ProjectSummary = { id: string; title: string; createdAt: string; updatedAt: string };
export type StoredProject<T = unknown> = { version: 1; revision: number; project: T };
export type StateDocument = { version: 1; stores: Record<string, unknown> };
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
};
```

- [ ] **Step 3: Implement safe atomic filesystem primitives**

Implement `assertSafeId`, `resolveInsideRoot`, `readJson`, `writeJsonAtomic`, `cleanupPartFiles`, and `writeStreamAtomic`. `writeJsonAtomic` must write `<file>.part`, copy the previous file to `<file>.bak`, then rename the part file. `readJson` must preserve invalid input as `<file>.corrupt` and read `<file>.bak` when valid.

- [ ] **Step 4: Implement app documents, project revisions, and media index**

`createAppStorage(rootDir)` must initialize:

```text
settings.json
app.json
projects/index.json
library/library.json
workbenches/image/records.json
workbenches/video/records.json
workbenches/audio/records.json
media-index.json
```

Project writes must compare `expectedRevision`, increment exactly once, update `projects/index.json`, and serialize writes per project. Media writes must stream unchanged bytes to the destination directory while calculating SHA-256 and then write the media index.

- [ ] **Step 5: Commit the storage core**

```bash
git add local-storage/src
git commit -m "feat: add local disk storage core" -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

### Task 2: Authenticated Local HTTP Service

**Files:**
- Create: `local-storage/src/server.ts`
- Create: `local-storage/src/index.ts`

**Interfaces:**
- Consumes: `createAppStorage`.
- Produces: `/local-api/health`, `/bootstrap`, `/settings`, `/app`, `/library`, `/projects`, `/workbenches/:kind`, and `/media`.

- [ ] **Step 1: Implement request authentication and error responses**

```ts
const token = process.env.LOCAL_STORAGE_TOKEN;
if (!token) throw new Error("LOCAL_STORAGE_TOKEN is required");

function assertAuthenticated(request: Request) {
    if (request.headers.get("x-local-storage-token") !== token) throw new HttpError(401, "本地存储令牌无效");
}
```

Only `/health` may omit authentication. Map unsafe IDs to 400, missing records to 404, revision conflicts to 409, and filesystem failures to 500 without returning secrets or complete settings.

- [ ] **Step 2: Implement JSON state and project routes**

Use exact request bodies:

```ts
type StateWrite = { key: string; value: unknown };
type ProjectCreate = { project: unknown };
type ProjectWrite = { expectedRevision: number; project: unknown };
```

`GET /bootstrap` returns `{ settings, app, projects }`. `GET /library` and workbench routes return their own documents. Project GET returns `{ revision, project }`.

- [ ] **Step 3: Implement raw media upload, read, copy, and delete routes**

`POST /media` must read metadata headers, pass `request.body` directly to `writeMedia`, and never convert the body to Base64. `GET /media?storageKey=...` must support `Range` for video and audio. `POST /media/copy-to-library` clones bytes without transcoding.

- [ ] **Step 4: Add the entrypoint**

```ts
import { resolve } from "node:path";
import { startLocalStorageServer } from "./server";

startLocalStorageServer({
    hostname: "127.0.0.1",
    port: Number(process.env.LOCAL_STORAGE_PORT) || 17372,
    rootDir: resolve(process.cwd(), "data"),
    token: process.env.LOCAL_STORAGE_TOKEN || "",
});
```

- [ ] **Step 5: Commit the HTTP service**

```bash
git add local-storage/src/server.ts local-storage/src/index.ts
git commit -m "feat: expose local storage API" -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

### Task 3: One-Command Startup and Frontend Storage Gate

**Files:**
- Create: `scripts/dev.ts`
- Modify: `Makefile`
- Modify: `web/vite.config.ts`
- Create: `web/src/services/local-api.ts`
- Create: `web/src/components/layout/local-storage-gate.tsx`
- Modify: `web/src/components/layout/app-providers.tsx`

**Interfaces:**
- Produces: `localApi`, `createLocalStateStorage(area)`, `mediaUrl(storageKey)`, `getBootstrap()`.
- Produces: `LocalStorageGate`.

- [ ] **Step 1: Add the Bun process supervisor**

```ts
const token = crypto.randomUUID().replaceAll("-", "");
const env = { ...process.env, LOCAL_STORAGE_TOKEN: token, LOCAL_STORAGE_PORT: "17372" };
const storage = Bun.spawn(["bun", "run", "local-storage/src/index.ts"], { env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
const web = Bun.spawn(["bun", "run", "--cwd", "web", "dev"], { env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });

const stop = () => {
    storage.kill();
    web.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await Promise.race([storage.exited, web.exited]);
stop();
process.exit(1);
```

Change `Makefile` to:

```make
.PHONY: dev

dev:
	bun run scripts/dev.ts
```

- [ ] **Step 2: Proxy and authenticate local API requests**

Add a Vite proxy for `/local-api` targeting `http://127.0.0.1:${LOCAL_STORAGE_PORT}` and set `x-local-storage-token` from `LOCAL_STORAGE_TOKEN` in `proxyReq`.

- [ ] **Step 3: Add the typed frontend API client and Zustand adapter**

```ts
export function createLocalStateStorage(area: "settings" | "app" | "library"): StateStorage {
    return {
        getItem: async (key) => JSON.stringify(await localApi.getState(area, key)),
        setItem: async (key, value) => void (await localApi.putState(area, key, JSON.parse(value))),
        removeItem: async (key) => void (await localApi.removeState(area, key)),
    };
}
```

Cache the bootstrap promise so simultaneous store hydration reads one response. Do not catch failures by returning empty data.

- [ ] **Step 4: Block the application when disk storage is unavailable**

`LocalStorageGate` must show “本地存储服务不可用，请在项目根目录执行 make” with a retry action. It renders children only after `/health` and `/bootstrap` succeed.

- [ ] **Step 5: Commit startup integration**

```bash
git add Makefile scripts/dev.ts web/vite.config.ts web/src/services/local-api.ts web/src/components/layout/local-storage-gate.tsx web/src/components/layout/app-providers.tsx
git commit -m "feat: require local storage on startup" -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

### Task 4: Move Global Settings off Browser Storage

**Files:**
- Modify: `web/src/stores/use-config-store.ts`
- Modify: `web/src/stores/use-theme-store.ts`
- Modify: `web/src/stores/use-prompt-store.ts`
- Modify: `web/src/stores/use-prompt-source-store.ts`
- Modify: `web/src/stores/canvas/use-plugin-store.ts`

**Interfaces:**
- Consumes: `createLocalStateStorage("settings" | "app")`.
- Produces: the same public store actions and state shapes used by existing components.

- [ ] **Step 1: Replace every business-store browser adapter**

Use:

```ts
storage: createJSONStorage(() => createLocalStateStorage("settings"))
```

for config, personal prompts, prompt sources, and plugins. Use the `"app"` area for theme. Preserve current `partialize`, merge normalization, and hydrated flags.

- [ ] **Step 2: Remove localForage imports from these stores**

No business store in this task may import `localForageStorage` or rely on default `localStorage`.

- [ ] **Step 3: Commit global state persistence**

```bash
git add web/src/stores/use-config-store.ts web/src/stores/use-theme-store.ts web/src/stores/use-prompt-store.ts web/src/stores/use-prompt-source-store.ts web/src/stores/canvas/use-plugin-store.ts
git commit -m "feat: persist settings to local disk" -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

### Task 5: Revisioned Canvas Index, Lazy Load, and Auto-Save

**Files:**
- Rewrite: `web/src/stores/canvas/use-canvas-store.ts`
- Modify: `web/src/pages/canvas/index.tsx`
- Modify: `web/src/pages/canvas/project.tsx`
- Modify: `web/src/components/canvas/canvas-project-card.tsx`
- Modify: `web/src/components/canvas/canvas-delete-projects-dialog.tsx`
- Modify: `web/src/lib/agent/agent-site-tools.ts`

**Interfaces:**
- Produces: `hydrateIndex()`, `loadProject(id)`, `createProject(title)`, `importProject(project)`, `renameProject(id,title)`, `deleteProjects(ids)`, `updateProject(id,patch)`, `flushProject(id)`.
- Produces: `saveStatus: "idle" | "saving" | "saved" | "error" | "conflict"` and `saveError`.

- [ ] **Step 1: Replace Zustand persist with bootstrap index hydration**

Keep project summaries in `projects`, track loaded IDs and revisions outside serialized project data, and read a full project only in `loadProject(id)`.

- [ ] **Step 2: Add revisioned debounced saves**

```ts
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const revisions = new Map<string, number>();

function scheduleProjectSave(id: string) {
    clearTimeout(saveTimers.get(id));
    saveTimers.set(id, setTimeout(() => void flushProject(id), 400));
}
```

On 409 set `saveStatus` to `conflict` and keep the in-memory edit. Do not retry with a newer revision automatically.

- [ ] **Step 3: Convert create, import, load, rename, and delete call sites to async**

Navigation must wait until project creation succeeds. Project route loading must await `loadProject(projectId)` before copying nodes into local page state.

- [ ] **Step 4: Add unload protection**

Register `beforeunload` only while save status is `saving`, `error`, or `conflict`. Attempt `flushProject` when a project page unmounts.

- [ ] **Step 5: Commit canvas persistence**

```bash
git add web/src/stores/canvas/use-canvas-store.ts web/src/pages/canvas web/src/components/canvas/canvas-project-card.tsx web/src/components/canvas/canvas-delete-projects-dialog.tsx web/src/lib/agent/agent-site-tools.ts
git commit -m "feat: save canvas projects to disk" -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

### Task 6: Store All Media as Original Disk Files

**Files:**
- Create: `web/src/services/storage-scope.ts`
- Rewrite: `web/src/services/image-storage.ts`
- Rewrite: `web/src/services/file-storage.ts`
- Modify: `web/src/pages/canvas/project.tsx`
- Modify: `web/src/pages/assets/index.tsx`
- Modify: `web/src/pages/image/index.tsx`
- Modify: `web/src/pages/video/index.tsx`

**Interfaces:**
- Produces: `setStorageScope(scope)`, `getStorageScope()`.
- Preserves: `uploadImage`, `resolveImageUrl`, `getImageBlob`, `setImageBlob`, `deleteStoredImages`.
- Preserves: `uploadMediaFile`, `resolveMediaUrl`, `getMediaBlob`, `setMediaBlob`, `deleteStoredMedia`.

- [ ] **Step 1: Add route-scoped media ownership**

```ts
export type StorageScope =
    | { kind: "library"; ownerId: "library" }
    | { kind: "project"; ownerId: string }
    | { kind: "workbench"; ownerId: "image" | "video" | "audio" };
```

Default to library. Project, asset, image, and video pages set the appropriate scope on mount and restore library scope on unmount.

- [ ] **Step 2: Replace IndexedDB media writes with raw API uploads**

`uploadImage` and `uploadMediaFile` must send Blob bytes directly as the request body. Returned URLs use `/local-api/media?storageKey=...`. `get*Blob` fetches that URL; `set*Blob` uploads with the requested storage key for archive import.

- [ ] **Step 3: Remove all localforage and object URL persistence**

The services may use a temporary object URL only to read image dimensions before or after disk upload, and must revoke it. No module-level Blob store remains.

- [ ] **Step 4: Commit media persistence**

```bash
git add web/src/services/storage-scope.ts web/src/services/image-storage.ts web/src/services/file-storage.ts web/src/pages/canvas/project.tsx web/src/pages/assets/index.tsx web/src/pages/image/index.tsx web/src/pages/video/index.tsx
git commit -m "feat: copy media into data directory" -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

### Task 7: Disk-Backed Library and Safe Media Adoption

**Files:**
- Modify: `web/src/stores/use-asset-store.ts`
- Modify all `addAsset`, `updateAsset`, and `removeAsset` call sites reported by `rg -n "addAsset\\(|updateAsset\\(|removeAsset\\(" web/src`.

**Interfaces:**
- Consumes: `createLocalStateStorage("library")` and `localApi.copyMediaToLibrary`.
- Produces: async `addAsset`, `updateAsset`, and `removeAsset` that resolve only after disk persistence is accepted.

- [ ] **Step 1: Move library state to `data/library/library.json`**

Keep the current asset types and hydration URL repair, but use local API state storage instead of `localForageStorage`.

- [ ] **Step 2: Copy project/workbench media into library ownership**

Before adding an image or video whose media record is not library-owned, call `copyMediaToLibrary` and replace its `storageKey`, URL, bytes, and MIME metadata with the returned record.

- [ ] **Step 3: Await library mutations in every caller**

Do not display “已加入我的资产” or return an Agent success result until the disk-backed mutation resolves.

- [ ] **Step 4: Commit the library change**

```bash
git add web/src/stores/use-asset-store.ts web/src
git commit -m "feat: persist asset library to disk" -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

### Task 8: Disk-Backed Workbench Records and WebDAV Compatibility

**Files:**
- Create: `web/src/services/workbench-records.ts`
- Modify: `web/src/pages/image/index.tsx`
- Modify: `web/src/pages/video/index.tsx`
- Modify: `web/src/services/app-sync.ts`

**Interfaces:**
- Produces: `listWorkbenchRecords<T>(kind)`, `setWorkbenchRecord(kind,id,value)`, `removeWorkbenchRecord(kind,id)`, `replaceWorkbenchRecords(kind,records)`.

- [ ] **Step 1: Add workbench record API functions**

```ts
export type WorkbenchKind = "image" | "video" | "audio";
export async function listWorkbenchRecords<T>(kind: WorkbenchKind): Promise<T[]>;
export async function setWorkbenchRecord<T>(kind: WorkbenchKind, id: string, value: T): Promise<void>;
export async function removeWorkbenchRecord(kind: WorkbenchKind, id: string): Promise<void>;
```

- [ ] **Step 2: Replace image and video localforage record stores**

Remove `localforage` imports, preserve sort/normalize logic, and await disk writes before refreshing history.

- [ ] **Step 3: Update WebDAV sync to read disk-backed records and media**

The sync feature may continue transferring remote data, but its local side must use current disk stores. It must not recreate IndexedDB state.

- [ ] **Step 4: Commit workbench persistence**

```bash
git add web/src/services/workbench-records.ts web/src/pages/image/index.tsx web/src/pages/video/index.tsx web/src/services/app-sync.ts
git commit -m "feat: persist workbench records to disk" -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

### Task 9: User Documentation and Release Notes

**Files:**
- Modify: `README.md`
- Modify: `docs/content/docs/development/local-development.mdx`
- Rewrite relevant storage sections: `docs/content/docs/development/canvas-data-structure.mdx`
- Modify: `docs/content/docs/progress/todo.mdx`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Documents: `make`, `data/`, plaintext secrets, no IndexedDB migration, original media bytes, and failure behavior.

- [ ] **Step 1: Update quick start**

Replace `cd web && bun run dev` with:

```bash
bun install --cwd web
make
```

State that the app requires the local storage service and saves user data under `data/`.

- [ ] **Step 2: Replace browser persistence documentation**

Document the actual disk tree, project revisions, media index, original-byte rule, `.part`, `.bak`, and the fact that old IndexedDB data is untouched but ignored.

- [ ] **Step 3: Update project progress documents**

Add one pending-test item covering restart restore, browser data deletion, another browser, raw media byte equality, service unavailable behavior, revision conflicts, and plaintext `settings.json`. Remove a matching todo item only if one exists.

- [ ] **Step 4: Add the changelog summary**

Add one `Unreleased` entry:

```text
- [调整] 画布、素材、生成记录、配置与原始媒体改由本机存储服务直接保存到 `data/`，重启或更换浏览器后可从磁盘恢复。
```

- [ ] **Step 5: Review without running build commands**

Inspect:

```bash
git diff --check
git status --short
rg -n "localforage|localStorage" web/src/stores web/src/pages/image web/src/pages/video web/src/services/image-storage.ts web/src/services/file-storage.ts
rg -n "ZIP|gzip|Base64|压缩|转码" local-storage web/src/services
```

Expected: no browser persistence remains in business stores or workbench records; remaining `localforage` use is limited to the rebuildable remote prompt cache. Existing ZIP import/export utilities may remain, but the automatic disk persistence path contains no compression.

- [ ] **Step 6: Commit documentation**

```bash
git add README.md docs/content/docs/development docs/content/docs/progress CHANGELOG.md docs/superpowers/plans/2026-08-02-local-disk-persistence.md
git commit -m "docs: document local disk persistence" -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

## Final Review Checklist

- [ ] Every business store reads from disk or is intentionally runtime-only.
- [ ] Old IndexedDB business data is neither read nor deleted.
- [ ] All uploads and generated media write original bytes before creating durable references.
- [ ] `make` supervises both required processes.
- [ ] Storage service binds only to `127.0.0.1` and rejects unauthenticated writes.
- [ ] Project writes enforce revisions and preserve one backup.
- [ ] Disk and API failures stay visible and never fall back to browser persistence.
- [ ] `data/` remains ignored by Git.
- [ ] Required docs and pending-test notes match the implementation.
