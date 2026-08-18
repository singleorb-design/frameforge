import { App, Button, Image, Tag } from "antd";
import { Copy, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { controlAssetLabels } from "@/lib/production/shot-mode-labels";
import { addControlAssetVersion, buildControlFramePrompt } from "@/lib/production/shot-control-assets";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import type { ControlAssetKind, ProductionProject, Shot, ShotControlAssetVersion } from "@/types/production";

export function ControlAssetPanel({
    production,
    shotboardId,
    shot,
    onChange,
    onPin,
    onOpenExternal,
}: {
    production: ProductionProject;
    shotboardId: string;
    shot: Shot;
    onChange: (production: ProductionProject) => void;
    onPin?: (shotId: string, recordId: string, version: number) => void;
    onOpenExternal?: () => void;
}) {
    const { message } = App.useApp();
    const inputRef = useRef<HTMLInputElement>(null);
    const uploadKindRef = useRef<ControlAssetKind>("first-frame");
    const uploadRecordRef = useRef<string | undefined>(undefined);
    if (!shot.generationPlan || shot.generationPlan.status !== "approved") return <div className="p-8 text-sm opacity-55">该镜头还有必须处理的问题，解决后会自动准备生成方式。</div>;
    const requirements = shot.generationPlan.requiredAssets;
    const kinds = Array.from(
        new Set<ControlAssetKind>([
            ...requirements.map((item) => item.kind === "keyframes" ? "keyframe" : item.kind as ControlAssetKind),
            ...shot.controlAssets.map((item) => item.kind),
        ]),
    );
    const upload = async (file?: File) => {
        if (!file) return;
        try {
            const image = await uploadImage(file);
            const kind = uploadKindRef.current;
            onChange(
                addControlAssetVersion(production, shotboardId, shot.id, {
                    recordId: uploadRecordRef.current,
                    kind,
                    label: controlAssetLabels[kind === "keyframe" ? "keyframes" : kind],
                    required: requirements.some((item) => item.required && (item.kind === "keyframes" ? "keyframe" : item.kind) === kind),
                    storageKey: image.storageKey,
                    source: "uploaded",
                    fileName: file.name || `${kind}.png`,
                    mimeType: image.mimeType,
                    width: image.width,
                    height: image.height,
                    purpose: purposeForKind(kind),
                    createdAt: new Date().toISOString(),
                }),
            );
            message.success("镜头画面已上传并自动采用");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "镜头画面上传失败");
        } finally {
            if (inputRef.current) inputRef.current.value = "";
            uploadRecordRef.current = undefined;
        }
    };
    return (
        <div className="thin-scrollbar h-full overflow-y-auto p-5">
            <div className="mb-5">
                <h2 className="text-base font-semibold">准备画面</h2>
                <p className="mt-1 text-xs opacity-50">角色、场景和道具参考已自动带入。这里只需要补齐必需的首帧、尾帧或关键帧；上传后会直接采用。</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                {kinds.flatMap((kind) => {
                    const records = kind === "keyframe" ? shot.controlAssets.filter((item) => item.kind === kind).sort((a, b) => a.order - b.order) : [shot.controlAssets.find((item) => item.kind === kind)];
                    const cards = records.length ? records : [undefined];
                    return cards.map((record, cardIndex) => {
                    const selected = record?.versions.find((item) => item.version === record.selectedVersion);
                    const imageKind = !["action-reference", "camera-reference", "audio-reference"].includes(kind);
                    const promptKind = kind === "keyframe" ? "keyframe" : kind;
                    const prompt = ["first-frame", "last-frame", "keyframe"].includes(promptKind) ? buildControlFramePrompt(production, shotboardId, shot.id, promptKind as ControlAssetKind) : "";
                    return (
                        <section key={record?.id || `${kind}-empty`} className="border-b border-stone-200 pb-4 dark:border-stone-800">
                            <div className="flex items-start justify-between gap-3">
                                <div><b className="text-sm">{controlAssetLabels[kind === "keyframe" ? "keyframes" : kind]}{kind === "keyframe" && record ? ` ${record.order}` : ""}</b><div className="mt-1 text-xs opacity-45">{record?.required || requirements.some((item) => item.required && item.kind === "keyframes") ? "必需" : "可选"}</div></div>
                                {selected ? <Tag color={selected.status === "approved" ? "green" : "red"}>{selected.status === "approved" ? "已自动采用" : "需重新上传"}</Tag> : null}
                            </div>
                            {selected ? <ControlAssetPreview version={selected} /> : <div className="mt-3 text-xs opacity-40">尚未上传</div>}
                            <div className="mt-3 flex flex-wrap gap-2">
                                {prompt ? <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => { void navigator.clipboard.writeText(prompt); message.success("控制帧 Prompt 已复制"); }}>复制 Prompt</Button> : null}
                                {imageKind ? <Button size="small" icon={<Upload className="size-3.5" />} onClick={() => { uploadKindRef.current = kind; uploadRecordRef.current = record?.id; inputRef.current?.click(); }}>{record ? "重新上传" : "上传画面"}</Button> : <span className="self-center text-[11px] opacity-45">视频/音频参考暂从画布已有素材关联</span>}
                                {kind === "keyframe" && record && cardIndex === cards.length - 1 ? <Button size="small" onClick={() => { uploadKindRef.current = kind; uploadRecordRef.current = undefined; inputRef.current?.click(); }}>添加下一关键帧</Button> : null}
                                {record && selected?.status === "approved" && onPin ? <Button size="small" onClick={() => onPin(shot.id, record.id, selected.version)}>固定到画布</Button> : null}
                            </div>
                        </section>
                    );
                    });
                })}
            </div>
            {shot.status === "control-assets-ready" ? <Button type="primary" className="mt-5" onClick={onOpenExternal}>下一步：生成外部任务</Button> : null}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
        </div>
    );
}

function ControlAssetPreview({ version }: { version: ShotControlAssetVersion }) {
    const [url, setUrl] = useState("");
    useEffect(() => {
        let mounted = true;
        void resolveImageUrl(version.storageKey).then((nextUrl) => {
            if (mounted) setUrl(nextUrl);
        });
        return () => {
            mounted = false;
        };
    }, [version.storageKey]);
    return (
        <div className="mt-3">
            <div className="mb-2 text-xs opacity-55">当前画面：{version.fileName}</div>
            {url ? (
                <div className="overflow-hidden rounded-md border border-stone-200 bg-black/5 dark:border-stone-800 dark:bg-white/5">
                    <Image
                        src={url}
                        alt={version.fileName}
                        width="100%"
                        className="block aspect-video w-full object-contain"
                        preview={{ mask: "放大查看" }}
                    />
                </div>
            ) : (
                <div className="rounded-md border border-dashed border-stone-300 px-3 py-8 text-center text-xs opacity-45 dark:border-stone-700">
                    图片文件暂不可预览
                </div>
            )}
        </div>
    );
}

function purposeForKind(kind: ControlAssetKind) {
    if (kind === "first-frame") return "锁定镜头开始构图和人物状态";
    if (kind === "last-frame") return "锁定镜头结束构图和动作落点";
    if (kind === "keyframe") return "控制连续动作中的必要视觉阶段";
    return "作为全能参考中的明确视觉职责";
}
