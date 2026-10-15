import { beforeEach, describe, expect, it } from "vitest";
import { buildApiUrl } from "@/lib/api-client";
import { mockEndpoints } from "@/mocks/endpoints";
import { employeeFixtures, employeeHandlers } from "@/test/employee-mocks";
import { learnerFixtures, learnerHandlers } from "@/test/learning-mocks";
import { mockServer, setupMockApi } from "@/test/msw";
import { managerFixtures, managerHandlers } from "@/test/manager-mocks";
import { peopleOpsFixtures, peopleOpsHandlers } from "@/test/people-ops-mocks";

setupMockApi();
// People Ops', the manager's and the employee's own endpoints are served by the API; their fixtures
// still back the screen tests.
beforeEach(() =>
  mockServer.use(
    ...peopleOpsHandlers(),
    ...managerHandlers(),
    ...employeeHandlers(),
    ...learnerHandlers(),
  ),
);

/** Example ids for parameterized endpoints, from the fixtures. */
const EXAMPLE: Record<string, string> = {
  "/v1/me/modules/:id": "/v1/me/modules/m4",
  "/v1/me/lessons/:id": "/v1/me/lessons/m4-l3",
  "/v1/me/checks/:id": "/v1/me/checks/m4-check",
  "/v1/people/:id": "/v1/people/p-sana",
  "/v1/team/members/:id": "/v1/team/members/p-leah",
  "/v1/team/members/:id/checkin-prep": "/v1/team/members/p-leah/checkin-prep?type=weekly",
  "/v1/team/members/:id/assign-options": "/v1/team/members/p-leah/assign-options",
  "/v1/people-ops/onboardings/:id": "/v1/people-ops/onboardings/p-leah",
  "/v1/people-ops/probation-reviews/:id": "/v1/people-ops/probation-reviews/pr-sofia",
  "/v1/people-ops/templates/:id": "/v1/people-ops/templates/tpl-eng-ic",
  "/v1/people-ops/templates/:id/versions/:version":
    "/v1/people-ops/templates/tpl-eng-ic/versions/4",
  "/v1/people-ops/people/:id/onboarding": "/v1/people-ops/people/p-leah/onboarding",
  "/v1/people-ops/people/:id/details": "/v1/people-ops/people/p-leah/details",
};

describe("mock layer", () => {
  it("registers each endpoint once", () => {
    const keys = mockEndpoints.map((endpoint) => endpoint.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // Each handler parses its fixture with the shared schema, so a fixture that drifts from the
  // contract turns into a 500 here instead of a screen that renders impossible data.
  const reads = [
    ...mockEndpoints,
    ...peopleOpsFixtures,
    ...managerFixtures,
    ...employeeFixtures,
    ...learnerFixtures,
  ]
    .map((endpoint) => endpoint.key)
    .filter((key) => key.startsWith("GET "));
  it.each(reads)("%s answers with data its schema accepts", async (key) => {
    const pattern = key.replace(/^GET /, "");
    const path = EXAMPLE[pattern] ?? pattern;
    expect(path, `add an example id for ${pattern}`).not.toContain(":");
    const response = await fetch(new URL(buildApiUrl(path), window.location.origin));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-ContextOS-Mock")).toBe("1");
  });

  it("validates write bodies like the API: 400 with the error envelope, 201 when valid", async () => {
    const post = (body: unknown) =>
      fetch(new URL(buildApiUrl("/v1/contributions"), window.location.origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const draft = {
      kind: "article",
      title: "Roll back a deploy",
      section: "process",
      visibility: "workspace",
      body: "",
      sourceIds: [],
      gapId: null,
    };

    const invalid = await post({ ...draft, submit: true });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    const saved = await post({ ...draft, submit: false });
    expect(saved.status).toBe(201);
    expect(await saved.json()).toMatchObject({ status: "draft", title: "Roll back a deploy" });
  });
});
