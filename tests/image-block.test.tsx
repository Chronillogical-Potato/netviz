import { beforeEach, describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import { ImageNodeView } from "../src/components/nodes/image-node";
import {
  useFlowStore,
  type ImageNode,
} from "../src/store/flow-store";

beforeEach(() => {
  useFlowStore.setState({ nodes: [], edges: [], groups: [] });
});

describe("image block", () => {
  test("creates an empty image frame with editable appearance defaults", () => {
    const addImageNode = useFlowStore.getState().addImageNode;
    const id = addImageNode("", { x: 40, y: 60 }, { width: 280, height: 180 });
    const node = useFlowStore
      .getState()
      .nodes.find((candidate): candidate is ImageNode => candidate.id === id);

    expect(node?.type).toBe("image");
    expect(node?.position).toEqual({ x: 40, y: 60 });
    expect(node?.style).toMatchObject({ width: 280, height: 180 });
    expect(node?.data).toMatchObject({
      src: "",
      fit: "contain",
      scale: 100,
      opacity: 100,
      borderWidth: 1,
      borderRadius: 8,
      borderStyle: "solid",
    });
  });

  test("renders an empty frame that opens an image picker", () => {
    const markup = renderToStaticMarkup(
      <ReactFlowProvider>
        <ImageNodeView
          {...({
            id: "image-1",
            type: "image",
            selected: false,
            data: { src: "" },
          } as never)}
        />
      </ReactFlowProvider>
    );

    expect(markup).toContain("Click to add image");
    expect(markup).toContain('accept="image/*"');
    expect(markup).toContain("overflow-visible");
    expect(markup).toContain('data-image-content="true"');
  });

  test("lets the image frame resize freely", async () => {
    const imageNode = await testFile(
      new URL("../src/components/nodes/image-node.tsx", import.meta.url)
    ).text();

    expect(imageNode).not.toContain("keepAspectRatio");
  });

  test("replaces only the image whose file picker was used", () => {
    const first = useFlowStore
      .getState()
      .addImageNode("", { x: 0, y: 0 }, { width: 280, height: 180 });
    const second = useFlowStore
      .getState()
      .addImageNode("", { x: 320, y: 0 }, { width: 280, height: 180 });
    useFlowStore.getState().selectNodes([first, second]);

    useFlowStore.getState().updateNodeData(first, { src: "data:image/png;base64,first" });

    const images = useFlowStore.getState().nodes as ImageNode[];
    expect(images.find((node) => node.id === first)?.data.src).toBe(
      "data:image/png;base64,first"
    );
    expect(images.find((node) => node.id === second)?.data.src).toBe("");
  });

  test("shows fit, scale, opacity, and border controls in the inspector", async () => {
    const inspector = await testFile(
      new URL("../src/components/inspector.tsx", import.meta.url)
    ).text();

    expect(inspector).toContain('aria-label="Image fit"');
    expect(inspector).toContain('label="Scale"');
    expect(inspector).toContain('label="Opacity"');
    expect(inspector).toContain('label="Border width"');
    expect(inspector).toContain("Replace image");
    expect(inspector).not.toContain("Alt text");
  });

  test("removes legacy alt text from the image model and layer name", async () => {
    const store = await testFile(
      new URL("../src/store/flow-store.ts", import.meta.url)
    ).text();

    expect(store).not.toContain("alt?: string");
    expect(store).not.toContain('return node.data.alt || "Image"');
  });
});
