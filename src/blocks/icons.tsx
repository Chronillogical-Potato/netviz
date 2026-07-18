import * as ReIcons from "reicon-react";
import type { IconComponent } from "reicon-react";
import { filled, type AppIcon } from "@/ui/icons";

export type IconName = string;

function toPascal(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

// Maps legacy block ids and previously-saved lucide icon names to their
// reicon equivalents so existing diagrams keep their icons.
const LEGACY_MAP: Record<string, string> = {
  server: "Server",
  database: "Database",
  firewall: "Shield",
  container: "Package",
  loadbalancer: "Scale",
  proxy: "Route",
  cloud: "Cloud",
  globe: "Globe",
  laptop: "Laptop",
  smartphone: "Mobile",
  cpu: "Cpu",
  disk: "HardDrive",
  wifi: "Wifi",
  lock: "Lock",
  users: "Users",
  box: "Box",
  layers: "Layers",
  zap: "Bolt",
  key: "Key",
  // lucide names that differ in reicon
  Zap: "Bolt",
  Container: "Package",
  TrendingUpDown: "Route",
  KeyRound: "Key",
  Smartphone: "Mobile",
  Trash2: "Trash",
  Code2: "Code",
  Type: "Text",
  Hash: "Hashtag",
  Square: "Stop",
  Circle: "Record",
  MousePointer2: "Cursor",
  PenLine: "Pen",
  Pencil: "Pen2",
  Activity: "Activity2",
  MoreVertical: "More2",
};

function isIconComponent(v: unknown): v is IconComponent {
  return (
    (typeof v === "object" || typeof v === "function") &&
    v !== null &&
    "$$typeof" in (v as object)
  );
}

const lib = ReIcons as unknown as Record<string, unknown>;
const filledCache = new Map<string, AppIcon>();

function filledByName(name: string): AppIcon | undefined {
  const cached = filledCache.get(name);
  if (cached) return cached;
  const raw = lib[name];
  if (!isIconComponent(raw)) return undefined;
  const wrapped = filled(raw);
  filledCache.set(name, wrapped);
  return wrapped;
}

const FALLBACK = filledByName("Box")!;

// Resolve a stored icon name (possibly a legacy/lowercase alias) to its
// canonical catalog export name, or "" if unknown.
export function canonicalIconName(name: string | undefined): string {
  if (!name) return "";
  if (isIconComponent(lib[name])) return name;
  const legacy = LEGACY_MAP[name];
  if (legacy && isIconComponent(lib[legacy])) return legacy;
  const pascal = toPascal(name);
  if (isIconComponent(lib[pascal])) return pascal;
  return "";
}

export function resolveIcon(name: string | undefined): AppIcon {
  if (!name) return FALLBACK;
  return (
    filledByName(name) ??
    filledByName(LEGACY_MAP[name] ?? "") ??
    filledByName(toPascal(name)) ??
    FALLBACK
  );
}

export const ICON_NAMES: string[] = Object.keys(ReIcons)
  .filter((k) => /^[A-Z]/.test(k) && isIconComponent(lib[k]))
  .sort();
