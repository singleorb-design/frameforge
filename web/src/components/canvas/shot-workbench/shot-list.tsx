import { Input, Select } from "antd";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { shotStatusLabels } from "@/lib/production/shot-mode-labels";
import type { ShotboardRecord } from "@/types/production";

export function ShotList({ shotboard, activeShotId, onSelect }: { shotboard: ShotboardRecord; activeShotId: string; onSelect: (shotId: string) => void }) {
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState("all");
    const shotById = useMemo(() => new Map(shotboard.shots.map((shot) => [shot.id, shot])), [shotboard.shots]);
    const query = keyword.trim().toLowerCase();
    return (
        <aside className="flex max-h-60 min-h-0 flex-col border-b border-stone-200 dark:border-stone-800 lg:max-h-none lg:border-b-0 lg:border-r">
            <div className="space-y-2 border-b border-stone-200 p-3 dark:border-stone-800">
                <Input size="small" allowClear prefix={<Search className="size-3.5 opacity-50" />} placeholder="搜索镜头" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
                <Select
                    size="small"
                    className="w-full"
                    value={status}
                    onChange={setStatus}
                    options={[{ value: "all", label: "全部状态" }, ...Array.from(new Set(shotboard.shots.map((shot) => shot.status))).map((value) => ({ value, label: shotStatusLabels[value] }))]}
                />
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
                {shotboard.scenes
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((scene) => {
                        const shots = scene.shotIds
                            .map((id) => shotById.get(id))
                            .filter((shot) => Boolean(shot && (status === "all" || shot.status === status) && (!query || `${shot.code} ${shot.narrativePurpose}`.toLowerCase().includes(query))));
                        if (!shots.length) return null;
                        return (
                            <section key={scene.id} className="mb-3">
                                <div className="px-2 py-1 text-[11px] font-medium opacity-45">
                                    场次 {scene.order} · {scene.heading}
                                </div>
                                {shots.map((shot) => (
                                    <button
                                        key={shot!.id}
                                        type="button"
                                        onClick={() => onSelect(shot!.id)}
                                        className={`mb-1 w-full rounded-md px-2 py-2 text-left transition ${shot!.id === activeShotId ? "bg-black/5 dark:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
                                    >
                                        <div className="truncate text-xs font-semibold">
                                            {shot!.code} · {shot!.narrativePurpose}
                                        </div>
                                        <div className="mt-1 flex justify-between gap-2 text-[10px] opacity-50">
                                            <span>{shotStatusLabels[shot!.status]}</span>
                                            <span>{(shot!.targetDurationMs / 1000).toFixed(1)}s</span>
                                        </div>
                                    </button>
                                ))}
                            </section>
                        );
                    })}
            </div>
        </aside>
    );
}
