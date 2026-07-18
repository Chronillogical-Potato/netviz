import type {
  AnimationIdFactory,
  FieldState,
  JsonObject,
  JsonValue,
  PageScenarioDocumentV1,
  ScenarioClipV1,
  ScenarioEffectV1,
  ScenarioPlaybackV1,
  ScenarioTargetV1,
  ScenarioTrackV1,
  ScenarioV1,
} from "./model";

const DEFAULT_SCENARIO_DURATION_MS = 4_000;
const DEFAULT_CLIP_DURATION_MS = 1_200;

const randomId: AnimationIdFactory = () => globalThis.crypto.randomUUID();

export interface CreateScenarioOptions {
  id?: string;
  name?: string;
  durationMs?: number;
  playback?: ScenarioPlaybackV1;
  idFactory?: AnimationIdFactory;
}

export interface CreateScenarioClipOptions
  extends Partial<Omit<ScenarioClipV1, "id" | "effect">> {
  id?: string;
  idFactory?: AnimationIdFactory;
}

export interface ApplyEdgeEffectInput {
  edgeIds: readonly string[];
  effect: ScenarioEffectV1;
  scenarioId?: string;
  clip?: Partial<Omit<ScenarioClipV1, "id" | "effect">>;
  idFactory?: AnimationIdFactory;
}

export interface ApplyNodeEffectInput {
  nodeIds: readonly string[];
  effect: ScenarioEffectV1;
  scenarioId?: string;
  append?: boolean;
  clip?: Partial<Omit<ScenarioClipV1, "id" | "effect">>;
  idFactory?: AnimationIdFactory;
}

export type ScenarioEffectPatchV1 = {
  type?: string;
  params?: JsonObject;
};

export type ScenarioClipPatchV1 = Partial<
  Omit<ScenarioClipV1, "id" | "effect">
> & {
  effect?: ScenarioEffectPatchV1;
};

export interface PatchEdgeEffectsInput {
  edgeIds: readonly string[];
  patch: ScenarioClipPatchV1;
  scenarioId?: string;
}

export interface RemoveEdgeEffectsInput {
  edgeIds: readonly string[];
  scenarioId?: string;
}

export interface RemoveNodeEffectsInput {
  nodeIds: readonly string[];
  scenarioId?: string;
}

export interface ScenarioTargetRemapV1 {
  source: ScenarioTargetV1;
  target: ScenarioTargetV1;
}

export function createEmptyScenarioDocument(): PageScenarioDocumentV1 {
  return {
    schemaVersion: 1,
    scenarios: [],
    defaultScenarioId: null,
  };
}

export function createScenario(
  options: CreateScenarioOptions = {}
): ScenarioV1 {
  const durationMs = options.durationMs ?? DEFAULT_SCENARIO_DURATION_MS;
  const idFactory = options.idFactory ?? randomId;

  return {
    id: options.id ?? idFactory(),
    name: options.name ?? "Default scenario",
    durationMs,
    playback: options.playback
      ? {
          rate: options.playback.rate,
          loop: { ...options.playback.loop },
        }
      : {
          rate: 1,
          loop: { mode: "repeat", startMs: 0, endMs: durationMs },
        },
    tracks: [],
    markers: [],
    triggers: [],
  };
}

export function createDefaultScenarioDocument(
  options: CreateScenarioOptions = {}
): PageScenarioDocumentV1 {
  const scenario = createScenario(options);
  return {
    schemaVersion: 1,
    scenarios: [scenario],
    defaultScenarioId: scenario.id,
  };
}

export function createScenarioClip(
  effect: ScenarioEffectV1,
  options: CreateScenarioClipOptions = {}
): ScenarioClipV1 {
  const idFactory = options.idFactory ?? randomId;
  return {
    id: options.id ?? idFactory(),
    startMs: options.startMs ?? 0,
    durationMs: options.durationMs ?? DEFAULT_CLIP_DURATION_MS,
    easing: options.easing ?? "linear",
    repeatCount: options.repeatCount ?? 0,
    repeatDelayMs: options.repeatDelayMs ?? 0,
    effect: cloneEffect(effect),
  };
}

export function applyEdgeEffect(
  document: PageScenarioDocumentV1,
  input: ApplyEdgeEffectInput
): PageScenarioDocumentV1 {
  const edgeIds = uniqueValues(input.edgeIds);
  if (edgeIds.length === 0) return document;

  const idFactory = input.idFactory ?? randomId;
  const resolved = resolveEditableScenario(document, input.scenarioId, idFactory);
  if (resolved === null) return document;

  const { document: workingDocument, scenarioIndex } = resolved;
  const selected = new Set(edgeIds);
  const scenario = workingDocument.scenarios[scenarioIndex];
  if (scenario === undefined) return document;

  const updatedTargets = new Set<string>();
  const tracks = scenario.tracks.map((track) => {
    if (!isSelectedConnectionTrack(track, selected)) return track;
    const firstClip = track.clips[0];
    updatedTargets.add(track.target.id);

    if (firstClip === undefined) {
      return {
        ...track,
        enabled: true,
        clips: [
          createScenarioClip(input.effect, {
            ...input.clip,
            idFactory,
          }),
        ],
      };
    }

    return {
      ...track,
      enabled: true,
      clips: [
        {
          ...firstClip,
          ...input.clip,
          effect: cloneEffect(input.effect),
        },
        ...track.clips.slice(1),
      ],
    };
  });

  for (const edgeId of edgeIds) {
    if (updatedTargets.has(edgeId)) continue;
    tracks.push({
      id: idFactory(),
      target: { type: "edge", id: edgeId },
      property: "connection-effect",
      enabled: true,
      clips: [
        createScenarioClip(input.effect, {
          ...input.clip,
          idFactory,
        }),
      ],
    });
  }

  const nextScenario = fitScenarioToClips({ ...scenario, tracks });
  return replaceScenario(workingDocument, scenarioIndex, nextScenario);
}

export function applyNodeEffect(
  document: PageScenarioDocumentV1,
  input: ApplyNodeEffectInput
): PageScenarioDocumentV1 {
  const nodeIds = uniqueValues(input.nodeIds);
  if (nodeIds.length === 0) return document;

  const idFactory = input.idFactory ?? randomId;
  const resolved = resolveEditableScenario(document, input.scenarioId, idFactory);
  if (resolved === null) return document;

  const { document: workingDocument, scenarioIndex } = resolved;
  const selected = new Set(nodeIds);
  const scenario = workingDocument.scenarios[scenarioIndex];
  if (scenario === undefined) return document;

  const updatedTargets = new Set<string>();
  const tracks = scenario.tracks.map((track) => {
    if (!isSelectedNodeTrack(track, selected)) return track;
    const firstClip = track.clips[0];
    updatedTargets.add(track.target.id);
    if (input.append) {
      return {
        ...track,
        enabled: true,
        clips: [
          ...track.clips,
          createScenarioClip(input.effect, { ...input.clip, idFactory }),
        ],
      };
    }
    if (firstClip === undefined) {
      return {
        ...track,
        enabled: true,
        clips: [createScenarioClip(input.effect, { ...input.clip, idFactory })],
      };
    }
    return {
      ...track,
      enabled: true,
      clips: [
        {
          ...firstClip,
          ...input.clip,
          effect: cloneEffect(input.effect),
        },
        ...track.clips.slice(1),
      ],
    };
  });

  for (const nodeId of nodeIds) {
    if (updatedTargets.has(nodeId)) continue;
    tracks.push({
      id: idFactory(),
      target: { type: "node", id: nodeId },
      property: "node-effect",
      enabled: true,
      clips: [createScenarioClip(input.effect, { ...input.clip, idFactory })],
    });
  }

  return replaceScenario(
    workingDocument,
    scenarioIndex,
    fitScenarioToClips({ ...scenario, tracks })
  );
}

export function patchEdgeEffects(
  document: PageScenarioDocumentV1,
  input: PatchEdgeEffectsInput
): PageScenarioDocumentV1 {
  const scenarioIndex = resolveScenarioIndex(document, input.scenarioId);
  if (scenarioIndex === -1) return document;

  const selected = new Set(uniqueValues(input.edgeIds));
  if (selected.size === 0) return document;

  const scenario = document.scenarios[scenarioIndex];
  if (scenario === undefined) return document;
  let changed = false;
  const tracks = scenario.tracks.map((track) => {
    if (!isSelectedConnectionTrack(track, selected) || track.clips.length === 0) {
      return track;
    }

    changed = true;
    return {
      ...track,
      clips: track.clips.map((clip) => patchClip(clip, input.patch)),
    };
  });

  if (!changed) return document;
  const nextScenario = fitScenarioToClips({ ...scenario, tracks });
  return replaceScenario(document, scenarioIndex, nextScenario);
}

export function removeEdgeEffects(
  document: PageScenarioDocumentV1,
  input: RemoveEdgeEffectsInput
): PageScenarioDocumentV1 {
  const scenarioIndex = resolveScenarioIndex(document, input.scenarioId);
  if (scenarioIndex === -1) return document;

  const selected = new Set(uniqueValues(input.edgeIds));
  if (selected.size === 0) return document;

  const scenario = document.scenarios[scenarioIndex];
  if (scenario === undefined) return document;
  const tracks = scenario.tracks.filter(
    (track) => !isSelectedConnectionTrack(track, selected)
  );
  if (tracks.length === scenario.tracks.length) return document;

  return replaceScenario(
    document,
    scenarioIndex,
    fitScenarioToClips({ ...scenario, tracks })
  );
}

export function removeNodeEffects(
  document: PageScenarioDocumentV1,
  input: RemoveNodeEffectsInput
): PageScenarioDocumentV1 {
  const scenarioIndex = resolveScenarioIndex(document, input.scenarioId);
  if (scenarioIndex === -1) return document;

  const selected = new Set(uniqueValues(input.nodeIds));
  if (selected.size === 0) return document;
  const scenario = document.scenarios[scenarioIndex];
  if (scenario === undefined) return document;
  const tracks = scenario.tracks.filter(
    (track) => !isSelectedNodeTrack(track, selected)
  );
  if (tracks.length === scenario.tracks.length) return document;
  return replaceScenario(
    document,
    scenarioIndex,
    fitScenarioToClips({ ...scenario, tracks })
  );
}

export function cloneScenarioTargets(
  document: PageScenarioDocumentV1,
  remaps: readonly ScenarioTargetRemapV1[],
  idFactory: AnimationIdFactory = randomId
): PageScenarioDocumentV1 {
  if (remaps.length === 0) return document;

  let changed = false;
  const scenarios = document.scenarios.map((scenario) => {
    const tracks: ScenarioTrackV1[] = [];

    for (const track of scenario.tracks) {
      tracks.push(track);
      for (const remap of remaps) {
        if (!targetsEqual(track.target, remap.source)) continue;
        changed = true;
        tracks.push({
          ...track,
          id: idFactory(),
          target: cloneTarget(remap.target),
          clips: track.clips.map((clip) => ({
            ...clip,
            id: idFactory(),
            effect: cloneEffect(clip.effect),
          })),
        });
      }
    }

    return tracks.length === scenario.tracks.length
      ? scenario
      : { ...scenario, tracks };
  });

  return changed ? { ...document, scenarios } : document;
}

export function pruneScenarioTargets(
  document: PageScenarioDocumentV1,
  targets: readonly ScenarioTargetV1[]
): PageScenarioDocumentV1 {
  if (targets.length === 0) return document;

  let changed = false;
  const scenarios = document.scenarios.map((scenario) => {
    const tracks = scenario.tracks.filter(
      (track) => !targets.some((target) => targetsEqual(track.target, target))
    );
    if (tracks.length === scenario.tracks.length) return scenario;
    changed = true;
    return { ...scenario, tracks };
  });

  return changed ? { ...document, scenarios } : document;
}

export function summarizeField<T>(
  values: readonly (T | undefined)[],
  equals: (left: T, right: T) => boolean = Object.is
): FieldState<T> {
  const defined = values.filter((value): value is T => value !== undefined);
  if (defined.length === 0) return { status: "none" };
  if (defined.length !== values.length) return { status: "mixed" };

  const first = defined[0];
  if (first === undefined) return { status: "none" };
  return defined.every((value) => equals(value, first))
    ? { status: "uniform", value: first }
    : { status: "mixed" };
}

export function summarizeEdgeEffectField<T>(
  document: PageScenarioDocumentV1,
  edgeIds: readonly string[],
  select: (clip: ScenarioClipV1) => T,
  scenarioId?: string
): FieldState<T> {
  const scenarioIndex = resolveScenarioIndex(document, scenarioId);
  const scenario = document.scenarios[scenarioIndex];
  if (scenario === undefined) return { status: "none" };

  const values = uniqueValues(edgeIds).map((edgeId) => {
    const track = scenario.tracks.find(
      (candidate) =>
        candidate.enabled &&
        candidate.property === "connection-effect" &&
        candidate.target.type === "edge" &&
        "id" in candidate.target &&
        candidate.target.id === edgeId
    );
    const clip = track?.clips[0];
    return clip === undefined ? undefined : select(clip);
  });
  return summarizeField(values, structuredEqual);
}

function resolveEditableScenario(
  document: PageScenarioDocumentV1,
  scenarioId: string | undefined,
  idFactory: AnimationIdFactory
): { document: PageScenarioDocumentV1; scenarioIndex: number } | null {
  const existingIndex = resolveScenarioIndex(document, scenarioId);
  if (existingIndex !== -1) {
    const scenario = document.scenarios[existingIndex];
    if (scenario === undefined) return null;
    return {
      document:
        document.defaultScenarioId === null
          ? { ...document, defaultScenarioId: scenario.id }
          : document,
      scenarioIndex: existingIndex,
    };
  }

  if (scenarioId !== undefined) return null;
  const created = createDefaultScenarioDocument({ idFactory });
  return { document: created, scenarioIndex: 0 };
}

function resolveScenarioIndex(
  document: PageScenarioDocumentV1,
  scenarioId: string | undefined
): number {
  const requestedId = scenarioId ?? document.defaultScenarioId;
  if (requestedId !== null) {
    const index = document.scenarios.findIndex(
      (scenario) => scenario.id === requestedId
    );
    if (index !== -1) return index;
  }
  return scenarioId === undefined && document.scenarios.length > 0 ? 0 : -1;
}

function replaceScenario(
  document: PageScenarioDocumentV1,
  scenarioIndex: number,
  scenario: ScenarioV1
): PageScenarioDocumentV1 {
  return {
    ...document,
    scenarios: document.scenarios.map((candidate, index) =>
      index === scenarioIndex ? scenario : candidate
    ),
  };
}

export function fitScenarioToClips(scenario: ScenarioV1): ScenarioV1 {
  const requiredDurationMs = scenario.tracks.reduce(
    (maximum, track) =>
      track.clips.reduce(
        (trackMaximum, clip) =>
          Math.max(trackMaximum, clip.startMs + clip.durationMs),
        maximum
      ),
    Math.max(1, ...scenario.markers.map((marker) => marker.atMs))
  );
  if (!scenario.tracks.some((track) => track.clips.length > 0)) return scenario;
  if (requiredDurationMs === scenario.durationMs) return scenario;

  const loop = scenario.playback.loop;
  return {
    ...scenario,
    durationMs: requiredDurationMs,
    playback: {
      ...scenario.playback,
      loop: {
        ...loop,
        startMs: loop.startMs >= requiredDurationMs ? 0 : loop.startMs,
        endMs:
          loop.endMs === scenario.durationMs || loop.endMs > requiredDurationMs
            ? requiredDurationMs
            : loop.endMs,
      },
    },
  };
}

function patchClip(
  clip: ScenarioClipV1,
  patch: ScenarioClipPatchV1
): ScenarioClipV1 {
  const { effect: effectPatch, ...clipPatch } = patch;
  if (effectPatch === undefined) return { ...clip, ...clipPatch };

  return {
    ...clip,
    ...clipPatch,
    effect: {
      type: effectPatch.type ?? clip.effect.type,
      params:
        effectPatch.params === undefined
          ? clip.effect.params
          : mergeJsonObjects(clip.effect.params, effectPatch.params),
    },
  };
}

function isSelectedConnectionTrack(
  track: ScenarioTrackV1,
  selected: ReadonlySet<string>
): track is ScenarioTrackV1 & { target: { type: string; id: string } } {
  return (
    track.property === "connection-effect" &&
    track.target.type === "edge" &&
    "id" in track.target &&
    selected.has(track.target.id)
  );
}

function isSelectedNodeTrack(
  track: ScenarioTrackV1,
  selected: ReadonlySet<string>
): track is ScenarioTrackV1 & { target: { type: string; id: string } } {
  return (
    track.property === "node-effect" &&
    track.target.type === "node" &&
    "id" in track.target &&
    selected.has(track.target.id)
  );
}

function targetsEqual(
  left: ScenarioTargetV1,
  right: ScenarioTargetV1
): boolean {
  if (left.type !== right.type) return false;
  const leftId = "id" in left ? left.id : undefined;
  const rightId = "id" in right ? right.id : undefined;
  return leftId === rightId;
}

function cloneTarget(target: ScenarioTargetV1): ScenarioTargetV1 {
  if ("id" in target) return { type: target.type, id: target.id };
  return target.type === "camera" ? { type: "camera" } : { type: "scenario" };
}

function cloneEffect(effect: ScenarioEffectV1): ScenarioEffectV1 {
  return {
    type: effect.type,
    params: cloneJsonObject(effect.params),
  };
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneJsonValue(child)])
  );
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (value !== null && typeof value === "object") {
    return cloneJsonObject(value);
  }
  return value;
}

function mergeJsonObjects(base: JsonObject, patch: JsonObject): JsonObject {
  const merged = cloneJsonObject(base);
  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = merged[key];
    merged[key] =
      isJsonObject(baseValue) && isJsonObject(patchValue)
        ? mergeJsonObjects(baseValue, patchValue)
        : cloneJsonValue(patchValue);
  }
  return merged;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && !Array.isArray(value) && value !== null && typeof value === "object";
}

function structuredEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => structuredEqual(value, right[index]))
    );
  }
  if (
    left !== null &&
    right !== null &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const leftEntries = Object.entries(left);
    const rightRecord = right as Record<string, unknown>;
    return (
      leftEntries.length === Object.keys(rightRecord).length &&
      leftEntries.every(
        ([key, value]) =>
          Object.prototype.hasOwnProperty.call(rightRecord, key) &&
          structuredEqual(value, rightRecord[key])
      )
    );
  }
  return false;
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
