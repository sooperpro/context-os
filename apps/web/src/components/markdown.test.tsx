import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/markdown";

describe("Markdown", () => {
  it("formats AI-written text: headings, lists, tables, quotes and code", () => {
    render(
      <Markdown
        text={[
          "## How billing works",
          "",
          "Events go through **Kafka** to the `ledger` service.",
          "",
          "1. Publish the event",
          "2. The ledger stores it",
          "",
          "> We chose Kafka for ordering.",
          "",
          "| Area | Owner |",
          "| --- | --- |",
          "| Billing | Platform |",
        ].join("\n")}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "How billing works" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Kafka").tagName).toBe("STRONG");
    expect(screen.getByText("ledger").tagName).toBe("CODE");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("table")).toHaveTextContent("BillingPlatform");
    expect(screen.getByText("We chose Kafka for ordering.").closest("blockquote")).not.toBeNull();
  });

  it("never renders raw HTML or script links from the model", () => {
    const { container } = render(
      <Markdown
        text={"<script>alert(1)</script>\n\nSome <b>bold</b> and [click](javascript:alert(1))"}
      />,
    );
    // Raw HTML shows as text; it is never turned into elements.
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container).toHaveTextContent("<script>alert(1)</script>");
    // The unsafe target is dropped: the text stays, the link goes nowhere.
    expect(screen.getByText("click").closest("a")?.getAttribute("href") ?? "").not.toContain(
      "javascript",
    );
  });
});
