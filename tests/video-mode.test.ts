import { describe, expect, test } from "bun:test";

describe("Video mode camera follow", () => {
  test("keeps chrome removal stationary and starts camera motion with playback", async () => {
    const canvasSource = await Bun.file(
      new URL("../src/components/canvas.tsx", import.meta.url)
    ).text();
    const controlsSource = await Bun.file(
      new URL("../src/components/playback-controls.tsx", import.meta.url)
    ).text();

    expect(controlsSource).toContain("stageVideoPresentationViewport");
    expect(controlsSource).toContain("getViewport()");
    expect(controlsSource).toContain('setWorkMode("preview", "video")');
    expect(canvasSource).toContain("takeVideoPresentationViewport");
    expect(canvasSource).toContain("preserveVideoPresentationViewport");
    expect(canvasSource).toContain(
      'const isVideoPresentation = isPreview && previewIntent === "video";',
    );
    expect(canvasSource).toContain("useLayoutEffect");
    expect(canvasSource).not.toContain("const staging = animate");
    expect(canvasSource).toContain("cameraTransition = animate");
  });

  test("renders the active animation name through a compositor camera", async () => {
    const source = await Bun.file(
      new URL("../src/components/canvas.tsx", import.meta.url)
    ).text();
    const packageJson = await Bun.file(
      new URL("../package.json", import.meta.url)
    ).json();

    expect(source).toContain("data-video-animation-name");
    expect(source).toContain("getActiveAnimationName");
    expect(source).toContain("videoTitle.trim()");
    expect(source).toContain("getActiveScenario");
    expect(source).not.toContain("Now playing");
    expect(packageJson.dependencies.motion).toBeString();
    expect(source).toContain('from "motion"');
    expect(source).not.toContain("requestAnimationFrame");
    expect(source).not.toContain("advanceVideoCameraMotion");
    expect(source).not.toContain("getActiveTargetFrames");
    expect(source).not.toContain("springValue");
    expect(source).not.toContain("motionValue");
    expect(source).toContain("videoViewportTransform");
    expect(source).toContain("subscribeTransport(syncCameraPlayback)");
    expect(source).toContain("viewportElement.style.transform = transform");
    expect(source).toContain("enabled={isVideoPresentation}");
    expect(source).toContain("panOnScroll={!isVideoPresentation}");
    expect(source).toContain("zoomOnScroll={!isVideoPresentation}");
    expect(source).toContain("onlyRenderVisibleElements={!renderAll && !isVideoPresentation}");
    expect(source).toContain("defaultViewport={savedViewport ?? undefined}");
    expect(source).toContain("onMoveEnd={persistViewport}");
    expect(source).not.toContain("void setViewport(nextViewport)");
    expect(source).toContain("void setViewport(returnViewport)");
    expect(source).not.toContain("void setViewport(lastViewport)");
    expect(source).toContain("useFlowStore.persist.onFinishHydration");
    expect(source).toContain("duration: 1.2");
    expect(source).not.toContain("smoothVideoFocusPoint");
    expect(source).not.toContain("cameraMoveDurationMs");
    expect(source).not.toContain("setCenter");
    expect(source).not.toContain("duration: 500");
  });

  test("keeps the Video title visible when camera follow is disabled", async () => {
    const source = await Bun.file(
      new URL("../src/components/canvas.tsx", import.meta.url)
    ).text();

    expect(source).toContain("videoCameraFollowEnabled");
    expect(source).toContain("followEnabled={videoCameraFollowEnabled}");
    expect(source).toContain("!followEnabled ||");
  });
});
