import { screen } from "@testing-library/react";
import { Editor } from "@tiptap/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "@/components/markdown";
import { renderWithProviders } from "@/test/utils";
import { lessonExtensions } from "./extensions";
import RichMarkdownEditor from "./rich-markdown-editor";

/** A lesson using everything lessons are written with. */
const LESSON = [
  "## Why we changed",
  "",
  "The batch job was **too slow** and *hard to watch*. See the [ADR](https://example.test/adr).",
  "",
  "### What to do",
  "",
  "1. Read the runbook",
  "2. Ask in `#billing`",
  "   - Mention the ticket",
  "   - Tag the on-call",
  "",
  "> Every shipment predictable.",
  "",
  "| Area | Owner |",
  "| --- | --- |",
  "| Billing | Platform |",
  "| Pricing | Sales |",
  "",
  "```",
  "kafka-topics --list",
  "```",
  "",
  "---",
  "",
  "Done.",
].join("\n");

const rendered = (text: string) =>
  renderToStaticMarkup(<Markdown text={text} />).replace(/>\s+</g, "><");

describe("Visual lesson editor", () => {
  it("writes back Markdown that learners see exactly as before", () => {
    const editor = new Editor({
      extensions: lessonExtensions(),
      content: LESSON,
      contentType: "markdown",
    });
    const markdown = editor.getMarkdown();
    editor.destroy();
    expect(rendered(markdown)).toBe(rendered(LESSON));
  });

  it("shows the lesson formatted and reports nothing until it is edited", async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <RichMarkdownEditor id="lesson" label="Lesson" value={LESSON} onChange={onChange} />,
    );
    const surface = await screen.findByRole("textbox", { name: "Lesson" });
    expect(surface.querySelector("h2")).toHaveTextContent("Why we changed");
    expect(surface.querySelector("strong")).toHaveTextContent("too slow");
    expect(surface.querySelector("table")).not.toBeNull();
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false");
    expect(onChange).not.toHaveBeenCalled();
  });
});
