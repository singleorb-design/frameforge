import { Input, Select } from "antd";

import type { ProductionProject, ShotAssetBinding } from "@/types/production";

export function ShotAssetBindings({
    production,
    characters,
    scene,
    props,
    onCharactersChange,
    onSceneChange,
    onPropsChange,
}: {
    production: ProductionProject;
    characters: ShotAssetBinding[];
    scene?: ShotAssetBinding;
    props: ShotAssetBinding[];
    onCharactersChange: (value: ShotAssetBinding[]) => void;
    onSceneChange: (value?: ShotAssetBinding) => void;
    onPropsChange: (value: ShotAssetBinding[]) => void;
}) {
    return (
        <div className="space-y-4">
            <BindingList
                label="角色"
                records={production.characters}
                value={characters}
                onChange={onCharactersChange}
                multiple
            />
            <BindingList
                label="场景"
                records={production.scenes}
                value={scene ? [scene] : []}
                onChange={(value) => onSceneChange(value[0])}
            />
            <BindingList label="道具" records={production.props} value={props} onChange={onPropsChange} multiple />
        </div>
    );
}

function BindingList<T>({
    label,
    records,
    value,
    onChange,
    multiple = false,
}: {
    label: string;
    records: Array<{ id: string; currentVersion: number; versions: Array<{ version: number; data: T }> }>;
    value: ShotAssetBinding[];
    onChange: (value: ShotAssetBinding[]) => void;
    multiple?: boolean;
}) {
    const selectedIds = value.map((item) => item.assetId);
    const setIds = (ids: string[]) =>
        onChange(
            ids.map((id) => {
                const current = value.find((item) => item.assetId === id);
                const record = records.find((item) => item.id === id);
                return current || { assetId: id, version: record?.currentVersion || 1, role: "", state: "" };
            }),
        );
    return (
        <section>
            <div className="mb-1.5 text-xs font-medium opacity-55">{label}</div>
            <Select
                className="w-full"
                mode={multiple ? "multiple" : undefined}
                allowClear
                placeholder={`选择${label}`}
                notFoundContent={`画布暂无可用${label}`}
                value={multiple ? selectedIds : selectedIds[0]}
                onChange={(next) => setIds(Array.isArray(next) ? next : next ? [next] : [])}
                options={records.map((record) => ({ value: record.id, label: recordName(record.versions.find((item) => item.version === record.currentVersion)?.data) }))}
            />
            {value.map((binding) => (
                    <div key={binding.assetId} className="mt-2 grid grid-cols-[52px_1fr] gap-2 border-t border-stone-200 pt-2 text-xs dark:border-stone-800">
                        <span className="pt-1 opacity-45">状态</span>
                        <Input size="small" placeholder="例如：受伤、变装、开启" value={binding.state} onChange={(event) => onChange(value.map((item) => (item.assetId === binding.assetId ? { ...item, state: event.target.value } : item)))} />
                    </div>
                ))}
        </section>
    );
}

function recordName(value: unknown) {
    if (!value || typeof value !== "object") return "未命名资产";
    const name = (value as Record<string, unknown>).name;
    return typeof name === "string" ? name : "未命名资产";
}
