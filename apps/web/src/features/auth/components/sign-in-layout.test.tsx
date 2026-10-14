import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignInLayout } from "@/features/auth/components/sign-in-layout";

describe("SignInLayout", () => {
  it("frames its content with the brand pitch, a titled card and the sign-on note, outside any router", () => {
    // The auth gate mounts this before the router exists, so no router is provided here on purpose.
    render(
      <SignInLayout title="Sign in" description="Use your work account.">
        <button type="button">Continue with Google Workspace</button>
      </SignInLayout>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Everything you need to know");
    expect(screen.getByRole("heading", { level: 2, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("Use your work account.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google Workspace" })).toBeInTheDocument();
    expect(screen.getByText(/single sign-on/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ContextOS home" })).toBeInTheDocument();
  });
});
