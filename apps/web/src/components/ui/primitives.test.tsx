import { render, screen } from "@testing-library/react";
import { CheckIcon } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Avatar, AvatarFallback, avatarToneFor } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ConnectedButton, ConnectedButtonGroup } from "@/components/ui/connected-button-group";
import { Fab } from "@/components/ui/fab";
import { KpiTile } from "@/components/ui/kpi-tile";
import { OptionList, OptionTile } from "@/components/ui/option-tile";
import { Progress } from "@/components/ui/progress";
import { StatusChip } from "@/components/ui/status-chip";
import { Stepper, StepperItem } from "@/components/ui/stepper";

describe("Button", () => {
  it("renders every variant and size without a raw palette class", () => {
    const variants = ["default", "secondary", "outline", "ghost", "elevated", "ai", "ai-tonal", "destructive", "link"] as const;
    for (const variant of variants) {
      const { unmount } = render(<Button variant={variant}>{variant}</Button>);
      const button = screen.getByRole("button", { name: variant });
      expect(button.className).not.toMatch(/-(?:emerald|amber|sky|slate|zinc|gray)-\d/);
      unmount();
    }
  });

  it("uses the teal AI tokens only for the ai variants", () => {
    render(<Button variant="ai">Ask</Button>);
    expect(screen.getByRole("button", { name: "Ask" }).className).toContain("bg-ai");
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).className).not.toContain("bg-ai");
  });
});

describe("Chip", () => {
  it("exposes filter selection as aria-pressed", () => {
    render(
      <>
        <Chip variant="filter" selected>
          Platform
        </Chip>
        <Chip variant="filter">Billing</Chip>
        <Chip>Assist</Chip>
      </>,
    );
    expect(screen.getByRole("button", { name: "Platform" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Billing" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Assist" })).not.toHaveAttribute("aria-pressed");
  });
});

describe("StatusChip", () => {
  it("always renders an icon next to the label", () => {
    render(
      <StatusChip tone="success" icon={<CheckIcon data-testid="icon" />}>
        Verified
      </StatusChip>,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("Verified").closest("[data-slot=status-chip]")).toHaveAttribute("data-tone", "success");
  });
});

describe("Stepper", () => {
  it("marks the current step for assistive technology", () => {
    render(
      <Stepper>
        <StepperItem index={1} status="done">
          Authorize
        </StepperItem>
        <StepperItem index={2} status="current">
          Choose content
        </StepperItem>
        <StepperItem index={3} status="upcoming" connector={false}>
          Sync settings
        </StepperItem>
      </Stepper>,
    );
    const items = screen.getAllByRole("listitem").filter((li) => li.dataset.slot === "stepper-item");
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[0]).not.toHaveAttribute("aria-current");
  });
});

describe("Banner", () => {
  it("announces errors as alerts and everything else as status", () => {
    render(
      <>
        <Banner tone="error" title="Jira sync is failing" />
        <Banner tone="info" title="First sync in progress" />
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Jira sync is failing");
    expect(screen.getByRole("status")).toHaveTextContent("First sync in progress");
  });
});

describe("ConnectedButtonGroup", () => {
  it("reflects the pressed segment", () => {
    render(
      <ConnectedButtonGroup>
        <ConnectedButton pressed>All</ConnectedButton>
        <ConnectedButton>Overdue</ConnectedButton>
      </ConnectedButtonGroup>,
    );
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Overdue" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("OptionTile", () => {
  it("keeps the native input so the label toggles it", () => {
    render(
      <OptionList>
        <OptionTile input={<input type="radio" name="freq" value="daily" defaultChecked />} title="Daily" />
        <OptionTile input={<input type="radio" name="freq" value="weekly" />} title="Weekly" />
      </OptionList>,
    );
    expect(screen.getByLabelText("Daily")).toBeChecked();
    expect(screen.getByLabelText("Weekly")).not.toBeChecked();
  });
});

describe("Avatar", () => {
  it("gives the same id the same tone every time", () => {
    expect(avatarToneFor("user_123")).toBe(avatarToneFor("user_123"));
    render(
      <Avatar tone="ai" size="lg">
        <AvatarFallback>MO</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText("MO").closest("[data-slot=avatar]")).toHaveAttribute("data-size", "lg");
  });
});

describe("Progress and KPI", () => {
  it("renders an accessible progressbar and a labelled value", () => {
    render(<Progress value={22} aria-label="Onboarding progress" />);
    expect(screen.getByRole("progressbar", { name: "Onboarding progress" })).toHaveAttribute("aria-valuenow", "22");
    render(<KpiTile label="Active hires" value="12" delta="+3 this week" deltaTone="good" />);
    expect(screen.getByText("Active hires")).toBeInTheDocument();
    expect(screen.getByText("+3 this week")).toHaveAttribute("data-tone", "good");
  });

  it("renders a FAB as a button", () => {
    render(<Fab floating>Ask Context Bot</Fab>);
    expect(screen.getByRole("button", { name: "Ask Context Bot" })).toHaveAttribute("data-slot", "fab");
  });
});
