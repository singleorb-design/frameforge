import { z } from "zod";

const text = z.string().trim().min(1);
const confidence = z.enum(["high", "medium", "low"]);
const framing = z
    .object({
        shotSize: text.optional(),
        cameraAngle: text.optional(),
        composition: text.optional(),
        lensIntent: text.optional(),
        screenDirection: text.optional(),
        cameraMovement: text.optional(),
    })
    .strict();

export const shotPreflightOutputSchema = z
    .object({
        shots: z
            .array(
                z
                    .object({
                        shotId: text,
                        summary: text,
                        confidence,
                        fields: z
                            .object({
                                narrativePurpose: text.optional(),
                                emotionalBeat: text.optional(),
                                informationGain: text.optional(),
                                shotCategory: z.enum(["establishing", "dialogue", "emotion-closeup", "reaction", "prop-detail", "action", "reveal", "transition"]).optional(),
                                framing: framing.optional(),
                                startState: text.optional(),
                                action: text.optional(),
                                endState: text.optional(),
                                continuityNotes: z.array(text).optional(),
                                soundCues: z.array(text).optional(),
                                targetDurationMs: z.number().int().positive().optional(),
                                editRelation: z.enum(["cut", "match-cut", "continuous", "transition"]).optional(),
                            })
                            .strict(),
                        assetStates: z.array(
                            z
                                .object({
                                    assetId: text,
                                    kind: z.enum(["character", "scene", "prop"]),
                                    role: text,
                                    state: z.string(),
                                    confidence,
                                    reason: text,
                                })
                                .strict(),
                        ),
                        issues: z.array(
                            z
                                .object({
                                    kind: z.enum([
                                        "missing-character",
                                        "missing-scene",
                                        "missing-prop",
                                        "ambiguous-character",
                                        "ambiguous-asset",
                                        "state-conflict",
                                        "stale-version",
                                        "insufficient-context",
                                    ]),
                                    severity: z.enum(["blocking", "review", "optional"]),
                                    message: text,
                                    assetKind: z.enum(["character", "scene", "prop"]).optional(),
                                    suggestedName: text.optional(),
                                    candidateAssetIds: z.array(text).optional(),
                                })
                                .strict(),
                        ),
                    })
                    .strict(),
            )
            .min(1),
    })
    .strict();

export type ShotPreflightModelOutput = z.infer<typeof shotPreflightOutputSchema>;
