import * as React from "react";
import { cn } from "@/lib/utils";

type SliderProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

// Framer-style range input: thin track, blue fill up to the thumb, small
// white round thumb. Track/thumb visuals live in index.css (.nv-slider);
// the fill percentage is driven by the --slider-fill custom property.
export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, min = 0, max = 100, value, style, ...props }, ref) => {
    const n = Number(value);
    const lo = Number(min);
    const hi = Number(max);
    const pct =
      hi > lo && !Number.isNaN(n)
        ? Math.min(100, Math.max(0, ((n - lo) / (hi - lo)) * 100))
        : 0;
    return (
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        value={value}
        style={{ ...style, ["--slider-fill" as string]: `${pct}%` }}
        className={cn("nv-slider", className)}
        {...props}
      />
    );
  }
);
Slider.displayName = "Slider";
