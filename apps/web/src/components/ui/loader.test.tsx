import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BotGlyph } from "@/components/ui/bot-glyph";
import { Loader } from "@/components/ui/loader";

describe("Loader and BotGlyph", () => {
  it("announces an indeterminate progress indicator with a label and draws a shape", () => {
    const { container } = render(<Loader contained size="sm" label="Context Bot is answering" />);
    expect(screen.getByRole("progressbar", { name: "Context Bot is answering" })).toBeInTheDocument();
    expect(container.querySelector("path")?.getAttribute("d")).toMatch(/^M.*Z$/);
  });

  it("renders the bot mark as decoration only", () => {
    const { container } = render(<BotGlyph size="xl" spin />);
    const glyph = container.querySelector("[data-slot=bot-glyph]");
    expect(glyph).toHaveAttribute("aria-hidden", "true");
    expect(glyph?.querySelector("[data-kind=cookie9]")).not.toBeNull();
  });
});
