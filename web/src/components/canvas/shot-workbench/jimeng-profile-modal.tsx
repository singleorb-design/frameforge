import { App, Button, Input, Modal } from "antd";
import { useEffect, useState } from "react";

import { createJimengProfileVersion } from "@/lib/production/jimeng-profile";
import type { PlatformCapabilityProfile, ProductionProject } from "@/types/production";

export function JimengProfileModal({
    open,
    production,
    profile,
    onChange,
    onClose,
}: {
    open: boolean;
    production: ProductionProject;
    profile: PlatformCapabilityProfile | null;
    onChange: (production: ProductionProject) => void;
    onClose: () => void;
}) {
    const { message } = App.useApp();
    const [value, setValue] = useState("");
    useEffect(() => setValue(profile ? JSON.stringify({ ...profile, profileVersion: undefined }, null, 2) : ""), [profile]);
    const save = () => {
        if (!profile) return;
        try {
            const parsed = JSON.parse(value) as Omit<PlatformCapabilityProfile, "profileVersion">;
            if (parsed.platform !== "jimeng-web" || !parsed.displayName?.trim() || !parsed.verifiedAt?.trim() || !Array.isArray(parsed.models) || !parsed.models.length) throw new Error("能力档案缺少平台、名称、验证时间或模型");
            parsed.models.forEach((model) => {
                if (!model.id || !model.label || !model.modes?.length || !model.ratios?.length || !model.resolutions?.length || !model.durationsSeconds?.length) throw new Error(`模型 ${model.id || "未命名"} 的能力字段不完整`);
            });
            const result = createJimengProfileVersion(production, profile.id, { ...parsed, id: profile.id });
            onChange(result.production);
            message.success(`已创建能力档案 v${result.profile.profileVersion}`);
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "能力档案保存失败");
        }
    };
    return (
        <Modal title="即梦能力档案新版本" open={open} width={760} onCancel={onClose} footer={<><Button onClick={onClose}>取消</Button><Button type="primary" onClick={save}>创建新版本</Button></>}>
            <p className="mb-3 text-xs opacity-55">即梦模型、会员权限和参考上限会变化。修改后创建新版本，不改写已经发布任务单中的档案快照。</p>
            <Input.TextArea className="font-mono" rows={24} value={value} onChange={(event) => setValue(event.target.value)} />
        </Modal>
    );
}
