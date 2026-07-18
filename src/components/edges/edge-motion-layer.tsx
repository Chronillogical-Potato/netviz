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
  getTotalLength?(): number;
  getPointAtLength?(length: number): { x: number; y: number };
}

export interface EdgeMotionSlotElements {
  group: SvgAttributeTarget | null;
  gradients: Array<SvgAttributeTarget | null>;
  gradientStops: Array<Array<SvgAttributeTarget | null>>;
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
    | "gradient-beam-base"
    | "gradient-beam"
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
  gradientPhase?: number;
  gradientReversed?: boolean;
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

const gradientIdFor = (
  edgeId: string,
  effectId: string,
  slotIndex: number,
  primitiveIndex: number
) =>
  `nv-edge-gradient-${idPart(edgeId)}-${idPart(effectId)}-${slotIndex}-${primitiveIndex}-${stableHash(
    `${edgeId}\0${effectId}\0${slotIndex}\0${primitiveIndex}`
  )}`;

const boundedPhases = (
  projection: Extract<EdgeEffectProjection, { supported: true }>
) => projection.phases.slice(0, 2);

export function createEdgeMotionPrimitives(
  projection: Extract<EdgeEffectProjection, { supported: true }>,
  gradientIds: readonly string[],
  beamTrailLengthRatio?: number
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
      const trailLengthRatio =
        beamTrailLengthRatio ?? projection.trailLengthRatio;
      return [
        {
          role: "gradient-beam-base",
          stroke: "gray",
          strokeWidth: projection.widthPx,
          opacity: 0.2,
          linecap: "round",
        },
        ...phases.map((phase, index) => {
          const reversed =
            projection.direction === "reverse" ||
            (projection.direction === "ping-pong" &&
              projection.travelDirection === "reverse") ||
            (projection.direction === "bidirectional" && index === 1);
          const trailStart = reversed
            ? Math.max(0, phase - trailLengthRatio)
            : phase;
          return {
            role: "gradient-beam" as const,
            stroke: `url(#${gradientIds[index + 1]})`,
            strokeWidth: projection.widthPx,
            opacity: projection.opacity,
            dasharray: `${trailLengthRatio} ${Number(
              (1 - trailLengthRatio).toFixed(6)
            )}`,
            dashoffset: Number((1 - trailStart).toFixed(6)),
            linecap: "round" as const,
            gradientPhase: phase,
            gradientReversed: reversed,
          };
        }),
      ];
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

const pointOnVector = (vector: EdgeGradientVector, ratio: number) => ({
  x: vector.x1 + (vector.x2 - vector.x1) * ratio,
  y: vector.y1 + (vector.y2 - vector.y1) * ratio,
});

const beamGradientVector = (
  vector: EdgeGradientVector,
  phase: number,
  span: number,
  reversed: boolean
): EdgeGradientVector => {
  const head = pointOnVector(vector, reversed ? phase - span : phase + span);
  const tail = pointOnVector(vector, phase);
  return { x1: head.x, y1: head.y, x2: tail.x, y2: tail.y };
};

const pathBeamGradientVector = (
  path: SvgAttributeTarget | null,
  fallback: EdgeGradientVector,
  phase: number,
  span: number,
  reversed: boolean
): EdgeGradientVector => {
  if (!path?.getTotalLength || !path.getPointAtLength) {
    return beamGradientVector(fallback, phase, span, reversed);
  }
  const length = path.getTotalLength();
  if (!Number.isFinite(length) || length <= 0) {
    return beamGradientVector(fallback, phase, span, reversed);
  }
  const headRatio = Math.min(
    1,
    Math.max(0, reversed ? phase - span : phase + span)
  );
  const tailRatio = Math.min(1, Math.max(0, phase));
  const head = path.getPointAtLength(length * headRatio);
  const tail = path.getPointAtLength(length * tailRatio);
  return { x1: head.x, y1: head.y, x2: tail.x, y2: tail.y };
};

const measuredBeamTrailLengthRatio = (
  projection: Extract<
    EdgeEffectProjection,
    { supported: true; preset: "gradient-beam" }
  >,
  path: SvgAttributeTarget | null
) => {
  const pathLength = path?.getTotalLength?.();
  if (!pathLength || !Number.isFinite(pathLength)) {
    return projection.trailLengthRatio;
  }
  return Number(
    Math.min(0.95, Math.max(0.02, projection.beamLengthPx / pathLength)).toFixed(
      6
    )
  );
};

const gradientStops = (colors: [string, string]) =>
  [
    ["0", colors[0], 0],
    ["0", colors[0], undefined],
    ["0.325", colors[1], undefined],
    ["1", colors[1], 0],
  ] as const;

const applyGradient = (
  gradient: SvgAttributeTarget | null,
  stops: Array<SvgAttributeTarget | null>,
  id: string,
  vector: EdgeGradientVector,
  colors: [string, string]
) => {
  writeAttribute(gradient, "id", id);
  writeAttribute(gradient, "gradientUnits", "userSpaceOnUse");
  writeAttribute(gradient, "x1", vector.x1);
  writeAttribute(gradient, "y1", vector.y1);
  writeAttribute(gradient, "x2", vector.x2);
  writeAttribute(gradient, "y2", vector.y2);
  const values = gradientStops(colors);
  for (let index = 0; index < stops.length; index += 1) {
    const [offset, color, opacity] = values[index] ?? values[values.length - 1];
    writeAttribute(stops[index], "offset", offset);
    writeAttribute(stops[index], "stop-color", color);
    writeAttribute(stops[index], "stop-opacity", opacity);
  }
};

const applyProjectionToSlot = (
  slot: EdgeMotionSlotElements,
  slotIndex: number,
  edgeId: string,
  projection: Extract<EdgeEffectProjection, { supported: true }>,
  context: EdgeMotionApplyContext
) => {
  const gradientIds = Array.from(
    { length: MAX_EDGE_PRIMITIVES_PER_SLOT },
    (_, primitiveIndex) =>
      gradientIdFor(edgeId, projection.effectId, slotIndex, primitiveIndex)
  );
  const beamSpan =
    projection.preset === "gradient-beam"
      ? measuredBeamTrailLengthRatio(projection, slot.paths[1])
      : 0.1;
  const primitives = createEdgeMotionPrimitives(
    projection,
    gradientIds,
    beamSpan
  ).slice(0, MAX_EDGE_PRIMITIVES_PER_SLOT);
  const colors = projection.colors;
  const glowBlurPx = projection.glowBlurPx;
  const glowColor = projection.glowColor;
  writeAttribute(slot.group, "display", undefined);
  writeAttribute(slot.group, "data-effect-id", projection.effectId);
  writeAttribute(slot.group, "data-effect-type", projection.effectType);
  writeAttribute(slot.group, "data-motion-preset", projection.preset);
  writeAttribute(slot.group, "data-motion-state", context.motionState);

  for (let index = 0; index < slot.paths.length; index += 1) {
    const path = slot.paths[index];
    const primitive = primitives[index];
    if (!primitive) {
      hidePath(path);
      continue;
    }
    const vector =
      primitive.gradientPhase === undefined
        ? context.gradientVector
        : pathBeamGradientVector(
            path,
            context.gradientVector,
            primitive.gradientPhase,
            beamSpan,
            primitive.gradientReversed ?? false
          );
    applyGradient(
      slot.gradients[index],
      slot.gradientStops[index] ?? [],
      gradientIds[index],
      vector,
      colors
    );
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
  gradients: Array.from(
    { length: MAX_EDGE_PRIMITIVES_PER_SLOT },
    () => null
  ),
  gradientStops: Array.from(
    { length: MAX_EDGE_PRIMITIVES_PER_SLOT },
    () => Array.from({ length: 4 }, () => null)
  ),
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
        const gradientIds = Array.from(
          { length: MAX_EDGE_PRIMITIVES_PER_SLOT },
          (_, primitiveIndex) =>
            gradientIdFor(edgeId, effectId, slotIndex, primitiveIndex)
        );
        const primitives = slotProjection
          ? createEdgeMotionPrimitives(slotProjection, gradientIds).slice(
              0,
              MAX_EDGE_PRIMITIVES_PER_SLOT
            )
          : [];
        const colors = slotProjection?.colors ?? ["#38bdf8", "#818cf8"];
        const glowBlurPx = slotProjection ? slotProjection.glowBlurPx : 0;
        const glowColor = slotProjection?.glowColor ?? colors[0];
        const beamSpan =
          slotProjection?.preset === "gradient-beam"
            ? slotProjection.trailLengthRatio
            : 0.1;

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
              {Array.from(
                { length: MAX_EDGE_PRIMITIVES_PER_SLOT },
                (_, primitiveIndex) => {
                  const primitive = primitives[primitiveIndex];
                  const vector =
                    primitive?.gradientPhase === undefined || !slotProjection
                      ? gradientVector
                      : beamGradientVector(
                          gradientVector,
                          primitive.gradientPhase,
                          beamSpan,
                          primitive.gradientReversed ?? false
                        );
                  return (
                    <linearGradient
                      key={primitiveIndex}
                      ref={(node) => {
                        if (slotsRef.current) {
                          slotsRef.current[slotIndex].gradients[primitiveIndex] =
                            node;
                        }
                      }}
                      id={gradientIds[primitiveIndex]}
                      gradientUnits="userSpaceOnUse"
                      x1={vector.x1}
                      y1={vector.y1}
                      x2={vector.x2}
                      y2={vector.y2}
                    >
                      {gradientStops(colors).map(
                        ([offset, color, opacity], stopIndex) => (
                          <stop
                            key={stopIndex}
                            ref={(node) => {
                              if (slotsRef.current) {
                                slotsRef.current[slotIndex].gradientStops[
                                  primitiveIndex
                                ][stopIndex] = node;
                              }
                            }}
                            offset={offset}
                            stopColor={color}
                            stopOpacity={opacity}
                          />
                        )
                      )}
                    </linearGradient>
                  );
                }
              )}
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
