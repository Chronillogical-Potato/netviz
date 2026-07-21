import { useState } from "react";
import {
  Code2,
  Hash,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Type,
  type AppIcon,
} from "@/ui/icons";
import { useReactFlow } from "@xyflow/react";
import { useFlowStore } from "@/store/flow-store";
import {
  ACCENT_CLASSES,
  CORE_BLOCKS,
  type Accent,
  type BlockDef,
} from "@/blocks/registry";
import { resolveIcon } from "@/blocks/icons";
import { Input } from "@/ui/input";
import { CustomBlockDialog } from "./custom-block-dialog";
import { cn } from "@/lib/utils";
import { TEMPLATES } from "@/templates/registry";

const DRAG_MIME = "application/x-netviz";

type CategoryKey = "templates" | "core" | "annotations" | "custom";
type Filter = "all" | CategoryKey;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "templates", label: "Templates" },
  { key: "core", label: "Blocks" },
  { key: "annotations", label: "Annotations" },
  { key: "custom", label: "Custom" },
];

function AccentTile({
  icon: Icon,
  accent,
  customIcon,
  hasIcon,
}: {
  icon: AppIcon;
  accent: Accent;
  customIcon?: string;
  hasIcon?: boolean;
}) {
  const c = ACCENT_CLASSES[accent];
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
        !customIcon && c.tile
      )}
    >
      {customIcon ? (
        <img src={customIcon} alt="" className="h-5 w-5 object-contain" />
      ) : hasIcon === false ? (
        <span className={cn("h-2.5 w-2.5 rounded-full", c.dot)} />
      ) : (
        <Icon className={cn("h-4 w-4", c.icon)} />
      )}
    </div>
  );
}

function BlockRow({
  payload,
  label,
  description,
  onAdd,
  onDelete,
  children,
}: {
  payload: object;
  label: string;
  description?: string;
  onAdd: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onAdd}
      role="button"
      title={`${label} — click to add, or drag onto the canvas`}
      className="group flex cursor-grab items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted active:cursor-grabbing"
    >
      {children}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-foreground/80">
          {label}
        </p>
        {description ? (
          <p className="truncate pt-0.5 text-[10px] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          aria-label={`Delete ${label}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1.5 text-xs font-semibold text-muted-foreground/90">
      {children}
    </p>
  );
}

type Item = {
  key: string;
  label: string;
  description?: string;
  payload: object;
  tile: React.ReactNode;
  add: () => void;
  onDelete?: () => void;
};

export function BlocksFlyout({ onAdded }: { onAdded: () => void }) {
  const customBlocks = useFlowStore((s) => s.customBlocks);
  const deleteCustomBlock = useFlowStore((s) => s.deleteCustomBlock);
  const addInfraNode = useFlowStore((s) => s.addInfraNode);
  const insertTemplate = useFlowStore((s) => s.insertTemplate);
  const addTextNode = useFlowStore((s) => s.addTextNode);
  const addStepNode = useFlowStore((s) => s.addStepNode);
  const addCodeNode = useFlowStore((s) => s.addCodeNode);
  const { screenToFlowPosition } = useReactFlow();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const viewportCenter = (offset: { x: number; y: number }) => {
    const c = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    return { x: c.x - offset.x, y: c.y - offset.y };
  };

  const addBlock = (block: BlockDef) => {
    addInfraNode(block, viewportCenter({ x: 110, y: 36 }));
    onAdded();
  };

  const blockItem = (b: BlockDef, onDelete?: () => void): Item => ({
    key: b.id,
    label: b.label,
    payload: { kind: "infra", blockId: b.id },
    tile: (
      <AccentTile
        icon={resolveIcon(b.iconName)}
        accent={b.accent}
        customIcon={b.customIcon}
        hasIcon={!!b.iconName}
      />
    ),
    add: () => addBlock(b),
    onDelete,
  });

  const annotationItem = (
    key: string,
    label: string,
    icon: AppIcon,
    accent: Accent,
    add: (pos: { x: number; y: number }) => void
  ): Item => ({
    key,
    label,
    payload: { kind: key },
    tile: <AccentTile icon={icon} accent={accent} />,
    add: () => {
      add(viewportCenter({ x: 40, y: 20 }));
      onAdded();
    },
  });

  const templateItems: Item[] = TEMPLATES.map((template) => ({
    key: template.id,
    label: template.name,
    description: template.description,
    payload: { kind: "template", templateId: template.id },
    tile: <AccentTile icon={Sparkles} accent="emerald" />,
    add: () => {
      insertTemplate(
        template.id,
        viewportCenter({ x: template.width / 2, y: template.height / 2 })
      );
      onAdded();
    },
  }));

  const sections: { key: CategoryKey; title: string; items: Item[] }[] = [
    {
      key: "templates",
      title: "Templates",
      items: templateItems,
    },
    {
      key: "core",
      title: "Blocks",
      items: CORE_BLOCKS.map((b) => blockItem(b)),
    },
    {
      key: "annotations",
      title: "Annotations",
      items: [
        annotationItem("text", "Text", Type, "amber", addTextNode),
        annotationItem("step", "Step", Hash, "indigo", addStepNode),
        annotationItem("code", "Code", Code2, "violet", addCodeNode),
      ],
    },
    {
      key: "custom",
      title: "Custom",
      items: customBlocks.map((b) =>
        blockItem(b, () => deleteCustomBlock(b.id))
      ),
    },
  ];

  const q = query.trim().toLowerCase();
  const matches = (it: Item) => !q || it.label.toLowerCase().includes(q);
  const visibleSections = sections
    .filter((sec) => filter === "all" || filter === sec.key)
    .map((sec) => ({ ...sec, items: sec.items.filter(matches) }))
    .filter((sec) => sec.items.length > 0);
  const availableFilters = FILTERS.filter(
    (f) => f.key !== "custom" || customBlocks.length > 0
  );

  return (
    <div className="pointer-events-auto flex max-h-[480px] w-80 flex-col rounded-xl border border-border/60 bg-popover shadow-xl">
      <div className="flex flex-col gap-2 p-2.5 pb-2">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="pl-8"
            />
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            title="New custom block"
            aria-label="New custom block"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {availableFilters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                filter === f.key
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-2 pb-2">
        {visibleSections.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            No blocks match{q ? ` “${query.trim()}”` : ""}.
          </p>
        ) : (
          <div className="flex flex-col gap-3 py-2">
            {visibleSections.map((sec) => (
              <section key={sec.key}>
                <SectionLabel>{sec.title}</SectionLabel>
                <div className="flex flex-col gap-0.5">
                  {sec.items.map((it) => (
                    <BlockRow
                      key={it.key}
                      payload={it.payload}
                      label={it.label}
                      description={it.description}
                      onAdd={it.add}
                      onDelete={it.onDelete}
                    >
                      {it.tile}
                    </BlockRow>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      <CustomBlockDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
