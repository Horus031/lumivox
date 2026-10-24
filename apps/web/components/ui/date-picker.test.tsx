import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatePicker } from "./date-picker";
import { formatLocalDate } from "@/lib/local-date";
import en from "@/messages/en.json";
import viMessages from "@/messages/vi.json";

describe("shared date picker", () => {
  let container: HTMLDivElement;
  let root: Root;
  const changed = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    act(() => root.unmount());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    container.remove();
  });
  async function render(props: Partial<React.ComponentProps<typeof DatePicker>> = {}, locale = "en") {
    await act(async () => root.render(
      <NextIntlClientProvider locale={locale} messages={locale === "vi" ? viMessages : en}>
        <DatePicker label="Deadline" onChange={changed} {...props} />
      </NextIntlClientProvider>,
    ));
  }
  async function click(element: HTMLElement | null | undefined) {
    expect(element).toBeTruthy();
    await act(async () => element!.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  }
  function button(label: string) { return [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === label); }

  it("opens an existing future date and selects another date without converting it to UTC", async () => {
    const year = new Date().getFullYear() + 5;
    await render({ value: new Date(year, 0, 15) });
    await click(container.querySelector("button"));
    expect(document.querySelector('[role="combobox"][aria-label="Year"]')?.textContent).toBe(String(year));
    const target = new Date(year, 0, 20);
    await click(document.querySelector<HTMLButtonElement>(`[data-day="${target.toLocaleDateString()}"]`));
    expect(changed).toHaveBeenCalledExactlyOnceWith(target);
    expect(document.querySelector('[data-slot="calendar"]')).toBeNull();
  });

  it("can navigate beyond December of the current year", async () => {
    const year = new Date().getFullYear();
    await render({ value: new Date(year, 11, 15) });
    await click(container.querySelector("button"));
    await click(document.querySelector<HTMLButtonElement>('[aria-label="Next month"]'));
    expect(document.querySelector('[role="combobox"][aria-label="Year"]')?.textContent).toBe(String(year + 1));
    expect(changed).not.toHaveBeenCalled();
    expect(document.querySelector('input[type="date"]')).toBeNull();
  });

  it("supports existing dates beyond the default navigation range", async () => {
    await render({ value: new Date(2300, 4, 12) });
    await click(container.querySelector("button"));
    expect(document.querySelector('[role="combobox"][aria-label="Year"]')?.textContent).toBe("2300");
  });

  it("clears optional dates and restores focus to the field", async () => {
    await render({ value: new Date(2030, 0, 15) });
    const trigger = container.querySelector("button")!;
    await click(trigger);
    await click(button("Clear date"));
    expect(changed).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(document.activeElement).toBe(trigger);
  });

  it("enforces required fields and excludes unavailable dates", async () => {
    await render({ required: true, minDate: new Date(2030, 0, 10), maxDate: new Date(2030, 0, 20), value: new Date(2030, 0, 15) });
    await click(container.querySelector("button"));
    expect(button("Clear date")).toBeUndefined();
    expect(button("Today")?.disabled).toBe(true);
    const outside = document.querySelector<HTMLButtonElement>(`[data-day="${new Date(2030, 0, 9).toLocaleDateString()}"]`)!;
    expect(outside.disabled).toBe(true);
    await click(outside);
    expect(changed).not.toHaveBeenCalled();
  });

  it("keeps required empty fields invalid and disabled fields out of validation", async () => {
    await render({ required: true });
    const input = container.querySelector("input")!;
    expect(input.validity.valueMissing).toBe(true);
    await render({ required: true, disabled: true });
    expect(container.querySelector("input")!.willValidate).toBe(false);
    await click(container.querySelector("button"));
    expect(document.querySelector('[data-slot="calendar"]')).toBeNull();
  });

  it("localizes the field and shortcuts in Vietnamese", async () => {
    await render({}, "vi");
    expect(container.textContent).toContain("Chọn ngày");
    await click(container.querySelector("button"));
    expect(button("Hôm nay")).toBeTruthy();
    expect(document.querySelector('[aria-label="Năm"]')).toBeTruthy();
    await click(button("Hôm nay"));
    expect(formatLocalDate(changed.mock.calls[0][0])).toBe(formatLocalDate(new Date()));
  });

  it("reopens on the latest controlled date after a form reset or record change", async () => {
    function Harness() {
      const [date, setDate] = useState<Date | undefined>(new Date(2030, 0, 15));
      return <><DatePicker label="Deadline" value={date} onChange={setDate} /><button onClick={() => setDate(new Date(2040, 5, 10))}>Switch record</button></>;
    }
    await act(async () => root.render(<NextIntlClientProvider locale="en" messages={en}><Harness /></NextIntlClientProvider>));
    await click(button("Switch record"));
    await click(container.querySelector("button"));
    expect(document.querySelector('[role="combobox"][aria-label="Year"]')?.textContent).toBe("2040");
  });
});
