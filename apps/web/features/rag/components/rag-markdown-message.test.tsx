import { act } from "react";
import {
  createRoot,
  type Root,
} from "react-dom/client";

import { NextIntlClientProvider } from "next-intl";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import messages from "@/messages/en.json";

import { RagMarkdownMessage } from "./rag-markdown-message";

describe("RAG Markdown renderer", () => {
  let container: HTMLDivElement;
  let root: Root;

  const originalClipboard =
    Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );

  function renderMarkdown(content: string) {
    act(() => {
      root.render(
        <NextIntlClientProvider
          locale="en"
          messages={messages}
          timeZone="UTC"
        >
          <RagMarkdownMessage
            content={content}
          />
        </NextIntlClientProvider>,
      );
    });
  }

  beforeEach(() => {
    Object.assign(globalThis, {
      IS_REACT_ACT_ENVIRONMENT: true,
    });

    container = document.createElement("div");
    document.body.append(container);

    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());

    container.remove();

    if (originalClipboard) {
      Object.defineProperty(
        navigator,
        "clipboard",
        originalClipboard,
      );
    } else {
      Reflect.deleteProperty(
        navigator,
        "clipboard",
      );
    }

    vi.restoreAllMocks();
  });

  it("renders headings and inline formatting", () => {
    renderMarkdown(
      "# Binary Search\n\n" +
        "**Important** and *efficient*.\n\n" +
        "Use `binary_search`.",
    );

    expect(
      container.querySelector("h2")?.textContent,
    ).toBe("Binary Search");

    expect(
      container.querySelector("strong")
        ?.textContent,
    ).toBe("Important");

    expect(
      container.querySelector("em")?.textContent,
    ).toBe("efficient");

    expect(
      container.querySelector("code")?.textContent,
    ).toBe("binary_search");
  });

  it("renders GFM tables as semantic HTML", () => {
    renderMarkdown(
      "| Algorithm | Complexity |\n" +
        "| --- | --- |\n" +
        "| Binary Search | O(log n) |\n" +
        "| Linear Search | O(n) |",
    );

    expect(
      container.querySelectorAll("table"),
    ).toHaveLength(1);

    expect(
      container.querySelectorAll("thead th"),
    ).toHaveLength(2);

    expect(
      container.querySelectorAll("tbody tr"),
    ).toHaveLength(2);

    expect(
      container.querySelector("tbody")
        ?.textContent,
    ).toContain("O(log n)");

    expect(
      container.querySelector(
        ".rag-table-scroll",
      )?.getAttribute("tabindex"),
    ).toBe("0");
  });

  it("preserves GFM column alignment", () => {
    renderMarkdown(
      "| Left | Right |\n" +
        "| :--- | ---: |\n" +
        "| A | B |",
    );

    const cells =
      container.querySelectorAll("th");

    expect(cells[0].style.textAlign).toBe(
      "left",
    );

    expect(cells[1].style.textAlign).toBe(
      "right",
    );
  });

  it("renders nested lists", () => {
    renderMarkdown(
      "- Parent\n" +
        "  - Nested item\n" +
        "  - Another item",
    );

    expect(
      container.querySelector("ul ul"),
    ).not.toBeNull();

    expect(
      container.querySelectorAll("li"),
    ).toHaveLength(3);
  });

  it("preserves ordered list start values", () => {
    renderMarkdown(
      "3. Third item\n" +
        "4. Fourth item",
    );

    expect(
      container.querySelector("ol")
        ?.getAttribute("start"),
    ).toBe("3");
  });

  it("renders read-only task lists", () => {
    renderMarkdown(
      "- [x] Completed\n" +
        "- [ ] Remaining",
    );

    const inputs =
      container.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]',
      );

    expect(inputs).toHaveLength(2);

    expect(inputs[0].checked).toBe(true);
    expect(inputs[1].checked).toBe(false);

    expect(inputs[0].disabled).toBe(true);
    expect(inputs[1].disabled).toBe(true);
  });

  it("renders strikethrough", () => {
    renderMarkdown("~~Old answer~~ New answer");

    expect(
      container.querySelector("del")
        ?.textContent,
    ).toBe("Old answer");
  });

  it("renders blockquotes", () => {
    renderMarkdown(
      "> Important learning note",
    );

    expect(
      container.querySelector("blockquote")
        ?.textContent,
    ).toContain("Important learning note");
  });

  it("renders highlighted fenced code", () => {
    renderMarkdown(
      "```python\n" +
        "def answer():\n" +
        "    return 42\n" +
        "```",
    );

    expect(
      container.querySelector(
        "pre code.language-python",
      ),
    ).not.toBeNull();

    expect(
      container.querySelector(".hljs-keyword"),
    ).not.toBeNull();

    expect(
      container.querySelector("figcaption")
        ?.textContent,
    ).toContain("python");
  });

  it("renders unknown code languages safely", () => {
    renderMarkdown(
      "```unknown-language\n" +
        "plain content\n" +
        "```",
    );

    expect(
      container.querySelector("pre code")
        ?.textContent,
    ).toContain("plain content");
  });

  it("renders inline mathematical expressions", () => {
    renderMarkdown(
      String.raw`The complexity is $O(\log n)$.`,
    );

    expect(
      container.querySelector(".katex"),
    ).not.toBeNull();

    expect(
      container.querySelector("math"),
    ).not.toBeNull();
  });

  it("renders display mathematical expressions", () => {
    renderMarkdown(
      [
        "$$",
        String.raw`\frac{a}{b}`,
        "$$",
      ].join("\n"),
    );

    expect(
      container.querySelector(".katex-display"),
    ).not.toBeNull();

    expect(
      container.querySelector("math"),
    ).not.toBeNull();
  });

  it("does not render math inside code fences", () => {
    renderMarkdown(
      "```text\n$x^2$\n```",
    );

    expect(
      container.querySelector(".katex"),
    ).toBeNull();

    expect(
      container.querySelector("pre code")
        ?.textContent,
    ).toContain("$x^2$");
  });

  it("handles invalid LaTeX without crashing", () => {
    renderMarkdown(
      String.raw`$\unknowncommand{x}$`,
    );

    expect(
      container.textContent?.length,
    ).toBeGreaterThan(0);
  });

  it("preserves literal escaped dollar signs", () => {
    renderMarkdown(
      String.raw`Price: \$10 and \$20.`,
    );

    expect(
      container.querySelector(".katex"),
    ).toBeNull();

    expect(container.textContent).toContain(
      "Price: $10 and $20.",
    );
  });

  it("allows safe HTTPS links", () => {
    renderMarkdown(
      "[Reference](https://example.com)",
    );

    const link =
      container.querySelector("a");

    expect(
      link?.getAttribute("href"),
    ).toBe("https://example.com");

    expect(
      link?.getAttribute("rel"),
    ).toBe("noopener noreferrer");

    expect(
      link?.getAttribute("target"),
    ).toBe("_blank");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "vbscript:alert(1)",
    "//example.com",
    "/admin",
  ])("blocks unsafe URL %s", (url) => {
    renderMarkdown(`[Unsafe](${url})`);

    expect(
      container.querySelector("a[href]"),
    ).toBeNull();

    expect(container.textContent).toContain(
      "Unsafe",
    );
  });

  it("does not render raw HTML", () => {
    renderMarkdown(
      '<script>alert("test")</script>\n\n' +
        '<iframe src="https://example.com"></iframe>\n\n' +
        '<img src="https://example.com/image.png" onerror="alert(1)">',
    );

    expect(
      container.querySelector("script"),
    ).toBeNull();

    expect(
      container.querySelector("iframe"),
    ).toBeNull();

    expect(
      container.querySelector("img"),
    ).toBeNull();

    expect(
      container.querySelector("[onerror]"),
    ).toBeNull();
  });

  it("does not load external Markdown images", () => {
    renderMarkdown(
      "![Diagram](https://example.com/image.png)",
    );

    expect(
      container.querySelector("img"),
    ).toBeNull();

    expect(container.textContent).toContain(
      "Diagram",
    );
  });

  it("blocks unsafe KaTeX resource commands", () => {
    renderMarkdown(
      String.raw`$\includegraphics{https://example.com/tracker.png}$`,
    );

    expect(
      container.querySelector("img"),
    ).toBeNull();
  });

  it("handles malformed code fences", () => {
    renderMarkdown(
      "```python extra metadata\n" +
        "print('hello')",
    );

    expect(container.textContent).toContain(
      "print('hello')",
    );
  });

  it("copies plain source code from highlighted blocks", async () => {
    const writeText = vi
      .fn()
      .mockResolvedValue(undefined);

    Object.defineProperty(
      navigator,
      "clipboard",
      {
        configurable: true,
        value: { writeText },
      },
    );

    renderMarkdown(
      "```python\n" +
        "print('hello')\n" +
        "```",
    );

    const button =
      container.querySelector("button")!;

    await act(async () => {
      button.click();
    });

    expect(writeText).toHaveBeenCalledWith(
      "print('hello')",
    );

    expect(button.textContent).toContain(
      messages.rag.codeCopied,
    );
  });

  it("reports clipboard failures", async () => {
    const writeText = vi
      .fn()
      .mockRejectedValue(
        new Error("Permission denied"),
      );

    Object.defineProperty(
      navigator,
      "clipboard",
      {
        configurable: true,
        value: { writeText },
      },
    );

    renderMarkdown(
      "```text\nexample\n```",
    );

    const button =
      container.querySelector("button")!;

    await act(async () => {
      button.click();
    });

    expect(button.textContent).toContain(
      messages.rag.codeCopyFailed,
    );
  });
});
