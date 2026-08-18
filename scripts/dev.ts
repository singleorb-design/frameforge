import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const token = randomBytes(24).toString("hex");
const env = { ...process.env, LOCAL_STORAGE_TOKEN: token, LOCAL_STORAGE_PORT: "17372" };
const io = { env, stdin: "inherit" as const, stdout: "inherit" as const, stderr: "inherit" as const };
const storage = Bun.spawn(["bun", "run", "local-storage/src/index.ts"], { ...io, cwd: process.cwd() });
try {
    await Promise.race([
        waitForStorage(),
        storage.exited.then((code) => {
            throw new Error(`本地存储服务启动失败（退出码 ${code}）`);
        }),
    ]);
} catch (error) {
    storage.kill();
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}
const web = Bun.spawn(["bun", "run", "dev"], { ...io, cwd: resolve(process.cwd(), "web") });
let stopping = false;

const stop = () => {
    if (stopping) return;
    stopping = true;
    storage.kill();
    web.kill();
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const exitCode = await Promise.race([storage.exited, web.exited]);
stop();
await Promise.allSettled([storage.exited, web.exited]);
process.exit(exitCode || 1);

async function waitForStorage() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
            if ((await fetch("http://127.0.0.1:17372/local-api/health")).ok) return;
        } catch {
            await Bun.sleep(100);
        }
    }
    throw new Error("本地存储服务启动超时");
}
