import type { SsoProvider } from "@contextos/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { SsoCard } from "@/features/admin/components/sso-card";
import { buildApiUrl } from "@/lib/api-client";
import { mockServer, setupMockApi } from "@/test/msw";
import { renderWithProviders } from "@/test/utils";

setupMockApi();

const provider = (domain: string, type: "oidc" | "saml", domainVerified: boolean): SsoProvider => ({
  providerId: `sso-${domain}`,
  type,
  domain,
  issuer: type === "oidc" ? `https://login.${domain}` : `https://idp.${domain}/saml`,
  domainVerified,
  verification: { name: `_contextos-verify.${domain}`, value: `contextos-verify=${domain}-token` },
  serviceProvider:
    type === "oidc"
      ? {
          callbackUrl: `https://app.test/api/auth/sso/callback/sso-${domain}`,
          entityId: null,
          metadataUrl: null,
        }
      : {
          callbackUrl: `https://app.test/api/auth/sso/saml2/sp/acs/sso-${domain}`,
          entityId: `https://app.test/sso-${domain}`,
          metadataUrl: `https://app.test/api/auth/sso/saml2/sp/metadata?providerId=sso-${domain}`,
        },
});

/** The live SSO contract: one verified OIDC connection and one SAML connection awaiting DNS. */
function liveSso() {
  let providers = [
    provider("tessellate.io", "oidc", true),
    provider("tessellate.dev", "saml", false),
  ];
  const addBodies: unknown[] = [];
  mockServer.use(
    http.get(buildApiUrl("/v1/admin/sso"), () =>
      HttpResponse.json({ available: true, enforced: false, providers }),
    ),
    http.post(buildApiUrl("/v1/admin/sso/providers/:id/verify"), () =>
      HttpResponse.json(
        {
          error: {
            code: "CONFLICT",
            message:
              "No matching TXT record at _contextos-verify.tessellate.dev yet. DNS changes can take a while to appear.",
          },
        },
        { status: 409 },
      ),
    ),
    http.post(buildApiUrl("/v1/admin/sso/providers"), async ({ request }) => {
      const body = (await request.json()) as { domain: string };
      addBodies.push(body);
      const added = provider(body.domain, "oidc", false);
      providers = [...providers, added];
      return HttpResponse.json(added, { status: 201 });
    }),
  );
  return { addBodies };
}

describe("SsoCard", () => {
  it("lists verified and unverified connections with what to enter in the identity provider", async () => {
    liveSso();
    renderWithProviders(<SsoCard />);

    const card = await screen.findByRole("region", { name: /Single sign-on/ });
    const [verified, pending] = await within(card).findAllByRole("listitem");
    expect(within(verified!).getByText("tessellate.io")).toBeInTheDocument();
    expect(within(verified!).getByText("OIDC")).toBeInTheDocument();
    expect(within(verified!).getByText("Verified")).toBeInTheDocument();
    expect(within(verified!).getByText("Redirect URI")).toBeInTheDocument();
    expect(within(verified!).queryByRole("button", { name: "Verify domain" })).toBeNull();

    expect(within(pending!).getByText("SAML 2.0")).toBeInTheDocument();
    expect(within(pending!).getByText("Unverified")).toBeInTheDocument();
    expect(within(pending!).getByText("_contextos-verify.tessellate.dev")).toBeInTheDocument();
    expect(within(pending!).getByText("ACS URL")).toBeInTheDocument();
    expect(within(pending!).getByText("SP entity ID")).toBeInTheDocument();
    expect(within(pending!).getByText("Metadata URL")).toBeInTheDocument();

    // A verified connection makes enforcement available.
    expect(
      within(card).getByRole("switch", { name: /Require SSO for everyone/ }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("shows why a domain could not be verified yet", async () => {
    liveSso();
    const user = userEvent.setup();
    renderWithProviders(<SsoCard />);

    await user.click(await screen.findByRole("button", { name: "Verify domain" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /No matching TXT record at _contextos-verify\.tessellate\.dev yet/,
    );
  });

  it("adds an OIDC connection with exactly the fields the API takes", async () => {
    const sso = liveSso();
    const user = userEvent.setup();
    renderWithProviders(<SsoCard />);

    await user.click(await screen.findByRole("button", { name: /Add SSO connection/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Email domain"), "Acme.com");
    await user.type(within(dialog).getByLabelText("Issuer URL"), "https://login.acme.com");
    await user.type(within(dialog).getByLabelText("Client ID"), "contextos");
    await user.type(within(dialog).getByLabelText("Client secret"), "s3cret");
    await user.click(within(dialog).getByRole("button", { name: "Add connection" }));

    expect(await screen.findByText("acme.com")).toBeInTheDocument();
    expect(sso.addBodies).toEqual([
      {
        type: "oidc",
        domain: "acme.com",
        issuer: "https://login.acme.com",
        clientId: "contextos",
        clientSecret: "s3cret",
      },
    ]);
  });

  it("explains that SSO needs real sign-in in development mode", async () => {
    mockServer.use(
      http.get(buildApiUrl("/v1/admin/sso"), () =>
        HttpResponse.json({ available: false, enforced: false, providers: [] }),
      ),
    );
    renderWithProviders(<SsoCard />);

    expect(await screen.findByText(/AUTH_MODE=accounts/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add SSO connection/ })).toBeDisabled();
    expect(screen.getByRole("switch", { name: /Require SSO for everyone/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
