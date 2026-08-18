import type { PlatformCapabilityProfile, ProductionProject, ShotGenerationMode } from "@/types/production";

export function getJimengProfile(production: ProductionProject, profileId: string, profileVersion?: number) {
    const profiles = production.platformProfiles.filter((profile) => profile.id === profileId);
    const profile = profileVersion
        ? profiles.find((item) => item.profileVersion === profileVersion)
        : profiles.slice().sort((a, b) => b.profileVersion - a.profileVersion)[0];
    if (!profile) throw new Error("即梦能力档案不存在");
    return profile;
}

export function createJimengProfileVersion(production: ProductionProject, profileId: string, patch: Omit<PlatformCapabilityProfile, "profileVersion">) {
    const latest = getJimengProfile(production, profileId);
    const profile: PlatformCapabilityProfile = { ...patch, id: profileId, profileVersion: latest.profileVersion + 1 };
    return { production: { ...production, platformProfiles: [...production.platformProfiles, profile] }, profile };
}

export function validateJimengSettings(
    profile: PlatformCapabilityProfile,
    settings: { model: string; mode: ShotGenerationMode; ratio: string; durationSeconds: number; resolution: string; nativeAudio: boolean },
    counts: { images: number; videos: number; audios: number; keyframes: number },
) {
    const model = profile.models.find((item) => item.id === settings.model);
    if (!model) throw new Error("所选即梦模型不在当前能力档案中");
    if (!model.modes.includes(settings.mode)) throw new Error("所选模型不支持当前生成模式");
    if (!model.ratios.includes(settings.ratio)) throw new Error("所选模型不支持当前画幅");
    if (!model.resolutions.includes(settings.resolution)) throw new Error("所选模型不支持当前分辨率");
    if (!model.durationsSeconds.includes(settings.durationSeconds)) throw new Error("所选模型不支持当前时长");
    if (settings.nativeAudio && !model.nativeAudio) throw new Error("所选模型不支持原生音频");
    if (counts.images > model.referenceLimits.images) throw new Error(`参考图片超过上限 ${model.referenceLimits.images}`);
    if (counts.videos > model.referenceLimits.videos) throw new Error(`参考视频超过上限 ${model.referenceLimits.videos}`);
    if (counts.audios > model.referenceLimits.audios) throw new Error(`参考音频超过上限 ${model.referenceLimits.audios}`);
    if (counts.keyframes > model.referenceLimits.keyframes) throw new Error(`关键帧超过上限 ${model.referenceLimits.keyframes}`);
    return model;
}
