// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { LanguagePicker } from "../src/editor/code/language-picker";

describe("LanguagePicker search reset", () => {
  it("clears the search query when reopened", () => {
    const picker = new LanguagePicker({ onChange: () => {} });
    document.body.appendChild(picker.dom);
    picker.open();
    picker.setQuery("py");
    picker.close();
    picker.open();
    const input = picker.dom.querySelector(".md-fences-lang-search") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(picker.dom.querySelector('[data-language-id="rust"]')).toBeTruthy();
    picker.destroy();
  });

  it("allows a fresh keyboard selection after reopening", () => {
    const onChange = vi.fn();
    const picker = new LanguagePicker({ onChange });
    document.body.appendChild(picker.dom);
    picker.open();
    picker.setQuery("py");
    picker.close();
    picker.open();
    const input = picker.dom.querySelector(".md-fences-lang-search") as HTMLInputElement;
    input.value = "rust";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const option = picker.dom.querySelector('[data-language-id="rust"]') as HTMLElement;
    expect(option).toBeTruthy();
    option.click();
    expect(onChange).toHaveBeenCalledWith("rust");
    picker.destroy();
  });
});
