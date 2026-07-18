import {
  createContext,
  memo,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type KeyboardEvent,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Code2,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  FolderPlus,
  Hash,
  Image as ImageIcon,
  Lock,
  LockOpen,
  Minus,
  Pencil,
  Shapes,
  Trash2,
  Type,
  type AppIcon,
} from "@/ui/icons";
import {
  descendantGroupIds,
  getNodeDisplayName,
  useFlowStore,
  type AppNode,
  type Group,
} from "@/store/flow-store";
import { cn } from "@/lib/utils";

const DRAG_MIME = "application/x-netviz-layer";

type CtxItem = {
  label: string;
  icon?: AppIcon;
  danger?: boolean;
  onSelect: () => void;
};

type CtxState = { x: number; y: number; items: CtxItem[] } | null;
const CtxMenuContext = createContext<{
  open: (x: number, y: number, items: CtxItem[]) => void;
}>({ open: () => {} });

function useCtxMenu() {
  return useContext(CtxMenuContext);
}

type DragPayload =
  | { kind: "node"; id: string }
  | { kind: "group"; id: string };

// When a search query is active: which node/group rows stay visible.
type LayersFilter = { nodeIds: Set<string>; groupIds: Set<string> } | null;
const FilterContext = createContext<LayersFilter>(null);

type DropZone = "before" | "after" | "into";

// One fixed icon per node category, so all layers of the same kind read
// the same (like Figma), regardless of the block's own icon.
function nodeIcon(node: AppNode): AppIcon {
  switch (node.type) {
    case "infra":
      return Box;
    case "shape":
      return Shapes;
    case "text":
      return Type;
    case "step":
      return Hash;
    case "line":
      return Minus;
    case "image":
      return ImageIcon;
    case "code":
      return Code2;
  }
  return Box;
}

function readPayload(e: DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return null;
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

const EMPTY_NODES: AppNode[] = [];
const EMPTY_GROUPS: Group[] = [];

export function LayersPanel({ query = "" }: { query?: string }) {
  const q = query.trim().toLowerCase();
  const rootGroups = useFlowStore(
    useShallow((s) => s.groups.filter((g) => g.parentGroupId === null))
  );
  const rootNodes = useFlowStore(
    useShallow((s) => s.nodes.filter((n) => !n.data.groupId))
  );
  // Full arrays are only needed to compute the search filter — subscribe
  // to constants when idle so drag frames don't re-render the panel here.
  const allNodes = useFlowStore((s) => (q ? s.nodes : EMPTY_NODES));
  const allGroups = useFlowStore((s) => (q ? s.groups : EMPTY_GROUPS));
  const createGroup = useFlowStore((s) => s.createGroup);
  const moveNodeBefore = useFlowStore((s) => s.moveNodeBefore);
  const moveGroupBefore = useFlowStore((s) => s.moveGroupBefore);
  const [rootOver, setRootOver] = useState(false);
  const [ctx, setCtx] = useState<CtxState>(null);
  const openCtx = useCallback(
    (x: number, y: number, items: CtxItem[]) => setCtx({ x, y, items }),
    []
  );
  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [ctx]);

  const filter = useMemo<LayersFilter>(() => {
    if (!q) return null;
    const groupById = new Map(allGroups.map((g) => [g.id, g]));
    const nameGroups = new Set(
      allGroups
        .filter((g) => g.name.toLowerCase().includes(q))
        .map((g) => g.id)
    );
    const inMatchedGroup = (gid: string | null | undefined) => {
      let cur = gid ?? null;
      let guard = 0;
      while (cur && guard++ < 100) {
        if (nameGroups.has(cur)) return true;
        cur = groupById.get(cur)?.parentGroupId ?? null;
      }
      return false;
    };
    const nodeIds = new Set(
      allNodes
        .filter(
          (n) =>
            getNodeDisplayName(n).toLowerCase().includes(q) ||
            inMatchedGroup(n.data.groupId)
        )
        .map((n) => n.id)
    );
    const groupIds = new Set(nameGroups);
    // Descendant groups of a name-matched group stay visible.
    for (const g of allGroups) {
      if (inMatchedGroup(g.parentGroupId)) groupIds.add(g.id);
    }
    // Ancestor chain of every visible node/group stays visible.
    const addAncestors = (gid: string | null | undefined) => {
      let cur = gid ?? null;
      let guard = 0;
      while (cur && guard++ < 100) {
        groupIds.add(cur);
        cur = groupById.get(cur)?.parentGroupId ?? null;
      }
    };
    for (const n of allNodes) {
      if (nodeIds.has(n.id)) addAncestors(n.data.groupId);
    }
    for (const id of [...groupIds]) {
      addAncestors(groupById.get(id)?.parentGroupId);
    }
    return { nodeIds, groupIds };
  }, [q, allNodes, allGroups]);

  const nothingMatches =
    !!filter && filter.nodeIds.size === 0 && filter.groupIds.size === 0;

  const onEmptyContextMenu = (e: MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    openCtx(e.clientX, e.clientY, [
      {
        label: "New group",
        icon: FolderPlus,
        onSelect: () => createGroup(null),
      },
    ]);
  };

  const onRootDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setRootOver(true);
    }
  };

  const onRootDrop = (e: DragEvent) => {
    const p = readPayload(e);
    setRootOver(false);
    if (!p) return;
    e.preventDefault();
    // Empty area is the bottom of a front-at-top list → send to the back
    // (front of the array) by inserting before the current first sibling.
    const st = useFlowStore.getState();
    if (p.kind === "node") {
      const firstRoot = st.nodes.find((n) => !n.data.groupId)?.id ?? null;
      moveNodeBefore(p.id, firstRoot, null);
    } else {
      const firstRootGroup =
        st.groups.find((g) => g.parentGroupId === null)?.id ?? null;
      moveGroupBefore(p.id, firstRootGroup, null);
    }
  };

  return (
    <CtxMenuContext.Provider value={{ open: openCtx }}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="px-1 text-xs font-semibold text-foreground">
            Layers
          </p>
          <button
            onClick={() => createGroup(null)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="New group"
            aria-label="New group"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div
          className={cn(
            "flex-1 overflow-y-auto px-2 pb-2",
            rootOver && "bg-accent/30"
          )}
          onDragOver={onRootDragOver}
          onDragLeave={() => setRootOver(false)}
          onDrop={onRootDrop}
          onDropCapture={() => setRootOver(false)}
          onDragEnd={() => setRootOver(false)}
          onContextMenu={onEmptyContextMenu}
        >
          {rootGroups.length === 0 && rootNodes.length === 0 ? (
            <p
              className="px-3 py-6 text-center text-xs text-muted-foreground/70"
              onContextMenu={onEmptyContextMenu}
            >
              No layers yet. Drop a block on the canvas.
            </p>
          ) : nothingMatches ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground/70">
              No layers match.
            </p>
          ) : (
            <FilterContext.Provider value={filter}>
              {/* Front-at-top: React Flow paints array-last on top, so the
                  list is rendered in reverse (last node = top row). */}
              <ul className="flex flex-col">
                {[...rootGroups].reverse().map((g) => (
                  <GroupRow key={g.id} group={g} depth={0} />
                ))}
                {[...rootNodes].reverse().map((n) => (
                  <NodeRow key={n.id} node={n} depth={0} />
                ))}
              </ul>
            </FilterContext.Provider>
          )}
        </div>
        {ctx && (
          <div
            className="fixed z-50 min-w-[160px] rounded-xl border border-border/60 bg-popover p-1 shadow-xl"
            style={{ left: ctx.x, top: ctx.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {ctx.items.map((it, i) => {
              const Ic = it.icon;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    it.onSelect();
                    setCtx(null);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                    it.danger && "text-destructive hover:text-destructive"
                  )}
                >
                  {Ic && <Ic className="h-3.5 w-3.5 shrink-0" />}
                  <span className="flex-1">{it.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </CtxMenuContext.Provider>
  );
}

const GroupRow = memo(function GroupRow({
  group,
  depth,
}: {
  group: Group;
  depth: number;
}) {
  const children = useFlowStore(
    useShallow((s) => s.groups.filter((g) => g.parentGroupId === group.id))
  );
  const childNodes = useFlowStore(
    useShallow((s) => s.nodes.filter((n) => n.data.groupId === group.id))
  );
  const groupEffect = useFlowStore(
    useShallow((s) => {
      const targets = new Set<string>([group.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const g of s.groups) {
          if (g.parentGroupId && targets.has(g.parentGroupId) && !targets.has(g.id)) {
            targets.add(g.id);
            changed = true;
          }
        }
      }
      let any = false;
      let anyVisible = false;
      let anyUnlocked = false;
      for (const n of s.nodes) {
        const gid = n.data.groupId ?? null;
        if (gid === null || !targets.has(gid)) continue;
        any = true;
        if (!n.hidden) anyVisible = true;
        if (!(n.draggable === false && n.selectable === false)) anyUnlocked = true;
      }
      return { any, anyVisible, anyUnlocked };
    })
  );
  const toggleGroupCollapsed = useFlowStore((s) => s.toggleGroupCollapsed);
  const selectNodes = useFlowStore((s) => s.selectNodes);
  const toggleGroupHidden = useFlowStore((s) => s.toggleGroupHidden);
  const toggleGroupLocked = useFlowStore((s) => s.toggleGroupLocked);
  const renameGroup = useFlowStore((s) => s.renameGroup);
  const deleteGroup = useFlowStore((s) => s.deleteGroup);
  const moveNodeBefore = useFlowStore((s) => s.moveNodeBefore);
  const moveGroupBefore = useFlowStore((s) => s.moveGroupBefore);
  const filter = useContext(FilterContext);
  const [editing, setEditing] = useState(false);
  // While searching, ignore collapse state so matches are visible.
  const collapsed = filter ? false : !!group.collapsed;
  const Caret = collapsed ? ChevronRight : ChevronDown;
  const FolderIc = collapsed ? Folder : FolderOpen;

  const onDragStartRow = (e: DragEvent) => {
    const payload: DragPayload = { kind: "group", id: group.id };
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDropRow = (zone: DropZone, e: DragEvent) => {
    const p = readPayload(e);
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    if (zone === "into") {
      if (p.kind === "node") moveNodeBefore(p.id, null, group.id);
      else moveGroupBefore(p.id, null, group.id);
    } else {
      const state = useFlowStore.getState();
      // Front-at-top: dropping above (before) = later among siblings.
      const before =
        zone === "after"
          ? group.id
          : nextSiblingGroupId(state.groups, group);
      if (p.kind === "group") {
        moveGroupBefore(p.id, before, group.parentGroupId);
      } else {
        const nodesAtLevel = state.nodes.filter(
          (n) => (n.data.groupId ?? null) === group.parentGroupId
        );
        const firstNodeId = nodesAtLevel[0]?.id ?? null;
        moveNodeBefore(p.id, firstNodeId, group.parentGroupId);
      }
    }
  };

  const { open: openCtx } = useCtxMenu();
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openCtx(e.clientX, e.clientY, [
      {
        label: "Rename",
        icon: Pencil,
        onSelect: () => setEditing(true),
      },
      {
        label: groupEffect.anyVisible ? "Hide" : "Show",
        icon: groupEffect.anyVisible ? Eye : EyeOff,
        onSelect: () => toggleGroupHidden(group.id),
      },
      {
        label: groupEffect.anyUnlocked ? "Lock" : "Unlock",
        icon: groupEffect.anyUnlocked ? LockOpen : Lock,
        onSelect: () => toggleGroupLocked(group.id),
      },
      {
        label: "Delete",
        icon: Trash2,
        danger: true,
        onSelect: () => deleteGroup(group.id),
      },
    ]);
  };

  if (filter && !filter.groupIds.has(group.id)) return null;

  return (
    <li>
      <Row
        depth={depth}
        draggable={!editing}
        onDragStart={onDragStartRow}
        onDrop={onDropRow}
        canAcceptInto
        onClick={() => {
          if (editing) return;
          toggleGroupCollapsed(group.id);
          // Select everything inside the group (incl. nested groups).
          const st = useFlowStore.getState();
          const targets = descendantGroupIds(st.groups, group.id);
          selectNodes(
            st.nodes
              .filter((n) => n.data.groupId && targets.has(n.data.groupId))
              .map((n) => n.id)
          );
        }}
        onContextMenu={onContextMenu}
        editing={editing}
        leading={
          <>
            <Caret className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
            <FolderIc className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </>
        }
        name={group.name}
        onRename={(name) => renameGroup(group.id, name)}
        onEditingChange={setEditing}
        trailing={
          <>
            {groupEffect.any && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleGroupHidden(group.id);
                }}
                className={cn(
                  "transition-opacity hover:text-foreground",
                  groupEffect.anyVisible
                    ? "opacity-0 group-hover:opacity-100"
                    : "opacity-100"
                )}
                title={groupEffect.anyVisible ? "Hide" : "Show"}
                aria-label={groupEffect.anyVisible ? "Hide group" : "Show group"}
              >
                {groupEffect.anyVisible ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            {groupEffect.any && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleGroupLocked(group.id);
                }}
                className={cn(
                  "transition-opacity hover:text-foreground",
                  groupEffect.anyUnlocked
                    ? "opacity-0 group-hover:opacity-100"
                    : "opacity-100"
                )}
                title={groupEffect.anyUnlocked ? "Lock" : "Unlock"}
                aria-label={groupEffect.anyUnlocked ? "Lock group" : "Unlock group"}
              >
                {groupEffect.anyUnlocked ? (
                  <LockOpen className="h-3 w-3" />
                ) : (
                  <Lock className="h-3 w-3" />
                )}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteGroup(group.id);
              }}
              className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              title="Delete group (keeps nodes)"
              aria-label="Delete group"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        }
      />
      {!collapsed && (children.length > 0 || childNodes.length > 0) && (
        <ul className="flex flex-col">
          {[...children].reverse().map((g) => (
            <GroupRow key={g.id} group={g} depth={depth + 1} />
          ))}
          {[...childNodes].reverse().map((n) => (
            <NodeRow key={n.id} node={n} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
});

function nextSiblingGroupId(groups: Group[], current: Group): string | null {
  const siblings = groups.filter(
    (g) => g.parentGroupId === current.parentGroupId
  );
  const idx = siblings.findIndex((g) => g.id === current.id);
  return siblings[idx + 1]?.id ?? null;
}

const NodeRow = memo(function NodeRow({
  node,
  depth,
}: {
  node: AppNode;
  depth: number;
}) {
  const selectNodes = useFlowStore((s) => s.selectNodes);
  const toggleNodeSelection = useFlowStore((s) => s.toggleNodeSelection);
  const toggleNodeHidden = useFlowStore((s) => s.toggleNodeHidden);
  const toggleNodeLocked = useFlowStore((s) => s.toggleNodeLocked);
  const renameNode = useFlowStore((s) => s.renameNode);
  const deleteNode = useFlowStore((s) => s.deleteNode);
  const moveNodeBefore = useFlowStore((s) => s.moveNodeBefore);
  const Icon = nodeIcon(node);
  const name = getNodeDisplayName(node);
  const selected = !!node.selected;
  const hidden = !!node.hidden;
  const locked = node.draggable === false && node.selectable === false;
  const filter = useContext(FilterContext);
  const [editing, setEditing] = useState(false);
  const canRename = node.type !== "line";

  const onDragStartRow = (e: DragEvent) => {
    const payload: DragPayload = { kind: "node", id: node.id };
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDropRow = (zone: DropZone, e: DragEvent) => {
    const p = readPayload(e);
    if (!p || p.kind !== "node") return;
    e.preventDefault();
    e.stopPropagation();
    const targetGroupId = node.data.groupId ?? null;
    // Front-at-top list: dropping ABOVE a row (before) means MORE front =
    // later in the array (insert after target); BELOW means behind.
    if (zone === "after") {
      moveNodeBefore(p.id, node.id, targetGroupId);
    } else {
      const siblings = useFlowStore
        .getState()
        .nodes.filter((n) => (n.data.groupId ?? null) === targetGroupId);
      const idx = siblings.findIndex((n) => n.id === node.id);
      const next = siblings[idx + 1]?.id ?? null;
      moveNodeBefore(p.id, next, targetGroupId);
    }
  };

  const { open: openCtx } = useCtxMenu();
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const items: CtxItem[] = [];
    if (canRename) {
      items.push({
        label: "Rename",
        icon: Pencil,
        onSelect: () => setEditing(true),
      });
    }
    items.push({
      label: hidden ? "Show" : "Hide",
      icon: hidden ? EyeOff : Eye,
      onSelect: () => toggleNodeHidden(node.id),
    });
    items.push({
      label: locked ? "Unlock" : "Lock",
      icon: locked ? LockOpen : Lock,
      onSelect: () => toggleNodeLocked(node.id),
    });
    items.push({
      label: "Delete",
      icon: Trash2,
      danger: true,
      onSelect: () => deleteNode(node.id),
    });
    openCtx(e.clientX, e.clientY, items);
  };

  if (filter && !filter.nodeIds.has(node.id)) return null;

  return (
    <li>
      <Row
        depth={depth}
        selected={selected}
        dimmed={hidden}
        draggable={!editing}
        onDragStart={onDragStartRow}
        onDrop={onDropRow}
        onClick={(e) => {
          if (editing) return;
          if (e.shiftKey) toggleNodeSelection(node.id);
          else selectNodes([node.id]);
        }}
        onContextMenu={onContextMenu}
        editing={editing}
        leading={
          <>
            <span className="w-3.5 shrink-0" />
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </>
        }
        name={name}
        onRename={(v) => renameNode(node.id, v)}
        onEditingChange={setEditing}
        trailing={
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleNodeHidden(node.id);
              }}
              className={cn(
                "transition-opacity hover:text-foreground",
                hidden ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
              title={hidden ? "Show" : "Hide"}
              aria-label={hidden ? "Show node" : "Hide node"}
            >
              {hidden ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleNodeLocked(node.id);
              }}
              className={cn(
                "transition-opacity hover:text-foreground",
                locked ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
              title={locked ? "Unlock" : "Lock"}
              aria-label={locked ? "Unlock node" : "Lock node"}
            >
              {locked ? (
                <Lock className="h-3 w-3" />
              ) : (
                <LockOpen className="h-3 w-3" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteNode(node.id);
              }}
              className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              title="Delete node"
              aria-label="Delete node"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        }
      />
    </li>
  );
});

function Row({
  depth,
  selected,
  dimmed,
  draggable,
  onDragStart,
  onDrop,
  canAcceptInto,
  onClick,
  onContextMenu,
  editing,
  onEditingChange,
  leading,
  name,
  onRename,
  trailing,
}: {
  depth: number;
  selected?: boolean;
  dimmed?: boolean;
  draggable: boolean;
  onDragStart: (e: DragEvent) => void;
  onDrop: (zone: DropZone, e: DragEvent) => void;
  canAcceptInto?: boolean;
  onClick: (e: MouseEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
  editing: boolean;
  onEditingChange: (v: boolean) => void;
  leading: ReactNode;
  name: string;
  onRename: (v: string) => void;
  trailing?: ReactNode;
}) {
  const [draft, setDraft] = useState(name);
  const [zone, setZone] = useState<DropZone | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const v = draft.trim();
    if (v && v !== name) onRename(v);
    onEditingChange(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft(name);
      onEditingChange(false);
    }
  };

  const computeZone = useCallback(
    (e: DragEvent): DropZone => {
      const el = rowRef.current;
      if (!el) return "after";
      const r = el.getBoundingClientRect();
      const y = e.clientY - r.top;
      const h = r.height;
      if (canAcceptInto) {
        if (y < h * 0.25) return "before";
        if (y > h * 0.75) return "after";
        return "into";
      }
      return y < h * 0.5 ? "before" : "after";
    },
    [canAcceptInto]
  );

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setZone(computeZone(e));
  };

  const onDropRow = (e: DragEvent) => {
    const z = computeZone(e);
    setZone(null);
    onDrop(z, e);
  };

  return (
    <div
      ref={rowRef}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={() => setZone(null)}
      onDrop={onDropRow}
      className={cn(
        "group relative flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[13px] transition-colors",
        selected
          ? "bg-accent font-medium text-foreground"
          : "text-foreground hover:bg-muted",
        dimmed && "opacity-50",
        zone === "into" && "bg-primary/20 ring-1 ring-primary/60"
      )}
      style={{ paddingLeft: 10 + depth * 14 }}
      onClick={editing ? undefined : onClick}
      onContextMenu={onContextMenu}
    >
      {zone === "before" && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-primary" />
      )}
      {zone === "after" && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
      )}
      {leading}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded-md bg-input px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <span
          className="min-w-0 flex-1 truncate"
          onDoubleClick={(e) => {
            e.stopPropagation();
            onEditingChange(true);
          }}
        >
          {name}
        </span>
      )}
      {trailing ? (
        <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
