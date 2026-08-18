import { resolve } from "node:path";

import { startLocalStorageServer } from "./server";

void main();

async function main() {
    await startLocalStorageServer({
        hostname: "127.0.0.1",
        port: Number(process.env.LOCAL_STORAGE_PORT) || 17372,
        rootDir: resolve(process.cwd(), "data"),
        token: process.env.LOCAL_STORAGE_TOKEN || "",
    });
}
