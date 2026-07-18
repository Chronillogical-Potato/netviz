import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  AlertTriangle,
  File,
  Keyboard,
  Settings,
  type AppIcon,
} from "@/ui/icons";
import { Dialog, DialogContent, DialogTitle } from "@/ui/dialog";
import { Segmented } from "@/ui/segmented";
import { Button } from "@/ui/button";
import { useFlowStore } from "@/store/flow-store";
import { cn } from "@/lib/utils";

type TabId = "general" | "file" | "shortcuts" | "danger";

const TABS: { id: TabId; label: string; icon: AppIcon }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "file", label: "File", icon: File },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "danger", label: "Danger zone", icon: AlertTriangle },
];

const TAB_TITLES: Record<TabId, string> = {
  general: "General",
  file: "File",
  shortcuts: "Shortcuts",
  danger: "Danger zone",
};

export type SettingsActions = {
  onSave: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onImport: () => void;
  onUploadImage: () => void;
  onClearCanvas: () => void;
  onResetWorkspace: () => void;
};

// Settings-panel row: label (+ optional description) left, control right,
// separated by hairlines.
function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[13px] text-foreground">{label}</p>
        {description && (
          <p className="pt-0.5 text-[11px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
        checked ? "bg-primary" : "bg-accent"
      )}
    >
      <span
        className={cn(
          "h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">
      {children}
    </kbd>
  );
}

const SHORTCUTS: { action: string; keys: string[] }[] = [
  { action: "Select tool", keys: ["V"] },
  { action: "Hand tool", keys: ["H"] },
  { action: "Rectangle", keys: ["R"] },
  { action: "Circle", keys: ["O"] },
  { action: "Text", keys: ["T"] },
  { action: "Blocks", keys: ["B"] },
  { action: "Undo", keys: ["⌘", "Z"] },
  { action: "Redo", keys: ["⌘", "⇧", "Z"] },
  { action: "Select all", keys: ["⌘", "A"] },
  { action: "Copy / Paste", keys: ["⌘", "C", "V"] },
  { action: "Fit view", keys: ["⇧", "1"] },
  { action: "Zoom to 100%", keys: ["⌘", "0"] },
  { action: "Exit preview / cancel", keys: ["Esc"] },
];

export function SettingsDialog({
  open,
  onOpenChange,
  actions,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  actions: SettingsActions;
}) {
  const [tab, setTab] = useState<TabId>("general");
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const showControls = useFlowStore((s) => s.showControls);
  const showSmartGuides = useFlowStore((s) => s.showSmartGuides);
  const toggleControls = useFlowStore((s) => s.toggleControls);
  const toggleSmartGuides = useFlowStore((s) => s.toggleSmartGuides);
  const motionPreference = useFlowStore((s) => s.motionPreference);
  const setMotionPreference = useFlowStore((s) => s.setMotionPreference);

  // Close the modal before kicking off flows that open other UI.
  const run = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <div className="flex h-[420px]">
          <nav className="flex w-48 shrink-0 flex-col gap-0.5 border-r border-border p-2.5">
            {TABS.map((t) => {
              const Ic = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors",
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                      active ? "bg-accent text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <Ic className="h-3.5 w-3.5" />
                  </span>
                  {t.label}
                </button>
              );
            })}
          </nav>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-border px-5 py-3.5">
              <DialogTitle className="text-sm font-semibold">
                {TAB_TITLES[tab]}
              </DialogTitle>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-1">
              {tab === "general" && (
                <>
                  <SettingsRow label="Theme">
                    <Segmented
                      className="w-52"
                      value={(mounted ? theme : undefined) as string}
                      onChange={(v) => setTheme(v)}
                      options={[
                        { value: "light", label: "Light" },
                        { value: "dark", label: "Dark" },
                        { value: "system", label: "System" },
                      ]}
                    />
                  </SettingsRow>
                  <SettingsRow
                    label="Motion"
                    description="System respects your device setting; Full is the authoring override."
                  >
                    <Segmented
                      className="w-52"
                      value={motionPreference}
                      onChange={setMotionPreference}
                      options={[
                        { value: "system", label: "System" },
                        { value: "full", label: "Full" },
                        { value: "reduced", label: "Reduced" },
                      ]}
                    />
                  </SettingsRow>
                  <SettingsRow
                    label="Canvas toolbar"
                    description="Floating tools at the bottom of the canvas."
                  >
                    <Switch
                      checked={showControls}
                      onChange={toggleControls}
                      label="Canvas toolbar"
                    />
                  </SettingsRow>
                  <SettingsRow
                    label="Smart guides"
                    description="Alignment guides and snapping while dragging."
                  >
                    <Switch
                      checked={showSmartGuides}
                      onChange={toggleSmartGuides}
                      label="Smart guides"
                    />
                  </SettingsRow>
                </>
              )}
              {tab === "file" && (
                <>
                  <SettingsRow
                    label="Save file"
                    description="Download the whole project as JSON."
                  >
                    <Button variant="outline" size="sm" onClick={run(actions.onSave)}>
                      Save
                    </Button>
                  </SettingsRow>
                  <SettingsRow
                    label="Export image"
                    description="Draw a crop area, then export."
                  >
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={run(actions.onExportPng)}
                      >
                        PNG
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={run(actions.onExportSvg)}
                      >
                        SVG
                      </Button>
                    </div>
                  </SettingsRow>
                  <SettingsRow
                    label="Import file"
                    description="Load a previously saved .json project."
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={run(actions.onImport)}
                    >
                      Import
                    </Button>
                  </SettingsRow>
                  <SettingsRow
                    label="Upload image"
                    description="Place an image on the canvas."
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={run(actions.onUploadImage)}
                    >
                      Upload
                    </Button>
                  </SettingsRow>
                </>
              )}
              {tab === "shortcuts" && (
                <>
                  {SHORTCUTS.map((s) => (
                    <SettingsRow key={s.action} label={s.action}>
                      <div className="flex gap-1">
                        {s.keys.map((k, i) => (
                          <Kbd key={i}>{k}</Kbd>
                        ))}
                      </div>
                    </SettingsRow>
                  ))}
                </>
              )}
              {tab === "danger" && (
                <>
                  <SettingsRow
                    label="Clear canvas"
                    description="Remove all nodes, edges, and groups on this page."
                  >
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={run(actions.onClearCanvas)}
                    >
                      Clear
                    </Button>
                  </SettingsRow>
                  <SettingsRow
                    label="Reset workspace"
                    description="Wipe everything and start fresh. Cannot be undone."
                  >
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={run(actions.onResetWorkspace)}
                    >
                      Reset
                    </Button>
                  </SettingsRow>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
