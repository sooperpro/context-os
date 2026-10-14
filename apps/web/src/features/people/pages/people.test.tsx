import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  AssistantContext,
  type AssistantContextValue,
} from "@/components/layout/assistant-context";
import { PeoplePage } from "@/features/people/pages/people-page";
import { PersonPage } from "@/features/people/pages/person-page";
import { setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

function renderAt(route: string) {
  const assistant: AssistantContextValue = {
    open: false,
    openAssistant: vi.fn(),
    closeAssistant: vi.fn(),
    toggleAssistant: vi.fn(),
    wide: false,
    toggleWide: vi.fn(),
    showBotDemo: vi.fn(),
    subscribeToRequests: () => () => undefined,
  };
  renderWithProviders(
    <AssistantContext value={assistant}>
      <Routes>
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/people/:personId" element={<PersonPage />} />
      </Routes>
    </AssistantContext>,
    { route },
  );
  return assistant;
}

const card = (name: string) =>
  within(screen.getByRole("list", { name: "People" })).getByRole("link", {
    name: new RegExp(name),
  });

describe("People", () => {
  it("lists people with badges relative to you, and searches by skill", async () => {
    const user = userEvent.setup();
    renderAt("/people");

    expect(await screen.findByText("412 people · 18 teams")).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "People" })).toBeInTheDocument();
    expect(card("Daniel Reyes")).toHaveAttribute("href", "/people/p-daniel");
    expect(within(card("Daniel Reyes")).getByText("Your manager")).toBeInTheDocument();
    expect(within(card("Sana Iqbal")).getByText("Your buddy")).toBeInTheDocument();
    expect(within(card("Sana Iqbal")).getByText("Expert")).toBeInTheDocument();
    expect(within(card("Maya Okafor")).getByText("You")).toBeInTheDocument();
    expect(within(card("Jonah Kim")).getByText("Starting soon")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Search people" }), "kafka");
    expect(await screen.findByText("1 person matching “kafka”")).toBeInTheDocument();
    expect(card("Sana Iqbal")).toBeInTheDocument();
  });

  it("filters to experts, and shows your team and all teams", async () => {
    const user = userEvent.setup();
    renderAt("/people");

    await user.click(await screen.findByRole("button", { name: "Experts" }));
    expect(await screen.findByText("5 people")).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "People" })).queryByRole("link", {
        name: /Maya Okafor/,
      }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Teams" }));
    const platform = await screen.findByRole("region", { name: "Platform team" });
    expect(within(platform).getByText("Daniel Reyes")).toBeInTheDocument();
    expect(within(platform).getByRole("link", { name: /Leah Park/ })).toHaveAttribute(
      "href",
      "/people/p-leah",
    );
    expect(screen.getByRole("article", { name: "Sales" })).toHaveTextContent("31 people");
  });

  it("shows a profile: what they own and their reporting line", async () => {
    const user = userEvent.setup();
    const assistant = renderAt("/people/p-sana");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Sana Iqbal" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Your buddy")).toBeInTheDocument();
    const owns = screen.getByRole("region", { name: /Owns in the Knowledge Hub/ });
    expect(
      within(owns).getByRole("link", { name: /ADR-042: Billing events on Kafka/ }),
    ).toHaveAttribute("href", "/knowledge?cat=decision");
    const line = screen.getByRole("region", { name: "Reporting line" });
    expect(within(line).getByRole("link", { name: /Daniel Reyes/ })).toHaveAttribute(
      "href",
      "/people/p-daniel",
    );

    await user.click(screen.getByRole("button", { name: "What does Sana work on?" }));
    expect(assistant.openAssistant).toHaveBeenCalledWith("What does Sana work on?");
  });
});
