# Stage 1 Animation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class Animation mode for Stage 1 connection-animation authoring and deterministic playback without changing the approved editor density or introducing the Stage 2 timeline.

**Architecture:** Store one versioned scenario document with each page, but keep playback state in a separate non-persisted runtime. A single monotonic clock evaluates enabled edge clips and notifies only mounted target renderers. Every SVG effect receives the exact XYFlow `edgePath`, while the base edge, motion overlay, interaction path, and label remain separate layers.

**Tech Stack:** React 19, TypeScript, Zustand/zundo, XYFlow, Bun test, Vite, SVG, IndexedDB persistence.

---

## Permanent Stage 1 boundaries

- Transport time, active preview scope, loop iteration, and reduced-motion overrides never enter `useFlowStore`, IndexedDB, project JSON, or undo history.
- Authored scenario data is page-owned and participates in save/load, undo, duplication, deletion, clear, and page switching.
- `WorkMode` is `design | animation | preview`. Design retains static diagram editing and never plays motion; Animation owns scenario authoring and explicit playback; Preview is read-only and autoplays the page default only when resolved motion preferences allow it.
- Effects reuse the exact `edgePath`; no DOM-derived path reconstruction is allowed.
- Unknown effect types and parameters round-trip unchanged and render the base edge only.
- Stage 1 does not add a timeline drawer, marker/trigger behavior, node or camera animation, paired request/response tracks, or video export.

## Task 1: Add the authored scenario document and pure helpers

**Files:**

- Create: `src/animation/model.ts`
- Create: `src/animation/scenario-document.ts`
- Create: `tests/scenario-document.test.ts`

- [ ] Write failing tests for empty documents, default scenario creation, five known presets, unknown-effect preservation, target cloning/pruning, and `none | uniform | mixed` field summaries.
- [ ] Run `bun test tests/scenario-document.test.ts` and confirm the new module import fails.
- [ ] Add open JSON contracts. Keep effect types open strings:

```ts
export interface PageScenarioDocumentV1 {
  schemaVersion: 1;
  scenarios: ScenarioV1[];
  defaultScenarioId: string | null;
}

export interface ScenarioClipV1 {
  id: string;
  startMs: number;
  durationMs: number;
  easing: string;
  repeatCount: number | "infinite";
  repeatDelayMs: number;
  effect: { type: string; params: JsonObject };
}

export type FieldState<T> =
  | { status: "none" }
  | { status: "uniform"; value: T }
  | { status: "mixed" };
```

- [ ] Implement immutable `applyEdgeEffect`, `patchEdgeEffects`, `removeEdgeEffects`, `cloneScenarioTargets`, `pruneScenarioTargets`, and mixed-field helpers. Timing edits update existing clips only.
- [ ] Run the focused test and `bun run build`.
- [ ] Commit as `Add page-owned animation scenarios`.

## Task 2: Add snapshot v2 and legacy migration

**Files:**

- Create: `src/animation/snapshot-migrations.ts`
- Modify: `src/lib/storage.ts`
- Create: `tests/snapshot-migration.test.ts`
- Create: `tests/storage.test.ts`

- [ ] Write failing tests for active and inactive page migration, finite/invalid legacy speed, no empty timeline for unanimated pages, preservation of Turbo/base appearance, deterministic generated IDs, v2 unknown-effect round trips, and unsupported version rejection.
- [ ] Run `bun test tests/snapshot-migration.test.ts tests/storage.test.ts` and confirm failures.
- [ ] Introduce `FlowSnapshotV2` and pure `createFlowSnapshot`, `parseFlowSnapshot`, and `migrateFlowSnapshotV1` functions.
- [ ] Convert each `edge.animated === true` to a moving-dash clip in a generated default scenario whose duration is `round(animationSpeed * 1000)` or `800`, then clear the legacy flag so CSS cannot double-animate it.
- [ ] Preserve the existing IndexedDB storage key, but move Zustand persistence to version 2 through a pure migrate callback.
- [ ] Run focused tests and `bun run build`.
- [ ] Commit as `Migrate animation data to snapshot v2`.

## Task 3: Add deterministic timing and one central runtime

**Files:**

- Create: `src/animation/timing.ts`
- Create: `src/animation/clock.ts`
- Create: `src/animation/runtime.ts`
- Create: `tests/animation-timing.test.ts`
- Create: `tests/animation-clock.test.ts`
- Create: `tests/animation-runtime.test.ts`

- [ ] Write failing tests for exact start/end boundaries, repeat-delay gaps, forward/reverse/bidirectional/ping-pong phase, sparse versus dense frame equivalence, pause/resume anchoring, seek, rate, missed-loop jumps, one scheduled RAF, target-only notification, and cleanup.
- [ ] Run the three focused tests and confirm missing-module failures.
- [ ] Calculate time from anchors, never accumulated deltas:

```ts
timelineMs = timelineAnchorMs
  + (frameTimestampMs - monotonicAnchorMs) * playbackRate * direction;
```

- [ ] Expose transport snapshots through a throttled external subscription and frame values through target-specific subscriptions. Notify an exiting target once to clear its projection.
- [ ] Add `play`, `pause`, `restart`, `seek`, `setPlaybackRate`, `setDirection`, `stop`, `activate`, and `destroy`. Keep the module independent from React and Zustand.
- [ ] Run focused tests and `bun run build`.
- [ ] Commit as `Add deterministic scenario playback`.

## Task 4: Render all five effects on the shared edge path

**Files:**

- Create: `src/animation/edge-effects.ts`
- Create: `src/components/edges/edge-motion-layer.tsx`
- Modify: `src/components/edges/labeled-edge.tsx`
- Modify: `src/index.css`
- Create: `tests/edge-effects.test.ts`
- Create: `tests/edge-motion-layer.test.tsx`

- [ ] Write failing projection tests for moving dash, gradient beam, packet, pulse, particles, clamped known params, bidirectional phases, particle count caps, unique gradient IDs, unknown-effect base-only rendering, and exact overlay/base `d` equality.
- [ ] Run the two focused tests and confirm failures.
- [ ] Render layers in this order: base path, pointer-inert motion paths, explicit interaction path, label. Forward existing marker and style props.
- [ ] Add stable hooks: `data-edge-layer="base|motion|interaction"`, `data-effect-type`, `data-motion-preset`, `data-motion-state`, and `data-edge-id`.
- [ ] Use normalized `pathLength="1"`; never call `getPointAtLength()` per particle per frame. Motion overlay refs subscribe directly to runtime target frames.
- [ ] Remove the legacy `.animated` playback rule while preserving Turbo as a static edge style.
- [ ] Run focused tests and `bun run build`.
- [ ] Commit as `Render scenario edge effects`.

## Task 5: Integrate scenarios with the document lifecycle

**Files:**

- Modify: `src/store/flow-store.ts`
- Modify: `src/components/canvas.tsx`
- Modify: `src/components/toolbar.tsx`
- Modify: `src/App.tsx`
- Create: `tests/flow-store-scenarios.test.ts`

- [ ] Write failing tests for page-owned scenario swapping, effect-edit undo/redo, edge/node duplication with remapped fresh track and clip IDs, deletion pruning, clear/undo, full load replacement, and page/load/clear transport reset.
- [ ] Run `bun test tests/flow-store-scenarios.test.ts` and confirm failures.
- [ ] Add `scenarioDocument` to active state and every `PageContent`; use factories so arrays are never shared between pages.
- [ ] Add authored actions for applying, patching, and removing selected-edge effects. Include `scenarioDocument` in zundo partialization and equality.
- [ ] Centralize graph deletion so incident edges and matching tracks are pruned atomically; intercept XYFlow deletion instead of allowing a second removal path.
- [ ] Save v2 through `createFlowSnapshot`; load through a history-resetting full replacement. Stop/reset transport on load, page switch, active-page deletion, clear, and Preview exit.
- [ ] Run focused tests, `bun test`, and `bun run build`.
- [ ] Commit as `Integrate scenarios with project state`.

## Task 6: Add Animation mode, compact authoring, and playback controls

**Files:**

- Modify: `src/components/canvas-options.tsx`
- Modify: `src/components/inspector.tsx`
- Create: `src/components/playback-controls.tsx`
- Modify: `src/components/canvas-toolbar.tsx`
- Modify: `src/components/settings-dialog.tsx`
- Modify: `src/store/flow-store.ts`

- [ ] Add component tests or pure selector tests first for `none | uniform | mixed` values and one-update multi-selection broadcasts.
- [ ] Add `animation` to the mode switcher. Design retains the current static edge appearance controls; Animation shows Animation preset, direction, duration, delay, `Preview selection`, and a collapsed Advanced disclosure. Selecting None removes clips.
- [ ] Show `Mixed` or `—` without inventing fallback values. A timing edit must not silently animate an unanimated edge.
- [ ] Add `PlaybackControls` with play/pause, restart, seek, rate, loop, reverse, semantic labels, and keyboard handling that ignores interactive/editable elements.
- [ ] Only playback controls subscribe to transport time; Canvas and Inspector must not subscribe to frame ticks.
- [ ] Add persisted `System | Full | Reduced` motion preference, excluded from project JSON and undo.
- [ ] Run focused tests, `bun test`, and `bun run build`.
- [ ] Commit as `Add animation authoring controls`.

## Task 7: Separate Design, Animation, and Preview lifecycles

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/components/canvas.tsx`
- Modify: `src/components/toolbar.tsx`
- Modify: `src/index.css`

- [ ] Enter Animation through a lifecycle action that activates the page default scenario but stays stopped until explicit playback; leaving it stops/resets transport.
- [ ] Enter Preview through a lifecycle action that clears selection and autoplays the default scenario only when motion is allowed.
- [ ] In Preview disable dragging, connecting, selection, focus mutation, deletion, copy/paste, and undo; retain pan/zoom, visible non-empty labels, transport, and `Exit preview`.
- [ ] Resolve system reduced motion with `matchMedia`; pause at zero and disable autoplay/loop unless the explicit in-app override enables motion.
- [ ] Add Space play/pause, Home restart, and Escape exit without intercepting inputs, buttons, selects, dialogs, menus, or editable content.
- [ ] Run `bun test`, `bun run build`, and `git diff --check`.
- [ ] Commit as `Make Preview scenario-aware`.

## Task 8: Browser verification and final review

**Files:**

- Modify only defects proven by browser testing, with a failing regression test before each fix.

- [ ] Reuse an existing port 8888 server when present; do not kill it. Otherwise start the repo server once.
- [ ] Create a graph with at least two differently oriented connections and validate all five presets.
- [ ] Assert every motion path `d` equals its base path before and after node move, pan, zoom, resize, and selection.
- [ ] Verify Design exposes only static diagram options and never plays; Animation exposes scenario options and deterministic selection preview/play/pause/restart/seek/rate/reverse/loop.
- [ ] Verify multi-selection shows Mixed and broadcasts a chosen field to all selected edges.
- [ ] Verify Preview removes authoring controls, preserves labels/pan/zoom/transport, blocks mutations, and exits with Escape.
- [ ] Verify reduced-motion default and explicit override, desktop and narrow viewport layouts, dark and light themes, browser logs, and screenshots.
- [ ] Run final `bun test`, `bun run build`, `git diff --check`, and `git status --short --branch`.
- [ ] Request a final code review and commit browser-proven fixes in small subject-only commits.

## Completion criteria

- Every Stage 1 bullet and every Next-session Handoff permanent constraint has a test or browser assertion.
- No frame tick changes the flow-store state, undo stack, edge-array identity, or persistence queue.
- The working tree is clean on `v2`, every new commit is signed and scoped, and no Stage 2 surface is present.
