import { beforeEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import * as TextNodeComponents from "../src/components/nodes/text-node";
import { TextNodeView } from "../src/components/nodes/text-node";
import { useFlowStore, type TextNode } from "../src/store/flow-store";

const textNode: TextNode = {
  id: "text-1",
  type: "text",
  position: { x: 0, y: 0 },
  data: { text: "Editable text", accent: "amber" },
};

beforeEach(() => {
  useFlowStore.setState({
    nodes: [textNode],
    workMode: "design",
    editingTextNodeId: null,
  });
});

describe("TextNodeView", () => {
  test("opens a newly added text node for immediate typing", () => {
    const id = useFlowStore.getState().addTextNode({ x: 20, y: 30 });

    expect(useFlowStore.getState().editingTextNodeId).toBe(id);
  });

  test("renders an in-place editor for the active text node", () => {
    const InlineTextEditor = (
      TextNodeComponents as unknown as {
        InlineTextEditor?: (props: {
          value: string;
          onChange: (value: string) => void;
          onCommit: () => void;
          onCancel: () => void;
        }) => React.ReactNode;
      }
    ).InlineTextEditor;
    expect(typeof InlineTextEditor).toBe("function");
    if (!InlineTextEditor) return;

    const markup = renderToStaticMarkup(
      <InlineTextEditor
        value="Editable text"
        onChange={() => {}}
        onCommit={() => {}}
        onCancel={() => {}}
      />
    );

    expect(markup).toContain("<textarea");
    expect(markup).toContain('aria-label="Edit text"');
    expect(markup.toLowerCase()).toContain("autofocus");
    expect(markup).toContain("Editable text");
  });

  test("advertises double-click editing when displaying text", () => {
    const markup = renderToStaticMarkup(
      <ReactFlowProvider>
        <TextNodeView
          id={textNode.id}
          type="text"
          data={textNode.data}
          selected={false}
          dragging={false}
          zIndex={0}
          selectable
          deletable
          draggable
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
        />
      </ReactFlowProvider>
    );

    expect(markup).toContain('title="Double-click to edit"');
    expect(markup).not.toContain("<textarea");
  });
});
