import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";

export default function RouteErrorBoundary() {
    const error = useRouteError();
    const message = routeErrorMessage(error);

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <main className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-10 text-stone-900 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)] dark:text-stone-100">
                <section className="w-full max-w-lg text-center">
                    <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 shadow-sm dark:border-red-950/60 dark:bg-stone-900 dark:text-red-400">
                        <AlertTriangle className="size-7" />
                    </div>
                    <h1 className="text-3xl font-semibold tracking-normal">页面运行异常</h1>
                    <p className="mt-3 text-sm leading-6 text-stone-500 dark:text-stone-400">{message}</p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium transition hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:hover:bg-stone-800" onClick={() => window.location.reload()}>
                            <RotateCcw className="size-4" />
                            重新加载
                        </button>
                        <Link to="/canvas" className="inline-flex h-10 items-center gap-2 rounded-lg bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200">
                            <Home className="size-4" />
                            返回画布
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}

function routeErrorMessage(error: unknown) {
    if (isRouteErrorResponse(error)) return error.statusText || `请求失败：${error.status}`;
    if (error instanceof Error) return error.message || "当前页面出现异常，请重新加载后继续。";
    return "当前页面出现异常，请重新加载后继续。";
}
