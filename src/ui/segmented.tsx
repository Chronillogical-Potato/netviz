import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  title?: string;
  disabled?: boolean;
};

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T | undefined;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center rounded-lg bg-muted p-0.5",
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        const Ic = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            title={o.title}
            aria-pressed={active}
            onClick={() => !o.disabled && onChange(o.value)}
            className={cn(
              "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
              o.disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground"
            )}
          >
            {Ic ? <Ic className="h-3.5 w-3.5" /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
