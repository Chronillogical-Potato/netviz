import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { File, Plus, Search, Trash2 } from "@/ui/icons";
import { useFlowStore, type Page } from "@/store/flow-store";
import { Input } from "@/ui/input";
import { LayersPanel } from "./layers-panel";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [query, setQuery] = useState("");
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-background">
      <div className="px-3 pb-1 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="pl-8"
          />
        </div>
      </div>
      <PagesSection query={query} />
      <div className="mx-3 h-px shrink-0 bg-border" />
      <div className="min-h-0 flex-1">
        <LayersPanel query={query} />
      </div>
    </aside>
  );
}

function PagesSection({ query }: { query: string }) {
  const pages = useFlowStore((s) => s.pages);
  const addPage = useFlowStore((s) => s.addPage);
  const q = query.trim().toLowerCase();
  const visible = q
    ? pages.filter((p) => p.name.toLowerCase().includes(q))
    : pages;
  return (
    <div className="flex max-h-[40%] shrink-0 flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <p className="px-1 text-xs font-semibold text-foreground">Pages</p>
        <button
          onClick={() => addPage()}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="New page"
          aria-label="New page"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="min-h-0 overflow-y-auto px-2 pb-2">
        {visible.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground/70">
            No pages match.
          </p>
        ) : (
          visible.map((p) => (
            <PageRow key={p.id} page={p} canDelete={pages.length > 1} />
          ))
        )}
      </ul>
    </div>
  );
}

function PageRow({ page, canDelete }: { page: Page; canDelete: boolean }) {
  const activePageId = useFlowStore((s) => s.activePageId);
  const setActivePage = useFlowStore((s) => s.setActivePage);
  const renamePage = useFlowStore((s) => s.renamePage);
  const deletePage = useFlowStore((s) => s.deletePage);
  const active = page.id === activePageId;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(page.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(page.name);
  }, [page.name, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const v = draft.trim();
    if (v && v !== page.name) renamePage(page.id, v);
    setEditing(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft(page.name);
      setEditing(false);
    }
  };

  return (
    <li>
      <div
        onClick={() => !editing && setActivePage(page.id)}
        onDoubleClick={() => setEditing(true)}
        className={cn(
          "group flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[13px] transition-colors",
          active
            ? "bg-muted font-medium text-foreground"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <File
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            active ? "text-foreground" : "text-muted-foreground/70"
          )}
        />
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKey}
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 rounded-md bg-input px-1.5 py-0.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{page.name}</span>
        )}
        {!editing && (
          <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
            {canDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deletePage(page.id);
                }}
                className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                title="Delete page"
                aria-label="Delete page"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
