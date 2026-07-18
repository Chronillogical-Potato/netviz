export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export const EDGE_EFFECT_PRESETS = [
  "edge.moving-dash",
  "edge.gradient-beam",
  "edge.packet",
  "edge.pulse",
  "edge.particle-stream",
] as const;

export type EdgeEffectPreset = (typeof EDGE_EFFECT_PRESETS)[number];

export type AnimationDirectionV1 =
  | "forward"
  | "reverse"
  | "bidirectional"
  | "ping-pong";

export type ScenarioRepeatCountV1 = number | "infinite";

export interface ScenarioEffectV1 {
  type: string;
  params: JsonObject;
}

export interface ScenarioClipV1 {
  id: string;
  startMs: number;
  durationMs: number;
  easing: string;
  repeatCount: ScenarioRepeatCountV1;
  repeatDelayMs: number;
  effect: ScenarioEffectV1;
}

export type ScenarioTargetV1 =
  | { type: "camera" }
  | { type: "scenario" }
  | { type: string; id: string };

export interface ScenarioTrackV1 {
  id: string;
  target: ScenarioTargetV1;
  property: string;
  enabled: boolean;
  clips: ScenarioClipV1[];
}

export type ScenarioLoopModeV1 = "none" | "repeat";

export interface ScenarioLoopV1 {
  mode: ScenarioLoopModeV1;
  startMs: number;
  endMs: number;
}

export interface ScenarioPlaybackV1 {
  rate: number;
  loop: ScenarioLoopV1;
}

export interface ScenarioMarkerV1 {
  id: string;
  name: string;
  atMs: number;
}

export interface ScenarioTriggerV1 {
  id: string;
  type: string;
  params: JsonObject;
}

export interface ScenarioV1 {
  id: string;
  name: string;
  durationMs: number;
  playback: ScenarioPlaybackV1;
  tracks: ScenarioTrackV1[];
  markers: ScenarioMarkerV1[];
  triggers: ScenarioTriggerV1[];
}

export interface PageScenarioDocumentV1 {
  schemaVersion: 1;
  scenarios: ScenarioV1[];
  defaultScenarioId: string | null;
}

export type FieldState<T> =
  | { status: "none" }
  | { status: "uniform"; value: T }
  | { status: "mixed" };

export type AnimationIdFactory = () => string;
