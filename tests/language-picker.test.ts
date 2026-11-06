// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { LanguagePicker } from "../src/editor/code/language-picker";

function mount(onChange: (id: string) => void): LanguagePicker {
  const picker = new LanguagePicker({ onChange });
  document.body.appendChild(picker.dom);
  return picker;
}

describe("LanguagePicker", () => {
  it("filters and selects a language", () => {
    const onChange = vi.fn();
    const picker = mount(onChange);
    picker.open();
    picker.setQuery("type");
    const option = picker.dom.querySelector(
      '[data-language-id="typescript"]'
    ) as HTMLElement;
    expect(option).toBeTruthy();
    option.click();
    expect(onChange).toHaveBeenCalledWith("typescript");
    picker.destroy();
  });

  it("offers a custom language for unknown queries", () => {
    const onChange = vi.fn();
    const picker = mount(onChange);
    picker.open();
    picker.setQuery("my-lang");
    const option = picker.dom.querySelector(
      '[data-custom-language="true"]'
    ) as HTMLElement;
    expect(option).toBeTruthy();
    expect(option.textContent).toContain("my-lang");
    option.click();
    expect(onChange).toHaveBeenCalledWith("my-lang");
    picker.destroy();
  });

  it("updates the trigger label", () => {
    const picker = new LanguagePicker({ onChange: () => {} });
    picker.setValue("typescript");
    expect(picker.dom.textContent).toContain("TypeScript");
    picker.setValue("plaintext");
    expect(picker.dom.textContent).toContain("纯文本");
    picker.destroy();
  });
});
