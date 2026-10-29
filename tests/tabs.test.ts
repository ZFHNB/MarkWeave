import { describe, it, expect } from "vitest";
import {
  activateTab,
  closeTab,
  computeSelectionStats,
  createTabState,
  cycleTab,
  openTab,
  reopenClosedTab,
  updateTabTitle,
} from "../src/workspace/tabs";

const tab = (docId: string, title = `${docId}.md`) => ({
  docId,
  title,
  dirty: false,
  pinned: false,
});

describe("tab state", () => {
  it("opens and activates a tab", () => {
    const state = openTab(createTabState(), tab("a"));
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe("a");
  });

  it("does not duplicate an already-open tab", () => {
    let state = openTab(createTabState(), tab("a"));
    state = openTab(state, tab("b"));
    state = openTab(state, tab("a"));
    expect(state.tabs.map((t) => t.docId)).toEqual(["a", "b"]);
    expect(state.activeTabId).toBe("a");
  });

  it("closes the active tab and activates its neighbour", () => {
    let state = openTab(createTabState(), tab("a"));
    state = openTab(state, tab("b"));
    state = openTab(state, tab("c"));
    state = closeTab(state, "b");
    expect(state.tabs.map((t) => t.docId)).toEqual(["a", "c"]);
    expect(state.activeTabId).toBe("c");
  });

  it("closes a background tab without changing the active one", () => {
    let state = openTab(createTabState(), tab("a"));
    state = openTab(state, tab("b"));
    state = closeTab(state, "a");
    expect(state.activeTabId).toBe("b");
  });

  it("clears the active tab when the last one closes", () => {
    const state = closeTab(openTab(createTabState(), tab("a")), "a");
    expect(state.tabs).toHaveLength(0);
    expect(state.activeTabId).toBeNull();
  });

  it("remembers closed tabs", () => {
    let state = openTab(createTabState(), tab("a"));
    state = openTab(state, tab("b"));
    state = closeTab(state, "a");
    expect(state.closedTabs[0]).toBe("a");
  });

  it("reopens the most recent closed tab that still exists", () => {
    let state = openTab(createTabState(), tab("a"));
    state = openTab(state, tab("b"));
    state = closeTab(state, "a");
    state = reopenClosedTab(state, ["a", "b"]);
    expect(state.tabs.map((t) => t.docId)).toEqual(["b", "a"]);
  });

  it("ignores reopening when the document is gone", () => {
    let state = openTab(createTabState(), tab("a"));
    state = closeTab(state, "a");
    expect(reopenClosedTab(state, ["b"]).tabs).toHaveLength(0);
  });

  it("activates only existing tabs", () => {
    const state = openTab(createTabState(), tab("a"));
    expect(activateTab(state, "missing").activeTabId).toBe("a");
  });

  it("updates title and dirty state", () => {
    let state = openTab(createTabState(), tab("a"));
    state = updateTabTitle(state, "a", "renamed.md", true);
    expect(state.tabs[0].title).toBe("renamed.md");
    expect(state.tabs[0].dirty).toBe(true);
  });

  it("cycles through tabs in both directions", () => {
    let state = openTab(createTabState(), tab("a"));
    state = openTab(state, tab("b"));
    state = openTab(state, tab("c"));
    expect(cycleTab(state, 1).activeTabId).toBe("a");
    expect(cycleTab(state, -1).activeTabId).toBe("b");
  });
});

describe("selection stats", () => {
  it("counts the whole text when nothing is selected", () => {
    const stats = computeSelectionStats("hello world", false);
    expect(stats.words).toBe(2);
    expect(stats.chars).toBe(11);
    expect(stats.lines).toBe(1);
    expect(stats.inSelection).toBe(false);
  });

  it("counts CJK characters individually", () => {
    expect(computeSelectionStats("你好世界", true)).toMatchObject({ words: 4, inSelection: true });
  });

  it("counts lines", () => {
    expect(computeSelectionStats("a\nb\nc", true).lines).toBe(3);
  });

  it("handles empty selection text", () => {
    expect(computeSelectionStats("", true)).toMatchObject({ words: 0, chars: 0, lines: 0 });
  });
});
