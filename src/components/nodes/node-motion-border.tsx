import { useEffect, useRef } from "react";
import type { TargetFrame } from "@/animation/runtime";
import { scenarioRuntime } from "@/animation/runtime-instance";

interface NodeMotionStyle {
  setProperty(name: string, value: string): void;
  removeProperty(name: string): void;
}

export interface NodeMotionElement {
  style: NodeMotionStyle;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export interface NodeMotionRuntimeSource {
  subscribeTarget(
    targetId: string,
    listener: (frame: TargetFrame) => void
  ): () => void;
}

const colorsOf = (frame: TargetFrame): [string, string] => {
  const colors = frame.clips[0]?.clip.effect.params.colors;
  return Array.isArray(colors) &&
    typeof colors[0] === "string" &&
    typeof colors[1] === "string"
    ? [colors[0], colors[1]]
    : ["#ffaa40", "#9c40ff"];
};

const clearNodeMotion = (element: NodeMotionElement) => {
  element.removeAttribute("data-motion-active");
  element.style.setProperty("--node-flow-opacity", "0");
};

export function applyNodeMotionTargetFrame(
  element: NodeMotionElement,
  frame: TargetFrame
) {
  const active = frame.clips.find(
    (item) =>
      item.clip.effect.type === "node.border-beam" && item.timing.active
  );
  if (frame.clear || !active) {
    clearNodeMotion(element);
    return;
  }

  const [start, end] = colorsOf({ ...frame, clips: [active] });
  const progress = active.timing.progress;
  const opacity = Math.min(1, progress * 6, (1 - progress) * 6);
  element.setAttribute("data-motion-active", "true");
  element.style.setProperty(
    "--node-flow-position",
    `${120 - progress * 140}%`
  );
  element.style.setProperty("--node-flow-opacity", String(opacity));
  element.style.setProperty("--node-flow-start", start);
  element.style.setProperty("--node-flow-end", end);
}

export function NodeMotionBorder({
  nodeId,
  runtime = scenarioRuntime,
}: {
  nodeId: string;
  runtime?: NodeMotionRuntimeSource;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const unsubscribe = runtime.subscribeTarget(nodeId, (frame) =>
      applyNodeMotionTargetFrame(element, frame)
    );
    return () => {
      unsubscribe();
      clearNodeMotion(element);
    };
  }, [nodeId, runtime]);

  return (
    <div
      ref={ref}
      className="nv-node-motion-border"
      aria-hidden="true"
    />
  );
}
