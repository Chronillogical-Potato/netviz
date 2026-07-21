import { describe, expect, test } from "bun:test";
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
];

describe("production templates", () => {
  test("offers two complex animated systems alongside the load balancer", () => {
    expect(TEMPLATES.map((template) => template.id)).toEqual([
      "load-balanced-web-app",
      "event-driven-commerce",
      "kubernetes-production-platform",
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

  test("uses valid blocks and connected paths for every template animation", () => {
    const blockIds = new Set(CORE_BLOCKS.map((block) => block.id));

    for (const template of TEMPLATES) {
      const nodeKeys = new Set(template.nodes.map((node) => node.key));
      const edgePairs = new Set(
        template.edges.map((edge) => `${edge.source}:${edge.target}`)
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
    }
  });
});
