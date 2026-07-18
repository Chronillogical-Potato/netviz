import { getSmoothStepPath, Position } from "@xyflow/react";
import { CORE_BLOCKS, type Accent, type BlockDef } from "@/blocks/registry";
import type { PageScenarioDocumentV1 } from "@/animation/model";
import type { AppNode, LabeledEdge } from "@/store/flow-store";
import { nodeDims } from "@/lib/snapping";

const ACCENT_COLORS: Record<Accent, string> = {
  indigo: "#818cf8",
  red: "#f87171",
  orange: "#fb923c",
  amber: "#fbbf24",
  yellow: "#facc15",
  lime: "#a3e635",
  emerald: "#34d399",
  teal: "#2dd4bf",
  cyan: "#22d3ee",
  sky: "#38bdf8",
  blue: "#60a5fa",
  violet: "#a78bfa",
  fuchsia: "#e879f9",
  pink: "#f472b6",
  slate: "#94a3b8",
};

type ExportNode = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  subtitle: string;
  variant: string;
  accent: string;
  background: string;
  border: string;
  titleColor: string;
  subtitleColor: string;
  radius: number;
  shape?: string;
  image?: string;
};

type ExportEdge = {
  id: string;
  path: string;
  label: string;
  labelX: number;
  labelY: number;
  color: string;
  dash: string;
};

export type ReactComponentExportInput = {
  projectName: string;
  nodes: AppNode[];
  edges: LabeledEdge[];
  customBlocks: BlockDef[];
  scenarioDocument: PageScenarioDocumentV1;
  pageBackground?: string;
};

function dimensions(node: AppNode) {
  const measured = nodeDims(node);
  if (measured.w > 0 && measured.h > 0) return measured;
  if (node.type === "infra") {
    const variant = (node.data as { variant?: string }).variant;
    return variant === "card" ? { w: 180, h: 150 } : { w: 220, h: 72 };
  }
  if (node.type === "shape") return { w: 300, h: 200 };
  if (node.type === "step") return { w: 56, h: 56 };
  return { w: 220, h: 72 };
}

function side(value: string | null | undefined, fallback: Position) {
  return value === "top"
    ? Position.Top
    : value === "right"
      ? Position.Right
      : value === "bottom"
        ? Position.Bottom
        : value === "left"
          ? Position.Left
          : fallback;
}

function point(node: ExportNode, position: Position) {
  if (position === Position.Top) {
    return { x: node.x + node.width / 2, y: node.y };
  }
  if (position === Position.Bottom) {
    return { x: node.x + node.width / 2, y: node.y + node.height };
  }
  if (position === Position.Left) {
    return { x: node.x, y: node.y + node.height / 2 };
  }
  return { x: node.x + node.width, y: node.y + node.height / 2 };
}

function componentName(projectName: string) {
  const name = projectName
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join("");
  const safe = /^\d/.test(name) ? `Diagram${name}` : name || "NetvizDiagram";
  return safe.endsWith("Diagram") ? safe : `${safe}Diagram`;
}

function buildNodes(input: ReactComponentExportInput): ExportNode[] {
  const blocks = [...CORE_BLOCKS, ...input.customBlocks];
  return input.nodes
    .filter((node) => !node.hidden && node.type !== "line")
    .map((node) => {
      const data = node.data as Record<string, unknown>;
      const block = blocks.find((candidate) => candidate.id === data.blockId);
      const size = dimensions(node);
      const accent =
        typeof data.accent === "string"
          ? data.accent
          : block?.accent ?? "slate";
      return {
        id: node.id,
        type: node.type ?? "shape",
        x: node.position.x,
        y: node.position.y,
        width: size.w,
        height: size.h,
        label: String(
          data.label ?? data.text ?? data.step ?? data.code ?? block?.label ?? ""
        ),
        subtitle: String(data.subtitle ?? block?.subtitle ?? ""),
        variant: String(data.variant ?? block?.variant ?? "row"),
        accent:
          ACCENT_COLORS[accent as Accent] ?? ACCENT_COLORS.slate,
        background: String(data.bgColor ?? block?.bgColor ?? "#151515"),
        border: String(data.borderColor ?? block?.borderColor ?? "#2c2c2c"),
        titleColor: String(data.titleColor ?? block?.titleColor ?? "#f5f5f5"),
        subtitleColor: String(
          data.subtitleColor ?? block?.subtitleColor ?? "#a3a3a3"
        ),
        radius:
          typeof data.borderRadius === "number" ? data.borderRadius : 16,
        shape: typeof data.shape === "string" ? data.shape : undefined,
        image: typeof data.src === "string" ? data.src : undefined,
      };
    });
}

function buildEdges(
  input: ReactComponentExportInput,
  nodes: ExportNode[]
): ExportEdge[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return input.edges.flatMap((edge) => {
    if (edge.hidden) return [];
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) return [];
    const sourceFallback =
      source.x <= target.x ? Position.Right : Position.Left;
    const targetFallback =
      source.x <= target.x ? Position.Left : Position.Right;
    const sourcePosition = side(edge.sourceHandle, sourceFallback);
    const targetPosition = side(edge.targetHandle, targetFallback);
    const sourcePoint = point(source, sourcePosition);
    const targetPoint = point(target, targetPosition);
    const [path, labelX, labelY] = getSmoothStepPath({
      sourceX: sourcePoint.x,
      sourceY: sourcePoint.y,
      targetX: targetPoint.x,
      targetY: targetPoint.y,
      sourcePosition,
      targetPosition,
      borderRadius: 16,
    });
    const style = edge.data?.lineStyle ?? "solid";
    const gap = edge.data?.dashGap ?? 6;
    return [
      {
        id: edge.id,
        path,
        label: edge.data?.label ?? "",
        labelX,
        labelY,
        color: edge.data?.color ?? "#52525b",
        dash:
          style === "dashed"
            ? `${gap} ${gap}`
            : style === "dotted"
              ? `1 ${Math.max(2, gap)}`
              : "",
      },
    ];
  });
}

function numberParam(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function generateReactComponent(input: ReactComponentExportInput) {
  const name = componentName(input.projectName);
  const nodes = buildNodes(input);
  const edges = buildEdges(input, nodes);
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const scenarios = input.scenarioDocument.scenarios.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    durationMs: scenario.durationMs,
    edgeClips: scenario.tracks.flatMap((track) => {
      if (
        !track.enabled ||
        track.property !== "connection-effect" ||
        !("id" in track.target)
      ) {
        return [];
      }
      const edge = edgeById.get(track.target.id);
      if (!edge) return [];
      return track.clips.flatMap((clip, index) => {
        if (clip.effect.type !== "edge.gradient-beam") return [];
        const colors = clip.effect.params.colors;
        return [
          {
            id: `${track.id}-${index}`,
            edgeId: edge.id,
            startMs: clip.startMs,
            durationMs: clip.durationMs,
            colors:
              Array.isArray(colors) &&
              typeof colors[0] === "string" &&
              typeof colors[1] === "string"
                ? [colors[0], colors[1]]
                : ["#ffaa40", "#9c40ff"],
            width: numberParam(clip.effect.params.widthPx, 2),
            opacity: numberParam(clip.effect.params.opacity, 1),
            trail: numberParam(clip.effect.params.trailLength, 0.1),
            glow: numberParam(clip.effect.params.glowBlurPx, 0),
          },
        ];
      });
    }),
    nodeClips: scenario.tracks.flatMap((track) => {
      if (
        !track.enabled ||
        track.property !== "node-effect" ||
        !("id" in track.target)
      ) {
        return [];
      }
      const node = nodeById.get(track.target.id);
      if (!node) return [];
      return track.clips.flatMap((clip, index) => {
        if (clip.effect.type !== "node.border-beam") return [];
        const colors = clip.effect.params.colors;
        return [
          {
            id: `${track.id}-${index}`,
            nodeId: node.id,
            startMs: clip.startMs,
            durationMs: clip.durationMs,
            colors:
              Array.isArray(colors) &&
              typeof colors[0] === "string" &&
              typeof colors[1] === "string"
                ? [colors[0], colors[1]]
                : ["#ffaa40", "#9c40ff"],
          },
        ];
      });
    }),
  }));

  const minX = Math.min(...nodes.map((node) => node.x), 0);
  const minY = Math.min(...nodes.map((node) => node.y), 0);
  const maxX = Math.max(...nodes.map((node) => node.x + node.width), 1);
  const maxY = Math.max(...nodes.map((node) => node.y + node.height), 1);
  const padding = 64;
  const viewBox = {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };

  return `import React, { type CSSProperties } from "react";

const nodes = ${JSON.stringify(nodes, null, 2)} as const;
const edges = ${JSON.stringify(edges, null, 2)} as const;
const scenarios = ${JSON.stringify(scenarios, null, 2)} as const;

export type ${name}Props = {
  className?: string;
  style?: CSSProperties;
  scenario?: string;
  playing?: boolean;
  background?: string;
};

const timing = (startMs: number, durationMs: number, totalMs: number) => {
  const start = Math.max(0.0001, Math.min(0.998, startMs / totalMs));
  const visible = Math.min(0.999, start + 0.0001);
  const end = Math.max(visible + 0.0001, Math.min(0.9998, (startMs + durationMs) / totalMs));
  const hidden = Math.min(0.9999, end + 0.0001);
  return { keyTimes: \`0;\${start};\${visible};\${end};\${hidden};1\` };
};

function DiagramNode({ node }: { node: (typeof nodes)[number] }) {
  if (node.type === "image" && node.image) {
    return <image href={node.image} x={node.x} y={node.y} width={node.width} height={node.height} preserveAspectRatio="xMidYMid meet" />;
  }
  if (node.type === "text") {
    return <text x={node.x} y={node.y + 24} fill={node.titleColor} fontSize="18" fontFamily="Inter, ui-sans-serif, system-ui">{node.label}</text>;
  }
  if (node.type === "shape" && node.shape === "circle") {
    return <ellipse cx={node.x + node.width / 2} cy={node.y + node.height / 2} rx={node.width / 2} ry={node.height / 2} fill={node.background} stroke={node.border} />;
  }
  const card = node.variant === "card";
  return (
    <g>
      <rect x={node.x} y={node.y} width={node.width} height={node.height} rx={node.radius} fill={node.background} stroke={node.border} />
      {node.type === "infra" ? (
        <>
          <rect
            x={card ? node.x + node.width / 2 - 20 : node.x + 18}
            y={card ? node.y + 22 : node.y + 16}
            width="40"
            height="40"
            rx="10"
            fill={node.accent}
            opacity="0.18"
          />
          <circle
            cx={card ? node.x + node.width / 2 : node.x + 38}
            cy={card ? node.y + 42 : node.y + 36}
            r="6"
            fill={node.accent}
          />
          <text
            x={card ? node.x + node.width / 2 : node.x + 76}
            y={card ? node.y + 92 : node.y + 31}
            textAnchor={card ? "middle" : "start"}
            fill={node.titleColor}
            fontSize="17"
            fontWeight="600"
            fontFamily="Inter, ui-sans-serif, system-ui"
          >{node.label}</text>
          {node.subtitle ? (
            <text
              x={card ? node.x + node.width / 2 : node.x + 76}
              y={card ? node.y + 116 : node.y + 53}
              textAnchor={card ? "middle" : "start"}
              fill={node.subtitleColor}
              fontSize="13"
              fontFamily="Inter, ui-sans-serif, system-ui"
            >{node.subtitle}</text>
          ) : null}
        </>
      ) : (
        <text x={node.x + node.width / 2} y={node.y + node.height / 2 + 5} textAnchor="middle" fill={node.titleColor} fontSize="16" fontFamily="Inter, ui-sans-serif, system-ui">{node.label}</text>
      )}
    </g>
  );
}

export function ${name}({
  className,
  style,
  scenario,
  playing = true,
  background = ${JSON.stringify(input.pageBackground ?? "#000000")},
}: ${name}Props) {
  const active = scenarios.find((item) => item.id === scenario || item.name === scenario) ?? scenarios.find((item) => item.id === ${JSON.stringify(input.scenarioDocument.defaultScenarioId)}) ?? scenarios[0];
  return (
    <svg
      className={className}
      style={{ display: "block", width: "100%", height: "auto", ...style }}
      viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}"
      role="img"
      aria-label=${JSON.stringify(input.projectName)}
    >
      <defs>
        <marker id="nv-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill="#52525b" />
        </marker>
        {active?.edgeClips.map((clip) => (
          <linearGradient key={\`edge-gradient-\${clip.id}\`} id={\`nv-edge-\${clip.id}\`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={clip.colors[0]} />
            <stop offset="100%" stopColor={clip.colors[1]} />
          </linearGradient>
        ))}
        {active?.nodeClips.map((clip) => (
          <linearGradient key={\`node-gradient-\${clip.id}\`} id={\`nv-node-\${clip.id}\`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={clip.colors[0]} />
            <stop offset="100%" stopColor={clip.colors[1]} />
          </linearGradient>
        ))}
      </defs>
      <rect x="${viewBox.x}" y="${viewBox.y}" width="${viewBox.width}" height="${viewBox.height}" fill={background} />
      {edges.map((edge) => (
        <g key={edge.id}>
          <path d={edge.path} fill="none" stroke={edge.color} strokeWidth="2" strokeDasharray={edge.dash || undefined} markerEnd="url(#nv-arrow)" />
          {edge.label ? <text x={edge.labelX} y={edge.labelY - 8} textAnchor="middle" fill="#a3a3a3" fontSize="11" fontFamily="Inter, ui-sans-serif, system-ui">{edge.label}</text> : null}
        </g>
      ))}
      {nodes.map((node) => <DiagramNode key={node.id} node={node} />)}
      {playing && active ? active.edgeClips.map((clip) => {
        const edge = edges.find((item) => item.id === clip.edgeId);
        if (!edge) return null;
        const t = timing(clip.startMs, clip.durationMs, active.durationMs);
        return (
          <path key={clip.id} d={edge.path} pathLength="1" fill="none" stroke={\`url(#nv-edge-\${clip.id})\`} strokeWidth={clip.width} strokeLinecap="round" strokeDasharray={\`\${clip.trail} \${1 - clip.trail}\`} strokeDashoffset="1" opacity="0" style={{ filter: clip.glow ? \`drop-shadow(0 0 \${clip.glow}px \${clip.colors[0]})\` : undefined }}>
            <animate attributeName="stroke-dashoffset" values="1;1;1;0;0;0" keyTimes={t.keyTimes} dur={\`\${active.durationMs}ms\`} repeatCount="indefinite" />
            <animate attributeName="opacity" values={\`0;0;\${clip.opacity};\${clip.opacity};0;0\`} keyTimes={t.keyTimes} dur={\`\${active.durationMs}ms\`} repeatCount="indefinite" />
          </path>
        );
      }) : null}
      {playing && active ? active.nodeClips.map((clip) => {
        const node = nodes.find((item) => item.id === clip.nodeId);
        if (!node) return null;
        const t = timing(clip.startMs, clip.durationMs, active.durationMs);
        return (
          <rect key={clip.id} x={node.x - 2} y={node.y - 2} width={node.width + 4} height={node.height + 4} rx={node.radius + 2} pathLength="1" fill="none" stroke={\`url(#nv-node-\${clip.id})\`} strokeWidth="3" strokeDasharray="0.2 0.8" strokeDashoffset="1" opacity="0">
            <animate attributeName="stroke-dashoffset" values="1;1;1;0;0;0" keyTimes={t.keyTimes} dur={\`\${active.durationMs}ms\`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes={t.keyTimes} dur={\`\${active.durationMs}ms\`} repeatCount="indefinite" />
          </rect>
        );
      }) : null}
    </svg>
  );
}

export default ${name};
`;
}

export function reactComponentFileName(projectName: string) {
  return `${componentName(projectName)}.tsx`;
}
