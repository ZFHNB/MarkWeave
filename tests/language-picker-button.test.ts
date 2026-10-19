// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { LanguagePicker } from "../src/editor/code/language-picker";

describe("LanguagePicker trigger protection", () => {
  it("marks the trigger as non-editable and hides the caret", () => {
    const picker = new LanguagePicker({ onChange: () => {} });
    document.body.appendChild(picker.dom);
    const trigger = picker.dom.querySelector(".md-fences-lang-trigger") as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute("contenteditable")).toBe("false");
    expect(trigger.style.userSelect).toBe("none");
    expect(trigger.style.caretColor).toBe("transparent");
    picker.destroy();
  });
});
