import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Highlight, themes } from "prism-react-renderer";
import { useTheme } from "next-themes";
import type { CodeNode } from "@/store/flow-store";
import { cn } from "@/lib/utils";
import { CanvasNodeResizer } from "./canvas-node-resizer";

const HANDLE_POSITIONS: { pos: Position; key: string }[] = [
  { pos: Position.Top, key: "top" },
  { pos: Position.Right, key: "right" },
  { pos: Position.Bottom, key: "bottom" },
  { pos: Position.Left, key: "left" },
];

function CodeNodeComponent({ data, selected }: NodeProps<CodeNode>) {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "light" ? themes.vsLight : themes.vsDark;
  const code = data.code || "// your code here";
  const lang = data.language || "plaintext";

  const style: React.CSSProperties = {};
  if (data.bgColor) style.backgroundColor = data.bgColor;
  if (data.borderColor) style.borderColor = data.borderColor;
  if (typeof data.borderRadius === "number")
    style.borderRadius = data.borderRadius;

  return (
    <div
      className={cn(
        "code-card relative flex h-full w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        selected && "ring-1 ring-ring"
      )}
      style={style}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
        <span
          className="truncate text-[11px] font-medium tracking-wide text-muted-foreground"
          style={data.titleColor ? { color: data.titleColor } : undefined}
        >
          {data.label || lang}
        </span>
        <span className="shrink-0 text-[10px] uppercase text-muted-foreground/70">
          {lang}
        </span>
      </div>
      <Highlight code={code} language={lang} theme={theme}>
        {({ className, style: preStyle, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(
              "min-h-0 flex-1 overflow-auto whitespace-pre p-3 text-xs leading-relaxed",
              className
            )}
            style={preStyle}
          >
            {tokens.map((line, i) => {
              const { key: lineKey, ...lineProps } = getLineProps({ line });
              return (
                <div key={i} {...lineProps}>
                  {line.map((token, j) => {
                    const { key: tokKey, ...tokProps } = getTokenProps({
                      token,
                    });
                    return <span key={j} {...tokProps} />;
                  })}
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
      <CanvasNodeResizer
        isVisible={selected}
        minWidth={180}
        minHeight={100}
        lineClassName="!border-ring/70"
        handleClassName="!h-1.5 !w-1.5 !rounded-[1px] !border !border-ring !bg-white !shadow-sm"
      />
      {HANDLE_POSITIONS.map(({ pos, key }) => (
        <Handle key={key} type="source" position={pos} id={key} />
      ))}
    </div>
  );
}

export const CodeNodeView = memo(CodeNodeComponent);
