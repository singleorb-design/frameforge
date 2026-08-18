import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "antd";
import { HardDrive, RotateCcw } from "lucide-react";

import { localApi } from "@/services/local-api";

export function LocalStorageGate({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [error, setError] = useState("");

    const load = async () => {
        setStatus("loading");
        setError("");
        try {
            localApi.resetBootstrap();
            await localApi.health();
            await localApi.bootstrap();
            const [{ useCanvasStore }, { useAssetStore }, { useConfigStore }, { useThemeStore }, { usePromptStore }, { usePromptSourceStore }, { usePluginStore }, { hydrateAgentPreferences }, { hydrateCanvasSidePanelPreferences }] = await Promise.all([
                import("@/stores/canvas/use-canvas-store"),
                import("@/stores/use-asset-store"),
                import("@/stores/use-config-store"),
                import("@/stores/use-theme-store"),
                import("@/stores/use-prompt-store"),
                import("@/stores/use-prompt-source-store"),
                import("@/stores/canvas/use-plugin-store"),
                import("@/stores/use-agent-store"),
                import("@/stores/use-canvas-side-panel-store"),
            ]);
            await Promise.all([
                useConfigStore.persist.rehydrate(),
                useThemeStore.persist.rehydrate(),
                usePromptStore.persist.rehydrate(),
                usePromptSourceStore.persist.rehydrate(),
                usePluginStore.persist.rehydrate(),
                hydrateAgentPreferences(),
                hydrateCanvasSidePanelPreferences(),
            ]);
            await Promise.all([useCanvasStore.getState().hydrateIndex(), useAssetStore.getState().hydrate()]);
            setStatus("ready");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "无法连接本地存储服务");
            setStatus("error");
        }
    };

    useEffect(() => {
        void load();
    }, []);

    if (status === "ready") return children;
    return (
        <main className="grid min-h-screen place-items-center bg-background px-6 text-stone-900 dark:text-stone-100">
            <section className="w-full max-w-md text-center">
                <HardDrive className="mx-auto size-10 text-stone-400" />
                <h1 className="mt-5 text-xl font-semibold">{status === "loading" ? "正在读取本地项目" : "本地存储服务不可用"}</h1>
                <p className="mt-3 text-sm leading-6 text-stone-500">{status === "loading" ? "正在从 data 目录加载画布和内容…" : error || "请在项目根目录执行 make 后重试。"}</p>
                {status === "error" ? (
                    <Button className="mt-6" icon={<RotateCcw className="size-4" />} onClick={() => void load()}>
                        重新连接
                    </Button>
                ) : null}
            </section>
        </main>
    );
}
