import { forwardRef, lazy, Suspense } from "react";
import {
  Activity2,
  ArchiveBox,
  Bell,
  Bolt,
  Box,
  BoxArchive,
  BrowserCode,
  CartShopping,
  Cloud,
  CloudStorage,
  Code,
  Cpu,
  CpuSetting2,
  CreditCard,
  Cursor,
  Database,
  Globe,
  HardDrive,
  Hashtag,
  InboxArchive,
  Key,
  Laptop,
  Layers,
  LayersAlt,
  Lock,
  LockKeyhole,
  Message,
  Mobile,
  More2,
  Package,
  Pen,
  Pen2,
  Receipt,
  Record,
  Route,
  Scale,
  Server,
  Shield,
  ShieldNetwork,
  Shop,
  Stop,
  Text,
  Trash,
  Users,
  Wallet,
  Wifi,
  WindowChartLine,
} from "reicon-react";
import catalogNames from "./icon-names.json";
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



const eagerIcons: Partial<Record<string, IconComponent>> = {
  Activity2,
  ArchiveBox,
  Bell,
  Bolt,
  Box,
  BoxArchive,
  BrowserCode,
  CartShopping,
  Cloud,
  CloudStorage,
  Code,
  Cpu,
  CpuSetting2,
  CreditCard,
  Cursor,
  Database,
  Globe,
  HardDrive,
  Hashtag,
  InboxArchive,
  Key,
  Laptop,
  Layers,
  LayersAlt,
  Lock,
  LockKeyhole,
  Message,
  Mobile,
  More2,
  Package,
  Pen,
  Pen2,
  Receipt,
  Record,
  Route,
  Scale,
  Server,
  Shield,
  ShieldNetwork,
  Shop,
  Stop,
  Text,
  Trash,
  Users,
  Wallet,
  Wifi,
  WindowChartLine,
};
const catalog = new Set(catalogNames);
let catalogPromise: Promise<typeof import("reicon-react")> | undefined;
export function loadIconCatalog() {
  return catalogPromise ??= import("reicon-react");
}
const filledCache = new Map<string, AppIcon>();

function filledByName(name: string): AppIcon | undefined {
  const cached = filledCache.get(name);
  if (cached) return cached;
  if (!catalog.has(name)) return undefined;
  const raw = eagerIcons[name];
  let wrapped: AppIcon;
  if (raw) {
    wrapped = filled(raw);
  } else {
    const Deferred = lazy(async () => {
      const icons = await loadIconCatalog();
      const icon = (icons as unknown as Record<string, IconComponent>)[name];
      return { default: filled(icon) };
    });
    wrapped = forwardRef((props, ref) => (
      <Suspense fallback={<FALLBACK {...props} ref={ref} />}>
        <Deferred {...props} ref={ref} />
      </Suspense>
    ));
  }
  filledCache.set(name, wrapped);
  return wrapped;
}

const FALLBACK = filledByName("Box")!;

// Resolve a stored icon name (possibly a legacy/lowercase alias) to its
// canonical catalog export name, or "" if unknown.
export function canonicalIconName(name: string | undefined): string {
  if (!name) return "";
  if (catalog.has(name)) return name;
  const legacy = LEGACY_MAP[name];
  if (legacy && catalog.has(legacy)) return legacy;
  const pascal = toPascal(name);
  if (catalog.has(pascal)) return pascal;
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

export const ICON_NAMES: string[] = catalogNames;
