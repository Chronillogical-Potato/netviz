import { useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Search,
  Upload,
  X,
} from "@/ui/icons";
import { useFlowStore } from "@/store/flow-store";
import {
  ACCENT_CLASSES,
  COLOR_PRESETS,
  type Accent,
  type IconPositionDef,
  type TextAlignDef,
} from "@/blocks/registry";
import { ICON_NAMES, resolveIcon, type IconName } from "@/blocks/icons";
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
import { Segmented } from "@/ui/segmented";
import { cn } from "@/lib/utils";

const ACCENTS: Accent[] = [
  "indigo",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "violet",
  "fuchsia",
  "pink",
  "slate",
];

const ICON_POSITIONS: { id: IconPositionDef; label: string }[] = [
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
];

const TEXT_ALIGNS: { id: TextAlignDef; icon: typeof AlignLeft }[] = [
  { id: "left", icon: AlignLeft },
  { id: "center", icon: AlignCenter },
  { id: "right", icon: AlignRight },
];

type ColorTarget = {
  key: string;
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
};

function ColorsSection({ targets }: { targets: ColorTarget[] }) {
  const [activeKey, setActiveKey] = useState(targets[0]?.key ?? "");
  const active = targets.find((t) => t.key === activeKey) ?? targets[0];
  if (!active) return null;
  return (
    <div className="grid gap-2">
      <Label>Colors</Label>
      <div className="flex flex-wrap gap-1">
        {targets.map((t) => {
          const selected = t.key === active.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveKey(t.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                selected
                  ? "bg-accent text-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <span
                className="h-3 w-3 rounded-sm ring-1 ring-inset ring-border"
                style={t.value ? { backgroundColor: t.value } : undefined}
              />
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {COLOR_PRESETS.map((p) => {
          const selected = (active.value ?? null) === p.hex;
          const isNone = p.hex === null;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => active.onChange(p.hex ?? undefined)}
              title={p.label}
              aria-label={p.label}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md transition-shadow",
                isNone && "bg-muted",
                selected && "ring-2 ring-ring ring-offset-1 ring-offset-background"
              )}
              style={isNone ? undefined : { backgroundColor: p.hex ?? undefined }}
            >
              {isNone ? <X className="h-3 w-3 text-muted-foreground" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CustomBlockDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const addCustomBlock = useFlowStore((s) => s.addCustomBlock);
  const [label, setLabel] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [iconName, setIconName] = useState<IconName>("");
  const [accent, setAccent] = useState<Accent>("slate");
  const [iconQuery, setIconQuery] = useState("");
  const [bgColor, setBgColor] = useState<string | undefined>(undefined);
  const [titleColor, setTitleColor] = useState<string | undefined>(undefined);
  const [subtitleColor, setSubtitleColor] = useState<string | undefined>(undefined);
  const [borderColor, setBorderColor] = useState<string | undefined>(undefined);
  const [iconPosition, setIconPosition] = useState<IconPositionDef>("left");
  const [textAlign, setTextAlign] = useState<TextAlignDef>("left");
  const [customIcon, setCustomIcon] = useState<string | undefined>(undefined);
  const iconInputRef = useRef<HTMLInputElement>(null);

  const MAX_VISIBLE_ICONS = 240;
  const filteredIcons = useMemo(() => {
    const q = iconQuery.trim().toLowerCase();
    if (!q) return ICON_NAMES;
    return ICON_NAMES.filter((n) => n.toLowerCase().includes(q));
  }, [iconQuery]);
  const shownIcons =
    filteredIcons.length > MAX_VISIBLE_ICONS
      ? filteredIcons.slice(0, MAX_VISIBLE_ICONS)
      : filteredIcons;

  const reset = () => {
    setLabel("");
    setSubtitle("");
    setIconName("");
    setAccent("slate");
    setIconQuery("");
    setBgColor(undefined);
    setTitleColor(undefined);
    setSubtitleColor(undefined);
    setBorderColor(undefined);
    setIconPosition("left");
    setTextAlign("left");
    setCustomIcon(undefined);
  };
  const handleOpen = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const onUploadIcon = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setCustomIcon(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!label.trim()) return;
    addCustomBlock({
      label: label.trim(),
      subtitle: subtitle.trim() || undefined,
      iconName,
      accent,
      bgColor,
      titleColor,
      subtitleColor,
      borderColor,
      iconPosition,
      textAlign,
      customIcon,
    });
    handleOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New custom block</DialogTitle>
          <DialogDescription>
            Define a reusable block for your diagrams.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="cb-label">Name</Label>
            <Input
              id="cb-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Edge Router"
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cb-sub">
              Subtitle{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="cb-sub"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="e.g. Region US-East"
            />
          </div>

          <div className="grid gap-2">
            <Label>Icon</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={iconQuery}
                onChange={(e) => setIconQuery(e.target.value)}
                placeholder="Search icons…"
                className="h-8 pl-7 text-xs"
              />
            </div>
            <div className="grid max-h-44 grid-cols-10 gap-1 overflow-y-auto rounded-lg bg-muted/60 p-1.5">
              <button
                type="button"
                onClick={() => setIconName("")}
                title="None"
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  iconName === "" && "bg-accent text-foreground"
                )}
              >
                <X className="h-3.5 w-3.5" />
              </button>
              {shownIcons.map((name) => {
                const Ic = resolveIcon(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setIconName(name)}
                    title={name}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                      iconName === name && "bg-accent text-foreground"
                    )}
                  >
                    <Ic className="h-3.5 w-3.5" />
                  </button>
                );
              })}
              {filteredIcons.length > shownIcons.length && (
                <p className="col-span-10 px-2 py-1.5 text-center text-[10px] text-muted-foreground/70">
                  +{filteredIcons.length - shownIcons.length} more — search to
                  narrow
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Custom icon (optional)</Label>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                {customIcon ? (
                  <img src={customIcon} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 flex-1"
                onClick={() => iconInputRef.current?.click()}
              >
                {customIcon ? "Replace" : "Upload image"}
              </Button>
              {customIcon && (
                <button
                  type="button"
                  onClick={() => setCustomIcon(undefined)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <input
                ref={iconInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadIcon(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Accent</Label>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((a) => {
                const c = ACCENT_CLASSES[a];
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAccent(a)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md transition-shadow",
                      c.tile,
                      accent === a && "ring-2 ring-ring ring-offset-1 ring-offset-background"
                    )}
                    aria-label={a}
                  >
                    <span className={cn("h-2.5 w-2.5 rounded-full", c.dot)} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Icon position</Label>
            <Segmented
              value={iconPosition}
              onChange={setIconPosition}
              options={ICON_POSITIONS.map((p) => ({
                value: p.id,
                label: p.label,
              }))}
            />
          </div>

          <div className="grid gap-2">
            <Label>Text align</Label>
            <Segmented
              value={textAlign}
              onChange={setTextAlign}
              options={TEXT_ALIGNS.map((a) => ({
                value: a.id,
                icon: a.icon,
                title: a.id,
              }))}
            />
          </div>

          <ColorsSection
            targets={[
              { key: "bg", label: "Background", value: bgColor, onChange: setBgColor },
              { key: "title", label: "Title", value: titleColor, onChange: setTitleColor },
              { key: "desc", label: "Description", value: subtitleColor, onChange: setSubtitleColor },
              { key: "border", label: "Border", value: borderColor, onChange: setBorderColor },
            ]}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!label.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
