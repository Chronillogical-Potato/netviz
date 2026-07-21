import { useRef, useState } from "react";
import { createFlowSnapshot, createShareUrl } from "@/lib/storage";
import { useFlowStore } from "@/store/flow-store";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Share } from "@/ui/icons";

type ShareState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; link: string }
  | { status: "error"; message: string };

export function ShareProjectButton() {
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<ShareState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const showShareDialog = () => {
    setOpen(true);
    setCopied(false);
    setShare({ status: "loading" });
    const snapshot = createFlowSnapshot(useFlowStore.getState());
    void createShareUrl(snapshot)
      .then((link) => setShare({ status: "ready", link }))
      .catch((error: unknown) =>
        setShare({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not create a share link.",
        })
      );
  };

  const copyLink = async () => {
    if (share.status !== "ready") return;
    inputRef.current?.select();
    try {
      await navigator.clipboard.writeText(share.link);
    } catch {
      document.execCommand("copy");
    }
    setCopied(true);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5"
        aria-label="Share project"
        onClick={showShareDialog}
      >
        <Share className="h-3.5 w-3.5" />
        Share
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share project</DialogTitle>
            <DialogDescription>
              Anyone with this link can open an editable copy of the project.
            </DialogDescription>
          </DialogHeader>
          {share.status === "loading" || share.status === "idle" ? (
            <div className="flex h-9 items-center rounded-lg bg-input px-3 text-xs text-muted-foreground">
              Creating compressed link…
            </div>
          ) : share.status === "error" ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs leading-relaxed text-destructive">
              {share.message}
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  readOnly
                  value={share.link}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label="Share link"
                  className="min-w-0 font-mono text-xs"
                />
                <Button onClick={() => void copyLink()}>
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
              {share.link.length > 50_000 ? (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  This is a large link because the project contains a lot of
                  data. Some messaging apps may shorten it.
                </p>
              ) : null}
            </>
          )}
          <DialogFooter className="grid-cols-1">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
