import { Button, Input } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

type CharacterField = {
    key: keyof CanvasNodeMetadata;
    label: string;
    multiline?: boolean;
};

const fields: CharacterField[] = [
    { key: "name", label: "角色名" },
    { key: "role", label: "角色定位" },
    { key: "importance", label: "重要度" },
    { key: "storyFunction", label: "剧情功能", multiline: true },
    { key: "ageRange", label: "年龄段" },
    { key: "gender", label: "性别" },
    { key: "body", label: "身形", multiline: true },
    { key: "face", label: "脸型与五官", multiline: true },
    { key: "hair", label: "发型", multiline: true },
    { key: "clothing", label: "服装", multiline: true },
    { key: "temperament", label: "气质", multiline: true },
    { key: "defaultExpression", label: "表情基准" },
    { key: "relationships", label: "人物关系", multiline: true },
    { key: "positivePrompt", label: "正向提示词", multiline: true },
    { key: "negativePrompt", label: "负向提示词", multiline: true },
    { key: "sourceNote", label: "信息来源", multiline: true },
];

export function CanvasCharacterCardEditor({ node, onChange, onClose }: { node: CanvasNodeData; onChange: (nodeId: string, patch: CanvasNodeMetadata) => void; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const metadata = node.metadata || {};
    const update = (key: keyof CanvasNodeMetadata, value: string) => onChange(node.id, { [key]: value });
    const updateList = (key: "colors" | "props" | "consistencyLocks", value: string) => onChange(node.id, { [key]: value.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean) });

    return (
        <div className="rounded-2xl border p-3 shadow-2xl backdrop-blur" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">角色设定</div>
                <Button size="small" type="text" onClick={onClose}>
                    关闭
                </Button>
            </div>
            <div className="thin-scrollbar grid max-h-[520px] gap-2 overflow-y-auto pr-1">
                {fields.map((field) => (
                    <label key={field.key} className="grid gap-1 text-xs">
                        <span style={{ color: theme.node.muted }}>{field.label}</span>
                        {field.multiline ? <Input.TextArea rows={2} value={String(metadata[field.key] || "")} onChange={(event) => update(field.key, event.target.value)} /> : <Input value={String(metadata[field.key] || "")} onChange={(event) => update(field.key, event.target.value)} />}
                    </label>
                ))}
                <ListInput label="主色" value={metadata.colors || []} onChange={(value) => updateList("colors", value)} />
                <ListInput label="关键道具" value={metadata.props || []} onChange={(value) => updateList("props", value)} />
                <ListInput label="一致性锁定词" value={metadata.consistencyLocks || []} onChange={(value) => updateList("consistencyLocks", value)} />
            </div>
        </div>
    );
}

function ListInput({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <label className="grid gap-1 text-xs">
            <span style={{ color: theme.node.muted }}>{label}</span>
            <Input.TextArea rows={2} value={value.join("，")} onChange={(event) => onChange(event.target.value)} />
        </label>
    );
}
