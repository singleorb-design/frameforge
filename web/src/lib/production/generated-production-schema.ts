import { z } from "zod";

const id = z.string().trim().min(1);
const text = z.string().trim().min(1);
const textArray = z.array(text);
const binding = z.object({ assetId: id, role: text, state: text.optional() }).strict();

export const generatedProductionSchema = z
    .object({
        scriptBreakdown: z
            .object({
                episodeNumber: z.number().int().positive(),
                title: text,
                scenes: z.array(z.object({ id, order: z.number().int().positive(), heading: text, location: text, timeOfDay: text, beatIds: z.array(id).min(1) }).strict()).min(1),
                beats: z.array(z.object({ id, sceneId: id, order: z.number().int().positive(), summary: text, dramaticFunction: text }).strict()).min(1),
                dialogueCues: z.array(z.object({ id, beatId: id, characterId: id.optional(), speaker: text, text }).strict()),
                voiceoverCues: z.array(z.object({ id, beatId: id, speaker: text, text }).strict()),
            })
            .strict(),
        scenes: z.array(
            z
                .object({
                    id,
                    name: text,
                    narrativeFunction: text,
                    era: text,
                    locationType: text,
                    spatialLayout: text,
                    materials: textArray,
                    palette: textArray,
                    defaultLighting: text,
                    timeVariants: textArray,
                    weatherVariants: textArray,
                    continuityLocks: textArray.min(1),
                    positivePrompt: text,
                    negativePrompt: text,
                    sourceNote: text,
                })
                .strict(),
        ),
        props: z.array(
            z
                .object({
                    id,
                    name: text,
                    narrativeFunction: text,
                    ownerCharacterId: id.optional(),
                    shape: text,
                    material: text,
                    colors: textArray,
                    scale: text,
                    handlingRules: textArray,
                    states: z.array(z.object({ id, name: text, description: text }).strict()).min(1),
                    continuityLocks: textArray.min(1),
                    positivePrompt: text,
                    negativePrompt: text,
                    sourceNote: text,
                })
                .strict(),
        ),
        shotboard: z
            .object({
                episodeNumber: z.number().int().positive(),
                title: text,
                targetDurationMs: z.number().int().positive(),
                targetRatio: z.enum(["9:16", "16:9", "1:1", "4:3", "3:4"]),
                scenes: z
                    .array(z.object({ id, order: z.number().int().positive(), heading: text, locationAssetId: id.optional(), timeOfDay: text, dramaticPurpose: text, beatSummary: text, shotIds: z.array(id).min(1) }).strict())
                    .min(1),
                shots: z
                    .array(
                        z
                            .object({
                                id,
                                sceneId: id,
                                order: z.number().int().positive(),
                                code: text,
                                sourceBeatIds: z.array(id).min(1),
                                narrativePurpose: text,
                                emotionalBeat: text,
                                informationGain: text,
                                shotCategory: z.enum(["establishing", "dialogue", "emotion-closeup", "reaction", "prop-detail", "action", "reveal", "transition"]),
                                framing: z.object({ shotSize: text, cameraAngle: text, composition: text, lensIntent: text, screenDirection: text, cameraMovement: text }).strict(),
                                startState: text,
                                action: text,
                                endState: text,
                                continuityNotes: textArray,
                                characterBindings: z.array(binding),
                                sceneBinding: binding.optional(),
                                propBindings: z.array(binding),
                                dialogueCueIds: z.array(id),
                                voiceoverCueIds: z.array(id),
                                soundCues: textArray,
                                targetDurationMs: z.number().int().positive(),
                                editRelation: z.enum(["cut", "match-cut", "continuous", "transition"]),
                            })
                            .strict(),
                    )
                    .min(1),
            })
            .strict(),
    })
    .strict();

export type GeneratedProductionDraft = z.infer<typeof generatedProductionSchema>;
