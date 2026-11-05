import { describe, it, expect } from "vitest";
import {
  activateTab,
  closeAllTabs,
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
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

describe("bulk tab closing", () => {
  function threeTabs() {
    let state = createTabState();
    state = openTab(state, tab("a"));
    state = openTab(state, tab("b"));
    state = openTab(state, tab("c"));
    return state;
  }

  it("closes everything except the kept tab", () => {
    const next = closeOtherTabs(threeTabs(), "b");
    expect(next.tabs.map((t) => t.docId)).toEqual(["b"]);
    expect(next.activeTabId).toBe("b");
    expect(next.closedTabs).toEqual(expect.arrayContaining(["a", "c"]));
  });

  it("keeps the state untouched when the kept tab does not exist", () => {
    const state = threeTabs();
    expect(closeOtherTabs(state, "missing")).toBe(state);
  });

  it("closes all tabs and remembers them for reopening", () => {
    const next = closeAllTabs(threeTabs());
    expect(next.tabs).toEqual([]);
    expect(next.activeTabId).toBeNull();
    // 最近关闭的排在最前：c 最后被关，因此最先能被「重新打开」找回
    expect(next.closedTabs[0]).toBe("c");
  });

  it("is a no-op when there are no tabs", () => {
    const empty = createTabState();
    expect(closeAllTabs(empty)).toBe(empty);
  });

  it("closes tabs to the right of the kept one", () => {
    const next = closeTabsToRight(threeTabs(), "a");
    expect(next.tabs.map((t) => t.docId)).toEqual(["a"]);
    expect(next.activeTabId).toBe("a");
    expect(next.closedTabs).toEqual(expect.arrayContaining(["b", "c"]));
  });

  it("does nothing when the kept tab is already last", () => {
    const state = threeTabs();
    expect(closeTabsToRight(state, "c")).toBe(state);
  });

  it("can reopen a tab after closing all", () => {
    const closed = closeAllTabs(threeTabs());
    const reopened = reopenClosedTab(closed, ["a", "b", "c"]);
    expect(reopened.tabs).toHaveLength(1);
    expect(reopened.closedTabs).not.toContain(reopened.tabs[0].docId);
  });
});
