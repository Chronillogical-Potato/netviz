export type TemplateNode = {
  key: string;
  blockId: string;
  position: { x: number; y: number };
  label?: string;
  subtitle?: string;
};

export type TemplateEdge = {
  key: string;
  source: string;
  target: string;
  sourceHandle?: "top" | "right" | "bottom" | "left";
  targetHandle?: "top" | "right" | "bottom" | "left";
};

export type TemplateAnimation = {
  name: string;
  nodeKeys: string[];
  colors: [string, string];
};

export type TemplateDefinition = {
  id: string;
  name: string;
  description: string;
  previewName?: string;
  edgeCurveStyle?: "stepped" | "smooth";
  width: number;
  height: number;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
  animations: TemplateAnimation[];
};

export const TEMPLATES: TemplateDefinition[] = [
  {
    id: "load-balanced-web-app",
    name: "Load-balanced web app",
    description:
      "Production web delivery with edge caching, WAF, high-availability balancing, stateless application servers, cache, replicated storage, and observability.",
    previewName: "Load-balanced requests",
    edgeCurveStyle: "smooth",
    width: 1_940,
    height: 640,
    nodes: [
      {
        key: "users",
        blockId: "service-provider",
        position: { x: 0, y: 260 },
        label: "Global Users",
        subtitle: "Web / Mobile",
      },
      {
        key: "cdn",
        blockId: "proxy",
        position: { x: 280, y: 284 },
        label: "CDN / Edge",
        subtitle: "TLS termination & caching",
      },
      {
        key: "waf",
        blockId: "firewall",
        position: { x: 560, y: 284 },
        label: "WAF / Firewall",
        subtitle: "DDoS & rate limiting",
      },
      {
        key: "load-balancer",
        blockId: "loadbalancer",
        position: { x: 840, y: 284 },
        label: "HA Load Balancer",
        subtitle: "Health checks & failover",
      },
      {
        key: "app-a",
        blockId: "container",
        position: { x: 1_140, y: 0 },
        label: "App Server A",
        subtitle: "Stateless application",
      },
      {
        key: "app-b",
        blockId: "container",
        position: { x: 1_140, y: 284 },
        label: "App Server B",
        subtitle: "Stateless application",
      },
      {
        key: "app-c",
        blockId: "container",
        position: { x: 1_140, y: 528 },
        label: "App Server C",
        subtitle: "Stateless application",
      },
      {
        key: "cache",
        blockId: "database",
        position: { x: 1_420, y: 0 },
        label: "Redis Cache",
        subtitle: "Sessions & hot data",
      },
      {
        key: "primary-db",
        blockId: "database",
        position: { x: 1_420, y: 284 },
        label: "PostgreSQL Primary",
        subtitle: "Transactional writes",
      },
      {
        key: "replica-db",
        blockId: "database",
        position: { x: 1_700, y: 284 },
        label: "PostgreSQL Replica",
        subtitle: "Read scaling & failover",
      },
      {
        key: "observability",
        blockId: "service-provider",
        position: { x: 1_700, y: 504 },
        label: "Observability",
        subtitle: "Metrics / Logs / Traces",
      },
    ],
    edges: [
      {
        key: "users-cdn",
        source: "users",
        target: "cdn",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "cdn-waf",
        source: "cdn",
        target: "waf",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "waf-lb",
        source: "waf",
        target: "load-balancer",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "lb-app-a",
        source: "load-balancer",
        target: "app-a",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "lb-app-b",
        source: "load-balancer",
        target: "app-b",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "lb-app-c",
        source: "load-balancer",
        target: "app-c",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "app-a-cache",
        source: "app-a",
        target: "cache",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "app-a-primary",
        source: "app-a",
        target: "primary-db",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "app-b-cache",
        source: "app-b",
        target: "cache",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "app-b-primary",
        source: "app-b",
        target: "primary-db",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "app-c-cache",
        source: "app-c",
        target: "cache",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "app-c-primary",
        source: "app-c",
        target: "primary-db",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "app-c-replica",
        source: "app-c",
        target: "replica-db",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "primary-replica",
        source: "primary-db",
        target: "replica-db",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "app-a-observability",
        source: "app-a",
        target: "observability",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "app-b-observability",
        source: "app-b",
        target: "observability",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "app-c-observability",
        source: "app-c",
        target: "observability",
        sourceHandle: "right",
        targetHandle: "left",
      },
    ],
    animations: [
      {
        name: "Cached request via App A",
        nodeKeys: ["users", "cdn", "waf", "load-balancer", "app-a", "cache"],
        colors: ["#34d399", "#22d3ee"],
      },
      {
        name: "Write request via App B",
        nodeKeys: [
          "users",
          "cdn",
          "waf",
          "load-balancer",
          "app-b",
          "primary-db",
        ],
        colors: ["#a78bfa", "#3b82f6"],
      },
      {
        name: "Read request via App C",
        nodeKeys: [
          "users",
          "cdn",
          "waf",
          "load-balancer",
          "app-c",
          "replica-db",
        ],
        colors: ["#f59e0b", "#f97316"],
      },
      {
        name: "Primary database replication",
        nodeKeys: ["primary-db", "replica-db"],
        colors: ["#38bdf8", "#818cf8"],
      },
      {
        name: "Telemetry export",
        nodeKeys: ["app-b", "observability"],
        colors: ["#2dd4bf", "#22d3ee"],
      },
    ],
  },
];

export function findTemplate(id: string) {
  return TEMPLATES.find((template) => template.id === id);
}
