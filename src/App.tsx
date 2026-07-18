import { useEffect, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Toolbar } from "@/components/toolbar";
import { Sidebar } from "@/components/sidebar";
import { Canvas } from "@/components/canvas";
import { Inspector } from "@/components/inspector";
import { useFlowStore } from "@/store/flow-store";
import { cn } from "@/lib/utils";

export default function App() {
  const workMode = useFlowStore((s) => s.workMode);
  const setWorkMode = useFlowStore((s) => s.setWorkMode);
  const motionPreference = useFlowStore((s) => s.motionPreference);
  const isPreview = workMode === "preview";
  const [systemReduced, setSystemReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const reducedMotion =
    motionPreference === "reduced" ||
    (motionPreference === "system" && systemReduced);

  useEffect(() => {
    if (!isPreview) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "input, select, textarea, button, [contenteditable='true'], [role='dialog'], [role='menu']"
        )
      ) {
        return;
      }
      setWorkMode("design");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isPreview, setWorkMode]);

  const clipboardRef = useRef<{ ids: string[]; pasteCount: number }>({
    ids: [],
    pasteCount: 0,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (useFlowStore.getState().workMode === "preview") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "c") {
        const ids = useFlowStore
          .getState()
          .nodes.filter((n) => n.selected)
          .map((n) => n.id);
        if (ids.length === 0) return;
        clipboardRef.current = { ids, pasteCount: 0 };
        e.preventDefault();
      } else if (key === "v") {
        const { ids, pasteCount } = clipboardRef.current;
        if (ids.length === 0) return;
        const next = pasteCount + 1;
        clipboardRef.current = { ids, pasteCount: next };
        const step = 24 * next;
        useFlowStore.getState().duplicateNodes(ids, { x: step, y: step });
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <ReactFlowProvider>
      <div
        className={cn(
          "flex h-screen w-screen flex-col bg-background text-foreground",
          isPreview && "preview-mode"
        )}
        data-motion={reducedMotion ? "reduced" : "full"}
      >
        <Toolbar />
        <div className="flex flex-1 overflow-hidden">
          {!isPreview && <Sidebar />}
          <div className="relative flex flex-1 overflow-hidden">
            <main className="flex-1 overflow-hidden">
              <Canvas />
            </main>
            {!isPreview && <Inspector />}
          </div>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
