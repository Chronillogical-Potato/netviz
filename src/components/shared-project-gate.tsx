import { useEffect, useRef, useState } from "react";
import type { FlowSnapshot } from "@/lib/storage";
import {
  createFlowSnapshot,
  downloadSnapshot,
  hasWorkspaceContent,
  parseSharedProject,
} from "@/lib/storage";
import { useFlowStore } from "@/store/flow-store";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/ui/dialog";
import { Button } from "@/ui/button";

function currentSnapshot() {
  return createFlowSnapshot(useFlowStore.getState());
}

function removeSharePayload() {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.hash.slice(1));
  params.delete("share");
  url.hash = params.toString();
  window.history.replaceState(window.history.state, "", url);
}

export function SharedProjectConflictContent({
  projectName,
  onDownload,
  onCancel,
  onOpen,
}: {
  projectName: string;
  onDownload: () => void;
  onCancel: () => void;
  onOpen: () => void;
}) {
  return (
    <>
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          Open shared project?
        </h2>
        <p className="pt-1.5 text-xs leading-relaxed text-muted-foreground">
          This link contains <strong className="text-foreground">{projectName}</strong>.
          Opening it will replace your current local workspace.
        </p>
      </div>
      <div className="rounded-xl border border-border/60 bg-muted/50 p-3">
        <button
          type="button"
          onClick={onDownload}
          className="text-xs font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
        >
          Download current project
        </button>
        <p className="pt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Save your existing work first, or open this link in an
          incognito/private window to keep both projects separate.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onOpen}>
          Open project
        </Button>
      </DialogFooter>
    </>
  );
}

export function SharedProjectGate() {
  const started = useRef(false);
  const [pending, setPending] = useState<FlowSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const openSharedProject = () => {
      if (started.current || !window.location.hash.includes("share=")) return;
      started.current = true;
      void parseSharedProject(window.location.hash)
        .then((snapshot) => {
          if (!snapshot) return;
          if (hasWorkspaceContent(currentSnapshot())) {
            setPending(snapshot);
            return;
          }
          useFlowStore.getState().replaceDocument(snapshot);
          removeSharePayload();
        })
        .catch(() => setError("The shared-project link is invalid or damaged."));
    };

    if (useFlowStore.persist.hasHydrated()) {
      openSharedProject();
      return;
    }
    return useFlowStore.persist.onFinishHydration(openSharedProject);
  }, []);

  const cancel = () => {
    setPending(null);
    removeSharePayload();
  };

  const open = () => {
    if (!pending) return;
    useFlowStore.getState().replaceDocument(pending);
    setPending(null);
    removeSharePayload();
  };

  const closeError = () => {
    setError(null);
    removeSharePayload();
  };

  return (
    <>
      <Dialog open={!!pending} onOpenChange={(next) => !next && cancel()}>
        <DialogContent>
          <DialogTitle className="sr-only">Open shared project?</DialogTitle>
          {pending ? (
            <SharedProjectConflictContent
              projectName={pending.projectName}
              onDownload={() => {
                const snapshot = currentSnapshot();
                downloadSnapshot(snapshot, snapshot.projectName);
              }}
              onCancel={cancel}
              onOpen={open}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={!!error} onOpenChange={(next) => !next && closeError()}>
        <DialogContent>
          <DialogTitle>Could not open shared project</DialogTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {error}
          </p>
          <DialogFooter className="grid-cols-1">
            <Button onClick={closeError}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
