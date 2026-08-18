# Character Visual Asset Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a reusable AI comic-drama character visual asset pack from a character card.

**Architecture:** Add a `CharacterAssetGroup` root node that acts as both generation task and collapsible asset pack. Generate the three-view image first, then use it as the reference image for the expression grid and shot-scale reference images. Store each result as a normal image node connected to the asset-pack root.

**Tech Stack:** Vite, React, TypeScript, Ant Design, Tailwind, existing image generation/edit APIs and local image storage.

## Global Constraints

- Page copy stays Chinese.
- Three-view generation must happen before dependent assets.
- Expression grid and shot-scale reference must use the generated three-view as reference.
- Do not implement LoRA, consistency scoring, auto-cropping, or separate front/side/back files.
- Do not add cloud storage or a new state system.

---

## Tasks

- [ ] Add character asset-group metadata and node defaults.
- [ ] Add character-card toolbar action and task options dialog.
- [ ] Generate three-view, expression grid, and shot-scale reference sequentially.
- [ ] Create image child nodes and root-to-child connections.
- [ ] Add asset-pack expand/collapse behavior aligned with image batches.
- [ ] Update docs and run focused verification.
