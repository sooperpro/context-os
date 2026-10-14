import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PillTab, PillTabs } from "@/components/ui/pill-tabs";

describe("PillTabs", () => {
  it("marks the active pill as the current page and renders the rest as plain links", () => {
    render(
      <PillTabs aria-label="Sections">
        <PillTab active render={<a href="/a" />}>
          Overview
        </PillTab>
        <PillTab render={<a href="/b" />}>Decisions</PillTab>
      </PillTabs>,
    );
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Decisions" })).not.toHaveAttribute("aria-current");
  });
});
