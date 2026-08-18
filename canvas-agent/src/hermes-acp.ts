import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { AGENT_PROMPT, VERSION } from "./config.js";
import type { AgentAttachment, AgentEmit } from "./types.js";

type Json = Record<string, unknown>;
type PendingRequest = { resolve: (value: unknown) => void; reject: (error: Error) => void };
type ParseState = { buffer: string };
type HermesSessionInfo = { sessionId?: string; id?: string; title?: string | null; name?: string | null; cwd?: string; createdAt?: string | number; updatedAt?: string | number; [key: string]: unknown };
type AgentThreadSummary = { id: string; preview: string; name?: string | null; cwd?: string; status?: string; source?: unknown; createdAt?: number; updatedAt?: number };
type AgentHistoryMessage = { id: string; role: "user" | "assistant" | "tool" | "error"; title?: string; text: string; detail?: unknown; streamId?: string };
type RunOptions = { sessionId?: string; cwd: string; emit: AgentEmit; onStart?: () => void; onSession?: (sessionId: string) => void; onFinish?: () => void };

let hermesApp: HermesAcpClient | null = null;
let hermesAppStart: Promise<HermesAcpClient> | null = null;
let hermesQueue: Promise<unknown> = Promise.resolve();

export function parseJsonLines(state: ParseState, chunk: string) {
    state.buffer += chunk;
    const lines = state.buffer.split("\n");
    state.buffer = lines.pop() || "";
    return lines.flatMap((line) => {
        const text = line.trim();
        if (!text) return [];
        return [JSON.parse(text) as Json];
    });
}

export function acpPromptBlocks(prompt: string, attachments: AgentAttachment[] = []) {
    return [
        { type: "text", text: prompt.trim() },
        ...attachments.flatMap((item) => {
            const match = item.dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
            if (!match?.[1]?.startsWith("image/") || !match[2]) return [];
            return [{ type: "image", mimeType: match[1], data: match[2] }];
        }),
    ];
}

export function toHermesAgentEvents(update: Json, sessionId: string, accumulatedText = "") {
    const type = String(update.sessionUpdate || "");
    const messageId = String(update.messageId || "");
    if (type === "agent_message" || type === "agent_message_chunk") {
        const text = accumulatedText || contentText(update.content);
        if (!text) return [];
        return [{ agent: "hermes", type: "item.updated", threadId: sessionId, item: { id: messageId || `msg-${Date.now()}`, type: "agent_message", text } }];
    }
    if (type === "state_update" && update.state === "running") return [{ agent: "hermes", type: "turn.started", threadId: sessionId }];
    if (type === "state_update" && update.state === "idle") return [{ agent: "hermes", type: "turn.completed", threadId: sessionId, usage: null }];
    if (type === "tool_call_update") {
        const status = String(update.status || "");
        if (status !== "completed" && status !== "failed" && status !== "cancelled") return [];
        return [
            {
                agent: "hermes",
                type: "item.completed",
                threadId: sessionId,
                item: { id: String(update.toolCallId || ""), type: "hermes_tool_call", title: update.title, status, result: update.rawOutput, error: status === "failed" ? { message: contentText(update.content) || "工具调用失败" } : undefined },
            },
        ];
    }
    return [];
}

export function summarizeHermesSession(session: HermesSessionInfo): AgentThreadSummary {
    const id = String(session.sessionId || session.id || "");
    const name = typeof session.title === "string" ? session.title : typeof session.name === "string" ? session.name : null;
    const summary: AgentThreadSummary = {
        id,
        preview: name || id || "Hermes 会话",
        name,
        cwd: typeof session.cwd === "string" ? session.cwd : undefined,
        source: session,
    };
    const createdAt = timestamp(session.createdAt);
    const updatedAt = timestamp(session.updatedAt);
    if (createdAt !== undefined) summary.createdAt = createdAt;
    if (updatedAt !== undefined) summary.updatedAt = updatedAt;
    return summary;
}

export async function startHermesSession(emit: AgentEmit, cwd: string) {
    const app = await getHermesApp(emit);
    const result = await app.request("session/new", { cwd, mcpServers: [canvasAgentMcpServer()] });
    const sessionId = String(field(result, "sessionId") || "");
    if (!sessionId) throw new Error("Hermes ACP 没有返回 sessionId");
    return summarizeHermesSession({ sessionId, cwd });
}

export async function listHermesSessions(emit: AgentEmit, cwd: string) {
    const app = await getHermesApp(emit);
    const result = await app.request("session/list", { cwd });
    const sessions = Array.isArray(field(result, "sessions")) ? field(result, "sessions") as HermesSessionInfo[] : [];
    return { data: sessions.map(summarizeHermesSession).filter((item) => item.id) };
}

export async function readHermesSession(emit: AgentEmit, sessionId: string, cwd: string) {
    const app = await getHermesApp(emit);
    const messages = await app.resumeSession(sessionId, cwd, true);
    return { thread: summarizeHermesSession({ sessionId, cwd }), messages };
}

export async function resumeHermesSession(emit: AgentEmit, sessionId: string, cwd: string) {
    const app = await getHermesApp(emit);
    const messages = await app.resumeSession(sessionId, cwd, true);
    return { thread: summarizeHermesSession({ sessionId, cwd }), messages };
}

export async function deleteHermesSession(emit: AgentEmit, sessionId: string) {
    const app = await getHermesApp(emit);
    try {
        await app.request("session/delete", { sessionId });
    } catch {
        await app.request("session/close", { sessionId });
    }
}

export async function runHermesTurn(prompt: string, attachments: AgentAttachment[], options: RunOptions) {
    if (!prompt.trim()) return;
    hermesQueue = hermesQueue.catch(() => undefined).then(() => runHermesTurnNow(prompt, attachments, options));
    await hermesQueue;
}

export async function interruptHermesTurn(emit: AgentEmit, sessionId?: string) {
    if (!sessionId) return false;
    const app = await getHermesApp(emit);
    app.notify("session/cancel", { sessionId });
    return true;
}

async function runHermesTurnNow(prompt: string, attachments: AgentAttachment[], options: RunOptions) {
    try {
        options.onStart?.();
        const app = await getHermesApp(options.emit);
        let sessionId = options.sessionId || "";
        if (!sessionId) {
            const thread = await startHermesSession(options.emit, options.cwd);
            sessionId = thread.id;
        } else {
            await app.resumeSession(sessionId, options.cwd, false);
        }
        options.onSession?.(sessionId);
        app.bindSession(sessionId, options.emit);
        const result = await app.request("session/prompt", { sessionId, prompt: acpPromptBlocks(withHermesPrompt(prompt), attachments) });
        options.emit("agent_event", { agent: "hermes", type: "turn.completed", threadId: sessionId, usage: field(result, "usage") || null });
    } catch (error) {
        options.emit("agent_error", { agent: "hermes", threadId: options.sessionId, message: errorMessage(error) });
    } finally {
        options.onFinish?.();
    }
}

class HermesAcpClient {
    private nextId = 1;
    private parseState: ParseState = { buffer: "" };
    private pending = new Map<number, PendingRequest>();
    private replayTarget: { sessionId: string; messages: AgentHistoryMessage[]; nextId: number } | null = null;
    private messageText = new Map<string, string>();
    private sessionEmit = new Map<string, AgentEmit>();

    private constructor(private child: ChildProcess, private emit: AgentEmit) {}

    static async start(emit: AgentEmit) {
        const command = process.env.HERMES_ACP_COMMAND || "hermes";
        const args = process.env.HERMES_ACP_COMMAND ? [] : ["acp"];
        const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        const client = new HermesAcpClient(child, emit);
        child.stdout?.on("data", (chunk) => client.read(chunk.toString()));
        child.stderr?.on("data", (chunk) => emit("agent_log", { text: chunk.toString() }));
        child.on("error", (error) => emit("agent_error", { agent: "hermes", message: error.message }));
        child.on("exit", (code) => {
            client.failAll(`Hermes ACP exited: ${code ?? 0}`);
            hermesApp = null;
            emit("agent_log", { text: `Hermes ACP exited: ${code ?? 0}` });
        });
        await client.request("initialize", { protocolVersion: 2, capabilities: { session: { requestPermission: true } }, info: { name: "canvas-agent", title: "FrameForge Canvas Agent", version: VERSION } });
        return client;
    }

    bindSession(sessionId: string, emit: AgentEmit) {
        this.sessionEmit.set(sessionId, emit);
    }

    async resumeSession(sessionId: string, cwd: string, replay: boolean) {
        this.replayTarget = replay ? { sessionId, messages: [], nextId: 0 } : null;
        await this.request("session/resume", { sessionId, cwd, mcpServers: [canvasAgentMcpServer()], ...(replay ? { replayFrom: { type: "start" } } : {}) });
        const messages = this.replayTarget?.messages || [];
        this.replayTarget = null;
        return messages;
    }

    request(method: string, params: Json = {}) {
        const id = this.nextId++;
        this.write({ jsonrpc: "2.0", id, method, params });
        return new Promise<unknown>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    }

    notify(method: string, params: Json = {}) {
        this.write({ jsonrpc: "2.0", method, params });
    }

    private write(message: Json) {
        this.child.stdin?.write(`${JSON.stringify(message)}\n`);
    }

    private read(chunk: string) {
        parseJsonLines(this.parseState, chunk).forEach((message) => this.handleMessage(message));
    }

    private handleMessage(message: Json) {
        if (typeof message.id === "number" && (message.result !== undefined || message.error !== undefined)) {
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            const error = message.error && typeof message.error === "object" ? String(field(message.error, "message") || "Hermes ACP request failed") : "";
            error ? pending.reject(new Error(error)) : pending.resolve(message.result);
            return;
        }
        if (message.method === "session/update") this.handleSessionUpdate((message.params || {}) as Json);
        if (message.method === "session/request_permission") this.respondPermission(message);
    }

    private handleSessionUpdate(params: Json) {
        const sessionId = String(params.sessionId || "");
        const update = (params.update || {}) as Json;
        const messageId = String(update.messageId || "");
        const updateType = String(update.sessionUpdate || "");
        if (messageId && (updateType === "agent_message" || updateType === "agent_message_chunk")) {
            const prev = updateType.endsWith("_chunk") ? this.messageText.get(messageId) || "" : "";
            this.messageText.set(messageId, `${prev}${contentText(update.content)}`);
        }
        if (this.replayTarget?.sessionId === sessionId) {
            const replayMessage = replayHistoryMessage(update, this.replayTarget.nextId++);
            if (replayMessage) this.replayTarget.messages.push(replayMessage);
            return;
        }
        const text = messageId ? this.messageText.get(messageId) || "" : "";
        const emit = this.sessionEmit.get(sessionId) || this.emit;
        toHermesAgentEvents(update, sessionId, text).forEach((event) => emit("agent_event", event));
    }

    private respondPermission(message: Json) {
        if (typeof message.id !== "number") return;
        const params = (message.params || {}) as Json;
        const options = Array.isArray(params.options) ? params.options as Json[] : [];
        const reject = options.find((item) => String(item.kind || "").startsWith("reject"));
        this.write({ jsonrpc: "2.0", id: message.id, result: { outcome: reject ? { outcome: "selected", optionId: String(reject.optionId || "") } : { outcome: "cancelled" } } });
    }

    private failAll(message: string) {
        this.pending.forEach((item) => item.reject(new Error(message)));
        this.pending.clear();
    }
}

async function getHermesApp(emit: AgentEmit) {
    if (hermesApp) return hermesApp;
    hermesAppStart ||= HermesAcpClient.start(emit);
    try {
        hermesApp = await hermesAppStart;
        return hermesApp;
    } finally {
        hermesAppStart = null;
    }
}

function withHermesPrompt(prompt: string) {
    return `${AGENT_PROMPT}\n\n用户请求：${prompt}`;
}

function canvasAgentMcpServer() {
    const current = process.argv.find((arg) => /index\.(t|j)s$/.test(arg)) || "";
    const entry = path.resolve(current || fileURLToPath(new URL("./index.js", import.meta.url)));
    const tsx = path.join(path.dirname(entry), "..", "node_modules", "tsx", "dist", "cli.mjs");
    return entry.endsWith(".ts")
        ? { type: "stdio", name: "frameforge", command: process.execPath, args: [tsx, entry, "mcp"], env: [] }
        : { type: "stdio", name: "frameforge", command: process.execPath, args: [entry, "mcp"], env: [] };
}

export function replayHistoryMessage(update: Json, index: number): AgentHistoryMessage | null {
    const type = String(update.sessionUpdate || "");
    const role = type === "user_message" || type === "user_message_chunk" ? "user" : type === "agent_message" || type === "agent_message_chunk" ? "assistant" : null;
    if (!role) return null;
    const id = String(update.messageId || `history-${index}`);
    return { id, role, title: role === "assistant" ? "Hermes" : undefined, text: contentText(update.content), streamId: id };
}

function contentText(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(contentText).filter(Boolean).join("");
    if (!value || typeof value !== "object") return "";
    const data = value as Json;
    if (typeof data.text === "string") return data.text;
    if (data.content) return contentText(data.content);
    return "";
}

function timestamp(value: unknown) {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const time = Date.parse(value);
        return Number.isFinite(time) ? time : undefined;
    }
    return undefined;
}

function field(value: unknown, key: string) {
    return value && typeof value === "object" ? (value as Json)[key] : undefined;
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
