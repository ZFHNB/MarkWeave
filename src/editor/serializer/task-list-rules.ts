/**
 * GFM 任务列表解析。
 *
 * markdown-it 默认把 `- [ ] todo` 解析为普通列表项，文本里保留字面量 `[ ]`。
 * 这里在渲染后的 DOM 上做一次后处理：若 `<li>` 的文本以 `[ ]` / `[x]` 开头，
 * 则改写为 `ul.md-task-list > li.md-task-item > input + .md-task-content`，
 * 与 schema 中 task_list / task_item 的 parseDOM 对应。
 */

const TASK_RE = /^\s*\[([ xX])\]\s+?/;

export function applyTaskListToDom(root: HTMLElement): void {
  const items = Array.from(root.querySelectorAll("li"));

  for (const li of items) {
    if (li.classList.contains("md-task-item")) continue;

    // 只处理列表项自身的首段文本，跳过嵌套列表
    const firstBlock = li.firstElementChild;
    const isParagraph = !firstBlock || firstBlock.tagName === "P";
    if (!isParagraph) continue;

    const target = firstBlock ?? li;
    const textNode = target.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) continue;

    const match = TASK_RE.exec(textNode.nodeValue || "");
    if (!match) continue;

    const checked = match[1].toLowerCase() === "x";
    textNode.nodeValue = (textNode.nodeValue || "").slice(match[0].length);

    li.classList.add("md-task-item");
    if (checked) li.classList.add("task-done");

    const checkbox = li.ownerDocument.createElement("input");
    checkbox.setAttribute("type", "checkbox");
    checkbox.setAttribute("class", "md-task-checkbox");
    if (checked) checkbox.setAttribute("checked", "checked");

    const content = li.ownerDocument.createElement("div");
    content.className = "md-task-content";

    if (firstBlock && firstBlock.tagName === "P") {
      // 把段落内容移入 .md-task-content
      while (firstBlock.firstChild) content.appendChild(firstBlock.firstChild);
      firstBlock.replaceWith(content);
    } else {
      while (li.firstChild) content.appendChild(li.firstChild);
      li.appendChild(content);
    }

    li.insertBefore(checkbox, li.firstChild);

    const parent = li.parentElement;
    if (parent && (parent.tagName === "UL" || parent.tagName === "OL")) {
      parent.classList.add("md-task-list");
      parent.classList.remove("md-ul-list");
    }
  }
}
