import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createAppStorage } from "./app-storage";
import type { DiskArea, MediaScope, WorkbenchKind } from "./types";

type StartOptions = {
    hostname: string;
    port: number;
    rootDir: string;
    token: string;
};

export async function startLocalStorageServer(options: StartOptions) {
    if (!options.token) throw new Error("LOCAL_STORAGE_TOKEN is required");
    const storage = createAppStorage(options.rootDir);
    await storage.initialize();

    const httpServer = createServer((incoming, outgoing) => {
        void (async () => {
            try {
                const request = await nodeRequest(incoming, options);
                const url = new URL(request.url);
                if (url.pathname === "/local-api/health") return sendResponse(outgoing, json({ ok: true }));
                assertAuthenticated(request, options.token);
                assertAllowedOrigin(request);

                if (url.pathname === "/local-api/bootstrap" && request.method === "GET") return sendResponse(outgoing, json(await storage.bootstrap()));
                if (url.pathname.startsWith("/local-api/state/")) return sendResponse(outgoing, await stateRoute(storage, request, url));
                if (url.pathname === "/local-api/projects" && request.method === "GET") return sendResponse(outgoing, json({ projects: await storage.listProjects() }));
                if (url.pathname === "/local-api/projects" && request.method === "POST") return sendResponse(outgoing, json(await storage.createProject((await request.json() as { project: never }).project), 201));
                if (url.pathname.startsWith("/local-api/projects/")) return sendResponse(outgoing, await projectRoute(storage, request, url));
                if (url.pathname.startsWith("/local-api/workbenches/")) return sendResponse(outgoing, await workbenchRoute(storage, request, url));
                if (url.pathname === "/local-api/media/copy-to-library" && request.method === "POST") return sendResponse(outgoing, json(await storage.copyMediaToLibrary((await request.json() as { storageKey: string }).storageKey)));
                if (url.pathname === "/local-api/media/project-references" && request.method === "GET") return sendResponse(outgoing, json({ projectIds: await storage.projectReferences(requiredQuery(url, "storageKey")) }));
                if (url.pathname === "/local-api/media/cleanup" && request.method === "POST") {
                    await storage.cleanupUnusedMedia();
                    return sendResponse(outgoing, json({ ok: true }));
                }
                if (url.pathname === "/local-api/media" && request.method === "POST") return sendResponse(outgoing, await mediaUploadRoute(storage, request));
                if (url.pathname === "/local-api/media" && request.method === "GET") return sendResponse(outgoing, await mediaReadRoute(storage, request, url));
                if (url.pathname === "/local-api/media" && request.method === "DELETE") {
                    await storage.deleteMedia(requiredQuery(url, "storageKey"));
                    return sendResponse(outgoing, new Response(null, { status: 204 }));
                }
                return sendResponse(outgoing, json({ error: "接口不存在" }, 404));
            } catch (error) {
                return sendResponse(outgoing, errorResponse(error));
            }
        })();
    });
    await new Promise<void>((resolve) => httpServer.listen(options.port, options.hostname, resolve));
    const address = httpServer.address();
    const port = typeof address === "object" && address ? address.port : options.port;

    console.log(`Local storage: http://${options.hostname}:${port}`);
    console.log(`Data directory: ${storage.rootDir}`);
    return {
        port,
        stop: () => new Promise<void>((resolve, reject) => httpServer.close((error) => (error ? reject(error) : resolve()))),
    };
}

async function stateRoute(storage: ReturnType<typeof createAppStorage>, request: Request, url: URL) {
    const area = diskArea(url.pathname.slice("/local-api/state/".length));
    const key = requiredQuery(url, "key");
    if (request.method === "GET") return json({ value: await storage.getState(area, key) });
    if (request.method === "PUT") {
        const body = await request.json() as { value: unknown };
        return json({ value: await storage.putState(area, key, body.value) });
    }
    if (request.method === "DELETE") {
        await storage.removeState(area, key);
        return new Response(null, { status: 204 });
    }
    return json({ error: "请求方法不支持" }, 405);
}

async function projectRoute(storage: ReturnType<typeof createAppStorage>, request: Request, url: URL) {
    const id = decodeURIComponent(url.pathname.slice("/local-api/projects/".length));
    if (request.method === "GET") return json(await storage.readProject(id));
    if (request.method === "PUT") {
        const body = await request.json() as { expectedRevision: number; project: never };
        return json(await storage.writeProject(id, body.expectedRevision, body.project));
    }
    if (request.method === "DELETE") {
        await storage.deleteProject(id);
        return new Response(null, { status: 204 });
    }
    return json({ error: "请求方法不支持" }, 405);
}

async function workbenchRoute(storage: ReturnType<typeof createAppStorage>, request: Request, url: URL) {
    const kind = workbenchKind(url.pathname.slice("/local-api/workbenches/".length));
    const id = url.searchParams.get("id");
    if (request.method === "GET") return json({ records: await storage.listWorkbenchRecords(kind) });
    if (request.method === "PUT" && id) {
        const body = await request.json() as { value: unknown };
        await storage.setWorkbenchRecord(kind, id, body.value);
        return json({ ok: true });
    }
    if (request.method === "PUT") {
        const body = await request.json() as { records: Record<string, unknown> };
        await storage.replaceWorkbenchRecords(kind, body.records);
        return json({ ok: true });
    }
    if (request.method === "DELETE" && id) {
        await storage.removeWorkbenchRecord(kind, id);
        return new Response(null, { status: 204 });
    }
    return json({ error: "请求方法不支持" }, 405);
}

async function mediaUploadRoute(storage: ReturnType<typeof createAppStorage>, request: Request) {
    if (!request.body) throw new Error("EMPTY_MEDIA");
    const scope = mediaScope(requiredHeader(request, "x-media-scope"));
    const ownerId = requiredHeader(request, "x-media-owner");
    const prefix = requiredHeader(request, "x-media-prefix");
    const originalName = decodeURIComponent(requiredHeader(request, "x-media-name"));
    const mimeType = request.headers.get("content-type") || "application/octet-stream";
    const requestedStorageKey = request.headers.get("x-media-storage-key") || undefined;
    return json(await storage.writeMedia({ scope, ownerId, prefix, originalName, mimeType, requestedStorageKey, body: request.body }), 201);
}

async function mediaReadRoute(storage: ReturnType<typeof createAppStorage>, request: Request, url: URL) {
    const { record, path, size } = await storage.readMedia(requiredQuery(url, "storageKey"));
    const range = request.headers.get("range");
    const headers = new Headers({
        "accept-ranges": "bytes",
        "cache-control": "no-store",
        "content-type": record.mimeType,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(record.originalName)}`,
    });
    if (!range) {
        headers.set("content-length", String(size));
        return fileResponse(path, 200, headers);
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const suffixLength = !match[1] && match[2] ? Number(match[2]) : 0;
    const start = suffixLength ? Math.max(0, size - suffixLength) : match[1] ? Number(match[1]) : 0;
    const end = suffixLength ? size - 1 : match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    headers.set("content-range", `bytes ${start}-${end}/${size}`);
    headers.set("content-length", String(end - start + 1));
    return fileResponse(path, 206, headers, { start, end });
}

function assertAuthenticated(request: Request, token: string) {
    if (request.headers.get("x-local-storage-token") !== token) throw new HttpError(401, "本地存储令牌无效");
}

function assertAllowedOrigin(request: Request) {
    const origin = request.headers.get("origin");
    if (!origin) return;
    const url = new URL(origin);
    if ((url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.port === "3000") return;
    throw new HttpError(403, "请求来源不允许");
}

function requiredHeader(request: Request, name: string) {
    const value = request.headers.get(name);
    if (!value) throw new HttpError(400, `缺少请求头 ${name}`);
    return value;
}

function requiredQuery(url: URL, name: string) {
    const value = url.searchParams.get(name);
    if (!value) throw new HttpError(400, `缺少参数 ${name}`);
    return value;
}

function diskArea(value: string): DiskArea {
    if (value !== "settings" && value !== "app" && value !== "library") throw new Error("UNSAFE_ID");
    return value;
}

function workbenchKind(value: string): WorkbenchKind {
    if (value !== "image" && value !== "video" && value !== "audio") throw new Error("UNSAFE_ID");
    return value;
}

function mediaScope(value: string): MediaScope {
    if (value !== "project" && value !== "library" && value !== "workbench") throw new Error("UNSAFE_ID");
    return value;
}

function json(value: unknown, status = 200) {
    return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function errorResponse(error: unknown) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message === "PROJECT_REVISION_CONFLICT") return json({ error: "项目已在其他页面更新", code: message }, 409);
    if (message === "PROJECT_EXISTS") return json({ error: "项目 ID 已存在", code: message }, 409);
    if (message === "MEDIA_KEY_CONFLICT") return json({ error: "媒体 ID 已存在且文件内容不一致", code: message }, 409);
    if (message === "MEDIA_IN_USE") return json({ error: "媒体仍被其他内容引用", code: message }, 409);
    if (message === "PROJECT_NOT_FOUND" || message === "MEDIA_NOT_FOUND") return json({ error: "数据不存在", code: message }, 404);
    if (message.startsWith("UNSAFE_") || message === "INVALID_PROJECT" || message === "PROJECT_ID_MISMATCH" || message === "EMPTY_MEDIA") return json({ error: "请求数据不合法", code: message }, 400);
    if (message.startsWith("CORRUPT_JSON:")) return json({ error: "本地数据文件损坏，请检查 data 目录中的备份文件", code: "CORRUPT_JSON" }, 500);
    console.error("Local storage error:", message);
    return json({ error: "本地磁盘读写失败", code: "LOCAL_STORAGE_ERROR" }, 500);
}

class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

async function nodeRequest(incoming: IncomingMessage, options: StartOptions) {
    const body = incoming.method === "GET" || incoming.method === "HEAD" ? undefined : await requestBody(incoming);
    return new Request(`http://${options.hostname}:${options.port}${incoming.url || "/"}`, {
        method: incoming.method,
        headers: incoming.headers as HeadersInit,
        body,
        duplex: body ? "half" : undefined,
    } as RequestInit & { duplex?: "half" });
}

async function requestBody(incoming: IncomingMessage) {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
}

async function sendResponse(outgoing: ServerResponse, response: Response) {
    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    if (!response.body) return outgoing.end();
    const reader = response.body.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) outgoing.write(value);
    }
    outgoing.end();
}

function fileResponse(path: string, status: number, headers: Headers, range?: { start: number; end: number }) {
    const stream = createReadStream(path, range);
    return new Response(stream as unknown as BodyInit, { status, headers });
}
