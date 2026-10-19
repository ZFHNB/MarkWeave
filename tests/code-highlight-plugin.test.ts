import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import { schema } from "../src/editor/schema";
import {
  createCodeHighlightPlugin,
  codeHighlightKey,
} from "../src/editor/code/highlight-plugin";

function stateWithCode(params: string, code: string): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("code_block", { params }, [schema.text(code)]),
  ]);
  return EditorState.create({
    doc,
    plugins: [createCodeHighlightPlugin()],
  });
}

describe("code highlight plugin", () => {
  it("decorates a javascript code block", () => {
    const state = stateWithCode("javascript", 'const x = "hi";');
    const decorations = codeHighlightKey.getState(state)!;
    const found = decorations.find(0, state.doc.content.size);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((d: any) => String(d.spec?.class || d.type?.attrs?.class || "").includes("hljs"))).toBe(true);
  });

  it("does not decorate mermaid, plaintext or unknown languages", () => {
    for (const params of ["mermaid", "plaintext", "unknown-lang"]) {
      const state = stateWithCode(params, "const x = 1;");
      const decorations = codeHighlightKey.getState(state)!;
      expect(decorations.find(0, state.doc.content.size)).toHaveLength(0);
    }
  });
});
