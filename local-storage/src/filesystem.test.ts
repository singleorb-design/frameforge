import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAppStorage } from "./app-storage";

describe("local disk storage", () => {
    test("writes JSON atomically and keeps one backup", async () => {
        const root = await mkdtemp(join(tmpdir(), "frameforge-"));
        const storage = createAppStorage(root);
        await storage.initialize();
        await storage.putState("settings", "config", { state: { value: 1 } });
        await storage.putState("settings", "config", { state: { value: 2 } });
        expect(JSON.parse(await readFile(join(root, "settings.json"), "utf8")).config.state.value).toBe(2);
        expect(JSON.parse(await readFile(join(root, "settings.json.bak"), "utf8")).config.state.value).toBe(1);
    });

    test("rejects a stale project revision", async () => {
        const root = await mkdtemp(join(tmpdir(), "frameforge-"));
        const storage = createAppStorage(root);
        const project = { id: "project-a", title: "A", createdAt: "1", updatedAt: "1" };
        const created = await storage.createProject(project);
        await storage.writeProject("project-a", created.revision, { ...project, title: "B" });
        await expect(storage.writeProject("project-a", created.revision, { ...project, title: "C" })).rejects.toThrow("PROJECT_REVISION_CONFLICT");
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
        const stored = await storage.readMedia(media.storageKey);
        expect(new Uint8Array(await Bun.file(stored.path).arrayBuffer())).toEqual(bytes);
    });
});
