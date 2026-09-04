import { afterEach, describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import type { ScenarioV1 } from "../src/animation/model";
import { createEmptyScenarioDocument } from "../src/animation/scenario-document";
import { scenarioRuntime } from "../src/animation/runtime-instance";
import {
  PlaybackControls,
  resolvePlaybackShortcut,
} from "../src/components/playback-controls";
import { useFlowStore, type WorkMode } from "../src/store/flow-store";

const scenario = (): ScenarioV1 => ({
  id: "scenario-playback-controls",
  name: "Playback controls",
  durationMs: 12_500,
  playback: {
    rate: 1,
    loop: { mode: "none", startMs: 0, endMs: 12_500 },
  },
  tracks: [],
  markers: [],
  triggers: [],
});

const shortcutEvent = (
  key: string,
  target: Record<string, unknown> | null = null
) =>
  ({
    key,
    code: key === " " ? "Space" : key,
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target,
  }) as unknown as KeyboardEvent;

const renderControls = (controls: ReactNode) =>
  renderToStaticMarkup(
    <ReactFlowProvider>{controls}</ReactFlowProvider>
  );

describe("PlaybackControls", () => {
  afterEach(() => {
    useFlowStore.setState({ workMode: "design" });
    scenarioRuntime.stop();
  });

  test("renders a compact sidebar player without a confusing total timeline", () => {
    useFlowStore.setState({ workMode: "animation", motionPreference: "full" });
    scenarioRuntime.activate("page-playback-controls", scenario());
    scenarioRuntime.seek(2_500);

    const markup = renderControls(<PlaybackControls />);

    expect(markup).toContain('role="toolbar"');
    expect(markup).toContain('aria-label="Animation playback"');
    expect(markup).toContain('aria-label="Play animation"');
    expect(markup).toContain('aria-label="Restart animation"');
    expect(markup).toContain('aria-label="Playback speed"');
    expect(markup).toContain('aria-label="Playback rate 1x"');
    expect(markup).not.toContain("Continuous");
    expect(markup).not.toContain('aria-label="Playback position"');
    expect(markup).not.toContain("0:02.5");
    expect(markup).not.toContain("0:12.5");
    expect(markup).not.toContain('aria-label="Reverse playback"');
  });

  test("offers an explicit override while reduced motion blocks playback", () => {
    useFlowStore.setState({
      workMode: "animation",
      motionPreference: "reduced",
    });
    scenarioRuntime.activate("page-playback-controls", scenario());

    const markup = renderControls(
      <PlaybackControls motionPreference="reduced" />
    );
    expect(markup).toContain("Reduced motion is on");
    expect(markup).toContain("Enable motion");
    expect(markup).toContain('aria-label="Enable full motion"');
  });

  test("maps Space and Home only in playback-capable modes", () => {
    for (const mode of ["animation", "video", "preview"] satisfies WorkMode[]) {
      expect(resolvePlaybackShortcut(shortcutEvent(" "), mode)).toBe(
        "toggle-playback"
      );
      expect(resolvePlaybackShortcut(shortcutEvent("Home"), mode)).toBe(
        "restart"
      );
    }

    expect(resolvePlaybackShortcut(shortcutEvent(" "), "design")).toBeNull();
    expect(
      resolvePlaybackShortcut(shortcutEvent("Home"), "design")
    ).toBeNull();
    expect(
      resolvePlaybackShortcut(shortcutEvent("ArrowRight"), "animation")
    ).toBeNull();
  });

  test("does not intercept shortcuts from interactive or editable targets", () => {
    for (const tagName of ["INPUT", "SELECT", "TEXTAREA", "BUTTON"]) {
      expect(
        resolvePlaybackShortcut(shortcutEvent(" ", { tagName }), "animation")
      ).toBeNull();
    }

    expect(
      resolvePlaybackShortcut(
        shortcutEvent("Home", { tagName: "DIV", isContentEditable: true }),
        "preview"
      )
    ).toBeNull();
    expect(
      resolvePlaybackShortcut(
        shortcutEvent(" ", {
          tagName: "SPAN",
          closest: () => ({ tagName: "BUTTON" }),
        }),
        "animation"
      )
    ).toBeNull();
  });

  test("ignores repeated or modified shortcuts", () => {
    expect(
      resolvePlaybackShortcut(
        { ...shortcutEvent(" "), repeat: true } as KeyboardEvent,
        "animation"
      )
    ).toBeNull();
    expect(
      resolvePlaybackShortcut(
        { ...shortcutEvent("Home"), metaKey: true } as KeyboardEvent,
        "preview"
      )
    ).toBeNull();
  });

  test("starts the runtime after the delayed Video launch", async () => {
    const source = await testFile(
      new URL("../src/components/playback-controls.tsx", import.meta.url)
    ).text();

    expect(source).toContain("scenarioRuntime.restart()");
    expect(source).toContain("scenarioRuntime.play()");
  });

  test("rebuilds Video playback with all configured delays", async () => {
    const source = await testFile(
      new URL("../src/components/playback-controls.tsx", import.meta.url)
    ).text();

    expect(source).toContain("videoStartDelayMs");
    expect(source).toContain("videoBetweenDelayMs");
    expect(source).toContain("videoEndDelayMs");
    expect(source).toContain("betweenMs: videoBetweenDelayMs");
    expect(source).toContain("endMs: videoEndDelayMs");
    expect(source).toContain("videoStartDelayMs,");
  });

  test("plays a scheduled template preview without rebuilding it sequentially", async () => {
    const controlsModule = (await import(
      "../src/components/playback-controls"
    )) as typeof import("../src/components/playback-controls") & {
      prepareAllConnections?: () => void;
    };
    useFlowStore.setState({
      nodes: [],
      edges: [],
      scenarioDocument: createEmptyScenarioDocument(),
      activePageId: "page-playback-controls",
    });
    useFlowStore
      .getState()
      .insertTemplate("sharded-postgres-platform", { x: 0, y: 0 });
    useFlowStore.getState().setWorkMode("animation");
    const scheduledPreviewId =
      useFlowStore.getState().scenarioDocument.defaultScenarioId;

    expect(typeof controlsModule.prepareAllConnections).toBe("function");
    controlsModule.prepareAllConnections?.();

    expect(scenarioRuntime.getTransportSnapshot().scenarioId).toBe(
      scheduledPreviewId
    );
  });

  test("keeps the chosen playback speed when preparing a template preview", async () => {
    const controlsModule = (await import(
      "../src/components/playback-controls"
    )) as typeof import("../src/components/playback-controls") & {
      prepareAllConnections?: () => void;
    };
    useFlowStore.setState({
      nodes: [],
      edges: [],
      scenarioDocument: createEmptyScenarioDocument(),
      activePageId: "page-playback-controls",
    });
    useFlowStore
      .getState()
      .insertTemplate("sharded-postgres-platform", { x: 0, y: 0 });
    useFlowStore.getState().setWorkMode("animation");
    scenarioRuntime.setPlaybackRate(2);

    controlsModule.prepareAllConnections?.();

    expect(scenarioRuntime.getTransportSnapshot().playbackRate).toBe(2);
  });
});
