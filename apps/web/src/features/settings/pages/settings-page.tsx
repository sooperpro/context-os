import type { AssistantPreferencesInput, NotificationPreferences } from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useClerk, useSession, useUser } from "@clerk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ConnectorLogo } from "@/components/connector-logo";
import { PageHeader } from "@/components/layout/page-header";
import { PreviewDataChip } from "@/components/preview-data-chip";
import type { Theme } from "@/components/theme-context";
import { Avatar, AvatarFallback, avatarShapeFor, avatarToneFor } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckIcon,
  ContrastIcon,
  DarkModeIcon,
  DesktopWindowsIcon,
  GroupIcon,
  Inventory2Icon,
  MailIcon,
  PasswordIcon,
  SmartphoneIcon,
  VerifiedUserIcon,
  LightModeIcon,
  LockIcon,
  LoginIcon,
  SettingsIcon,
  WarningIcon,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionList, OptionTile } from "@/components/ui/option-tile";
import { PillTab, PillTabs } from "@/components/ui/pill-tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatusChip } from "@/components/ui/status-chip";
import { Switch } from "@/components/ui/switch";
import { ACCOUNT_ENDPOINTS } from "@/features/account/api/account.api";
import {
  assistantPreferencesQuery,
  connectedAppsQuery,
  meQuery,
  notificationPreferencesQuery,
  useDisconnectApp,
  useRequestDataExport,
  useUpdateAssistantPreferences,
  useUpdateMe,
  useUpdateNotificationPreferences,
} from "@/features/account/api/account.queries";
import { useTheme } from "@/hooks/use-theme";
import { formatRelativeTime, initialsOf } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import { useViewer } from "@/features/workspace/hooks/use-viewer";

/*
 * Personal settings (prototype `#settings`): profile name and time zone, notification channels and
 * quiet hours, theme and reduced motion (this device), Context Bot preferences, sign-in and
 * sessions from the identity provider, connected apps and a copy of your data. The last three and
 * the Context Bot preferences are mocked until the API serves them. Settings only affect the person
 * changing them.
 */

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "notifications", label: "Notifications" },
  { id: "preferences", label: "Preferences" },
  { id: "security", label: "Security" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const TIME_ZONES: string[] =
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export function SettingsPage() {
  useBotContext(
    {
      chips: [{ icon: SettingsIcon, label: "Your settings" }],
      suggestions: ["How is my progress measured?"],
      intro: "I can explain what each setting does.",
    },
    "settings",
  );
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : "profile";
  const me = useQuery(meQuery());
  const viewer = useViewer();

  return (
    <div>
      <PageHeader
        kicker={me.data?.name}
        title="Settings"
        description="Your profile and preferences. These only affect you."
      />
      <PillTabs aria-label="Settings sections" className="mb-6">
        {TABS.map((t) => (
          <PillTab
            key={t.id}
            active={tab === t.id}
            render={<Link to={t.id === "profile" ? "/settings" : `/settings?tab=${t.id}`} />}
          >
            {t.label}
          </PillTab>
        ))}
      </PillTabs>

      <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_20rem] @3xl:items-start">
        <div className="space-y-4">
          {tab === "profile" ? <ProfileTab /> : null}
          {tab === "notifications" ? <NotificationsTab /> : null}
          {tab === "preferences" ? <PreferencesTab /> : null}
          {tab === "security" ? <SecurityTab /> : null}
        </div>
        <aside className="space-y-4">
          {viewer.role === "owner" || viewer.role === "admin" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Workspace settings</CardTitle>
                <CardDescription>
                  Connectors, roles, access and AI settings for everyone are under Admin.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  nativeButton={false}
                  render={<Link to="/members" />}
                >
                  <GroupIcon aria-hidden /> Members & roles
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  nativeButton={false}
                  render={<Link to="/ai" />}
                >
                  AI settings
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link to="/setup" />}
                >
                  Workspace setup
                </Button>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Privacy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-on-surface-variant">
              <p>Your Context Bot conversations are private to you.</p>
              <p>
                Your manager and assigned mentor can see your learning progress, but not your quiz
                scores.
              </p>
              <p>Workspace admins can see your role and status, not your conversations.</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ProfileTab() {
  const me = useQuery(meQuery());
  const update = useUpdateMe();
  const [name, setName] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);

  if (me.isPending) return <Skeleton className="h-80 rounded-card" />;
  if (me.isError) {
    return (
      <Banner
        tone="error"
        icon={<WarningIcon />}
        title="Could not load your profile"
        description={me.error.message}
      />
    );
  }

  const currentName = name ?? me.data.name;
  const currentZone =
    timezone ?? me.data.preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dirty =
    currentName.trim() !== me.data.name ||
    currentZone !== (me.data.preferences.timezone ?? currentZone);
  const nameValid = currentName.trim().length > 0;

  const save = () =>
    update.mutate(
      { name: currentName.trim(), timezone: currentZone },
      {
        onSuccess: () => {
          toast.success("Profile saved");
          setName(null);
          setTimezone(null);
        },
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Shown in People and next to your conversations and contributions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar size="xl" tone={avatarToneFor(me.data.id)} shape={avatarShapeFor(me.data.id)}>
            <AvatarFallback>{initialsOf(currentName) || "?"}</AvatarFallback>
          </Avatar>
          <div className="text-sm text-on-surface-variant">
            <p className="font-medium text-on-surface">{ROLE_LABEL[me.data.role]}</p>
            {me.data.email ? <p>{me.data.email}</p> : null}
          </div>
        </div>
        <div className="grid gap-4 @xl:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="settings-name">Name</Label>
            <Input
              id="settings-name"
              value={currentName}
              aria-invalid={!nameValid}
              onChange={(event) => setName(event.target.value)}
            />
            {!nameValid ? <p className="px-4 text-xs text-error">Enter your name.</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-timezone">Time zone</Label>
            <Select value={currentZone} onValueChange={(value) => setTimezone(value)}>
              <SelectTrigger id="settings-timezone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_ZONES.map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="px-4 text-xs text-on-surface-variant">
              Used for due dates, quiet hours and check-ins.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            disabled={!dirty || update.isPending}
            onClick={() => {
              setName(null);
              setTimezone(null);
            }}
          >
            Cancel
          </Button>
          <Button disabled={!dirty || !nameValid || update.isPending} onClick={save}>
            {update.isPending ? <Spinner /> : <CheckIcon aria-hidden />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationsTab() {
  const preferences = useQuery(notificationPreferencesQuery());
  const update = useUpdateNotificationPreferences();

  if (preferences.isPending) return <Skeleton className="h-64 rounded-card" />;
  if (preferences.isError) {
    return (
      <Banner
        tone="error"
        icon={<WarningIcon />}
        title="Could not load notification settings"
        description={preferences.error.message}
      />
    );
  }

  const value = preferences.data;
  const change = (patch: Partial<NotificationPreferences>) =>
    update.mutate(
      { ...value, ...patch },
      { onSuccess: () => toast.success("Notification settings saved") },
    );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Check-ins, reviews, assignments and knowledge gaps routed to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-0.5">
            <ToggleRow
              id="notify-in-app"
              title="In ContextOS"
              description="The bell in the top bar."
              checked={value.inApp}
              disabled={update.isPending}
              onChange={(inApp) => change({ inApp })}
            />
            <ToggleRow
              id="notify-email"
              title="Email"
              description="Sent to the address you sign in with."
              checked={value.email}
              disabled={update.isPending}
              onChange={(email) => change({ email })}
            />
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Quiet hours</CardTitle>
          <CardDescription>Email waits until quiet hours end, in your time zone.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 @xl:grid-cols-2">
          <HourSelect
            id="quiet-from"
            label="From"
            value={value.quietStartHour}
            disabled={update.isPending}
            onChange={(quietStartHour) => change({ quietStartHour })}
          />
          <HourSelect
            id="quiet-until"
            label="Until"
            value={value.quietEndHour}
            disabled={update.isPending}
            onChange={(quietEndHour) => change({ quietEndHour })}
          />
        </CardContent>
      </Card>
    </>
  );
}

function ToggleRow({
  id,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <li className="flex items-center gap-4 rounded-xs bg-pane px-4 py-3 first:rounded-t-lg last:rounded-b-lg">
      <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-on-surface-variant">{description}</span>
      </label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </li>
  );
}

function HourSelect({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  disabled: boolean;
  onChange: (hour: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={String(value)}
        disabled={disabled}
        onValueChange={(next) => onChange(Number(next))}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((hour) => (
            <SelectItem key={hour} value={String(hour)}>
              {hourLabel(hour)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const THEMES: Array<{ value: Theme; label: string; description: string; icon: React.ReactNode }> = [
  {
    value: "system",
    label: "Match system",
    description: "Follow this device",
    icon: <ContrastIcon />,
  },
  { value: "light", label: "Light", description: "Always light", icon: <LightModeIcon /> },
  { value: "dark", label: "Dark", description: "Always dark", icon: <DarkModeIcon /> },
];

function PreferencesTab() {
  const { theme, setTheme, reducedMotion, setReducedMotion } = useTheme();
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Saved on this device.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-on-surface-variant">Theme</legend>
            <OptionList orientation="horizontal" className="@xl:flex-nowrap">
              {THEMES.map((option) => (
                <OptionTile
                  key={option.value}
                  className="min-w-40 flex-1 rounded-xs first:rounded-l-lg first:rounded-tr-xs last:rounded-r-lg last:rounded-bl-xs [&_svg]:size-5"
                  input={
                    <input
                      type="radio"
                      name="theme"
                      value={option.value}
                      checked={theme === option.value}
                      onChange={() => setTheme(option.value)}
                    />
                  }
                  title={option.label}
                  description={option.description}
                  trailing={option.icon}
                />
              ))}
            </OptionList>
          </fieldset>
          <ul>
            <ToggleRow
              id="reduce-motion"
              title="Reduce motion"
              description="Stops spinning shapes, wavy progress and springy transitions. Your system's setting also does this."
              checked={reducedMotion}
              disabled={false}
              onChange={(reduced) => {
                setReducedMotion(reduced);
                toast.success(
                  reduced ? "Motion reduced on this device" : "Motion restored on this device",
                );
              }}
            />
          </ul>
        </CardContent>
      </Card>
      <AssistantPreferencesCard />
    </>
  );
}

/** Context Bot (prototype Settings): open beside lessons, and suggested questions. */
function AssistantPreferencesCard() {
  const query = useQuery(assistantPreferencesQuery());
  const update = useUpdateAssistantPreferences();
  const change = (input: AssistantPreferencesInput, label: string, on: boolean) =>
    update.mutate(input, {
      onSuccess: () => toast.success(`${on ? "Turned on" : "Turned off"}: ${label}`),
      onError: () => toast.error("The setting could not be saved. Please try again."),
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Context Bot</CardTitle>
      </CardHeader>
      <CardContent>
        {query.data ? (
          <ul>
            <ToggleRow
              id="bot-lessons"
              title="Open beside lessons"
              description="On large screens, Context Bot opens next to the lesson you're reading."
              checked={query.data.openBesideLessons}
              disabled={update.isPending}
              onChange={(on) => change({ openBesideLessons: on }, "Open beside lessons", on)}
            />
            <ToggleRow
              id="bot-suggestions"
              title="Show suggested questions"
              description="Based on the page you're on and your current stage."
              checked={query.data.showSuggestions}
              disabled={update.isPending}
              onChange={(on) => change({ showSuggestions: on }, "Show suggested questions", on)}
            />
          </ul>
        ) : (
          <Skeleton className="h-28 rounded-lg" />
        )}
      </CardContent>
    </Card>
  );
}

function SecurityTab() {
  return (
    <>
      <SignInCard />
      <SessionsCard />
      <ConnectedAppsCard />
      <YourDataCard />
    </>
  );
}

/** How they sign in, from the identity provider. Changes happen in its own window. */
function SignInCard() {
  const clerk = useClerk();
  const { user } = useUser();
  const sso = user?.externalAccounts[0];
  const email = sso?.emailAddress ?? user?.primaryEmailAddress?.emailAddress;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in</CardTitle>
        <CardDescription>Managed by your company's identity provider.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-0.5">
          <li className="flex items-center gap-3 rounded-xs bg-pane px-4 py-3 first:rounded-t-lg last:rounded-b-lg">
            {sso ? (
              <ConnectorLogo provider={sso.provider} size="sm" />
            ) : (
              <span
                aria-hidden
                className="grid size-8 place-items-center rounded-md bg-surface-container-high [&_svg]:size-4"
              >
                <MailIcon />
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">
                {sso ? `${providerLabel(sso.provider)} single sign-on` : "Email sign-in"}
              </span>
              {email ? (
                <span className="truncate text-xs text-on-surface-variant">{email}</span>
              ) : null}
            </span>
            <StatusChip tone="success" icon={<VerifiedUserIcon />}>
              Managed by IT
            </StatusChip>
          </li>
          <li className="flex items-center gap-3 rounded-xs bg-pane px-4 py-3 first:rounded-t-lg last:rounded-b-lg">
            <span
              aria-hidden
              className="grid size-8 place-items-center rounded-md bg-surface-container-high [&_svg]:size-4"
            >
              <PasswordIcon />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">2-step verification</span>
              <span className="text-xs text-on-surface-variant">
                {sso
                  ? `Set up in your ${providerLabel(sso.provider)} account`
                  : "Set up in your account"}
              </span>
            </span>
            {user?.twoFactorEnabled || sso ? (
              <StatusChip tone="success" icon={<CheckIcon />}>
                On
              </StatusChip>
            ) : (
              <StatusChip tone="neutral" icon={<WarningIcon />}>
                Off
              </StatusChip>
            )}
          </li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => clerk.openUserProfile()}>
            <LockIcon aria-hidden /> Manage sign-in and security
          </Button>
          <Button variant="ghost" onClick={() => void clerk.signOut({ redirectUrl: "/" })}>
            <LoginIcon aria-hidden /> Sign out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function providerLabel(provider: string): string {
  const name = provider.replace(/^oauth_/, "");
  return name === "google"
    ? "Google Workspace"
    : name.replace(/^\w/, (letter) => letter.toUpperCase());
}

/** "Where you're signed in" (prototype): the identity provider's sessions, with sign-out per device. */
function SessionsCard() {
  const { user, isLoaded } = useUser();
  const { session: current } = useSession();
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ["identity-sessions", user?.id],
    queryFn: () => user!.getSessions(),
    enabled: Boolean(user),
  });
  const [busy, setBusy] = useState(false);
  const others = (sessions.data ?? []).filter((entry) => entry.id !== current?.id);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["identity-sessions", user?.id] });

  const revoke = async (targets: typeof others, message: string) => {
    setBusy(true);
    try {
      await Promise.all(targets.map((entry) => entry.revoke()));
      toast.success(message);
    } catch {
      toast.error("Could not sign out. Please try again.");
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Where you're signed in</CardTitle>
        {others.length ? (
          <Button
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => void revoke(others, "Signed out everywhere else")}
          >
            Sign out everywhere else
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {!user ? (
          isLoaded === false ? (
            <Skeleton className="h-28 rounded-lg" />
          ) : (
            <p className="text-sm text-on-surface-variant">
              Sign in to see the devices you're signed in on.
            </p>
          )
        ) : sessions.isPending ? (
          <Skeleton className="h-28 rounded-lg" />
        ) : sessions.isError ? (
          <p className="text-sm text-on-surface-variant">Your sessions could not be loaded.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {(sessions.data ?? []).map((entry) => {
              const activity = entry.latestActivity;
              const device = [
                activity.deviceType ?? (activity.isMobile ? "Phone" : "Computer"),
                activity.browserName,
              ]
                .filter(Boolean)
                .join(" · ");
              const where = [activity.city, activity.country].filter(Boolean).join(", ");
              const isCurrent = entry.id === current?.id;
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 rounded-xs bg-pane px-4 py-3 first:rounded-t-lg last:rounded-b-lg"
                >
                  <span
                    aria-hidden
                    className="grid size-8 place-items-center rounded-md bg-surface-container-high [&_svg]:size-4"
                  >
                    {activity.isMobile ? <SmartphoneIcon /> : <DesktopWindowsIcon />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium">{device}</span>
                    <span className="text-xs text-on-surface-variant">
                      {[where, isCurrent ? "This device" : formatRelativeTime(entry.lastActiveAt)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {isCurrent ? (
                    <StatusChip tone="info" icon={<CheckIcon />}>
                      This device
                    </StatusChip>
                  ) : (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void revoke([entry], "Signed out of that device")}
                    >
                      Sign out
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ConnectedAppsCard() {
  const query = useQuery(connectedAppsQuery());
  const disconnect = useDisconnectApp();
  const items = query.data?.items ?? [];
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2">
        <CardTitle>Connected apps</CardTitle>
        <PreviewDataChip endpoint={ACCOUNT_ENDPOINTS.connectedApps.path} />
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : items.length ? (
          <ul className="flex flex-col gap-0.5">
            {items.map((app) => (
              <li
                key={app.id}
                className="flex items-center gap-3 rounded-xs bg-pane px-4 py-3 first:rounded-t-lg last:rounded-b-lg"
              >
                <ConnectorLogo provider={app.provider} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{app.name}</span>
                  <span className="text-xs text-on-surface-variant">{app.description}</span>
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={disconnect.isPending}
                  onClick={() =>
                    disconnect.mutate(app.id, {
                      onSuccess: () => toast.success(`${app.name} disconnected`),
                      onError: () => toast.error("Could not disconnect. Please try again."),
                    })
                  }
                >
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-on-surface-variant">No connected apps.</p>
        )}
      </CardContent>
    </Card>
  );
}

function YourDataCard() {
  const exportData = useRequestDataExport();
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2">
        <CardTitle>Your data</CardTitle>
        <PreviewDataChip endpoint={ACCOUNT_ENDPOINTS.dataExport.path} />
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <p className="text-sm">
          Get a copy of your profile, contributions, check-in notes shared with you, and Context Bot
          history.
        </p>
        <Button
          size="xs"
          variant="secondary"
          disabled={exportData.isPending || exportData.isSuccess}
          onClick={() =>
            exportData.mutate(undefined, {
              onSuccess: (result) =>
                toast.success(`We'll email a download link to ${result.email} within 24 hours`),
              onError: () => toast.error("The request could not be sent. Please try again."),
            })
          }
        >
          <Inventory2Icon aria-hidden />{" "}
          {exportData.isSuccess ? "Copy requested" : "Request a copy"}
        </Button>
      </CardContent>
    </Card>
  );
}
