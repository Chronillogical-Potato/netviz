import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  Check,
  ChevronDown,
  Eye,
  PenLine,
  Settings,
} from "@/ui/icons";
import type { AppIcon } from "@/ui/icons";
import { useReactFlow, getNodesBounds, getViewportForBounds } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import { useFlowStore } from "@/store/flow-store";
import {
  createFlowSnapshot,
  downloadSnapshot,
  readSnapshotFromFile,
} from "@/lib/storage";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Logo } from "@/ui/logo";
import { SettingsDialog } from "./settings-dialog";
import { ShareProjectDialog } from "./share-project-button";

import type { WorkMode } from "@/store/flow-store";
const WORK_MODES: { id: WorkMode; label: string; icon: AppIcon }[] = [
  { id: "design", label: "Design", icon: PenLine },
  { id: "animation", label: "Animation", icon: Activity },
];

// Centered file name, Figma-style: double-click to rename in place.
// Persistence is automatic — projectName lives in the store, which
// auto-saves to IndexedDB.
function ProjectTitle() {
  const projectName = useFlowStore((s) => s.projectName);
  const setProjectName = useFlowStore((s) => s.setProjectName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(projectName);
  }, [projectName, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setProjectName(draft);
    setEditing(false);
  };

  return (
    <div className="pointer-events-none fixed left-1/2 top-0 z-40 flex h-12 -translate-x-1/2 items-center">
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setDraft(projectName);
              setEditing(false);
            }
          }}
          style={{ width: `${Math.min(Math.max(draft.length + 3, 8), 48)}ch` }}
          className="pointer-events-auto h-7 rounded-md bg-input px-2 text-center text-[13px] font-medium text-foreground outline-none focus:ring-1 focus:ring-ring"
          aria-label="Project name"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={() => setEditing(true)}
          title="Double-click to rename"
          className="pointer-events-auto max-w-72 truncate rounded-md px-2 py-1 text-[13px] font-medium text-foreground/90 transition-colors hover:bg-muted"
        >
          {projectName}
        </button>
      )}
    </div>
  );
}

function ModeSelector() {
  const workMode = useFlowStore((s) => s.workMode);
  const setWorkMode = useFlowStore((s) => s.setWorkMode);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const current = WORK_MODES.find((m) => m.id === workMode) ?? WORK_MODES[0];
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg bg-muted pl-2.5 pr-2 transition-colors hover:bg-accent",
          open && "bg-accent"
        )}
      >
        <Logo className="h-4 w-4" />
        <span className="text-[13px] font-semibold">{current.label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[160px] rounded-xl border border-border/60 bg-popover p-1 shadow-xl">
          {WORK_MODES.map((m) => {
            const active = workMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setWorkMode(m.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-muted"
              >
                <m.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1">{m.label}</span>
                {active && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Toolbar() {
  // Only subscribe to the booleans the toolbar renders with — save/export
  // read the full workspace via getState() at call time so the toolbar
  // doesn't re-render on every node drag frame.
  const hasNodes = useFlowStore((s) => s.nodes.length > 0);
  const workMode = useFlowStore((s) => s.workMode);
  const setWorkMode = useFlowStore((s) => s.setWorkMode);
  const setRenderAll = useFlowStore((s) => s.setRenderAllElements);
  const replaceDocument = useFlowStore((s) => s.replaceDocument);
  const clear = useFlowStore((s) => s.clear);
  const resetWorkspace = useFlowStore((s) => s.resetWorkspace);
  const selectAll = useFlowStore((s) => s.selectAll);
  const addImageNode = useFlowStore((s) => s.addImageNode);
  const { screenToFlowPosition } = useReactFlow();
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [exportDialog, setExportDialog] = useState<{
    format: "png" | "svg";
    name: string;
    bounds?: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const [cropMode, setCropMode] = useState<{
    format: "png" | "svg";
  } | null>(null);
  const [saveDialog, setSaveDialog] = useState<{ name: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (workMode === "preview") return;
      const target = e.target as HTMLElement | null;
      if (target && /input|textarea/i.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        useFlowStore.temporal.getState().undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        useFlowStore.temporal.getState().redo();
      } else if (k === "a") {
        e.preventDefault();
        selectAll();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectAll, workMode]);

  const uploadImage = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const img = new Image();
      img.onload = () => {
        const max = 400;
        const ratio = img.width / img.height || 1;
        const width = Math.min(max, img.width);
        const height = width / ratio;
        const pos = screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        addImageNode(
          src,
          { x: pos.x - width / 2, y: pos.y - height / 2 },
          { width, height }
        );
      };
      img.src = src;
    };
    reader.readAsDataURL(f);
  };

  const defaultExportName = () => useFlowStore.getState().projectName;

  const openExportDialog = (format: "png" | "svg") => {
    if (!hasNodes) return;
    setCropMode({ format });
  };

  const onCropComplete = useCallback(
    (screenRect: { x: number; y: number; width: number; height: number }) => {
      if (!cropMode) return;
      const tl = screenToFlowPosition({ x: screenRect.x, y: screenRect.y });
      const br = screenToFlowPosition({
        x: screenRect.x + screenRect.width,
        y: screenRect.y + screenRect.height,
      });
      setCropMode(null);
      setExportDialog({
        format: cropMode.format,
        name: defaultExportName(),
        bounds: {
          x: tl.x,
          y: tl.y,
          width: br.x - tl.x,
          height: br.y - tl.y,
        },
      });
    },
    [cropMode, screenToFlowPosition]
  );

  const onCropExportAll = useCallback(() => {
    if (!cropMode) return;
    setCropMode(null);
    setExportDialog({ format: cropMode.format, name: defaultExportName() });
  }, [cropMode]);

  const onCropCancel = useCallback(() => setCropMode(null), []);

  const exportImage = async (
    format: "png" | "svg",
    filename: string,
    customBounds?: { x: number; y: number; width: number; height: number }
  ) => {
    const { nodes, turboColors } = useFlowStore.getState();
    const viewport = document.querySelector(
      ".react-flow__viewport"
    ) as HTMLElement | null;
    if (!viewport || nodes.length === 0) return;
    const bounds = customBounds ?? getNodesBounds(nodes);
    if (bounds.width === 0 || bounds.height === 0) return;

    // Force React Flow to mount all nodes/edges (disables virtualization temporarily)
    setRenderAll(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const padding = 80;
    const width = Math.round(bounds.width + padding * 2);
    const height = Math.round(bounds.height + padding * 2);
    const vp = getViewportForBounds(bounds, width, height, 1, 1, padding);
    const state = useFlowStore.getState();
    const pageBg = state.pages.find((p) => p.id === state.activePageId)
      ?.bgColor;
    const bg = getComputedStyle(document.body)
      .getPropertyValue("--canvas-bg")
      .trim();
    const bgColor = pageBg ?? (bg ? `hsl(${bg})` : "#ffffff");

    const edgeSvgs = Array.from(
      viewport.querySelectorAll(".react-flow__edges svg, .react-flow__edges > svg")
    ) as SVGSVGElement[];
    const saved = edgeSvgs.map((svg) => ({
      el: svg,
      w: svg.getAttribute("width"),
      h: svg.getAttribute("height"),
      style: svg.getAttribute("style"),
    }));
    const maxX = Math.ceil(bounds.x + bounds.width + padding * 2);
    const maxY = Math.ceil(bounds.y + bounds.height + padding * 2);
    const svgW = Math.max(maxX, Math.round(width / vp.zoom), 1);
    const svgH = Math.max(maxY, Math.round(height / vp.zoom), 1);
    edgeSvgs.forEach((svg) => {
      svg.setAttribute("width", String(svgW));
      svg.setAttribute("height", String(svgH));
      svg.style.width = `${svgW}px`;
      svg.style.height = `${svgH}px`;
      svg.style.overflow = "visible";
    });
    const edgesContainer = viewport.querySelector(
      ".react-flow__edges"
    ) as HTMLElement | null;
    const savedEdgesStyle = edgesContainer?.getAttribute("style") ?? null;
    if (edgesContainer) {
      edgesContainer.style.width = `${svgW}px`;
      edgesContainer.style.height = `${svgH}px`;
      edgesContainer.style.position = "absolute";
      edgesContainer.style.top = "0";
      edgesContainer.style.left = "0";
      edgesContainer.style.overflow = "visible";
    }

    const overriddenPaths: {
      el: SVGPathElement;
      stroke: string | null;
      style: string | null;
    }[] = [];
    const [c0, c1] = turboColors ?? ["#ec4899", "#3b82f6"];
    const SVG_NS = "http://www.w3.org/2000/svg";

    // html-to-image deep-clones SVGs but skips style inlining on SVG children.
    // Inline computed stroke/fill on all edge paths so they survive the clone.
    const allEdgePaths = Array.from(
      viewport.querySelectorAll(
        ".react-flow__edge-path, .react-flow__edge-interaction"
      )
    ) as SVGElement[];
    const savedEdgePathStyles = allEdgePaths.map((el) => ({
      el,
      style: el.getAttribute("style"),
    }));
    allEdgePaths.forEach((el) => {
      const cs = window.getComputedStyle(el);
      el.style.setProperty("stroke", cs.stroke);
      el.style.setProperty("stroke-width", cs.strokeWidth);
      el.style.setProperty("fill", cs.fill);
      if (cs.strokeDasharray && cs.strokeDasharray !== "none")
        el.style.setProperty("stroke-dasharray", cs.strokeDasharray);
      if (cs.strokeLinecap && cs.strokeLinecap !== "butt")
        el.style.setProperty("stroke-linecap", cs.strokeLinecap);
    });

    // Clone marker <defs> into each edge SVG so url(#marker) refs resolve
    // within the same SVG (html-to-image isolates each SVG).
    const defsSource = edgesContainer?.querySelector("svg > defs");
    const injectedDefs: SVGDefsElement[] = [];
    if (defsSource) {
      edgeSvgs.forEach((svg) => {
        if (svg.contains(defsSource)) return;
        const clone = defsSource.cloneNode(true) as SVGDefsElement;
        svg.insertBefore(clone, svg.firstChild);
        injectedDefs.push(clone);
      });
    }

    edgeSvgs.forEach((svg) => {
      const turboPaths = svg.querySelectorAll(
        ".react-flow__edge.turbo-on .react-flow__edge-path"
      );
      if (turboPaths.length === 0) return;
      const gradId = `turbo-edge-export-${Math.random().toString(36).slice(2, 9)}`;
      let defs = svg.querySelector("defs");
      if (!defs) {
        defs = document.createElementNS(SVG_NS, "defs");
        svg.insertBefore(defs, svg.firstChild);
      }
      const grad = document.createElementNS(SVG_NS, "linearGradient");
      grad.setAttribute("id", gradId);
      grad.setAttribute("x1", "0%");
      grad.setAttribute("y1", "0%");
      grad.setAttribute("x2", "100%");
      grad.setAttribute("y2", "0%");
      const s0 = document.createElementNS(SVG_NS, "stop");
      s0.setAttribute("offset", "0%");
      s0.setAttribute("stop-color", c0);
      const s1 = document.createElementNS(SVG_NS, "stop");
      s1.setAttribute("offset", "100%");
      s1.setAttribute("stop-color", c1);
      grad.appendChild(s0);
      grad.appendChild(s1);
      defs.appendChild(grad);
      turboPaths.forEach((p) => {
        const path = p as SVGPathElement;
        overriddenPaths.push({
          el: path,
          stroke: path.getAttribute("stroke"),
          style: path.getAttribute("style"),
        });
        path.setAttribute("stroke", `url(#${gradId})`);
        path.style.stroke = `url(#${gradId})`;
      });
    });

    try {
      const opts = {
        backgroundColor: bgColor,
        width,
        height,
        pixelRatio: format === "png" ? 4 : 1,
        cacheBust: true,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
        },
      };
      const dataUrl =
        format === "png"
          ? await toPng(viewport, opts)
          : await toSvg(viewport, opts);
      const cleaned =
        filename.trim().replace(/[\\/:*?"<>|]/g, "_") || defaultExportName();
      const stripped = cleaned.replace(
        new RegExp(`\\.${format}$`, "i"),
        ""
      );
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${stripped}.${format}`;
      a.click();
    } finally {
      saved.forEach(({ el, w, h, style }) => {
        if (w === null) el.removeAttribute("width"); else el.setAttribute("width", w);
        if (h === null) el.removeAttribute("height"); else el.setAttribute("height", h);
        if (style === null) el.removeAttribute("style"); else el.setAttribute("style", style);
      });
      if (edgesContainer) {
        if (savedEdgesStyle === null) edgesContainer.removeAttribute("style");
        else edgesContainer.setAttribute("style", savedEdgesStyle);
      }
      injectedDefs.forEach((d) => d.parentNode?.removeChild(d));
      overriddenPaths.forEach(({ el, stroke }) => {
        if (stroke === null) el.removeAttribute("stroke");
        else el.setAttribute("stroke", stroke);
      });
      edgeSvgs.forEach((svg) => {
        svg
          .querySelectorAll("linearGradient[id^='turbo-edge-export-']")
          .forEach((g) => g.parentNode?.removeChild(g));
      });
      savedEdgePathStyles.forEach(({ el, style }) => {
        if (style === null) el.removeAttribute("style");
        else el.setAttribute("style", style);
      });
      setRenderAll(false);
    }
  };

  const save = () =>
    setSaveDialog({ name: useFlowStore.getState().projectName });

  const doSave = (name: string) => {
    const s = useFlowStore.getState();
    downloadSnapshot(
      createFlowSnapshot({
        projectName: s.projectName,
        nodes: s.nodes,
        edges: s.edges,
        customBlocks: s.customBlocks,
        groups: s.groups,
        pages: s.pages,
        activePageId: s.activePageId,
        pageContents: s.pageContents,
        scenarioDocument: s.scenarioDocument,
        turbo: s.turbo,
        turboColors: s.turboColors,
      }),
      name
    );
  };

  const load = async (f: File) => {
    try {
      const snap = await readSnapshotFromFile(f);
      replaceDocument(snap);
    } catch (e) {
      console.error(e);
      alert("Could not load file. See console for details.");
    }
  };

  return (
    <header className="relative flex h-12 shrink-0 items-center border-b border-border bg-background px-2.5">
      <ProjectTitle />
      <div className="flex items-center justify-start gap-2">
        <ModeSelector />
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          title="Settings"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        actions={{
          onShare: () => setShareOpen(true),
          onSave: save,
          onExportPng: () => openExportDialog("png"),
          onExportSvg: () => openExportDialog("svg"),
          onImport: () => fileRef.current?.click(),
          onUploadImage: () => imageRef.current?.click(),
          onClearCanvas: () => setConfirmClearOpen(true),
          onResetWorkspace: () => setConfirmResetOpen(true),
        }}
      />
      <ShareProjectDialog open={shareOpen} onOpenChange={setShareOpen} />
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => setWorkMode("preview")}
          disabled={!hasNodes}
          title="Hide the editor for screenshots or recording"
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) load(f);
          e.target.value = "";
        }}
      />
      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadImage(f);
          e.target.value = "";
        }}
      />
      <Dialog
        open={!!saveDialog}
        onOpenChange={(o) => {
          if (!o) setSaveDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save file</DialogTitle>
            <DialogDescription>
              Downloads the whole project as a .json file.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5 py-1">
            <Label htmlFor="save-filename">File name</Label>
            <div className="flex items-center gap-1">
              <Input
                id="save-filename"
                autoFocus
                value={saveDialog?.name ?? ""}
                onChange={(e) =>
                  setSaveDialog((d) =>
                    d ? { ...d, name: e.target.value } : d
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && saveDialog) {
                    e.preventDefault();
                    const { name } = saveDialog;
                    setSaveDialog(null);
                    doSave(name);
                  }
                }}
              />
              <span className="shrink-0 text-sm text-muted-foreground">
                .json
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!saveDialog) return;
                const { name } = saveDialog;
                setSaveDialog(null);
                doSave(name);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset workspace?</DialogTitle>
            <DialogDescription>
              Wipes all nodes, edges, groups, custom blocks, and preferences.
              App reloads as brand new. Cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmResetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmResetOpen(false);
                void resetWorkspace();
              }}
            >
              Reset workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!exportDialog}
        onOpenChange={(o) => {
          if (!o) setExportDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Export {exportDialog?.format.toUpperCase() ?? ""}
            </DialogTitle>
            <DialogDescription>Choose a file name.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5 py-1">
            <Label htmlFor="export-filename">File name</Label>
            <div className="flex items-center gap-1">
              <Input
                id="export-filename"
                autoFocus
                value={exportDialog?.name ?? ""}
                onChange={(e) =>
                  setExportDialog((d) =>
                    d ? { ...d, name: e.target.value } : d
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && exportDialog) {
                    e.preventDefault();
                    const { format, name, bounds } = exportDialog;
                    setExportDialog(null);
                    void exportImage(format, name, bounds);
                  }
                }}
              />
              <span className="shrink-0 text-sm text-muted-foreground">
                .{exportDialog?.format}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!exportDialog) return;
                const { format, name, bounds } = exportDialog;
                setExportDialog(null);
                void exportImage(format, name, bounds);
              }}
            >
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear canvas?</DialogTitle>
            <DialogDescription>
              This removes all nodes, edges, and groups. Cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClearOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clear();
                setConfirmClearOpen(false);
              }}
            >
              Clear canvas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {cropMode && (
        <CropOverlay
          onComplete={onCropComplete}
          onExportAll={onCropExportAll}
          onCancel={onCropCancel}
        />
      )}
    </header>
  );
}

function CropOverlay({
  onComplete,
  onExportAll,
  onCancel,
}: {
  onComplete: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  onExportAll: () => void;
  onCancel: () => void;
}) {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel]);

  const rect =
    start && end
      ? {
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x),
          height: Math.abs(end.y - start.y),
        }
      : null;

  const handleDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    setStart({ x: e.clientX, y: e.clientY });
    setEnd({ x: e.clientX, y: e.clientY });
  };

  const handleMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    setEnd({ x: e.clientX, y: e.clientY });
  };

  const handleUp = () => {
    if (!dragging.current || !rect) return;
    dragging.current = false;
    if (rect.width < 10 || rect.height < 10) {
      setStart(null);
      setEnd(null);
      return;
    }
    onComplete(rect);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 cursor-crosshair select-none"
      onMouseDown={handleDown}
      onMouseMove={handleMove}
      onMouseUp={handleUp}
    >
      {/* dark overlay */}
      {rect && rect.width > 2 ? (
        <div
          className="absolute border-2 border-dashed border-ring"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/30" />
      )}
      {/* hint bar */}
      <div className="fixed left-1/2 top-4 z-[51] -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-popover px-4 py-2 shadow-xl">
          <span className="text-[13px] text-foreground">
            Draw to select area
          </span>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onExportAll();
            }}
            className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            Export all
          </button>
          <span className="text-xs text-muted-foreground">
            ESC to cancel
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
