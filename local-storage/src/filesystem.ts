import { createHash, randomBytes } from "node:crypto";
import { createWriteStream, existsSync, lstatSync } from "node:fs";
import { copyFile, mkdir, open, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;

export function assertSafeId(value: string) {
    if (!SAFE_ID.test(value) || value.includes("..")) throw new Error("UNSAFE_ID");
    return value;
}

export function resolveInsideRoot(rootDir: string, ...parts: string[]) {
    const root = resolve(rootDir);
    const target = resolve(root, ...parts);
    if (isAbsolute(parts.join("")) || (target !== root && !target.startsWith(`${root}${sep}`))) throw new Error("UNSAFE_PATH");
    let current = root;
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("UNSAFE_PATH");
    for (const part of relative(root, target).split(sep).filter(Boolean)) {
        current = join(current, part);
        if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("UNSAFE_PATH");
    }
    return target;
}

export async function ensureDirectory(path: string) {
    await mkdir(path, { recursive: true });
}

export async function fileExists(path: string) {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
    if (!(await fileExists(path))) return structuredClone(fallback);
    try {
        return JSON.parse(await readFile(path, "utf8")) as T;
    } catch {
        const corruptPath = `${path}.corrupt`;
        await rm(corruptPath, { force: true });
        await rename(path, corruptPath);
        try {
            const backup = JSON.parse(await readFile(`${path}.bak`, "utf8")) as T;
            await copyFile(`${path}.bak`, path);
            return backup;
        } catch {
            throw new Error(`CORRUPT_JSON:${basename(path)}`);
        }
    }
}

export async function writeJsonAtomic(path: string, value: unknown) {
    await ensureDirectory(dirname(path));
    const partPath = `${path}.part`;
    const backupPath = `${path}.bak`;
    const file = await open(partPath, "w", 0o600);
    try {
        await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
        await file.sync();
    } finally {
        await file.close();
    }
    if (await fileExists(path)) await copyFile(path, backupPath);
    await rename(partPath, path);
}

export async function cleanupPartFiles(rootDir: string) {
    if (!(await fileExists(rootDir))) return;
    const entries = await readdir(rootDir, { withFileTypes: true });
    await Promise.all(
        entries.map(async (entry) => {
            const path = join(rootDir, entry.name);
            if (entry.isSymbolicLink()) return;
            if (entry.isDirectory()) return cleanupPartFiles(path);
            if (entry.name.endsWith(".part")) await rm(path, { force: true });
        }),
    );
}

export async function writeStreamAtomic(path: string, body: ReadableStream<Uint8Array>) {
    await ensureDirectory(dirname(path));
    const partPath = `${path}.part`;
    const hash = createHash("sha256");
    let bytes = 0;
    const source = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
    source.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        hash.update(chunk);
    });
    try {
        await pipeline(source, createWriteStream(partPath, { flags: "w", mode: 0o600 }));
        const file = await open(partPath, "r+");
        try {
            await file.sync();
        } finally {
            await file.close();
        }
        await rename(partPath, path);
        return { bytes, sha256: hash.digest("hex") };
    } catch (error) {
        await rm(partPath, { force: true });
        throw error;
    }
}

export function safeExtension(originalName: string, mimeType: string) {
    const source = extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, "");
    if (source && source.length <= 10) return source;
    const known: Record<string, string> = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "audio/mpeg": ".mp3",
        "audio/mp4": ".m4a",
        "audio/wav": ".wav",
        "audio/ogg": ".ogg",
    };
    return known[mimeType] || ".bin";
}

export function createStorageKey(prefix: string) {
    assertSafeId(prefix);
    return `${prefix}:${randomBytes(12).toString("hex")}`;
}

export function safeFileStem(storageKey: string) {
    return assertSafeId(storageKey).replaceAll(":", "_");
}

export function relativePath(rootDir: string, path: string) {
    const value = relative(resolve(rootDir), resolve(path));
    if (!value || value.startsWith("..") || isAbsolute(value)) throw new Error("UNSAFE_PATH");
    return value.split(sep).join("/");
}
