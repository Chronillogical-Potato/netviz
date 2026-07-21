import { describe, expect, test } from "bun:test";
import { canonicalIconName } from "../src/blocks/icons";
import { CORE_BLOCKS } from "../src/blocks/registry";
import { TEMPLATES } from "../src/templates/registry";

const productionTemplates = [
  {
    id: "event-driven-commerce",
    labels: [
      "API Gateway",
      "Order Service",
      "Kafka Event Bus",
      "Payment Worker",
      "Dead Letter Queue",
    ],
    animations: [
      "Customer checkout",
      "Payment processing",
      "Inventory reservation",
      "Customer notification",
    ],
  },
  {
    id: "kubernetes-production-platform",
    labels: [
      "Kubernetes Ingress",
      "Web API",
      "Kafka Cluster",
      "Worker Deployment",
      "Prometheus",
      "Grafana / Alerting",
    ],
    animations: [
      "Cached API request",
      "Authenticated request",
      "Asynchronous job",
      "Autoscaling signal",
    ],
  },
  {
    id: "sharded-postgres-platform",
    labels: [
      "Authoritative DNS",
      "Edge Firewall",
      "Traffic Load Balancer",
      "Pgpool-II",
      "Customer Shard",
      "Orders Shard",
      "Analytics Shard",
    ],
    animations: [
      "Web profile request / response",
      "Mobile checkout request / response",
      "Partner analytics request / response",
      "Cached session request / response",
    ],
  },
];

describe("production templates", () => {
  test("gives each template a distinct picker identity", () => {
    expect(new Set(TEMPLATES.map((template) => template.iconName)).size).toBe(
      TEMPLATES.length
    );
    expect(new Set(TEMPLATES.map((template) => template.accent)).size).toBe(
      TEMPLATES.length
    );
    expect(
      TEMPLATES.every((template) => canonicalIconName(template.iconName))
    ).toBeTrue();
  });

  test("keeps production stages spacious and uses purpose-specific icons", () => {
    for (const template of TEMPLATES) {
      const columns = [
        ...new Set(template.nodes.map((node) => node.position.x)),
      ].sort((a, b) => a - b);
      const gaps = columns.slice(1).map((x, index) => x - columns[index]);

      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(320);
      expect(
        template.nodes.every((node) => canonicalIconName(node.iconName))
      ).toBeTrue();
    }
  });

  test("offers three complex animated systems alongside the load balancer", () => {
    expect(TEMPLATES.map((template) => template.id)).toEqual([
      "load-balanced-web-app",
      "event-driven-commerce",
      "kubernetes-production-platform",
      "sharded-postgres-platform",
    ]);

    for (const expected of productionTemplates) {
      const template = TEMPLATES.find((item) => item.id === expected.id);
      expect(template).toBeDefined();
      expect(template?.edgeCurveStyle).toBe("smooth");
      expect(template?.previewName).toBeString();
      expect(template?.nodes.length).toBeGreaterThanOrEqual(14);
      expect(template?.edges.length).toBeGreaterThanOrEqual(16);
      expect(template?.animations.length).toBeGreaterThanOrEqual(5);
      const labels = template?.nodes.map((node) => node.label) ?? [];
      const animations =
        template?.animations.map((animation) => animation.name) ?? [];
      expect(expected.labels.every((label) => labels.includes(label))).toBeTrue();
      expect(
        expected.animations.every((animation) => animations.includes(animation))
      ).toBeTrue();
    }
  });

  test("schedules overlapping request-response traffic for the sharded database", () => {
    const template = TEMPLATES.find(
      (item) => item.id === "sharded-postgres-platform"
    );
    const requestResponse =
      template?.animations.filter(
        (animation) => animation.preset === "request-response"
      ) ?? [];

    expect(requestResponse).toHaveLength(4);
    expect(requestResponse.map((animation) => animation.previewStartMs)).toEqual([
      0,
      900,
      1_800,
      3_100,
    ]);
    expect(
      requestResponse.every((animation) => animation.responseColors?.length === 2)
    ).toBeTrue();
  });

  test("schedules concurrent workload and telemetry beams for Kubernetes", () => {
    const template = TEMPLATES.find(
      (item) => item.id === "kubernetes-production-platform"
    );
    const starts = new Map(
      template?.animations.map((animation) => [
        animation.name,
        animation.previewStartMs,
      ])
    );

    expect([
      starts.get("Cached API request"),
      starts.get("Authenticated request"),
      starts.get("Asynchronous job"),
    ]).toEqual([0, 900, 1_800]);
    expect([
      starts.get("Metrics dashboard"),
      starts.get("Centralized log search"),
      starts.get("Distributed trace"),
    ]).toEqual([6_000, 6_000, 6_000]);
  });

  test("uses valid blocks and connected paths for every template animation", () => {
    const blockIds = new Set(CORE_BLOCKS.map((block) => block.id));

    for (const template of TEMPLATES) {
      const nodeKeys = new Set(template.nodes.map((node) => node.key));
      const edgePairs = new Set(
        template.edges.map((edge) => `${edge.source}:${edge.target}`)
      );
      const connectedPairs = new Set(
        template.edges.flatMap((edge) => [
          `${edge.source}:${edge.target}`,
          `${edge.target}:${edge.source}`,
        ])
      );
      expect(nodeKeys.size).toBe(template.nodes.length);
      expect(new Set(template.edges.map((edge) => edge.key)).size).toBe(
        template.edges.length
      );
      expect(template.nodes.every((node) => blockIds.has(node.blockId))).toBeTrue();
      expect(
        template.edges.every(
          (edge) => nodeKeys.has(edge.source) && nodeKeys.has(edge.target)
        )
      ).toBeTrue();
      expect(
        template.animations.every((animation) =>
          animation.nodeKeys.slice(0, -1).every((key, index) =>
            edgePairs.has(`${key}:${animation.nodeKeys[index + 1]}`)
          )
        )
      ).toBeTrue();
      expect(
        template.animations.every(
          (animation) =>
            !animation.responseNodeKeys ||
            animation.responseNodeKeys.slice(0, -1).every((key, index) =>
              connectedPairs.has(
                `${key}:${animation.responseNodeKeys![index + 1]}`
              )
            )
        )
      ).toBeTrue();
    }
  });
});
