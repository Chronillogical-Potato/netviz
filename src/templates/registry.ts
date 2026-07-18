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
    description: "Client, load balancer, two servers, database, and two request paths.",
    previewName: "Load-balanced requests",
    width: 1_060,
    height: 360,
    nodes: [
      {
        key: "client",
        blockId: "service-provider",
        position: { x: 0, y: 105 },
        label: "Client",
        subtitle: "Web / Mobile",
      },
      {
        key: "load-balancer",
        blockId: "loadbalancer",
        position: { x: 270, y: 145 },
      },
      {
        key: "server-a",
        blockId: "server",
        position: { x: 560, y: 0 },
        label: "Server A",
      },
      {
        key: "server-b",
        blockId: "server",
        position: { x: 560, y: 220 },
        label: "Server B",
      },
      {
        key: "database",
        blockId: "database",
        position: { x: 840, y: 145 },
      },
    ],
    edges: [
      {
        key: "client-lb",
        source: "client",
        target: "load-balancer",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "lb-server-a",
        source: "load-balancer",
        target: "server-a",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "lb-server-b",
        source: "load-balancer",
        target: "server-b",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "server-a-db",
        source: "server-a",
        target: "database",
        sourceHandle: "right",
        targetHandle: "left",
      },
      {
        key: "server-b-db",
        source: "server-b",
        target: "database",
        sourceHandle: "right",
        targetHandle: "left",
      },
    ],
    animations: [
      {
        name: "Request via Server A",
        nodeKeys: ["client", "load-balancer", "server-a", "database"],
        colors: ["#34d399", "#22d3ee"],
      },
      {
        name: "Request via Server B",
        nodeKeys: ["client", "load-balancer", "server-b", "database"],
        colors: ["#a78bfa", "#3b82f6"],
      },
    ],
  },
];

export function findTemplate(id: string) {
  return TEMPLATES.find((template) => template.id === id);
}
