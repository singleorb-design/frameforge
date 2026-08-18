# Character Card Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add script-driven batch generation of main character cards as a collapsible character-card group.

**Architecture:** Add two built-in node types: `CharacterGroup` and `CharacterCard`. Trigger generation from script-node toolbar, gather options in a modal, call the existing text model, parse strict JSON, and create one root group plus child card nodes. Reuse existing canvas metadata and visibility patterns for root/child ownership while keeping character-specific layout separate from image batch sizing.

**Tech Stack:** Vite, React, TypeScript, Ant Design, Tailwind, Zustand, existing text generation API.

## Global Constraints

- Page copy stays Chinese.
- Generate only main character cards, not all mentioned people.
- Do not generate three-view images in this feature.
- Do not add cloud sync or separate storage.
- Do not add a new state-management system.
- Do not run syntax checks, builds, or tests after coding; project AGENTS says the user will do that.

---

## Tasks

- [ ] Add character group/card metadata fields and node defaults.
- [ ] Add built-in renderers for character group and character card.
- [ ] Add script toolbar action and options modal.
- [ ] Implement JSON prompt/call/parser and create root/child nodes with connections.
- [ ] Add expand/collapse visibility for character groups.
- [ ] Update docs and run focused source inspections.
