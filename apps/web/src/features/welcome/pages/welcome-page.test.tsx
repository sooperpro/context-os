import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { WelcomePage } from "@/features/welcome/pages/welcome-page";
import { buildApiUrl } from "@/lib/api-client";
import { setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

describe("First-day welcome", () => {
  it("introduces the people, saves the profile and opens the roadmap", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/roadmap" element={<h1>My roadmap</h1>} />
      </Routes>,
      { route: "/welcome" },
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: /Welcome.*Maya/ }),
    ).toBeInTheDocument();
    const helpers = screen.getByRole("list", { name: "People who will help you" });
    expect(within(helpers).getAllByRole("listitem")).toHaveLength(3);
    expect(helpers).toHaveTextContent("Daniel ReyesYour manager");
    await user.click(screen.getByRole("button", { name: "Get started" }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Set up your profile" }),
    ).toBeInTheDocument();
    const name = screen.getByRole("textbox", { name: "What should people call you?" });
    await user.clear(name);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.type(name, "May");
    await user.click(screen.getByRole("button", { name: "Kafka" }));
    await user.click(screen.getByRole("radio", { name: /Both/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Your first 90 days" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 topics you know are marked optional/)).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "Stages" })).toHaveTextContent("Foundations");
    await user.click(screen.getByRole("button", { name: "Open my roadmap" }));

    expect(await screen.findByRole("heading", { name: "My roadmap" })).toBeInTheDocument();
    const saved = (await (
      await fetch(new URL(buildApiUrl("/v1/me/welcome"), window.location.origin))
    ).json()) as {
      completedAt: string | null;
      profile: { preferredName: string; known: string[]; reminders: string };
    };
    expect(saved.completedAt).not.toBeNull();
    expect(saved.profile).toMatchObject({
      preferredName: "May",
      known: ["TypeScript", "APIs", "Kafka"],
      reminders: "both",
    });
  });
});
