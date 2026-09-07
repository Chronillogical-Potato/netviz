import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import { InfraNodeView } from "../src/components/nodes/infra-node";

describe("infrastructure block motion surface", () => {
  for (const shape of ["circle", "square"] as const) {
    test(`anchors ${shape} motion to its visible surface`, () => {
      const markup = renderToStaticMarkup(
        <ReactFlowProvider>
          <InfraNodeView {...({
            id: "motion-node",
            type: "infra",
            selected: false,
            data: { blockId: "database", label: "Database", subtitle: "Primary", shape },
          } as never)} />
        </ReactFlowProvider>
      );

      expect(markup.match(/nv-node-motion-border/g)).toHaveLength(1);
      expect(markup.match(/infra-card/g)).toHaveLength(1);
      if (shape === "circle") {
        expect(markup).toMatch(/<div class="[^"]*infra-card relative[^"]*rounded-full[^"]*"[^>]*><div class="nv-node-motion-border"/);
        expect(markup).not.toMatch(/^<div class="[^"]*infra-card/);
        expect(markup).not.toMatch(/class="[^"]*infra-card[^"]*overflow-hidden/);
      } else {
        expect(markup).toMatch(/^<div class="[^"]*infra-card[^"]*"[^>]*><div class="nv-node-motion-border"/);
      }
      expect(markup).toContain("Primary");
    });
  }
});
