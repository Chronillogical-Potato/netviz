export interface RequestFlowEdge {
  id: string;
  source: string;
  target: string;
}

export interface RequestFlowStep {
  edgeId: string;
  hop: number;
}

export function buildRequestFlow(
  edges: readonly RequestFlowEdge[],
  startNodeId: string
): RequestFlowStep[] {
  if (!startNodeId) return [];

  const steps: RequestFlowStep[] = [];
  const nodeDepth = new Map<string, number>([[startNodeId, 0]]);
  const queue = [startNodeId];

  for (let index = 0; index < queue.length; index += 1) {
    const source = queue[index];
    const depth = nodeDepth.get(source) ?? 0;
    for (const edge of edges) {
      if (edge.source !== source) continue;
      const knownTargetDepth = nodeDepth.get(edge.target);
      if (knownTargetDepth !== undefined && knownTargetDepth <= depth) continue;
      if (knownTargetDepth === undefined) {
        nodeDepth.set(edge.target, depth + 1);
        queue.push(edge.target);
      }
      steps.push({ edgeId: edge.id, hop: depth });
    }
  }

  return steps;
}

export function buildSelectedRequestFlow(
  edges: readonly RequestFlowEdge[]
): RequestFlowStep[] {
  if (edges.length === 0) return [];

  const targetIds = new Set(edges.map((edge) => edge.target));
  const roots = edges
    .map((edge) => edge.source)
    .filter(
      (source, index, sources) =>
        !targetIds.has(source) && sources.indexOf(source) === index
    );
  if (roots.length === 0) roots.push(edges[0].source);

  const steps: RequestFlowStep[] = [];
  const included = new Set<string>();
  for (const root of roots) {
    for (const step of buildRequestFlow(edges, root)) {
      if (included.has(step.edgeId)) continue;
      included.add(step.edgeId);
      steps.push(step);
    }
  }
  return steps;
}
