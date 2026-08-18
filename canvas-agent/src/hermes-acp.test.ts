import assert from "node:assert/strict";
import test from "node:test";

import { acpPromptBlocks, parseJsonLines, replayHistoryMessage, toHermesAgentEvents, summarizeHermesSession } from "./hermes-acp.js";

test("parseJsonLines parses newline delimited JSON and keeps partial data", () => {
    const state = { buffer: "" };
    assert.deepEqual(parseJsonLines(state, '{"jsonrpc":"2.0","id":1}\n{"jsonrpc":"2.0"'), [{ jsonrpc: "2.0", id: 1 }]);
    assert.equal(state.buffer, '{"jsonrpc":"2.0"');
    assert.deepEqual(parseJsonLines(state, ',"id":2}\n'), [{ jsonrpc: "2.0", id: 2 }]);
    assert.equal(state.buffer, "");
});

test("acpPromptBlocks sends a text block only", () => {
    assert.deepEqual(acpPromptBlocks("  hello  "), [{ type: "text", text: "hello" }]);
});

test("acpPromptBlocks includes image attachments as ACP image blocks", () => {
    assert.deepEqual(acpPromptBlocks("hello", [{ type: "image/png", dataUrl: "data:image/png;base64,aW1hZ2U=" }]), [
        { type: "text", text: "hello" },
        { type: "image", mimeType: "image/png", data: "aW1hZ2U=" },
    ]);
});

test("toHermesAgentEvents converts ACP agent message chunks", () => {
    const events = toHermesAgentEvents(
        {
            sessionUpdate: "agent_message_chunk",
            messageId: "msg-1",
            content: { type: "text", text: "你好" },
        },
        "session-1",
        "你好",
    );
    assert.deepEqual(events, [
        {
            agent: "hermes",
            type: "item.updated",
            threadId: "session-1",
            item: { id: "msg-1", type: "agent_message", text: "你好" },
        },
    ]);
});

test("toHermesAgentEvents converts ACP idle state to turn completion", () => {
    assert.deepEqual(toHermesAgentEvents({ sessionUpdate: "state_update", state: "idle", stopReason: "end_turn" }, "session-1"), [
        { agent: "hermes", type: "turn.completed", threadId: "session-1", usage: null },
    ]);
});

test("replayHistoryMessage accepts Hermes history chunks without message ids", () => {
    assert.deepEqual(replayHistoryMessage({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "你好" } }, 2), {
        id: "history-2",
        role: "assistant",
        title: "Hermes",
        text: "你好",
        streamId: "history-2",
    });
});

test("summarizeHermesSession maps ACP session info for the web panel", () => {
    assert.deepEqual(
        summarizeHermesSession({
            sessionId: "session-1",
            title: "商品图生成",
            cwd: "/tmp/work",
            updatedAt: "2026-08-15T10:00:00.000Z",
        }),
        {
            id: "session-1",
            preview: "商品图生成",
            name: "商品图生成",
            cwd: "/tmp/work",
            updatedAt: Date.parse("2026-08-15T10:00:00.000Z"),
            source: {
                sessionId: "session-1",
                title: "商品图生成",
                cwd: "/tmp/work",
                updatedAt: "2026-08-15T10:00:00.000Z",
            },
        },
    );
});
