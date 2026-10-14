import {
  AlertTriangleIcon,
  ArrowUpRightIcon,
  CableIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  HelpCircleIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import * as Icons from "@/components/ui/icons";
import { ConnectedButton, ConnectedButtonGroup } from "@/components/ui/connected-button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Fab } from "@/components/ui/fab";
import { KpiTile, MiniTile } from "@/components/ui/kpi-tile";
import { LogoStack, LogoTile } from "@/components/ui/logo-tile";
import { OptionList, OptionTile } from "@/components/ui/option-tile";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import {
  SegmentedItem,
  SegmentedItemBody,
  SegmentedItemLead,
  SegmentedItemMeta,
  SegmentedItemTitle,
  SegmentedItemTrail,
  SegmentedList,
} from "@/components/ui/segmented-list";
import { StatusChip } from "@/components/ui/status-chip";
import { Stepper, StepperItem } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const BUTTON_VARIANTS = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "elevated",
  "ai",
  "ai-tonal",
  "destructive",
  "link",
] as const;
const BUTTON_SIZES = ["xs", "sm", "default", "md"] as const;
const STATUS_TONES = ["success", "warning", "error", "info", "ai", "neutral"] as const;
const STATUS_ICONS = {
  success: <CheckIcon />,
  warning: <AlertTriangleIcon />,
  error: <XCircleIcon />,
  info: <InfoIcon />,
  ai: <SparklesIcon />,
  neutral: <ClockIcon />,
} as const;
const AVATAR_TONES = ["primary", "ai", "secondary", "warning", "success", "neutral"] as const;
const PEOPLE = [
  { id: "maya", initials: "MO", name: "Maya Okafor", role: "Product Engineer", progress: 22 },
  { id: "daniel", initials: "DR", name: "Daniel Reyes", role: "Engineering Manager", progress: 100 },
  { id: "sana", initials: "SI", name: "Sana Iqbal", role: "Staff Engineer", progress: 64 },
];

/** Placeholder brand mark for the logo tile demo. Real tiles take the connector's SVG. */
function DemoLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" className="fill-primary" />
      <circle cx="12" cy="12" r="4" className="fill-ai-container" />
    </svg>
  );
}
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
  const [filter, setFilter] = useState("all");
  const [notify, setNotify] = useState(true);

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

        <Section title="Icons (Material Symbols Rounded)">
          <div className="flex flex-wrap gap-2">
            {Object.entries(Icons).map(([name, Icon]) => (
              <span
                key={name}
                title={name}
                className="flex h-12 w-24 flex-col items-center justify-center gap-1 rounded-md bg-card text-[10px] text-on-surface-variant [&_svg]:size-6 [&_svg]:text-on-surface"
              >
                <Icon />
                {name.replace(/Icon$/, "")}
              </span>
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
          <Row label="icons">
            <Button size="icon-xs" variant="ghost" aria-label="More">
              <MoreHorizontalIcon />
            </Button>
            <Button size="icon-sm" variant="outline" aria-label="Add">
              <PlusIcon />
            </Button>
            <Button size="icon" variant="secondary" aria-label="Refresh">
              <RefreshCwIcon />
            </Button>
            <Button size="icon-lg" variant="ai-tonal" aria-label="Ask">
              <SparklesIcon />
            </Button>
            <Button size="lg">Start</Button>
          </Row>
          <Row label="FAB">
            <Fab aria-label="Ask Context Bot">
              <SparklesIcon />
            </Fab>
            <Fab floating>
              <SparklesIcon /> Ask Context Bot
            </Fab>
            <Fab variant="primary">
              <PlusIcon /> New project
            </Fab>
          </Row>
          <Row label="Connected">
            <ConnectedButtonGroup>
              {(["all", "overdue", "blocked"] as const).map((value) => (
                <ConnectedButton key={value} pressed={filter === value} onClick={() => setFilter(value)}>
                  {value}
                </ConnectedButton>
              ))}
            </ConnectedButtonGroup>
            <ConnectedButtonGroup size="sm">
              <ConnectedButton pressed>Week</ConnectedButton>
              <ConnectedButton>Month</ConnectedButton>
            </ConnectedButtonGroup>
          </Row>
        </Section>

        <Section title="Chips and status">
          <Row label="Assist">
            <Chip>
              <FileTextIcon /> View roadmap
            </Chip>
            <Chip>Open source</Chip>
          </Row>
          <Row label="Filter">
            <Chip variant="filter" selected>
              <CheckIcon /> Platform
            </Chip>
            <Chip variant="filter">Billing</Chip>
            <Chip variant="filter">People Ops</Chip>
          </Row>
          <Row label="Suggestion">
            <Chip variant="suggestion">Who owns the ingest gateway?</Chip>
            <Chip variant="ai">
              <SparklesIcon /> Ask about this lesson
            </Chip>
          </Row>
          <Row label="Prompt">
            <Chip variant="prompt" className="max-w-xs">
              <SparklesIcon /> Why is billing moving to events, and what breaks if we roll it back?
            </Chip>
          </Row>
          <Row label="Status">
            {STATUS_TONES.map((tone) => (
              <StatusChip key={tone} tone={tone} icon={STATUS_ICONS[tone]}>
                {tone}
              </StatusChip>
            ))}
          </Row>
        </Section>

        <Section title="Avatars and switch">
          <Row label="Sizes">
            {(["xs", "sm", "default", "md", "lg", "xl"] as const).map((size) => (
              <Avatar key={size} size={size}>
                <AvatarFallback>MO</AvatarFallback>
              </Avatar>
            ))}
          </Row>
          <Row label="Tones">
            {AVATAR_TONES.map((tone) => (
              <Avatar key={tone} tone={tone}>
                <AvatarFallback>{tone.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
            ))}
            <Avatar shape="squircle" tone="ai" size="md">
              <AvatarFallback>SQ</AvatarFallback>
            </Avatar>
            <Avatar shape="arch" tone="warning" size="md">
              <AvatarFallback>AR</AvatarFallback>
            </Avatar>
          </Row>
          <Row label="Group">
            <AvatarGroup>
              {PEOPLE.map((p) => (
                <Avatar key={p.id} tone={AVATAR_TONES[PEOPLE.indexOf(p)]}>
                  <AvatarFallback>{p.initials}</AvatarFallback>
                </Avatar>
              ))}
              <AvatarGroupCount>+4</AvatarGroupCount>
            </AvatarGroup>
          </Row>
          <Row label="Switch">
            <Switch checked={notify} onCheckedChange={setNotify} aria-label="Notifications" />
            <Switch defaultChecked size="sm" aria-label="Compact" />
            <Switch disabled aria-label="Disabled" />
          </Row>
        </Section>

        <Section title="Progress">
          <div className="max-w-xl space-y-4">
            <Progress value={22} aria-label="Roadmap">
              <ProgressLabel>Roadmap</ProgressLabel>
              <ProgressValue />
            </Progress>
            <Progress value={64} tone="success" aria-label="Setup" />
            <Progress value={45} tone="warning" flat aria-label="Flat" />
            <Progress value={80} tone="ai" aria-label="Context Bot" />
            <Progress value={null} tone="error" aria-label="Indeterminate" />
          </div>
        </Section>

        <Section title="Stepper and option tiles">
          <div className="max-w-xl rounded-xl bg-card p-4 @container">
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
            </Stepper>
          </div>
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <OptionList>
              <OptionTile
                input={<input type="radio" name="freq" defaultChecked />}
                title="Every hour"
                description="Recommended for active sources"
              />
              <OptionTile input={<input type="radio" name="freq" />} title="Daily" />
              <OptionTile input={<input type="radio" name="freq" disabled />} title="Manual only" />
            </OptionList>
            <OptionList>
              <OptionTile
                input={<input type="checkbox" defaultChecked />}
                title="Engineering shared drive"
                trailing={<StatusChip tone="neutral" icon={<FileTextIcon />}>1,204</StatusChip>}
              />
              <OptionTile
                input={<input type="checkbox" />}
                title="Finance"
                description="Restricted: 3 items need admin consent"
                trailing={<StatusChip tone="warning" icon={<AlertTriangleIcon />}>Restricted</StatusChip>}
              />
            </OptionList>
          </div>
        </Section>

        <Section title="Tiles, banners, logos">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile label="Active hires" value="12" delta={<><ArrowUpRightIcon /> +3 this week</>} deltaTone="good" />
            <KpiTile label="Overdue modules" value="4" delta={<><ArrowUpRightIcon /> +2</>} deltaTone="bad" />
            <KpiTile label="Knowledge gaps" value="7" delta="unchanged" />
            <div className="grid grid-cols-3 gap-2">
              <MiniTile label="Docs" value="1.2k" />
              <MiniTile label={<><AlertTriangleIcon /> Stale</>} value="38" tone="warning" />
              <MiniTile label={<><XCircleIcon /> Failed</>} value="2" tone="error" />
            </div>
          </div>
          <div className="space-y-3">
            <Banner
              tone="error"
              icon={<XCircleIcon />}
              title="Jira sync is failing"
              description="Three projects returned 403 since Oct 12. Answers may be out of date."
              actions={<Button variant="ghost" size="sm">Reconnect</Button>}
            />
            <Banner
              tone="info"
              icon={<RefreshCwIcon />}
              title="First sync in progress"
              description="Indexing 1,204 documents from the Engineering drive."
            />
            <Banner tone="ai" icon={<SparklesIcon />} title="Context Bot drafted this from 4 sources" />
          </div>
          <Row label="Logo tiles">
            <LogoTile size="sm"><DemoLogo /></LogoTile>
            <LogoTile><DemoLogo /></LogoTile>
            <LogoTile size="lg"><DemoLogo /></LogoTile>
            <LogoStack>
              <LogoTile><DemoLogo /></LogoTile>
              <LogoTile><DemoLogo /></LogoTile>
              <LogoTile><DemoLogo /></LogoTile>
            </LogoStack>
          </Row>
        </Section>

        <Section title="Lists, tables, navigation">
          <div className="grid gap-4 lg:grid-cols-2">
            <SegmentedList>
              {PEOPLE.map((p) => (
                <SegmentedItem key={p.id} render={<button type="button" />}>
                  <SegmentedItemLead>
                    <Avatar size="default" tone={AVATAR_TONES[PEOPLE.indexOf(p)]}>
                      <AvatarFallback>{p.initials}</AvatarFallback>
                    </Avatar>
                  </SegmentedItemLead>
                  <SegmentedItemBody>
                    <SegmentedItemTitle>{p.name}</SegmentedItemTitle>
                    <SegmentedItemMeta>
                      <span>{p.role}</span>
                      <span aria-hidden>·</span>
                      <span>Week 2</span>
                    </SegmentedItemMeta>
                  </SegmentedItemBody>
                  <SegmentedItemTrail>
                    <Progress value={p.progress} flat className="w-24" aria-label={`${p.name} progress`} />
                    <ChevronRightIcon className="size-5 text-on-surface-variant" />
                  </SegmentedItemTrail>
                </SegmentedItem>
              ))}
            </SegmentedList>
            <div className="space-y-4">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="#">Knowledge Hub</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink href="#">Projects</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Project Kestrel</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <div className="rounded-xl bg-card p-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Connector</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Health</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="flex items-center gap-2">
                        <LogoTile size="sm"><DemoLogo /></LogoTile> Google Drive
                      </TableCell>
                      <TableCell>1,204</TableCell>
                      <TableCell>
                        <StatusChip tone="success" icon={<CheckIcon />}>Healthy</StatusChip>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button size="icon-xs" variant="ghost" aria-label="Actions" />}>
                            <MoreHorizontalIcon />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Google Drive</DropdownMenuLabel>
                            <DropdownMenuItem>
                              <RefreshCwIcon /> Sync now
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <CableIcon /> Change scope
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive">Disconnect</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="flex items-center gap-2">
                        <LogoTile size="sm"><DemoLogo /></LogoTile> Jira
                      </TableCell>
                      <TableCell>312</TableCell>
                      <TableCell>
                        <StatusChip tone="error" icon={<XCircleIcon />}>Error</StatusChip>
                      </TableCell>
                      <TableCell>
                        <Button size="icon-xs" variant="ghost" aria-label="Help">
                          <HelpCircleIcon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
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
