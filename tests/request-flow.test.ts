import { describe, expect, test } from "vitest";
import {
  buildRequestFlow,
  buildSelectedRequestFlow,
} from "../src/animation/request-flow";

describe("request flow", () => {
  test("orders reachable directed edges by hop and ignores cycles", () => {
    const steps = buildRequestFlow(
      [
        { id: "user-firewall", source: "user", target: "firewall" },
        { id: "firewall-proxy", source: "firewall", target: "proxy" },
        { id: "proxy-server", source: "proxy", target: "server" },
        { id: "firewall-audit", source: "firewall", target: "audit" },
        { id: "server-firewall", source: "server", target: "firewall" },
        { id: "unrelated", source: "db", target: "backup" },
      ],
      "user"
    );

    expect(steps).toEqual([
      { edgeId: "user-firewall", hop: 0 },
      { edgeId: "firewall-proxy", hop: 1 },
      { edgeId: "firewall-audit", hop: 1 },
      { edgeId: "proxy-server", hop: 2 },
    ]);
  });

  test("finds the start of a specifically selected path", () => {
    expect(
      buildSelectedRequestFlow([
        { id: "firewall-proxy", source: "firewall", target: "proxy" },
        { id: "proxy-server", source: "proxy", target: "server" },
      ])
    ).toEqual([
      { edgeId: "firewall-proxy", hop: 0 },
      { edgeId: "proxy-server", hop: 1 },
    ]);
  });
});
