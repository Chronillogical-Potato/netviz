import {
  fitScenarioToClips,
  patchAnimationBeam,
  type PatchAnimationBeamInput,
  type ScenarioClipPatchV1,
} from "./scenario-document";
import type {
  PageScenarioDocumentV1,
  ScenarioClipV1,
  ScenarioEffectV1,
  ScenarioV1,
} from "./model";

export const GRADIENT_BEAM_DURATION_MS = 1_500;
export const NODE_BORDER_DURATION_MS = 800;
export const REQUEST_FLOW_ARRIVAL_LEAD_MS = 200;
export const REQUEST_FLOW_EDGE_DELAY_MS = NODE_BORDER_DURATION_MS;
export const REQUEST_FLOW_HOP_DELAY_MS =
  NODE_BORDER_DURATION_MS +
  GRADIENT_BEAM_DURATION_MS -
  REQUEST_FLOW_ARRIVAL_LEAD_MS;

export type NodeBorderEntrySide = "top" | "right" | "bottom" | "left";

const ENTRY_SIDES = new Set<NodeBorderEntrySide>([
  "top",
  "right",
  "bottom",
  "left",
]);

const entrySideOf = (value: unknown): NodeBorderEntrySide =>
  typeof value === "string" && ENTRY_SIDES.has(value as NodeBorderEntrySide)
    ? (value as NodeBorderEntrySide)
    : "left";

export function createGradientBeamEffect(): ScenarioEffectV1 {
  return {
    type: "edge.gradient-beam",
    params: {
      direction: "forward",
      colors: ["#ffaa40", "#9c40ff"],
      widthPx: 2,
      opacity: 1,
      trailLength: 0.1,
      beamLengthPx: 48,
      glowBlurPx: 0,
    },
  };
}

export function createGradientBeamClip(
  startMs = 0
): ScenarioClipPatchV1 {
  return {
    startMs,
    durationMs: GRADIENT_BEAM_DURATION_MS,
    easing: "linear",
    repeatCount: 0,
    repeatDelayMs: 0,
  };
}

export function createNodeBorderEffect(
  entrySide: NodeBorderEntrySide = "left"
): ScenarioEffectV1 {
  return {
    type: "node.border-beam",
    params: { colors: ["#ffaa40", "#9c40ff"], entrySide },
  };
}

export function createNodeBorderClip(startMs = 0): ScenarioClipPatchV1 {
  return {
    startMs,
    durationMs: NODE_BORDER_DURATION_MS,
    easing: "linear",
    repeatCount: 0,
    repeatDelayMs: 0,
  };
}

type FlowEdge = {
  id: string;
  source: string;
  target: string;
};

type TimedClip = {
  key: string;
  clip: ScenarioClipV1;
};

type BeamClip = TimedClip & {
  fromNodeId: string;
  toNodeId: string;
};

type ShimmerClip = TimedClip & {
  nodeId: string;
};

const clipKey = (trackId: string, clipId: string) =>
  `${trackId}:${clipId}`;

const closestShimmer = (
  shimmers: readonly ShimmerClip[],
  nodeId: string,
  atMs: number
) =>
  shimmers
    .filter((shimmer) => shimmer.nodeId === nodeId)
    .reduce<ShimmerClip | undefined>((closest, shimmer) => {
      if (!closest) return shimmer;
      return Math.abs(shimmer.clip.startMs - atMs) <
        Math.abs(closest.clip.startMs - atMs)
        ? shimmer
        : closest;
    }, undefined);

export function patchSynchronizedGradientBeam(
  document: PageScenarioDocumentV1,
  input: PatchAnimationBeamInput,
  edges: readonly FlowEdge[]
): PageScenarioDocumentV1 {
  // Custom paths form a timing chain:
  // beam arrival -> target shimmer -> the target's outgoing beams.
  // Keep that chain together when one beam's start or duration changes.
  const sourceScenario = document.scenarios.find(
    (scenario) => scenario.id === input.scenarioId
  );
  const sourceTrack = sourceScenario?.tracks.find(
    (track) => track.id === input.trackId
  );
  const sourceClip = sourceTrack?.clips.find(
    (clip) => clip.id === input.clipId
  );
  const patched = patchAnimationBeam(document, input);
  if (
    !sourceScenario ||
    !sourceTrack ||
    !sourceClip ||
    sourceTrack.property !== "connection-effect" ||
    sourceTrack.target.type !== "edge" ||
    !("id" in sourceTrack.target) ||
    sourceClip.effect.type !== "edge.gradient-beam" ||
    (input.patch.startMs === undefined &&
      input.patch.durationMs === undefined)
  ) {
    return patched;
  }

  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const beams = sourceScenario.tracks.flatMap((track) => {
    if (
      track.property !== "connection-effect" ||
      track.target.type !== "edge" ||
      !("id" in track.target)
    ) {
      return [];
    }
    const edge = edgeById.get(track.target.id);
    if (!edge) return [];
    return track.clips.flatMap((clip) => {
      if (clip.effect.type !== "edge.gradient-beam") return [];
      const direction = clip.effect.params.direction;
      if (direction === "bidirectional") return [];
      const reverse = direction === "reverse";
      return [
        {
          key: clipKey(track.id, clip.id),
          clip,
          fromNodeId: reverse ? edge.target : edge.source,
          toNodeId: reverse ? edge.source : edge.target,
        } satisfies BeamClip,
      ];
    });
  });
  const shimmers = sourceScenario.tracks.flatMap((track) => {
    if (
      track.property !== "node-effect" ||
      track.target.type !== "node" ||
      !("id" in track.target)
    ) {
      return [];
    }
    const nodeId = track.target.id;
    return track.clips.flatMap((clip) =>
      clip.effect.type === "node.border-beam"
        ? [
            {
              key: clipKey(track.id, clip.id),
              clip,
              nodeId,
            } satisfies ShimmerClip,
          ]
        : []
    );
  });
  const selectedKey = clipKey(input.trackId, input.clipId);
  const selectedBeam = beams.find((beam) => beam.key === selectedKey);
  if (!selectedBeam || shimmers.length === 0) return patched;

  const destinationByBeam = new Map<string, ShimmerClip>();
  const incomingByShimmer = new Map<string, BeamClip[]>();
  const outgoingByShimmer = new Map<string, BeamClip[]>();
  for (const beam of beams) {
    const destination = closestShimmer(
      shimmers,
      beam.toNodeId,
      beam.clip.startMs +
        beam.clip.durationMs -
        REQUEST_FLOW_ARRIVAL_LEAD_MS
    );
    if (destination) {
      destinationByBeam.set(beam.key, destination);
      incomingByShimmer.set(destination.key, [
        ...(incomingByShimmer.get(destination.key) ?? []),
        beam,
      ]);
    }

    const source = shimmers
      .filter(
        (shimmer) =>
          shimmer.nodeId === beam.fromNodeId &&
          shimmer.clip.startMs <= beam.clip.startMs
      )
      .sort((left, right) => right.clip.startMs - left.clip.startMs)[0];
    if (source) {
      outgoingByShimmer.set(source.key, [
        ...(outgoingByShimmer.get(source.key) ?? []),
        beam,
      ]);
    }
  }

  const beamStarts = new Map(
    beams.map((beam) => [beam.key, beam.clip.startMs])
  );
  const beamDurations = new Map(
    beams.map((beam) => [beam.key, beam.clip.durationMs])
  );
  beamStarts.set(
    selectedKey,
    input.patch.startMs ?? selectedBeam.clip.startMs
  );
  beamDurations.set(
    selectedKey,
    input.patch.durationMs ?? selectedBeam.clip.durationMs
  );

  const shimmerStartDeltas = new Map<string, number>();
  const beamStartDeltas = new Map<string, number>();
  const pending = [destinationByBeam.get(selectedKey)].filter(
    (shimmer): shimmer is ShimmerClip => shimmer !== undefined
  );
  const processed = new Set<string>();
  while (pending.length > 0) {
    const shimmer = pending.shift();
    if (!shimmer || processed.has(shimmer.key)) continue;
    processed.add(shimmer.key);
    const incoming = incomingByShimmer.get(shimmer.key) ?? [];
    if (incoming.length === 0) continue;
    const nextStartMs = Math.max(
      ...incoming.map(
        (beam) =>
          (beamStarts.get(beam.key) ?? beam.clip.startMs) +
          (beamDurations.get(beam.key) ?? beam.clip.durationMs) -
          REQUEST_FLOW_ARRIVAL_LEAD_MS
      )
    );
    const deltaMs = nextStartMs - shimmer.clip.startMs;
    if (deltaMs === 0) continue;
    shimmerStartDeltas.set(shimmer.key, deltaMs);

    for (const beam of outgoingByShimmer.get(shimmer.key) ?? []) {
      if (beam.key === selectedKey) continue;
      beamStarts.set(beam.key, beam.clip.startMs + deltaMs);
      beamStartDeltas.set(beam.key, deltaMs);
      const destination = destinationByBeam.get(beam.key);
      if (destination) pending.push(destination);
    }
  }
  if (shimmerStartDeltas.size === 0 && beamStartDeltas.size === 0) {
    return patched;
  }

  const scenarios = patched.scenarios.map((scenario) => {
    let scenarioChanged = false;
    const tracks = scenario.tracks.map((track) => {
      let trackChanged = false;
      const clips = track.clips.map((clip) => {
        const key = clipKey(track.id, clip.id);
        const deltaMs =
          shimmerStartDeltas.get(key) ?? beamStartDeltas.get(key);
        if (deltaMs === undefined) return clip;
        trackChanged = true;
        scenarioChanged = true;
        return { ...clip, startMs: clip.startMs + deltaMs };
      });
      return trackChanged ? { ...track, clips } : track;
    });
    return scenarioChanged
      ? fitScenarioToClips({ ...scenario, tracks })
      : scenario;
  });
  return { ...patched, scenarios };
}

export function applyNodeBorderEntrySides(
  document: PageScenarioDocumentV1,
  edges: readonly {
    id: string;
    target: string;
    targetHandle?: string | null;
  }[]
): PageScenarioDocumentV1 {
  let changed = false;
  const scenarios = document.scenarios.map((scenario) => {
    const animatedEdgeIds = new Set(
      scenario.tracks
        .filter(
          (track) =>
            track.property === "connection-effect" &&
            track.target.type === "edge" &&
            "id" in track.target &&
            track.clips.some(
              (clip) => clip.effect.type === "edge.gradient-beam"
            )
        )
        .map((track) => ("id" in track.target ? track.target.id : ""))
    );
    const incomingSides = new Map(
      edges
        .filter((edge) => animatedEdgeIds.has(edge.id))
        .map((edge) => [edge.target, entrySideOf(edge.targetHandle)])
    );
    const tracks = scenario.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (
          track.property !== "node-effect" ||
          track.target.type !== "node" ||
          !("id" in track.target) ||
          clip.effect.type !== "node.border-beam"
        ) {
          return clip;
        }
        const entrySide =
          incomingSides.get(track.target.id) ??
          entrySideOf(clip.effect.params.entrySide);
        if (clip.effect.params.entrySide === entrySide) return clip;
        changed = true;
        return {
          ...clip,
          effect: {
            ...clip.effect,
            params: { ...clip.effect.params, entrySide },
          },
        };
      }),
    }));
    return { ...scenario, tracks };
  });
  return changed ? { ...document, scenarios } : document;
}

const uniqueTimedClips = (
  scenario: ScenarioV1,
  property: string,
  effectType: string
) =>
  [
    ...new Map(
      scenario.tracks
        .filter((track) => track.property === property)
        .flatMap((track) =>
          track.clips.filter((clip) => clip.effect.type === effectType)
        )
        .map((clip) => [clip.startMs, clip])
    ).values(),
  ].sort((left, right) => left.startMs - right.startMs);

const normalizeRequestFlowSchedule = (scenario: ScenarioV1): ScenarioV1 => {
  const edgeClips = uniqueTimedClips(
    scenario,
    "connection-effect",
    "edge.gradient-beam"
  );
  const nodeClips = uniqueTimedClips(
    scenario,
    "node-effect",
    "node.border-beam"
  );
  if (
    edgeClips.length === 0 ||
    nodeClips.length !== edgeClips.length + 1
  ) {
    return scenario;
  }
  const synchronized = edgeClips.every((edgeClip, index) => {
    const sourceShimmer = nodeClips[index];
    const targetShimmer = nodeClips[index + 1];
    return (
      sourceShimmer !== undefined &&
      targetShimmer !== undefined &&
      edgeClip.startMs ===
        sourceShimmer.startMs + sourceShimmer.durationMs &&
      targetShimmer.startMs ===
        edgeClip.startMs +
          edgeClip.durationMs -
          REQUEST_FLOW_ARRIVAL_LEAD_MS
    );
  });
  if (synchronized) return scenario;

  const edgeStarts = edgeClips.map((clip) => clip.startMs);
  const nodeStarts = nodeClips.map((clip) => clip.startMs);

  const edgeSchedule = new Map(
    edgeStarts.map((startMs, index) => [
      startMs,
      REQUEST_FLOW_EDGE_DELAY_MS + index * REQUEST_FLOW_HOP_DELAY_MS,
    ])
  );
  const nodeSchedule = new Map(
    nodeStarts.map((startMs, index) => [
      startMs,
      index * REQUEST_FLOW_HOP_DELAY_MS,
    ])
  );
  let changed = false;
  const tracks = scenario.tracks.map((track) => {
    const clips = track.clips.map((clip) => {
      const schedule =
        track.property === "connection-effect" &&
        clip.effect.type === "edge.gradient-beam"
          ? edgeSchedule
          : track.property === "node-effect" &&
              clip.effect.type === "node.border-beam"
            ? nodeSchedule
            : null;
      const startMs = schedule?.get(clip.startMs);
      if (startMs === undefined || startMs === clip.startMs) return clip;
      changed = true;
      return { ...clip, startMs };
    });
    return { ...track, clips };
  });

  return changed ? fitScenarioToClips({ ...scenario, tracks }) : scenario;
};

export function normalizeGradientBeamDefaults(
  document: PageScenarioDocumentV1
): PageScenarioDocumentV1 {
  let changed = false;
  const scenarios = document.scenarios.map((scenario) => {
    const tracks = scenario.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (
          clip.effect.type !== "edge.gradient-beam" ||
          clip.durationMs !== 5_000 ||
          clip.easing !== "cubic-bezier(0.16, 1, 0.3, 1)"
        ) {
          return clip;
        }
        changed = true;
        return {
          ...clip,
          durationMs: GRADIENT_BEAM_DURATION_MS,
          easing: "linear",
        };
      }),
    }));
    const normalized = fitScenarioToClips({ ...scenario, tracks });
    const repaired = normalizeRequestFlowSchedule(normalized);
    if (repaired !== normalized) changed = true;
    return repaired;
  });
  return changed ? { ...document, scenarios } : document;
}
