import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { MessageDialog } from "@/features/messages/components/message-dialog";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

/** The directory search the dialog uses to find someone the Hub knows only by name. */
function members(items: Array<{ id: string; name: string }>) {
  mockServer.use(
    http.get(buildApiUrl("/v1/users"), () =>
      HttpResponse.json({
        items: items.map((item) => ({ ...item, role: "member", status: "active" })),
      }),
    ),
  );
}

describe("MessageDialog (ALL-3)", () => {
  it("finds someone by name and sends them a message about a Hub item", async () => {
    members([
      { id: "u-priya-n", name: "Priya Nair" },
      { id: "u-priya", name: "Priya Shah" },
    ]);
    const sent: unknown[] = [];
    mockServer.use(
      http.post(buildApiUrl("/v1/people/:id/messages"), async ({ request, params }) => {
        sent.push({ to: params.id, body: await request.json() });
        return HttpResponse.json({ inApp: true, emailed: false });
      }),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <MessageDialog
        to={{ name: "Priya Shah" }}
        about={{ title: "ADR-0007", link: "/projects/p1/items/i1" }}
        onClose={onClose}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Message Priya Shah" });
    expect(dialog).toHaveTextContent("About ADR-0007.");
    await user.type(await within(dialog).findByLabelText("Message"), "Is this still current?");
    await user.click(within(dialog).getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(sent).toEqual([
        {
          to: "u-priya",
          body: {
            text: "Is this still current?",
            about: { title: "ADR-0007", link: "/projects/p1/items/i1" },
          },
        },
      ]),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("says so when nobody in ContextOS has that name", async () => {
    members([{ id: "u-priya-n", name: "Priya Nair" }]);
    renderWithProviders(<MessageDialog to={{ name: "Priya Shah" }} onClose={vi.fn()} />);
    const dialog = await screen.findByRole("dialog", { name: "Message Priya Shah" });
    expect(
      await within(dialog).findByText(
        "Priya Shah isn't in ContextOS yet, so they can't get messages here.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
