/**
 * 文档标签页状态（纯逻辑，便于单测）。
 * 标签与文档一一对应；关闭标签只是从标签栏移除，文档本身仍在工作区。
 */

export interface TabItem {
  docId: string;
  title: string;
  dirty: boolean;
  pinned: boolean;
}

export interface TabState {
  tabs: TabItem[];
  activeTabId: string | null;
  closedTabs: string[];
}

export function createTabState(): TabState {
  return { tabs: [], activeTabId: null, closedTabs: [] };
}

export function openTab(state: TabState, tab: TabItem): TabState {
  const existing = state.tabs.find((item) => item.docId === tab.docId);
  if (existing) {
    return {
      ...state,
      tabs: state.tabs.map((item) => (item.docId === tab.docId ? { ...item, ...tab } : item)),
      activeTabId: tab.docId,
    };
  }
  return {
    tabs: [...state.tabs, tab],
    activeTabId: tab.docId,
    closedTabs: state.closedTabs.filter((id) => id !== tab.docId),
  };
}

export function closeTab(state: TabState, docId: string): TabState {
  const index = state.tabs.findIndex((item) => item.docId === docId);
  if (index === -1) return state;

  const tabs = state.tabs.filter((item) => item.docId !== docId);
  let activeTabId = state.activeTabId;
  if (activeTabId === docId) {
    const neighbour = tabs[Math.min(index, tabs.length - 1)];
    activeTabId = neighbour ? neighbour.docId : null;
  }

  return {
    tabs,
    activeTabId,
    closedTabs: [docId, ...state.closedTabs.filter((id) => id !== docId)].slice(0, 20),
  };
}

export function activateTab(state: TabState, docId: string): TabState {
  if (!state.tabs.some((item) => item.docId === docId)) return state;
  return { ...state, activeTabId: docId };
}

/** 重新打开最近关闭的标签；docId 需仍然存在于工作区 */
export function reopenClosedTab(state: TabState, availableDocIds: string[]): TabState {
  for (const docId of state.closedTabs) {
    if (availableDocIds.includes(docId)) {
      const tab = { docId, title: docId, dirty: false, pinned: false };
      return openTab({ ...state, closedTabs: state.closedTabs.filter((id) => id !== docId) }, tab);
    }
  }
  return state;
}

export function updateTabTitle(state: TabState, docId: string, title: string, dirty: boolean): TabState {
  return {
    ...state,
    tabs: state.tabs.map((item) => (item.docId === docId ? { ...item, title, dirty } : item)),
  };
}

export function cycleTab(state: TabState, direction: 1 | -1): TabState {
  if (state.tabs.length === 0) return state;
  const index = state.tabs.findIndex((item) => item.docId === state.activeTabId);
  const next = (index + direction + state.tabs.length) % state.tabs.length;
  return { ...state, activeTabId: state.tabs[next].docId };
}

/** 统计选区（或全文）的字数 */
export interface SelectionStats {
  words: number;
  chars: number;
  lines: number;
  inSelection: boolean;
}

export function computeSelectionStats(
  text: string,
  hasSelection: boolean
): SelectionStats {
  const chars = text.length;
  const lines = text === "" ? 0 : text.split(/\r?\n/).length;
  const matches = text.match(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{Script=Latin}0-9]+/gu
  );
  return {
    words: matches ? matches.length : 0,
    chars,
    lines,
    inSelection: hasSelection,
  };
}

/**
 * 关闭除 keepId 之外的所有标签。
 *
 * 目标标签保持激活；不在标签栏里的文档不受影响（它们本来就没开）。
 */
export function closeOtherTabs(state: TabState, keepId: string): TabState {
  const kept = state.tabs.filter((tab) => tab.docId === keepId);
  if (kept.length === 0) return state;

  const closed = state.tabs
    .filter((tab) => tab.docId !== keepId)
    .map((tab) => tab.docId);

  return {
    tabs: kept,
    activeTabId: keepId,
    closedTabs: [...closed, ...state.closedTabs.filter((id) => id !== keepId)].slice(0, 20),
  };
}

/** 关闭全部标签；文档本身仍在工作区，可用「重新打开」找回 */
export function closeAllTabs(state: TabState): TabState {
  if (state.tabs.length === 0) return state;
  const closed = state.tabs.map((tab) => tab.docId);
  return {
    tabs: [],
    activeTabId: null,
    // 越靠后的越"最近"，因此反向压入
    closedTabs: [...closed.slice().reverse(), ...state.closedTabs].slice(0, 20),
  };
}

/** 关闭指定标签右侧的所有标签（保留 keepId 及其左侧） */
export function closeTabsToRight(state: TabState, keepId: string): TabState {
  const index = state.tabs.findIndex((tab) => tab.docId === keepId);
  if (index === -1) return state;

  const kept = state.tabs.slice(0, index + 1);
  const closed = state.tabs.slice(index + 1).map((tab) => tab.docId);
  if (closed.length === 0) return state;

  return {
    tabs: kept,
    activeTabId: keepId,
    closedTabs: [...closed, ...state.closedTabs.filter((id) => !closed.includes(id))].slice(0, 20),
  };
}
