import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { startLocalStorageServer } from "./server";

test("local storage server runs on Node http and answers health", async () => {
    const root = await mkdtemp(join(tmpdir(), "frameforge-storage-"));
    const server = await startLocalStorageServer({ hostname: "127.0.0.1", port: 0, rootDir: root, token: "token" });
    try {
        const response = await fetch(`http://127.0.0.1:${server.port}/local-api/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { ok: true });
    } finally {
        await server.stop();
    }
});
