import { useState } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfidenceBadge, StateBadge, VerificationBadge } from "@/features/hub/components/badges";
import { SourceStatusBadge } from "@/features/sources/components/source-status-badge";

/**
 * Component gallery (development builds only, see app/router.tsx).
 * Every primitive, every variant, both themes. Check here before building anything:
 * if it exists, import it; if it almost exists, add a variant; only then build new.
 */

const BUTTON_VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;
const BUTTON_SIZES = ["xs", "sm", "default"] as const;
const BADGE_VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;

/* Semantic color roles, as pairs of container + on-container utilities. */
const COLOR_ROLES: Array<{ name: string; bg: string; fg: string }> = [
  { name: "primary", bg: "bg-primary", fg: "text-primary-foreground" },
  { name: "primary-container", bg: "bg-primary-container", fg: "text-on-primary-container" },
  { name: "secondary (tonal)", bg: "bg-secondary", fg: "text-secondary-foreground" },
  { name: "ai", bg: "bg-ai", fg: "text-on-ai" },
  { name: "ai-container", bg: "bg-ai-container", fg: "text-on-ai-container" },
  { name: "success", bg: "bg-success", fg: "text-on-success" },
  { name: "success-container", bg: "bg-success-container", fg: "text-on-success-container" },
  { name: "warning", bg: "bg-warning", fg: "text-on-warning" },
  { name: "warning-container", bg: "bg-warning-container", fg: "text-on-warning-container" },
  { name: "error", bg: "bg-error", fg: "text-on-error" },
  { name: "error-container", bg: "bg-error-container", fg: "text-on-error-container" },
  { name: "info-container", bg: "bg-info-container", fg: "text-on-info-container" },
  { name: "surface", bg: "bg-surface", fg: "text-on-surface" },
  { name: "surface-container-lowest", bg: "bg-surface-container-lowest", fg: "text-on-surface" },
  { name: "surface-container-low", bg: "bg-surface-container-low", fg: "text-on-surface" },
  { name: "surface-container", bg: "bg-surface-container", fg: "text-on-surface" },
  { name: "surface-container-high", bg: "bg-surface-container-high", fg: "text-on-surface" },
  { name: "surface-container-highest", bg: "bg-surface-container-highest", fg: "text-on-surface" },
  { name: "inverse-surface", bg: "bg-inverse-surface", fg: "text-inverse-on-surface" },
];

const RADII = ["rounded-xs", "rounded-sm", "rounded-md", "rounded-lg", "rounded-xl", "rounded-2xl", "rounded-3xl", "rounded-4xl", "rounded-full"];
const ELEVATIONS = ["shadow-elevation-1", "shadow-elevation-2", "shadow-elevation-3", "shadow-elevation-4"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function UiGalleryPage() {
  const [selectValue, setSelectValue] = useState<string | null>("decision");

  return (
    <div className="min-h-svh bg-shell">
      <header className="sticky top-0 z-10 border-b bg-pane/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="font-heading text-lg font-semibold">UI gallery</h1>
            <p className="text-xs text-muted-foreground">
              Development only. Primitives from <code>components/ui</code>, tokens from{" "}
              <code>@contextos/design-tokens</code>.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-12 px-4 py-8">
        <Section title="Color roles">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {COLOR_ROLES.map((role) => (
              <div
                key={role.name}
                className={`${role.bg} ${role.fg} flex h-16 items-end rounded-lg border border-outline-variant/40 px-3 py-2 text-xs font-medium`}
              >
                {role.name}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type">
          <div className="space-y-2 rounded-xl bg-card p-6">
            <p className="font-heading text-5xl">Display: How Tessellate makes money</p>
            <p className="font-heading text-3xl">Headline: Project Kestrel</p>
            <p className="text-xl">Title: Choose your workspace</p>
            <p className="text-base">Body: Each project reconstructs how a piece of work got here, why, and what is true now.</p>
            <p className="text-sm text-muted-foreground">Body small: Updated today · 6 sources</p>
            <p className="font-mono text-sm">Code: src_01HZX8 · pk_test_…</p>
          </div>
        </Section>

        <Section title="Shape and elevation">
          <Row label="Corners">
            {RADII.map((r) => (
              <div key={r} className={`${r} flex size-14 items-center justify-center bg-primary-container text-[10px] text-on-primary-container`}>
                {r.replace("rounded-", "")}
              </div>
            ))}
          </Row>
          <Row label="Elevation">
            {ELEVATIONS.map((e) => (
              <div key={e} className={`${e} flex h-14 w-24 items-center justify-center rounded-lg bg-pane text-[10px]`}>
                {e.replace("shadow-elevation-", "level ")}
              </div>
            ))}
          </Row>
        </Section>

        <Section title="Buttons">
          {BUTTON_SIZES.map((size) => (
            <Row key={size} label={`size: ${size}`}>
              {BUTTON_VARIANTS.map((variant) => (
                <Button key={variant} variant={variant} size={size}>
                  {variant}
                </Button>
              ))}
              <Button size={size} disabled>
                disabled
              </Button>
              <Button size={size}>
                <Spinner /> busy
              </Button>
            </Row>
          ))}
        </Section>

        <Section title="Badges and status">
          <Row label="Badge">
            {BADGE_VARIANTS.map((variant) => (
              <Badge key={variant} variant={variant}>
                {variant}
              </Badge>
            ))}
          </Row>
          <Row label="Verification">
            {(["inferred", "confirmed", "stale", "disputed", "superseded"] as const).map((v) => (
              <VerificationBadge key={v} verification={v} />
            ))}
          </Row>
          <Row label="Confidence">
            {(["high", "medium", "low"] as const).map((c) => (
              <ConfidenceBadge key={c} confidence={c} />
            ))}
          </Row>
          <Row label="State">
            {(["active", "blocked", "done", "planned", "risk", "open_question"] as const).map((s) => (
              <StateBadge key={s} state={s} />
            ))}
          </Row>
          <Row label="Source">
            {(["pending", "processing", "ready", "failed"] as const).map((s) => (
              <SourceStatusBadge key={s} status={s} />
            ))}
          </Row>
        </Section>

        <Section title="Inputs">
          <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="g-name">Project name</Label>
              <Input id="g-name" placeholder="Billing migration" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="g-kind">Kind</Label>
              <Select value={selectValue} onValueChange={setSelectValue}>
                <SelectTrigger id="g-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="decision">Decision</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="status_claim">Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="g-desc">Description</Label>
              <Textarea id="g-desc" placeholder="What this project is about" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="g-invalid">Invalid</Label>
              <Input id="g-invalid" aria-invalid defaultValue="not an email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="g-disabled">Disabled</Label>
              <Input id="g-disabled" disabled defaultValue="read only" />
            </div>
          </div>
        </Section>

        <Section title="Cards, tabs, feedback">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Card title</CardTitle>
                <CardDescription>Cards sit on the pane with a 20px corner.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="overview">
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="decisions">Decisions</TabsTrigger>
                    <TabsTrigger value="people">People</TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="pt-3 text-sm text-muted-foreground">
                    Overview content.
                  </TabsContent>
                  <TabsContent value="decisions" className="pt-3 text-sm text-muted-foreground">
                    Decisions content.
                  </TabsContent>
                  <TabsContent value="people" className="pt-3 text-sm text-muted-foreground">
                    People content.
                  </TabsContent>
                </Tabs>
              </CardContent>
              <CardFooter className="gap-2">
                <Button size="sm">Primary</Button>
                <Button size="sm" variant="outline">
                  Secondary
                </Button>
              </CardFooter>
            </Card>
            <div className="space-y-4">
              <Alert>
                <AlertTitle>Jira sync is failing</AlertTitle>
                <AlertDescription>Three projects returned 403. Reconnect to continue.</AlertDescription>
              </Alert>
              <Alert variant="destructive">
                <AlertTitle>Could not get an answer</AlertTitle>
                <AlertDescription>Your question is kept. Retry when ready.</AlertDescription>
              </Alert>
              <div className="flex items-center gap-3">
                <Spinner />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="size-8 rounded-full" />
              </div>
              <Separator />
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>Not enough source evidence yet</EmptyTitle>
                  <EmptyDescription>Add a document or thread to populate this section.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          </div>
        </Section>

        <Section title="Overlays">
          <Row label="Overlays">
            <Dialog>
              <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm this decision</DialogTitle>
                  <DialogDescription>Dialogs use the 28px corner and trap focus.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost">Cancel</Button>
                  <Button>Confirm</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Sheet>
              <SheetTrigger render={<Button variant="outline" />}>Open sheet</SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Source</SheetTitle>
                  <SheetDescription>Side sheets hold evidence and the assistant below 1200px.</SheetDescription>
                </SheetHeader>
              </SheetContent>
            </Sheet>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" />}>Hover me</TooltipTrigger>
              <TooltipContent>Plain tooltip, 450ms delay in the prototype</TooltipContent>
            </Tooltip>
            <Button variant="secondary" onClick={() => toast.success("Reminder sent")}>
              Show toast
            </Button>
          </Row>
        </Section>
      </main>
    </div>
  );
}
