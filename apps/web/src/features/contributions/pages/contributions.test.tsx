import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { ContributionEditorPage } from "@/features/contributions/pages/contribution-editor-page";
import { ContributionsPage } from "@/features/contributions/pages/contributions-page";
import { setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

function renderAt(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/contributions" element={<ContributionsPage />} />
      <Route path="/contributions/new" element={<ContributionEditorPage />} />
    </Routes>,
    { route },
  );
}

describe("Contributions", () => {
  it("shows gaps to fill and your contributions with their review state", async () => {
    const user = userEvent.setup();
    renderAt("/contributions");

    const gaps = await screen.findByRole("region", { name: "Knowledge gaps you could fill" });
    // Buttons rendered as links keep the button role; the href is what matters here.
    expect((await within(gaps).findByText("Write it")).closest("a")).toHaveAttribute(
      "href",
      "/contributions/new?gap=gap-kestrel-rollback",
    );

    const mine = screen.getByRole("region", { name: "Your contributions" });
    const shipment = (await within(mine).findByText("Shipment event")).closest("li")!;
    expect(
      within(shipment).getByText("In review", { selector: "[aria-current=step] span" }),
    ).toBeInTheDocument();
    expect(within(shipment).getByText(/add the list of event types/)).toBeInTheDocument();

    await user.click(within(shipment).getByRole("button", { name: "Edit and resubmit" }));
    await waitFor(() =>
      expect(within(mine).queryByText(/add the list of event types/)).not.toBeInTheDocument(),
    );
    expect(within(mine).getByText(/resubmitted today/)).toBeInTheDocument();
  });

  it("writes a contribution from a gap: draft from sources, submit, and see it in review", async () => {
    const user = userEvent.setup();
    renderAt("/contributions/new?gap=gap-kestrel-rollback");

    expect(await screen.findByRole("textbox", { name: "Title" })).toHaveValue(
      "Roll back a Kestrel deploy",
    );
    expect(screen.getByText(/Fills the gap/)).toHaveTextContent(
      "How do I roll back a Kestrel deploy?",
    );
    const submit = screen.getByRole("button", { name: "Submit for review" });
    expect(submit).toBeDisabled();
    expect(await screen.findByText("Sana Iqbal")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Draft from sources" }));
    expect(await screen.findByText(/Drafted by Context Bot/)).toBeInTheDocument();
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Content" }).value).toContain(
      "## Steps",
    );
    expect(screen.getByText("Kestrel rollout plan v3")).toBeInTheDocument();
    expect(screen.getByText(/connector is failing/)).toBeInTheDocument();

    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    const mine = await screen.findByRole("region", { name: "Your contributions" });
    const created = (await within(mine).findByText("Roll back a Kestrel deploy")).closest("li")!;
    expect(within(created).getByText(/Reviewer:/)).toHaveTextContent(
      "Reviewer: Sana Iqbal · usually 2 working days",
    );
    const gaps = screen.getByRole("region", { name: "Knowledge gaps you could fill" });
    await waitFor(() =>
      expect(
        within(gaps).queryByText("How do I roll back a Kestrel deploy?"),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps Submit off until there is a title, enough text and a source", async () => {
    const user = userEvent.setup();
    renderAt("/contributions/new");

    await user.type(await screen.findByRole("textbox", { name: "Title" }), "Dwell time");
    await user.click(screen.getByRole("button", { name: "Glossary term" }));
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeDisabled();
    const checks = screen.getByRole("list", { name: "Ready to submit" });
    expect(within(checks).getByText(/^Title/)).toHaveTextContent("(done)");
    expect(within(checks).getByText(/At least one source/)).toHaveTextContent("(to do)");
  });
});
