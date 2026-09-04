import type { IconName } from "./icons";

export type Accent =
  | "indigo"
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "emerald"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "violet"
  | "fuchsia"
  | "pink"
  | "slate";

export type InfraVariantDef = "row" | "card";

export type IconPositionDef = "left" | "right" | "top" | "bottom";
export type TextAlignDef = "left" | "center" | "right";

export type BlockDef = {
  id: string;
  label: string;
  subtitle?: string;
  iconName: IconName;
  accent: Accent;
  builtin: boolean;
  variant?: InfraVariantDef;
  bgColor?: string;
  iconColor?: string;
  titleColor?: string;
  subtitleColor?: string;
  borderColor?: string;
  iconPosition?: IconPositionDef;
  textAlign?: TextAlignDef;
  customIcon?: string;
};

export const CORE_BLOCKS: BlockDef[] = [
  { id: "server", label: "Server", subtitle: "Linux host", iconName: "server", accent: "indigo", builtin: true },
  { id: "loadbalancer", label: "Load Balancer", subtitle: "L4 / L7", iconName: "loadbalancer", accent: "emerald", builtin: true },
  { id: "firewall", label: "Firewall", subtitle: "Perimeter", iconName: "firewall", accent: "red", builtin: true },
  { id: "proxy", label: "Proxy", subtitle: "Forward / Reverse", iconName: "proxy", accent: "violet", builtin: true },
  { id: "container", label: "Container", subtitle: "Docker", iconName: "container", accent: "sky", builtin: true },
  { id: "database", label: "Database", subtitle: "Postgres", iconName: "database", accent: "amber", builtin: true },
  { id: "service-provider", label: "Service Provider", subtitle: "External integration", iconName: "cloud", accent: "teal", builtin: true, variant: "card" },
];

export type AccentClasses = {
  tile: string;
  icon: string;
  ring: string;
  dot: string;
  border: string;
};

export const COLOR_PRESETS: { id: string; hex: string | null; label: string }[] = [
  { id: "none", hex: null, label: "Default" },
  { id: "transparent", hex: "transparent", label: "Transparent" },
  { id: "white", hex: "#ffffff", label: "White" },
  { id: "slate-100", hex: "#f1f5f9", label: "Slate 100" },
  { id: "slate-300", hex: "#cbd5e1", label: "Slate 300" },
  { id: "slate-500", hex: "#64748b", label: "Slate 500" },
  { id: "slate-700", hex: "#334155", label: "Slate 700" },
  { id: "black", hex: "#0f172a", label: "Black" },

  { id: "red-200", hex: "#fecaca", label: "Red 200" },
  { id: "orange-200", hex: "#fed7aa", label: "Orange 200" },
  { id: "amber-200", hex: "#fde68a", label: "Amber 200" },
  { id: "yellow-200", hex: "#fef08a", label: "Yellow 200" },
  { id: "lime-200", hex: "#d9f99d", label: "Lime 200" },
  { id: "emerald-200", hex: "#a7f3d0", label: "Emerald 200" },
  { id: "teal-200", hex: "#99f6e4", label: "Teal 200" },
  { id: "cyan-200", hex: "#a5f3fc", label: "Cyan 200" },
  { id: "sky-200", hex: "#bae6fd", label: "Sky 200" },
  { id: "blue-200", hex: "#bfdbfe", label: "Blue 200" },
  { id: "indigo-200", hex: "#c7d2fe", label: "Indigo 200" },
  { id: "violet-200", hex: "#ddd6fe", label: "Violet 200" },
  { id: "fuchsia-200", hex: "#f5d0fe", label: "Fuchsia 200" },
  { id: "pink-200", hex: "#fbcfe8", label: "Pink 200" },

  { id: "red-500", hex: "#ef4444", label: "Red 500" },
  { id: "orange-500", hex: "#f97316", label: "Orange 500" },
  { id: "amber-500", hex: "#f59e0b", label: "Amber 500" },
  { id: "yellow-500", hex: "#eab308", label: "Yellow 500" },
  { id: "lime-500", hex: "#84cc16", label: "Lime 500" },
  { id: "emerald-500", hex: "#10b981", label: "Emerald 500" },
  { id: "teal-500", hex: "#14b8a6", label: "Teal 500" },
  { id: "cyan-500", hex: "#06b6d4", label: "Cyan 500" },
  { id: "sky-500", hex: "#0ea5e9", label: "Sky 500" },
  { id: "blue-500", hex: "#3b82f6", label: "Blue 500" },
  { id: "indigo-500", hex: "#6366f1", label: "Indigo 500" },
  { id: "violet-500", hex: "#8b5cf6", label: "Violet 500" },
  { id: "fuchsia-500", hex: "#d946ef", label: "Fuchsia 500" },
  { id: "pink-500", hex: "#ec4899", label: "Pink 500" },

  { id: "red-700", hex: "#b91c1c", label: "Red 700" },
  { id: "orange-700", hex: "#c2410c", label: "Orange 700" },
  { id: "amber-700", hex: "#b45309", label: "Amber 700" },
  { id: "yellow-700", hex: "#a16207", label: "Yellow 700" },
  { id: "lime-700", hex: "#4d7c0f", label: "Lime 700" },
  { id: "emerald-700", hex: "#047857", label: "Emerald 700" },
  { id: "teal-700", hex: "#0f766e", label: "Teal 700" },
  { id: "cyan-700", hex: "#0e7490", label: "Cyan 700" },
  { id: "sky-700", hex: "#0369a1", label: "Sky 700" },
  { id: "blue-700", hex: "#1d4ed8", label: "Blue 700" },
  { id: "indigo-700", hex: "#4338ca", label: "Indigo 700" },
  { id: "violet-700", hex: "#6d28d9", label: "Violet 700" },
  { id: "fuchsia-700", hex: "#a21caf", label: "Fuchsia 700" },
  { id: "pink-700", hex: "#be185d", label: "Pink 700" },
];

export const ACCENT_CLASSES: Record<Accent, AccentClasses> = {
  indigo:  { tile: "bg-indigo-500/15",  icon: "text-indigo-400",  ring: "ring-indigo-500/40",  dot: "bg-indigo-400",  border: "border-indigo-500/40" },
  red:     { tile: "bg-red-500/15",     icon: "text-red-400",     ring: "ring-red-500/40",     dot: "bg-red-400",     border: "border-red-500/40" },
  orange:  { tile: "bg-orange-500/15",  icon: "text-orange-400",  ring: "ring-orange-500/40",  dot: "bg-orange-400",  border: "border-orange-500/40" },
  amber:   { tile: "bg-amber-500/15",   icon: "text-amber-400",   ring: "ring-amber-500/40",   dot: "bg-amber-400",   border: "border-amber-500/40" },
  yellow:  { tile: "bg-yellow-500/15",  icon: "text-yellow-400",  ring: "ring-yellow-500/40",  dot: "bg-yellow-400",  border: "border-yellow-500/40" },
  lime:    { tile: "bg-lime-500/15",    icon: "text-lime-400",    ring: "ring-lime-500/40",    dot: "bg-lime-400",    border: "border-lime-500/40" },
  emerald: { tile: "bg-emerald-500/15", icon: "text-emerald-400", ring: "ring-emerald-500/40", dot: "bg-emerald-400", border: "border-emerald-500/40" },
  teal:    { tile: "bg-teal-500/15",    icon: "text-teal-400",    ring: "ring-teal-500/40",    dot: "bg-teal-400",    border: "border-teal-500/40" },
  cyan:    { tile: "bg-cyan-500/15",    icon: "text-cyan-400",    ring: "ring-cyan-500/40",    dot: "bg-cyan-400",    border: "border-cyan-500/40" },
  sky:     { tile: "bg-sky-500/15",     icon: "text-sky-400",     ring: "ring-sky-500/40",     dot: "bg-sky-400",     border: "border-sky-500/40" },
  blue:    { tile: "bg-blue-500/15",    icon: "text-blue-400",    ring: "ring-blue-500/40",    dot: "bg-blue-400",    border: "border-blue-500/40" },
  violet:  { tile: "bg-violet-500/15",  icon: "text-violet-400",  ring: "ring-violet-500/40",  dot: "bg-violet-400",  border: "border-violet-500/40" },
  fuchsia: { tile: "bg-fuchsia-500/15", icon: "text-fuchsia-400", ring: "ring-fuchsia-500/40", dot: "bg-fuchsia-400", border: "border-fuchsia-500/40" },
  pink:    { tile: "bg-pink-500/15",    icon: "text-pink-400",    ring: "ring-pink-500/40",    dot: "bg-pink-400",    border: "border-pink-500/40" },
  slate:   { tile: "bg-slate-500/15",   icon: "text-slate-300",   ring: "ring-slate-500/40",   dot: "bg-slate-400",   border: "border-slate-500/40" },
};
