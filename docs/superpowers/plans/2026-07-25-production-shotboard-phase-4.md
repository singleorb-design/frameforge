# Production Shotboard Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task.

**Goal:** Complete the external-production loop with candidate upload/review, continuity checks, episode readiness, Jianying execution sheets, subtitles/audio cue sheets, and a standard ZIP production package.

**Constraints**

- Upload/import videos only; no generation API.
- No private Jianying draft format.
- Candidate upload does not imply approval.
- Approved candidate records in/out trim and edit notes.
- Continuity checks are deterministic rules plus manual acknowledgement.
- ZIP contains only existing local media and transparent issues for missing files.
- Reuse current file storage, image storage, zip helper, file-saver.
- No new dependencies or build/typecheck/tests.

## Task 1: Candidate Domain

- Extend Shot with `candidates`, `approvedCandidateId`, edit directives.
- Candidate: storageKey/file metadata/source task/version/status/review/in/out/target duration/edit notes.
- Pure module `shot-candidates.ts`: add, review, approve, reject, select trim.
- Approve validates source task, duration and trim, sets candidate approved and shot edit-ready.
- Any later shot/task change marks approved candidate stale and returns candidate-review.

## Task 2: Candidate UI

- Add 候选验收 tab to workbench.
- Upload mp4/mov via current `uploadMediaFile`.
- Native video preview.
- Review checklist: identity, scene, prop, start/end, action, camera, artifacts, continuity.
- Approve/reject; set in/out seconds, target duration, speed/freeze/crop/interpolation notes.
- Pin approved candidate to canvas Video node, deduplicated.

## Task 3: Continuity Rules

- Pure `continuity-validator.ts`.
- Compare adjacent shots in scene and across scene boundary.
- Rules: character bindings/version/state, prop owner/state, scene/time, screen direction, edit relation, previous end vs next start keywords, dialogue continuity.
- Findings warning/error/acknowledged with IDs.
- Store episode continuity findings in Shotboard; acknowledge warning; errors block final package.
- Add continuity view in episode board.

## Task 4: Episode Production Board

- Full-screen shotboard workbench separate from Markdown reader.
- Group shots by scene, status/mode/readiness/blockers.
- Filters for pending plan/assets/task/candidate/edit-ready/blocked.
- Summary counts, estimated duration, missing approved clips, stale tasks, continuity issues.
- Export work package allowed with issues; final package gated.

## Task 5: Jianying Execution Artifacts

- Pure renderers:
  - `jianying-edit-plan.csv`
  - `dialogue-voiceover.md`
  - `subtitles.srt`
  - `audio-cue-sheet.csv`
  - `issues.md`
  - `manifest.json`
- CSV escaping and SRT timestamp helpers.
- Timeline order uses scene/shot order.
- Dialogue/voiceover timing allocated within approved trim; flag overflow.
- Include edit notes, speed/freeze/crop/interpolation, transition, grading notes.

## Task 6: Standard ZIP Package

- `production-package.ts` uses existing `createZip`.
- Work package: always exports and writes issues.
- Jimeng package: published non-stale task sheets + control assets.
- Final edit package: requires approved candidate for all shots and no error continuity findings.
- Include shotboard JSON/MD/CSV, tasks, control frames, selected clips, edit plan, dialogue, SRT, audio cue, issues.
- Stable filenames `ep01-sc06-sh025-approved-v001.mp4`.
- Missing local blob becomes issues entry; never silently omit.
- Download through file-saver.

## Task 7: Docs and Final Review

- Changelog and pending-test.
- Remove production TODO or replace with post-V1 followups.
- Static review all four phases, no video generation imports in production workflow.
- `git diff --check`, cumulative diff, trailers.

## Manual Acceptance

1. Upload multiple Jimeng candidate videos.
2. Review/reject/approve and set trim.
3. Pin approved video to canvas.
4. Run continuity checks and acknowledge warnings.
5. Open episode board and inspect readiness.
6. Export work package with incomplete issues.
7. Complete all shots and export final package.
8. Open ZIP and verify actual videos/control frames plus JSON/MD/CSV/SRT.
9. Follow Jianying edit plan to produce a rough cut.
10. Confirm no private draft and no video generation call.
