import { useEffect, useRef } from "react";
import type { EdgeEffectProjection } from "../../animation/edge-effects";
import { projectEdgeEffect } from "../../animation/edge-effects";
import { scenarioRuntime } from "../../animation/runtime-instance";
import type { TargetFrame } from "../../animation/runtime";

export type EdgeMotionState = "stopped" | "playing" | "paused";

export interface EdgeGradientVector {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface EdgeMotionRuntimeSource {
  subscribeTarget(
    targetId: string,
    listener: (frame: TargetFrame) => void
  ): () => void;
  getTransportSnapshot?(): { isPlaying: boolean };
}

export interface SvgAttributeTarget {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  getAttribute(name: string): string | null;
}

export interface EdgeMotionSlotElements {
  group: SvgAttributeTarget | null;
  gradient: SvgAttributeTarget | null;
  gradientStops: Array<SvgAttributeTarget | null>;
  paths: Array<SvgAttributeTarget | null>;
}

export interface EdgeMotionApplyContext {
  motionState: EdgeMotionState;
  gradientVector: EdgeGradientVector;
}

export interface EdgeMotionLayerProps {
  edgeId: string;
  edgePath: string;
  projection?: EdgeEffectProjection;
  motionState: EdgeMotionState;
  gradientVector?: EdgeGradientVector;
  runtime?: EdgeMotionRuntimeSource;
}

interface MotionPrimitive {
  role:
    | "moving-dash"
    | "beam-trail"
    | "beam-core"
    | "packet-tail"
    | "packet-core"
    | "pulse"
    | "particles";
  stroke: string;
  strokeWidth: number;
  opacity: number;
  dasharray?: string;
  dashoffset?: number;
  linecap?: "butt" | "round";
  particleCount?: number;
}

export const MAX_EDGE_EFFECT_SLOTS = 4;
export const MAX_EDGE_PRIMITIVES_PER_SLOT = 4;

const DEFAULT_GRADIENT_VECTOR: EdgeGradientVector = {
  x1: 0,
  y1: 0,
  x2: 1,
  y2: 0,
};

const idPart = (value: string) =>
  value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "edge";

const stableHash = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const gradientIdFor = (edgeId: string, effectId: string, slotIndex: number) =>
  `nv-edge-gradient-${idPart(edgeId)}-${idPart(effectId)}-${slotIndex}-${stableHash(
    `${edgeId}\0${effectId}\0${slotIndex}`
  )}`;

const boundedPhases = (
  projection: Extract<EdgeEffectProjection, { supported: true }>
) => projection.phases.slice(0, 2);

export function createEdgeMotionPrimitives(
  projection: Extract<EdgeEffectProjection, { supported: true }>,
  gradientId: string
): MotionPrimitive[] {
  const colors = projection.colors;
  const phases = boundedPhases(projection);

  switch (projection.preset) {
    case "moving-dash":
      return phases.map((phase) => ({
        role: "moving-dash",
        stroke: colors[0],
        strokeWidth: projection.widthPx,
        opacity: projection.opacity,
        dasharray: `${projection.dashLengthPx}px ${projection.gapLengthPx}px`,
        dashoffset: 1 - phase,
        linecap: "round",
      }));

    case "gradient-beam": {
      const trailLength = projection.trailLengthRatio;
      const coreLength = Math.max(0.01, trailLength * 0.35);
      return phases.flatMap((phase) => [
        {
          role: "beam-trail" as const,
          stroke: `url(#${gradientId})`,
          strokeWidth: projection.widthPx * 2,
          opacity: projection.opacity * 0.35,
          dasharray: `${trailLength} ${1 - trailLength}`,
          dashoffset: 1 - phase,
          linecap: "round" as const,
        },
        {
          role: "beam-core" as const,
          stroke: `url(#${gradientId})`,
          strokeWidth: projection.widthPx,
          opacity: projection.opacity,
          dasharray: `${coreLength} ${1 - coreLength}`,
          dashoffset: 1 - phase,
          linecap: "round" as const,
        },
      ]);
    }

    case "packet": {
      const coreLength = projection.packetLengthRatio;
      const tailLength = Math.min(0.4, Math.max(0.08, coreLength * 4));
      const sizePx = projection.sizePx;
      return phases.flatMap((phase) => [
        {
          role: "packet-tail" as const,
          stroke: colors[1],
          strokeWidth: Math.max(1, sizePx * 0.55),
          opacity: projection.opacity * 0.4,
          dasharray: `${tailLength} ${1 - tailLength}`,
          dashoffset: 1 - phase,
          linecap: "round" as const,
        },
        {
          role: "packet-core" as const,
          stroke: colors[0],
          strokeWidth: sizePx,
          opacity: projection.opacity,
          dasharray: `${coreLength} ${1 - coreLength}`,
          dashoffset: 1 - phase,
          linecap: "round" as const,
        },
      ]);
    }

    case "pulse":
      return phases.map((phase) => {
        const wave = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
        return {
          role: "pulse",
          stroke: colors[0],
          strokeWidth: projection.widthPx * (1 + wave * 0.75),
          opacity: projection.opacity * (0.45 + wave * 0.55),
          linecap: "round",
        };
      });

    case "particle-stream": {
      const count = projection.count;
      return phases.map((phase) => ({
        role: "particles",
        stroke: colors[0],
        strokeWidth: projection.particleSizePx,
        opacity: projection.opacity,
        dasharray:
          projection.distribution === "spacing"
            ? `0px ${projection.spacingPx}px`
            : `0 ${1 / count}`,
        dashoffset: 1 - phase,
        linecap: "round",
        particleCount: count,
      }));
    }
  }
}

const writeAttribute = (
  node: SvgAttributeTarget | null,
  name: string,
  value: string | number | undefined
) => {
  if (!node) return;
  if (value === undefined) {
    node.removeAttribute(name);
    return;
  }
  node.setAttribute(name, String(value));
};

const hidePath = (path: SvgAttributeTarget | null) => {
  writeAttribute(path, "display", "none");
  for (const name of [
    "data-effect-id",
    "data-motion-role",
    "data-particle-count",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-dasharray",
    "stroke-dashoffset",
    "opacity",
    "style",
  ]) {
    writeAttribute(path, name, undefined);
  }
};

const hideSlot = (slot: EdgeMotionSlotElements) => {
  writeAttribute(slot.group, "display", "none");
  for (const name of [
    "data-effect-id",
    "data-effect-type",
    "data-motion-preset",
    "data-motion-state",
  ]) {
    writeAttribute(slot.group, name, undefined);
  }
  for (const path of slot.paths) hidePath(path);
};

const applyProjectionToSlot = (
  slot: EdgeMotionSlotElements,
  slotIndex: number,
  edgeId: string,
  projection: Extract<EdgeEffectProjection, { supported: true }>,
  context: EdgeMotionApplyContext
) => {
  const gradientId = gradientIdFor(edgeId, projection.effectId, slotIndex);
  const primitives = createEdgeMotionPrimitives(projection, gradientId).slice(
    0,
    MAX_EDGE_PRIMITIVES_PER_SLOT
  );
  const colors = projection.colors;
  const glowBlurPx = projection.glowBlurPx;
  const glowColor = projection.glowColor;

  writeAttribute(slot.group, "display", undefined);
  writeAttribute(slot.group, "data-effect-id", projection.effectId);
  writeAttribute(slot.group, "data-effect-type", projection.effectType);
  writeAttribute(slot.group, "data-motion-preset", projection.preset);
  writeAttribute(slot.group, "data-motion-state", context.motionState);

  writeAttribute(slot.gradient, "id", gradientId);
  writeAttribute(slot.gradient, "gradientUnits", "userSpaceOnUse");
  writeAttribute(slot.gradient, "x1", context.gradientVector.x1);
  writeAttribute(slot.gradient, "y1", context.gradientVector.y1);
  writeAttribute(slot.gradient, "x2", context.gradientVector.x2);
  writeAttribute(slot.gradient, "y2", context.gradientVector.y2);
  const stopValues: Array<[string, string, number | undefined]> = [
    ["0", colors[0], 0],
    ["0.5", colors[1], undefined],
    ["1", colors[0], 0],
  ];
  for (let index = 0; index < slot.gradientStops.length; index += 1) {
    const [offset, color, opacity] = stopValues[index] ?? stopValues[2];
    writeAttribute(slot.gradientStops[index], "offset", offset);
    writeAttribute(slot.gradientStops[index], "stop-color", color);
    writeAttribute(slot.gradientStops[index], "stop-opacity", opacity);
  }

  for (let index = 0; index < slot.paths.length; index += 1) {
    const path = slot.paths[index];
    const primitive = primitives[index];
    if (!primitive) {
      hidePath(path);
      continue;
    }
    writeAttribute(path, "display", undefined);
    writeAttribute(path, "data-edge-layer", "motion");
    writeAttribute(path, "data-effect-id", projection.effectId);
    writeAttribute(path, "data-motion-index", index);
    writeAttribute(path, "data-motion-role", primitive.role);
    writeAttribute(path, "data-particle-count", primitive.particleCount);
    writeAttribute(path, "fill", "none");
    writeAttribute(path, "stroke", primitive.stroke);
    writeAttribute(path, "stroke-width", primitive.strokeWidth);
    writeAttribute(path, "stroke-linecap", primitive.linecap);
    writeAttribute(path, "stroke-dasharray", primitive.dasharray);
    writeAttribute(path, "stroke-dashoffset", primitive.dashoffset);
    writeAttribute(path, "opacity", primitive.opacity);
    writeAttribute(path, "vector-effect", "non-scaling-stroke");
    writeAttribute(
      path,
      "style",
      glowBlurPx > 0
        ? `filter:drop-shadow(0 0 ${glowBlurPx}px ${glowColor})`
        : undefined
    );
  }
};

export function applyEdgeMotionTargetFrame(
  frame: TargetFrame,
  slots: EdgeMotionSlotElements[],
  context: EdgeMotionApplyContext
) {
  if (frame.clear) {
    for (const slot of slots) hideSlot(slot);
    return;
  }

  const projections = frame.clips
    .map(({ clip, timing }) => projectEdgeEffect(clip, timing))
    .filter(
      (
        projection
      ): projection is Extract<EdgeEffectProjection, { supported: true }> =>
        projection.supported && projection.active
    )
    .slice(0, Math.min(MAX_EDGE_EFFECT_SLOTS, slots.length));

  for (let index = 0; index < slots.length; index += 1) {
    const projection = projections[index];
    if (index >= MAX_EDGE_EFFECT_SLOTS || !projection) {
      hideSlot(slots[index]);
      continue;
    }
    applyProjectionToSlot(
      slots[index],
      index,
      frame.targetId,
      projection,
      context
    );
  }
}

export function subscribeEdgeMotionTarget(
  runtime: EdgeMotionRuntimeSource,
  edgeId: string,
  slots: EdgeMotionSlotElements[],
  getContext: () => EdgeMotionApplyContext
) {
  for (const slot of slots) hideSlot(slot);
  const unsubscribe = runtime.subscribeTarget(edgeId, (frame) => {
    const context = getContext();
    const transport = runtime.getTransportSnapshot?.();
    applyEdgeMotionTargetFrame(
      frame,
      slots,
      transport
        ? {
            ...context,
            motionState: transport.isPlaying ? "playing" : "paused",
          }
        : context
    );
  });
  return () => {
    unsubscribe();
    for (const slot of slots) hideSlot(slot);
  };
}

const emptySlot = (): EdgeMotionSlotElements => ({
  group: null,
  gradient: null,
  gradientStops: Array.from({ length: 3 }, () => null),
  paths: Array.from({ length: MAX_EDGE_PRIMITIVES_PER_SLOT }, () => null),
});

export function EdgeMotionLayer({
  edgeId,
  edgePath,
  projection,
  motionState,
  gradientVector = DEFAULT_GRADIENT_VECTOR,
  runtime = scenarioRuntime,
}: EdgeMotionLayerProps) {
  const slotsRef = useRef<EdgeMotionSlotElements[] | null>(null);
  if (slotsRef.current === null) {
    slotsRef.current = Array.from(
      { length: MAX_EDGE_EFFECT_SLOTS },
      emptySlot
    );
  }
  const contextRef = useRef<EdgeMotionApplyContext>({
    motionState,
    gradientVector,
  });
  contextRef.current = { motionState, gradientVector };

  useEffect(
    () =>
      subscribeEdgeMotionTarget(runtime, edgeId, slotsRef.current ?? [], () =>
        contextRef.current
      ),
    [edgeId, runtime]
  );

  const initialProjection =
    projection?.supported && projection.active ? projection : null;

  return (
    <g
      className="nv-edge-motion"
      aria-hidden="true"
      pointerEvents="none"
      data-edge-id={edgeId}
      data-motion-state={motionState}
    >
      {Array.from({ length: MAX_EDGE_EFFECT_SLOTS }, (_, slotIndex) => {
        const slotProjection = slotIndex === 0 ? initialProjection : null;
        const effectId = slotProjection?.effectId ?? `slot-${slotIndex}`;
        const gradientId = gradientIdFor(edgeId, effectId, slotIndex);
        const primitives = slotProjection
          ? createEdgeMotionPrimitives(slotProjection, gradientId).slice(
              0,
              MAX_EDGE_PRIMITIVES_PER_SLOT
            )
          : [];
        const colors = slotProjection?.colors ?? ["#38bdf8", "#818cf8"];
        const glowBlurPx = slotProjection ? slotProjection.glowBlurPx : 0;
        const glowColor = slotProjection?.glowColor ?? colors[0];

        return (
          <g
            key={slotIndex}
            ref={(node) => {
              if (slotsRef.current) slotsRef.current[slotIndex].group = node;
            }}
            display={slotProjection ? undefined : "none"}
            data-effect-id={slotProjection?.effectId}
            data-effect-type={slotProjection?.effectType}
            data-motion-preset={slotProjection?.preset}
            data-motion-state={slotProjection ? motionState : undefined}
            data-motion-slot={slotIndex}
          >
            <defs>
              <linearGradient
                ref={(node) => {
                  if (slotsRef.current) {
                    slotsRef.current[slotIndex].gradient = node;
                  }
                }}
                id={gradientId}
                gradientUnits="userSpaceOnUse"
                x1={gradientVector.x1}
                y1={gradientVector.y1}
                x2={gradientVector.x2}
                y2={gradientVector.y2}
              >
                {[0, 0.5, 1].map((offset, stopIndex) => (
                  <stop
                    key={offset}
                    ref={(node) => {
                      if (slotsRef.current) {
                        slotsRef.current[slotIndex].gradientStops[stopIndex] =
                          node;
                      }
                    }}
                    offset={offset}
                    stopColor={colors[stopIndex === 1 ? 1 : 0]}
                    stopOpacity={stopIndex === 1 ? undefined : 0}
                  />
                ))}
              </linearGradient>
            </defs>
            {Array.from(
              { length: MAX_EDGE_PRIMITIVES_PER_SLOT },
              (_, primitiveIndex) => {
                const primitive = primitives[primitiveIndex];
                return (
                  <path
                    key={primitiveIndex}
                    ref={(node) => {
                      if (slotsRef.current) {
                        slotsRef.current[slotIndex].paths[primitiveIndex] = node;
                      }
                    }}
                    d={edgePath}
                    pathLength={1}
                    display={primitive ? undefined : "none"}
                    data-edge-layer={primitive ? "motion" : undefined}
                    data-effect-id={slotProjection?.effectId}
                    data-motion-index={primitive ? primitiveIndex : undefined}
                    data-motion-role={primitive?.role}
                    data-particle-count={primitive?.particleCount}
                    fill="none"
                    stroke={primitive?.stroke}
                    strokeWidth={primitive?.strokeWidth}
                    strokeLinecap={primitive?.linecap}
                    strokeDasharray={primitive?.dasharray}
                    strokeDashoffset={primitive?.dashoffset}
                    opacity={primitive?.opacity}
                    vectorEffect="non-scaling-stroke"
                    style={
                      primitive && glowBlurPx > 0
                        ? {
                            filter: `drop-shadow(0 0 ${glowBlurPx}px ${glowColor})`,
                          }
                        : undefined
                    }
                  />
                );
              }
            )}
          </g>
        );
      })}
    </g>
  );
}
