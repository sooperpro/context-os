import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { SignUpForm } from "@/features/auth/components/sign-up-form";

/* Clerk's signal hooks, faked: each method resolves like Clerk's ({ error }), and the tests read the calls. */
const clerk = vi.hoisted(() => {
  const ok = () => Promise.resolve({ error: null });
  const noErrors = () => ({ fields: {}, global: null, raw: null });
  return {
    ok,
    noErrors,
    signIn: {
      status: "needs_first_factor",
      sso: vi.fn(ok),
      emailCode: { sendCode: vi.fn(ok), verifyCode: vi.fn(ok) },
      finalize: vi.fn(ok),
    },
    signUp: {
      status: "missing_requirements",
      sso: vi.fn(ok),
      password: vi.fn(ok),
      verifications: { sendEmailCode: vi.fn(ok), verifyEmailCode: vi.fn(ok) },
      finalize: vi.fn(ok),
    },
    signInErrors: noErrors(),
  };
});

vi.mock("@clerk/react", () => ({
  useSignIn: () => ({ signIn: clerk.signIn, errors: clerk.signInErrors, fetchStatus: "idle" }),
  useSignUp: () => ({ signUp: clerk.signUp, errors: clerk.noErrors(), fetchStatus: "idle" }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  clerk.signIn.status = "needs_first_factor";
  clerk.signUp.status = "missing_requirements";
  clerk.signInErrors = clerk.noErrors();
});

describe("SignInForm", () => {
  it("signs in with a code sent to the work email, then sets the session", async () => {
    const user = userEvent.setup();
    clerk.signIn.emailCode.verifyCode.mockImplementation(() => {
      clerk.signIn.status = "complete";
      return clerk.ok();
    });
    render(<SignInForm onCreateAccount={vi.fn()} />);

    expect(screen.getByRole("heading", { level: 2, name: "Sign in" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Work email" }), "maya@tessellate.io");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(clerk.signIn.emailCode.sendCode).toHaveBeenCalledWith({
      emailAddress: "maya@tessellate.io",
    });

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByText("maya@tessellate.io")).toBeInTheDocument();
    const signIn = screen.getByRole("button", { name: "Sign in" });
    expect(signIn).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Code" }), "12a3456");
    await user.click(signIn);
    expect(clerk.signIn.emailCode.verifyCode).toHaveBeenCalledWith({ code: "123456" });
    await waitFor(() => expect(clerk.signIn.finalize).toHaveBeenCalled());
  });

  it("checks the email before asking Clerk", async () => {
    const user = userEvent.setup();
    render(<SignInForm onCreateAccount={vi.fn()} />);
    await user.type(screen.getByRole("textbox", { name: "Work email" }), "maya");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("textbox", { name: "Work email" })).toHaveAccessibleDescription(
      "Enter your work email.",
    );
    expect(clerk.signIn.emailCode.sendCode).not.toHaveBeenCalled();
  });

  it("offers to create an account when no account has that email", async () => {
    const user = userEvent.setup();
    const onCreateAccount = vi.fn();
    clerk.signInErrors = {
      ...clerk.noErrors(),
      fields: { identifier: { code: "form_identifier_not_found", message: "Not found" } },
    };
    render(<SignInForm onCreateAccount={onCreateAccount} />);
    await user.type(screen.getByRole("textbox", { name: "Work email" }), "new@tessellate.io");
    expect(screen.getByText("There's no account with this email yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create an account with this email" }));
    expect(onCreateAccount).toHaveBeenCalledWith("new@tessellate.io");
  });

  it("hands Google sign-in to Clerk and waits for the return", async () => {
    const user = userEvent.setup();
    clerk.signIn.sso.mockImplementation(() => new Promise(() => undefined));
    render(<SignInForm onCreateAccount={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(clerk.signIn.sso).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: "oauth_google", redirectCallbackUrl: "/sso-callback" }),
    );
    expect(await screen.findByText("Signing you in with Google…")).toBeInTheDocument();
  });
});

describe("SignUpForm", () => {
  it("creates the account with a password, confirms the email and sets the session", async () => {
    const user = userEvent.setup();
    clerk.signUp.verifications.verifyEmailCode.mockImplementation(() => {
      clerk.signUp.status = "complete";
      return clerk.ok();
    });
    render(<SignUpForm initialEmail="maya@tessellate.io" onSignIn={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: "Work email" })).toHaveValue("maya@tessellate.io");
    await user.type(screen.getByRole("textbox", { name: "First name" }), "Maya");
    await user.type(screen.getByRole("textbox", { name: "Last name" }), "Okafor");
    await user.type(screen.getByLabelText("Password"), "a long passphrase here");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(clerk.signUp.password).toHaveBeenCalledWith({
      emailAddress: "maya@tessellate.io",
      password: "a long passphrase here",
      firstName: "Maya",
      lastName: "Okafor",
    });
    await waitFor(() => expect(clerk.signUp.verifications.sendEmailCode).toHaveBeenCalled());
    expect(await screen.findByRole("heading", { name: "Confirm your email" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Code" }), "654321");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(clerk.signUp.verifications.verifyEmailCode).toHaveBeenCalledWith({ code: "654321" });
    await waitFor(() => expect(clerk.signUp.finalize).toHaveBeenCalled());
  });

  it("asks for a longer password before asking Clerk", async () => {
    const user = userEvent.setup();
    render(<SignUpForm initialEmail="maya@tessellate.io" onSignIn={vi.fn()} />);
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(
      "Use at least 15 characters.",
    );
    expect(clerk.signUp.password).not.toHaveBeenCalled();
  });
});
