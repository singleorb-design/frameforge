import type {
    ProductionProject,
    Shot,
    ShotAssetBinding,
    ShotAssetKind,
    ShotEditableFields,
    ShotFieldSource,
    ShotPreflightConfidence,
    ShotPreflightIssue,
    ShotPreflightFields,
    ShotPreflightPatch,
    ShotPreflightState,
    ShotboardRecord,
    VersionedRecord,
} from "@/types/production";
import { validateShot } from "@/lib/production/shotboard-editor";
import { validateShotboardContinuity } from "@/lib/production/continuity-validator";
import { isInvalidCharacterCandidate } from "@/lib/production/character-name-filter";

export type ShotPreflightMatch = {
    characterBindings: ShotAssetBinding[];
    sceneBinding?: ShotAssetBinding;
    propBindings: ShotAssetBinding[];
    fieldSources: ShotFieldSource[];
    issues: ShotPreflightIssue[];
};

export type ShotPreflightApplyResult = {
    production: ProductionProject;
    autoApprovedCount: number;
    reviewCount: number;
    failedCount: number;
};

export type ShotPreflightSummary = {
    total: number;
    autoApproved: number;
    needsReview: number;
    failed: number;
    pending: number;
};

export function createPendingPreflight(): ShotPreflightState {
    return { status: "pending", confidence: "low", fieldSources: [], lockedFieldPaths: [], issues: [] };
}

export function matchShotAssets(
    production: ProductionProject,
    shotboardId: string,
    shotId: string,
    preferredAssetIds: string[] = [],
): ShotPreflightMatch {
    const shotboard = requiredShotboard(production, shotboardId);
    const shot = requiredShot(shotboard, shotId);
    const breakdown = production.scriptBreakdowns.find((item) => item.id === shotboard.sourceScriptRevision);
    const preferred = new Set(preferredAssetIds);
    const text = [
        shot.narrativePurpose,
        shot.startState,
        shot.action,
        shot.endState,
        ...shot.sourceBeatIds.map((id) => breakdown?.beats.find((item) => item.id === id)?.summary || ""),
        ...shot.dialogueCueIds.flatMap((id) => {
            const cue = breakdown?.dialogueCues.find((item) => item.id === id);
            return cue ? [cue.speaker, cue.text] : [];
        }),
    ].join("\n");
    const speakers = shot.dialogueCueIds
        .map((id) => breakdown?.dialogueCues.find((item) => item.id === id)?.speaker || "")
        .filter(Boolean);
    const namedCharacters = detectNamedCharacters(
        text,
        [
            ...production.characters.map((record) => recordName(record)),
            ...(breakdown?.characterNames || []),
        ],
        speakers,
    );
    const primaryCharacterNames = new Set((breakdown?.characterNames || []).filter((name) => !isInvalidCharacterCandidate(name)).map(normalizeName));
    const sources: ShotFieldSource[] = [];
    const issues: ShotPreflightIssue[] = [];
    const characterBindings = preserveValid(shot.characterBindings, production.characters);
    const propBindings = preserveValid(shot.propBindings, production.props);
    let sceneBinding = validBinding(shot.sceneBinding, production.scenes) ? shot.sceneBinding : undefined;

    matchNamedAssets({
        kind: "character",
        records: production.characters,
        text,
        explicitNames: namedCharacters,
        primaryCharacterNames,
        preferred,
        selected: characterBindings,
        sources,
        issues,
        shotId,
    });
    matchNamedAssets({
        kind: "prop",
        records: production.props,
        text,
        explicitNames: [],
        preferred,
        selected: propBindings,
        sources,
        issues,
        shotId,
    });

    if (!sceneBinding) {
        const storyScene = shotboard.scenes.find((item) => item.id === shot.sceneId);
        const direct = storyScene?.locationAssetId
            ? production.scenes.find((record) => record.id === storyScene.locationAssetId)
            : undefined;
        if (direct) {
            sceneBinding = binding(direct, "主场景", storyScene?.timeOfDay || "");
            sources.push(source("sceneBinding", preferred.has(direct.id) ? "connected-asset" : "canvas-asset", direct.id, "场次已绑定该场景"));
        } else {
            const sceneText = [storyScene?.heading, breakdown?.scenes.find((item) => item.heading === storyScene?.heading)?.location, text].filter(Boolean).join("\n");
            const matches = rankedMatches(production.scenes, sceneText, [], preferred, "scene");
            if (matches.length === 1) {
                sceneBinding = binding(matches[0], "主场景", storyScene?.timeOfDay || "");
                sources.push(source("sceneBinding", preferred.has(matches[0].id) ? "connected-asset" : "canvas-asset", matches[0].id, "场次名称精确匹配"));
            } else {
                issues.push(
                    issue(
                        matches.length ? "ambiguous-asset" : "missing-scene",
                        matches.length ? "找到多个可能的场景，请确认使用哪一个" : `缺少场景：${storyScene?.heading || "当前镜头场景"}`,
                        "blocking",
                        shotId,
                        "scene",
                        storyScene?.heading,
                        matches.map((item) => item.id),
                    ),
                );
            }
        }
    }
    return { characterBindings, sceneBinding, propBindings, fieldSources: sources, issues: dedupeIssues(issues) };
}

export function reconcileKnownAssetBindings(production: ProductionProject, now: string) {
    let next = production;
    const updatedShotIds: string[] = [];
    production.shotboards.forEach((sourceBoard) => {
        const board = requiredShotboard(next, sourceBoard.id);
        const changedShotIds = new Set<string>();
        const shots = board.shots.map((shot) => {
            const match = includeKnownIssueBindings(next, shot, matchShotAssets(next, board.id, shot.id));
            const issues = shot.preflight.issues
                .filter((issue) => isTrustedCharacterIssue(next, board.id, issue))
                .map((issue) =>
                    shouldResolveAssetIssue(next, issue, match)
                        ? { ...issue, status: "resolved" as const, assetDraftStatus: "idle" as const, assetDraftError: undefined, assetDraftStartedAt: undefined }
                        : issue,
                );
            const bindingChanged =
                JSON.stringify(shot.characterBindings) !== JSON.stringify(match.characterBindings) ||
                JSON.stringify(shot.sceneBinding) !== JSON.stringify(match.sceneBinding) ||
                JSON.stringify(shot.propBindings) !== JSON.stringify(match.propBindings);
            const issuesChanged = JSON.stringify(shot.preflight.issues) !== JSON.stringify(issues);
            if (!bindingChanged && !issuesChanged) return shot;
            changedShotIds.add(shot.id);
            updatedShotIds.push(shot.id);
            return {
                ...shot,
                characterBindings: match.characterBindings,
                sceneBinding: match.sceneBinding,
                propBindings: match.propBindings,
                preflight: {
                    ...shot.preflight,
                    fieldSources: mergeSources(shot.preflight.fieldSources, match.fieldSources),
                    issues,
                    lastRunAt: now,
                    error: undefined,
                },
                updatedAt: now,
            };
        });
        if (!changedShotIds.size) return;
        next = {
            ...next,
            shotboards: next.shotboards.map((item) =>
                item.id === board.id ? { ...item, version: item.version + 1, updatedAt: now, shots } : item,
            ),
        };
        next = {
            ...next,
            shotboards: next.shotboards.map((item) =>
                item.id === board.id
                    ? {
                          ...item,
                          shots: item.shots.map((shot) => {
                              if (!changedShotIds.has(shot.id)) return shot;
                              const blockers = validateShot(next, board.id, shot.id);
                              const hasOpenIssue = shot.preflight.issues.some((issue) => issue.status === "open" && issue.severity !== "optional");
                              return {
                                  ...shot,
                                  blockers,
                                  preflight: {
                                      ...shot.preflight,
                                      status: blockers.some((blocker) => blocker.severity === "error") || hasOpenIssue ? "needs-review" : "ready",
                                  },
                              };
                          }),
                      }
                    : item,
            ),
        };
    });
    return { production: next, updatedShotIds };
}

export function isTrustedCharacterIssue(production: ProductionProject, shotboardId: string, issue: ShotPreflightIssue) {
    if (issue.assetKind !== "character") return true;
    const name = normalizeName(issue.suggestedName || "");
    if (!name || isInvalidCharacterCandidate(issue.suggestedName || "")) return false;
    const shotboard = production.shotboards.find((item) => item.id === shotboardId);
    const breakdown = production.scriptBreakdowns.find((item) => item.id === shotboard?.sourceScriptRevision);
    const characterNames = new Set([
        ...production.characters.map((record) => normalizeName(recordName(record))),
        ...(breakdown?.characterNames || []).map(normalizeName),
        ...(breakdown?.dialogueCues || []).map((cue) => normalizeName(cue.speaker)),
    ].filter(Boolean));
    return characterNames.has(name) || Boolean(issue.candidateAssetIds?.some((id) => production.characters.some((record) => record.id === id)));
}

export function applyShotPreflight(
    production: ProductionProject,
    shotboardId: string,
    patches: ShotPreflightPatch[],
    now: string,
    batchId = `preflight-${Date.now()}`,
    preferredAssetIds: string[] = [],
): ShotPreflightApplyResult {
    const original = requiredShotboard(production, shotboardId);
    const patchById = new Map(patches.map((item) => [item.shotId, item]));
    patches.forEach((patch) => {
        if (!original.shots.some((shot) => shot.id === patch.shotId)) throw new Error(`AI 整理引用不存在的镜头：${patch.shotId}`);
    });
    let nextProduction = production;
    let failedCount = 0;
    original.shots.forEach((originalShot) => {
        const aiPatch = patchById.get(originalShot.id);
        if (!aiPatch) return;
        try {
            const currentBoard = requiredShotboard(nextProduction, shotboardId);
            const currentShot = requiredShot(currentBoard, originalShot.id);
            const match = matchShotAssets(nextProduction, shotboardId, currentShot.id, preferredAssetIds);
            validateAssetMatches(nextProduction, aiPatch);
            const matchedBindings = applyAssetStates(match, aiPatch);
            const locked = new Set(currentShot.preflight.lockedFieldPaths);
            const fields = mergeUnlockedFields(currentShot, aiPatch.fields, locked);
            const nextShot: Shot = {
                ...currentShot,
                ...fields,
                characterBindings: matchedBindings.characterBindings,
                sceneBinding: matchedBindings.sceneBinding,
                propBindings: matchedBindings.propBindings,
                revision: currentShot.revision + 1,
                history: [...currentShot.history, { revision: currentShot.revision, snapshot: snapshot(currentShot), preflight: currentShot.preflight, savedAt: now }].slice(-30),
                status: "draft",
                preflight: {
                    ...currentShot.preflight,
                    status: "running",
                    confidence: aiPatch.confidence,
                    batchId,
                    summary: aiPatch.summary || currentShot.preflight.summary,
                    fieldSources: mergeSources(currentShot.preflight.fieldSources, [...match.fieldSources, ...aiPatch.fieldSources]),
                    issues: dedupeIssues([...match.issues, ...aiPatch.issues]),
                    lastRunAt: now,
                    error: undefined,
                },
                updatedAt: now,
            };
            nextProduction = replaceShotDirect(nextProduction, currentBoard, nextShot, now);
            const blockers = validateShot(nextProduction, shotboardId, nextShot.id);
            const hasReview = nextShot.preflight.issues.some((item) => item.status === "open" && item.severity !== "optional");
            const continuityErrors = validateShotboardContinuity(nextProduction, shotboardId).some(
                (item) => item.severity === "error" && (item.fromShotId === nextShot.id || item.toShotId === nextShot.id),
            );
            const autoApprove = aiPatch.confidence === "high" && !blockers.some((item) => item.severity === "error") && !hasReview && !continuityErrors;
            nextProduction = replaceShotDirect(
                nextProduction,
                requiredShotboard(nextProduction, shotboardId),
                {
                    ...requiredShot(requiredShotboard(nextProduction, shotboardId), nextShot.id),
                    status: autoApprove ? "shot-approved" : "draft",
                    blockers,
                    preflight: {
                        ...nextShot.preflight,
                        status: autoApprove ? "ready" : nextShot.preflight.lockedFieldPaths.length ? "user-locked" : "needs-review",
                    },
                },
                now,
            );
        } catch (error) {
            failedCount += 1;
            const board = requiredShotboard(nextProduction, shotboardId);
            const shot = requiredShot(board, originalShot.id);
            nextProduction = replaceShotDirect(
                nextProduction,
                board,
                {
                    ...shot,
                    preflight: {
                        ...shot.preflight,
                        status: "failed",
                        confidence: "low",
                        batchId,
                        lastRunAt: now,
                        error: error instanceof Error ? error.message : "AI 整理失败",
                    },
                },
                now,
            );
        }
    });
    const board = requiredShotboard(nextProduction, shotboardId);
    const summary = summarizeShotPreflight(board);
    const batch = {
        id: batchId,
        sourceScriptRevision: board.sourceScriptRevision,
        preferredAssetIds: [...preferredAssetIds],
        assetVersions: allAssetVersions(nextProduction),
        shotIds: patches.map((item) => item.shotId),
        autoApprovedCount: summary.autoApproved,
        reviewCount: summary.needsReview,
        failedCount,
        createdAt: now,
    };
    nextProduction = {
        ...nextProduction,
        shotboards: nextProduction.shotboards.map((item) =>
            item.id === shotboardId ? { ...item, preflightBatches: [...item.preflightBatches, batch].slice(-20), updatedAt: now } : item,
        ),
    };
    return { production: nextProduction, autoApprovedCount: summary.autoApproved, reviewCount: summary.needsReview, failedCount };
}

export function summarizeShotPreflight(shotboard: ShotboardRecord): ShotPreflightSummary {
    return shotboard.shots.reduce(
        (summary, shot) => {
            summary.total += 1;
            if (shot.preflight.status === "failed") summary.failed += 1;
            else if (shot.status === "shot-approved" && shot.preflight.status === "ready") summary.autoApproved += 1;
            else if (shot.preflight.status === "needs-review" || shot.preflight.status === "user-locked") summary.needsReview += 1;
            else summary.pending += 1;
            return summary;
        },
        { total: 0, autoApproved: 0, needsReview: 0, failed: 0, pending: 0 },
    );
}

export function markShotPreflightFailed(
    production: ProductionProject,
    shotboardId: string,
    shotIds: string[],
    batchId: string,
    error: string,
    now: string,
): ProductionProject {
    const targets = new Set(shotIds);
    return {
        ...production,
        shotboards: production.shotboards.map((shotboard) =>
            shotboard.id === shotboardId
                ? {
                      ...shotboard,
                      version: shotboard.version + 1,
                      shots: shotboard.shots.map((shot) =>
                          targets.has(shot.id)
                              ? {
                                    ...shot,
                                    preflight: {
                                        ...shot.preflight,
                                        status: "failed",
                                        confidence: "low",
                                        batchId,
                                        lastRunAt: now,
                                        error,
                                    },
                                    updatedAt: now,
                                }
                              : shot,
                      ),
                      updatedAt: now,
                  }
                : shotboard,
        ),
    };
}

export function markShotPreflightRunning(
    production: ProductionProject,
    shotboardId: string,
    shotIds: string[],
    batchId: string,
    now: string,
): ProductionProject {
    const targets = new Set(shotIds);
    return {
        ...production,
        shotboards: production.shotboards.map((shotboard) =>
            shotboard.id === shotboardId
                ? {
                      ...shotboard,
                      version: shotboard.version + 1,
                      shots: shotboard.shots.map((shot) =>
                          targets.has(shot.id)
                              ? {
                                    ...shot,
                                    preflight: {
                                        ...shot.preflight,
                                        status: "running",
                                        batchId,
                                        lastRunAt: now,
                                        error: undefined,
                                    },
                                    updatedAt: now,
                                }
                              : shot,
                      ),
                      updatedAt: now,
                  }
                : shotboard,
        ),
    };
}

export function lockShotFields(preflight: ShotPreflightState, fieldPaths: string[]): ShotPreflightState {
    const lockedFieldPaths = Array.from(new Set([...preflight.lockedFieldPaths, ...fieldPaths]));
    return {
        ...preflight,
        status: "user-locked",
        lockedFieldPaths,
        fieldSources: mergeSources(
            preflight.fieldSources,
            fieldPaths.map((fieldPath) => ({ fieldPath, source: "user", confidence: "high", reason: "用户手动修改" })),
        ),
    };
}

export function unlockShotFields(
    production: ProductionProject,
    shotboardId: string,
    shotId: string,
    fieldPaths?: string[],
): ProductionProject {
    const targets = fieldPaths ? new Set(fieldPaths) : null;
    return {
        ...production,
        shotboards: production.shotboards.map((shotboard) =>
            shotboard.id === shotboardId
                ? {
                      ...shotboard,
                      shots: shotboard.shots.map((shot) => {
                          if (shot.id !== shotId) return shot;
                          const lockedFieldPaths = targets ? shot.preflight.lockedFieldPaths.filter((path) => !targets.has(path)) : [];
                          const fieldSources = shot.preflight.fieldSources.filter(
                              (source) => source.source !== "user" || lockedFieldPaths.includes(source.fieldPath),
                          );
                          return {
                              ...shot,
                              preflight: {
                                  ...shot.preflight,
                                  status: lockedFieldPaths.length ? "user-locked" : "pending",
                                  lockedFieldPaths,
                                  fieldSources,
                              },
                          };
                      }),
                  }
                : shotboard,
        ),
    };
}

export function resolveShotAssetIssue(
    production: ProductionProject,
    shotboardId: string,
    shotId: string,
    issueId: string,
    assetId: string,
    now: string,
) {
    const board = requiredShotboard(production, shotboardId);
    const shot = requiredShot(board, shotId);
    const issue = shot.preflight.issues.find((item) => item.id === issueId);
    if (!issue?.assetKind) throw new Error("该异常无法手动绑定素材");
    const record = (issue.assetKind === "character" ? production.characters : issue.assetKind === "scene" ? production.scenes : production.props).find((item) => item.id === assetId);
    if (!record) throw new Error("候选素材不存在");
    const nextBinding = binding(record, issue.assetKind === "scene" ? "主场景" : issue.assetKind === "prop" ? "关键道具" : "镜头人物", "");
    const name = issue.suggestedName || recordName(record);
    const nextShot: Shot = {
        ...shot,
        characterBindings:
            issue.assetKind === "character"
                ? [
                      ...shot.characterBindings.filter((item) => !bindingHasName(production.characters, item, name) && item.assetId !== assetId),
                      nextBinding,
                  ]
                : shot.characterBindings,
        sceneBinding: issue.assetKind === "scene" ? nextBinding : shot.sceneBinding,
        propBindings:
            issue.assetKind === "prop"
                ? [
                      ...shot.propBindings.filter((item) => !bindingHasName(production.props, item, name) && item.assetId !== assetId),
                      nextBinding,
                  ]
                : shot.propBindings,
        preflight: {
            ...shot.preflight,
            issues: shot.preflight.issues.map((item) =>
                item.id === issueId
                    ? { ...item, status: "resolved" as const, assetDraftStatus: "idle" as const, assetDraftError: undefined, assetDraftStartedAt: undefined }
                    : item,
            ),
            fieldSources: mergeSources(shot.preflight.fieldSources, [source(`${issue.assetKind}Bindings.${record.id}`, "user", record.id, `用户选择素材：${name}`)]),
            lastRunAt: now,
            error: undefined,
        },
        updatedAt: now,
    };
    const withShot = replaceShotDirect(production, board, nextShot, now);
    const blockers = validateShot(withShot, shotboardId, shotId);
    const current = requiredShot(requiredShotboard(withShot, shotboardId), shotId);
    const hasOpenIssue = current.preflight.issues.some((item) => item.status === "open" && item.severity !== "optional");
    return replaceShotDirect(
        withShot,
        requiredShotboard(withShot, shotboardId),
        {
            ...current,
            blockers,
            preflight: {
                ...current.preflight,
                status: blockers.some((blocker) => blocker.severity === "error") || hasOpenIssue ? "needs-review" : "ready",
            },
        },
        now,
    );
}

function matchNamedAssets<T>({
    kind,
    records,
    text,
    explicitNames,
    primaryCharacterNames,
    preferred,
    selected,
    sources,
    issues,
    shotId,
}: {
    kind: "character" | "prop";
    records: VersionedRecord<T>[];
    text: string;
    explicitNames: string[];
    primaryCharacterNames: Set<string>;
    preferred: Set<string>;
    selected: ShotAssetBinding[];
    sources: ShotFieldSource[];
    issues: ShotPreflightIssue[];
    shotId: string;
}) {
    const names = new Set([
        ...explicitNames,
        ...records
            .map((record) => recordName(record))
            .filter((name) => name && (kind === "prop" ? propAliases(name).some((alias) => includesName(text, alias)) : includesName(text, name))),
    ]);
    names.forEach((name) => {
        const matches = rankedMatches(records, text, [name], preferred, kind);
        if (matches.length === 1) {
            if (!selected.some((item) => item.assetId === matches[0].id)) {
                selected.push(binding(matches[0], kind === "character" ? roleForCharacter(text, name) : "关键道具", ""));
            }
            sources.push(source(`${kind}Bindings.${matches[0].id}`, preferred.has(matches[0].id) ? "connected-asset" : explicitNames.includes(name) ? "dialogue" : "canvas-asset", matches[0].id, `${name} 名称精确匹配`));
        } else {
            issues.push(
                issue(
                    matches.length ? kind === "character" ? "ambiguous-character" : "ambiguous-asset" : kind === "character" ? "missing-character" : "missing-prop",
                    matches.length ? `${name} 匹配到多个资产，请确认` : `缺少${kind === "character" ? "人物" : "关键道具"}：${name}`,
                    kind === "character" && !primaryCharacterNames.has(normalizeName(name)) ? "review" : "blocking",
                    shotId,
                    kind,
                    name,
                    matches.map((item) => item.id),
                ),
            );
        }
    });
}

function shouldResolveAssetIssue(
    production: ProductionProject,
    issue: ShotPreflightIssue,
    match: ShotPreflightMatch,
) {
    if (issue.status !== "open" || !issue.suggestedName) return false;
    if ((issue.kind === "missing-character" || issue.kind === "ambiguous-character") && issue.assetKind === "character") {
        return match.characterBindings.some((binding) => bindingHasName(production.characters, binding, issue.suggestedName!));
    }
    if ((issue.kind === "missing-scene" || issue.kind === "ambiguous-asset") && issue.assetKind === "scene") {
        return Boolean(match.sceneBinding && bindingHasName(production.scenes, match.sceneBinding, issue.suggestedName));
    }
    if ((issue.kind === "missing-prop" || issue.kind === "ambiguous-asset") && issue.assetKind === "prop") {
        return match.propBindings.some((binding) => bindingHasName(production.props, binding, issue.suggestedName!));
    }
    return false;
}

function includeKnownIssueBindings(production: ProductionProject, shot: Shot, match: ShotPreflightMatch): ShotPreflightMatch {
    let characterBindings = [...match.characterBindings];
    const propBindings = [...match.propBindings];
    let sceneBinding = match.sceneBinding;
    const fieldSources = [...match.fieldSources];
    shot.preflight.issues
        .filter((issue) => issue.status === "open" && issue.suggestedName)
        .forEach((issue) => {
            if ((issue.kind === "missing-character" || issue.kind === "ambiguous-character") && issue.assetKind === "character") {
                const match = knownRecordByName(production, production.characters, issue.suggestedName!);
                if (match) {
                    characterBindings = characterBindings.filter(
                        (item) =>
                            !bindingHasName(production.characters, item, issue.suggestedName!) ||
                            (item.assetId === match.record.id && item.version === match.version),
                    );
                    if (!characterBindings.some((item) => item.assetId === match.record.id && item.version === match.version)) {
                        characterBindings.push(binding(match.record, "镜头人物", "", match.version));
                    }
                    fieldSources.push(source(`characterBindings.${match.record.id}`, "rule", match.record.id, `按缺失异常匹配已有角色：${issue.suggestedName}`));
                }
            }
            if ((issue.kind === "missing-scene" || issue.kind === "ambiguous-asset") && issue.assetKind === "scene" && !sceneBinding) {
                const match = knownRecordByName(production, production.scenes, issue.suggestedName!);
                if (match) {
                    sceneBinding = binding(match.record, "主场景", "", match.version);
                    fieldSources.push(source("sceneBinding", "rule", match.record.id, `按缺失异常匹配已有场景：${issue.suggestedName}`));
                }
            }
            if ((issue.kind === "missing-prop" || issue.kind === "ambiguous-asset") && issue.assetKind === "prop") {
                const match = knownRecordByName(production, production.props, issue.suggestedName!);
                if (match && !propBindings.some((binding) => binding.assetId === match.record.id)) {
                    propBindings.push(binding(match.record, "关键道具", "", match.version));
                    fieldSources.push(source(`propBindings.${match.record.id}`, "rule", match.record.id, `按缺失异常匹配已有道具：${issue.suggestedName}`));
                }
            }
        });
    return { ...match, characterBindings, sceneBinding, propBindings, fieldSources };
}

function knownRecordByName<T>(production: ProductionProject, records: VersionedRecord<T>[], name: string) {
    const target = normalizeName(name);
    const matches = records.flatMap((record) => {
        const versions = record.versions
            .filter((version) => normalizeName(dataName(version.data)) === target)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        return versions.length ? [{ record, version: versions[0].version, createdAt: versions[0].createdAt }] : [];
    });
    if (!matches.length) return undefined;
    const references = production.assetReferences
        .filter((reference) => matches.some((match) => match.record.id === reference.assetId && match.record.versions.some((version) => version.version === reference.assetVersion && normalizeName(dataName(version.data)) === target)))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    if (references.length) {
        const reference = references[0];
        return { record: matches.find((match) => match.record.id === reference.assetId)!.record, version: reference.assetVersion };
    }
    const latest = matches.sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    return { record: latest.record, version: latest.version };
}

function bindingHasName<T>(records: VersionedRecord<T>[], binding: ShotAssetBinding, name: string) {
    const record = records.find((item) => item.id === binding.assetId);
    const data = record?.versions.find((item) => item.version === binding.version)?.data;
    const recordNameValue = data && typeof data === "object" && "name" in data && typeof data.name === "string" ? data.name : "";
    return normalizeName(recordNameValue) === normalizeName(name);
}

function rankedMatches<T>(records: VersionedRecord<T>[], text: string, explicitNames: string[], preferred: Set<string>, kind: "character" | "scene" | "prop") {
    const explicit = new Set(explicitNames.map(normalizeName));
    const matches = records.filter((record) => {
        const recordNameValue = recordName(record);
        const name = normalizeName(recordNameValue);
        const aliases = kind === "prop" ? propAliases(recordNameValue) : [recordNameValue];
        return Boolean(name && (explicit.has(name) || aliases.some((alias) => includesName(text, alias))));
    });
    const preferredMatches = matches.filter((record) => preferred.has(record.id));
    return preferredMatches.length ? preferredMatches : matches;
}

function mergeUnlockedFields(shot: Shot, patch: ShotPreflightFields, locked: Set<string>): Partial<ShotEditableFields> {
    const result: Partial<ShotEditableFields> = {};
    Object.entries(patch).forEach(([key, value]) => {
        if (key === "characterBindings" || key === "sceneBinding" || key === "propBindings" || key === "dialogueCueIds" || key === "voiceoverCueIds") return;
        if (key === "framing" && value && typeof value === "object") {
            const framing = { ...shot.framing };
            Object.entries(value).forEach(([field, fieldValue]) => {
                if (!locked.has(`framing.${field}`)) (framing as Record<string, unknown>)[field] = fieldValue;
            });
            result.framing = framing;
            return;
        }
        if (!locked.has(key)) (result as Record<string, unknown>)[key] = value;
    });
    return result;
}

function applyAssetStates(match: ShotPreflightMatch, patch: ShotPreflightPatch): ShotPreflightMatch {
    const characters = match.characterBindings.map((item) => ({ ...item }));
    const props = match.propBindings.map((item) => ({ ...item }));
    let scene = match.sceneBinding ? { ...match.sceneBinding } : undefined;
    patch.assetMatches
        .filter((item) => item.confidence === "high")
        .forEach((asset) => {
            const target = asset.kind === "character" ? characters : asset.kind === "prop" ? props : scene ? [scene] : [];
            const existing = target.find((item) => item.assetId === asset.assetId);
            if (existing) {
                existing.role = asset.role;
                existing.state = asset.state;
            } else if (asset.kind === "scene") {
                scene = { assetId: asset.assetId, version: asset.version, role: asset.role, state: asset.state };
            } else {
                target.push({ assetId: asset.assetId, version: asset.version, role: asset.role, state: asset.state });
            }
        });
    return { ...match, characterBindings: characters, sceneBinding: scene, propBindings: props };
}

function validateAssetMatches(production: ProductionProject, patch: ShotPreflightPatch) {
    patch.assetMatches.forEach((item) => {
        const records = item.kind === "character" ? production.characters : item.kind === "scene" ? production.scenes : production.props;
        const record = records.find((candidate) => candidate.id === item.assetId);
        if (!record || !record.versions.some((version) => version.version === item.version)) {
            throw new Error(`AI 整理引用无效资产：${item.assetId} v${item.version}`);
        }
    });
}

function snapshot(shot: Shot): ShotEditableFields {
    return {
        narrativePurpose: shot.narrativePurpose,
        emotionalBeat: shot.emotionalBeat,
        informationGain: shot.informationGain,
        shotCategory: shot.shotCategory,
        framing: { ...shot.framing },
        startState: shot.startState,
        action: shot.action,
        endState: shot.endState,
        continuityNotes: [...shot.continuityNotes],
        characterBindings: shot.characterBindings.map((item) => ({ ...item })),
        sceneBinding: shot.sceneBinding ? { ...shot.sceneBinding } : undefined,
        propBindings: shot.propBindings.map((item) => ({ ...item })),
        dialogueCueIds: [...shot.dialogueCueIds],
        voiceoverCueIds: [...shot.voiceoverCueIds],
        soundCues: [...shot.soundCues],
        targetDurationMs: shot.targetDurationMs,
        editRelation: shot.editRelation,
    };
}

function replaceShotDirect(production: ProductionProject, shotboard: ShotboardRecord, shot: Shot, now: string): ProductionProject {
    return {
        ...production,
        shotboards: production.shotboards.map((item) =>
            item.id === shotboard.id
                ? { ...item, version: item.version + 1, shots: item.shots.map((current) => current.id === shot.id ? shot : current), updatedAt: now }
                : item,
        ),
    };
}

function requiredShotboard(production: ProductionProject, id: string) {
    const shotboard = production.shotboards.find((item) => item.id === id);
    if (!shotboard) throw new Error("分镜表不存在");
    return shotboard;
}

function requiredShot(shotboard: ShotboardRecord, id: string) {
    const shot = shotboard.shots.find((item) => item.id === id);
    if (!shot) throw new Error("镜头不存在");
    return shot;
}

function preserveValid<T>(bindings: ShotAssetBinding[], records: VersionedRecord<T>[]) {
    return bindings.filter((item) => validBinding(item, records)).map((item) => ({ ...item }));
}

function validBinding<T>(binding: ShotAssetBinding | undefined, records: VersionedRecord<T>[]) {
    return Boolean(binding && records.some((record) => record.id === binding.assetId && record.versions.some((item) => item.version === binding.version)));
}

function binding<T>(record: VersionedRecord<T>, role: string, state: string, version = record.currentVersion): ShotAssetBinding {
    return { assetId: record.id, version, role, state };
}

function source(fieldPath: string, sourceKind: ShotFieldSource["source"], sourceId: string, reason: string): ShotFieldSource {
    return { fieldPath, source: sourceKind, sourceId, confidence: "high", reason };
}

function issue(
    kind: ShotPreflightIssue["kind"],
    message: string,
    severity: ShotPreflightIssue["severity"],
    shotId: string,
    assetKind?: ShotAssetKind,
    suggestedName?: string,
    candidateAssetIds?: string[],
): ShotPreflightIssue {
    return {
        id: `${shotId}:${kind}:${normalizeName(suggestedName || message)}`,
        kind,
        severity,
        message,
        shotIds: [shotId],
        assetKind,
        suggestedName,
        candidateAssetIds,
        prompt: suggestedName ? defaultPrompt(assetKind, suggestedName) : undefined,
        status: "open",
    };
}

function defaultPrompt(kind: ShotAssetKind | undefined, name: string) {
    const label = kind === "character" ? "人物设定卡" : kind === "scene" ? "无人物场景参考图" : "关键道具设定图";
    return {
        positivePrompt: `${name}，${label}，AI 漫剧生产参考，正交清晰构图，外观和状态可重复复现`,
        negativePrompt: "文字，水印，模糊，变形，多余主体，现代无关元素",
        recommendedRatio: kind === "character" ? "3:2" : kind === "scene" ? "16:9" : "1:1",
    };
}

function dedupeIssues(issues: ShotPreflightIssue[]) {
    return Array.from(new Map(issues.map((item) => [item.id, item])).values());
}

function mergeSources(current: ShotFieldSource[], next: ShotFieldSource[]) {
    return Array.from(new Map([...current, ...next].map((item) => [item.fieldPath, item])).values());
}

function recordName<T>(record: VersionedRecord<T>) {
    const data = record.versions.find((item) => item.version === record.currentVersion)?.data;
    return dataName(data);
}

function dataName(data: unknown) {
    return data && typeof data === "object" && "name" in data && typeof data.name === "string" ? data.name : "";
}

function normalizeName(value: string) {
    return value.replace(/[\s·・._\-:：,，。'"“”‘’]/g, "").toLowerCase();
}

function includesName(text: string, name: string) {
    const normalized = normalizeName(text);
    const target = normalizeName(name);
    return Boolean(target.length >= 2 && normalized.includes(target));
}

function roleForCharacter(text: string, name: string) {
    return normalizeName(text).startsWith(normalizeName(name)) ? "当前动作主体" : "镜头人物";
}

function detectNamedCharacters(text: string, knownNames: string[], speakers: string[]) {
    const usableNames = knownNames.filter((name) => !isInvalidCharacterCandidate(name));
    const candidates = new Set([...speakers.filter((name) => !isInvalidCharacterCandidate(name)), ...usableNames.filter((name) => includesName(text, name))]);
    const known = new Set(usableNames.filter(Boolean));
    const ignored = new Set(["宾客甲", "宾客乙", "弟子甲", "弟子乙", "路人", "众人", "宾客", "弟子", "画外音", "旁白"]);
    return Array.from(candidates).filter(
        (name) =>
            name.length >= 2 &&
            !ignored.has(name) &&
            !isInvalidCharacterCandidate(name) &&
            (!Array.from(known).some((knownName) => knownName !== name && name.includes(knownName)) || known.has(name)),
    );
}

function propAliases(name: string) {
    const base = name.trim();
    const core = base.replace(/^(?:旧|古|祖传|订亲|黑色|幽紫色|金色|银色|神秘|破碎|完整|染血)/, "");
    return core.length >= 2 && core !== base ? [base, core] : [base];
}

function allAssetVersions(production: ProductionProject) {
    return [...production.characters, ...production.scenes, ...production.props].map((item) => ({ assetId: item.id, version: item.currentVersion }));
}
