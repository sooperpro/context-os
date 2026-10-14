import type { SourceObject } from "@contextos/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceList } from "@/features/sources/components/source-list";
import { SourceDrawerContext } from "@/features/sources/components/source-drawer-context";
import { renderWithProviders } from "@/test/utils";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const source = (id: string, title: string, status: SourceObject["status"]): SourceObject => ({
  id,
  projectId: PROJECT,
  connector: "manual",
  kind: "document",
  externalId: null,
  title,
  url: null,
  author: "Priya Nair",
  sourceCreatedAt: "2026-04-28T00:00:00.000Z",
  sourceUpdatedAt: null,
  ingestedAt: "2026-10-14T00:00:00.000Z",
  processedAt: null,
  status,
  error: status === "failed" ? "No readable text" : null,
  contentLength: 1200,
  chunkCount: status === "ready" ? 3 : 0,
});

describe("SourceList", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows provenance and status per row and confirms before deleting", async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      calls.push(`${init?.method ?? "GET"} ${typeof input === "string" ? input : input instanceof URL ? input.href : input.url}`);
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    const user = userEvent.setup();
    renderWithProviders(
      <SourceDrawerContext value={{ open: vi.fn() }}>
        <SourceList
          projectId={PROJECT}
          sources={[source("a1", "Kestrel design doc", "ready"), source("b2", "Scanned PDF", "failed")]}
        />
      </SourceDrawerContext>,
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("No readable text")).toBeInTheDocument();
    expect(screen.getByText("3 chunks")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete Scanned PDF" }));
    expect(await screen.findByRole("heading", { name: "Delete this source?" })).toBeInTheDocument();
    expect(calls.some((call) => call.startsWith("DELETE"))).toBe(false);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calls.some((call) => call.startsWith("DELETE") && call.includes("/sources/b2"))).toBe(true));
  });
});
