import {
  PROFILE_LIMITS,
  type AssistantPreferencesInput,
  type NotificationPreferences,
} from "@contextos/shared";
import { useBotContext } from "@/components/layout/bot-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ConnectorLogo } from "@/components/connector-logo";
import { PageHeader } from "@/components/layout/page-header";
import { PreviewDataChip } from "@/components/preview-data-chip";
import type { Theme } from "@/components/theme-context";
import {
  AVATAR_SHAPES,
  Avatar,
  AvatarFallback,
  avatarShapeFor,
  avatarToneFor,
  type AvatarShape,
} from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import {
  AddIcon,
  CheckIcon,
  CloseIcon,
  ContrastIcon,
  DarkModeIcon,
  DesktopWindowsIcon,
  GroupIcon,
  Inventory2Icon,
  KeyIcon,
  MailIcon,
  PasswordIcon,
  SmartphoneIcon,
  VerifiedUserIcon,
  LightModeIcon,
  LogoutIcon,
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
import { Textarea } from "@/components/ui/textarea";
import { ACCOUNT_ENDPOINTS } from "@/features/account/api/account.api";
import { signOut, signOutDevice, signOutOtherDevices } from "@/features/auth/api/auth.api";
import { authKeys, devicesQuery, sessionQuery } from "@/features/auth/api/auth.queries";
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
import { teamsQuery } from "@/features/members/api/members.queries";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { PasswordCard } from "@/features/settings/components/password-card";
import { skillSuggestionsQuery } from "@/features/people/api/people.queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

/*
 * Personal settings (prototype `#settings`): profile name and time zone, notification channels and
 * quiet hours, theme and reduced motion (this device), Context Bot preferences, sign-in and
 * sessions from the identity provider, connected apps and a copy of your data. All of them are
 * served by the API. Settings only affect the person changing them.
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
              <p>
                Your Context Bot conversations are private to you and the workspace owners. Each
                time an owner reads them, it&rsquo;s written to the audit log.
              </p>
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

interface ProfileDraft {
  name: string;
  timezone: string;
  pronouns: string;
  location: string;
  bio: string;
  skills: string[];
  avatarShape: AvatarShape | null;
}

const shapeLabel = (shape: AvatarShape) =>
  shape.replace(
    /^(\D+)(\d*)$/,
    (_, word: string, count: string) =>
      `${word.charAt(0).toUpperCase()}${word.slice(1)}${count ? ` ${count}` : ""}`,
  );

const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(typeof a === "string" ? a.trim() : a) ===
  JSON.stringify(typeof b === "string" ? b.trim() : b);

/** Role access spec §4.9: pronouns, location, bio, skills and avatar shape are yours to edit. */
function ProfileTab() {
  const me = useQuery(meQuery());
  const update = useUpdateMe();
  const [draft, setDraft] = useState<Partial<ProfileDraft>>({});
  const [newSkill, setNewSkill] = useState("");
  // ESCO ids of skills picked from the suggestions since the last save (N-10).
  const [skillIds, setSkillIds] = useState<Record<string, string>>({});
  const skillListId = useId();
  const skillText = useDebouncedValue(newSkill.trim(), 250);
  const suggestions = useQuery(skillSuggestionsQuery(skillText));
  const organization = me.data?.organization ?? {};
  const jobTitle = typeof organization.jobTitle === "string" ? organization.jobTitle : null;
  const teamId = typeof organization.teamId === "string" ? organization.teamId : null;
  const teams = useQuery({ ...teamsQuery(), enabled: teamId !== null });
  const teamName = teams.data?.find((team) => team.id === teamId)?.name ?? null;

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

  const saved: ProfileDraft = {
    name: me.data.name,
    timezone: me.data.preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    pronouns: me.data.profile?.pronouns ?? "",
    location: me.data.profile?.location ?? "",
    bio: me.data.profile?.bio ?? "",
    skills: me.data.profile?.skills ?? [],
    avatarShape: me.data.profile?.avatarShape ?? null,
  };
  const current: ProfileDraft = { ...saved, ...draft };
  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const changed = (key: keyof ProfileDraft) => !sameValue(current[key], saved[key]);
  const dirty = (Object.keys(saved) as Array<keyof ProfileDraft>).some(changed);
  const nameValid = current.name.trim().length > 0;
  const shape = avatarShapeFor(me.data.id, current.avatarShape);
  const tone = avatarToneFor(me.data.id);
  const initials = initialsOf(current.name) || "?";

  const typed = newSkill.trim().slice(0, PROFILE_LIMITS.skill);
  // A suggestion picked from the list (or typed exactly) keeps its own spelling and ESCO id.
  const picked = suggestions.data?.find(
    (item) => item.label.toLocaleLowerCase() === typed.toLocaleLowerCase(),
  );
  const skillToAdd = picked?.label ?? typed;
  const canAddSkill =
    skillToAdd.length > 0 &&
    current.skills.length < PROFILE_LIMITS.skills &&
    !current.skills.some((skill) => skill.toLocaleLowerCase() === skillToAdd.toLocaleLowerCase());
  const addSkill = () => {
    if (!canAddSkill) return;
    set("skills", [...current.skills, skillToAdd]);
    if (picked?.id) setSkillIds((ids) => ({ ...ids, [skillToAdd]: picked.id! }));
    setNewSkill("");
  };
  const newIds = Object.fromEntries(
    Object.entries(skillIds).filter(([skill]) => current.skills.includes(skill)),
  );

  const reset = () => {
    setDraft({});
    setNewSkill("");
    setSkillIds({});
  };
  const save = () =>
    update.mutate(
      {
        name: current.name.trim(),
        timezone: current.timezone,
        // Only what changed, so an unchanged location doesn't overwrite the HR system's.
        ...(changed("pronouns") ? { pronouns: current.pronouns.trim() } : {}),
        ...(changed("location") ? { location: current.location.trim() } : {}),
        ...(changed("bio") ? { bio: current.bio.trim() } : {}),
        ...(changed("skills")
          ? {
              skills: current.skills,
              ...(Object.keys(newIds).length ? { skillIds: newIds } : {}),
            }
          : {}),
        ...(changed("avatarShape") ? { avatarShape: current.avatarShape } : {}),
      },
      {
        onSuccess: () => {
          toast.success("Profile saved");
          reset();
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
        <div className="flex flex-wrap items-center gap-4">
          <Avatar size="xl" tone={tone} shape={shape}>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="text-sm text-on-surface-variant">
            <p className="font-medium text-on-surface">{ROLE_LABEL[me.data.role]}</p>
            {me.data.email ? <p>{me.data.email}</p> : null}
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Avatar shape</legend>
          <div className="flex flex-wrap gap-1.5">
            {AVATAR_SHAPES.map((option) => (
              <label
                key={option}
                className="cursor-pointer rounded-full p-1 transition-colors has-checked:bg-secondary-container has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
              >
                <input
                  type="radio"
                  name="avatar-shape"
                  value={option}
                  className="sr-only"
                  checked={shape === option}
                  onChange={() => set("avatarShape", option)}
                  aria-label={shapeLabel(option)}
                />
                <Avatar size="default" tone={tone} shape={option} aria-hidden>
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 @xl:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="settings-name">Name</Label>
            <Input
              id="settings-name"
              value={current.name}
              aria-invalid={!nameValid}
              onChange={(event) => set("name", event.target.value)}
            />
            {!nameValid ? <p className="px-4 text-xs text-error">Enter your name.</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-pronouns">Pronouns</Label>
            <Input
              id="settings-pronouns"
              value={current.pronouns}
              maxLength={PROFILE_LIMITS.pronouns}
              placeholder="she/her, he/him, they/them"
              onChange={(event) => set("pronouns", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-location">Location</Label>
            <Input
              id="settings-location"
              value={current.location}
              maxLength={PROFILE_LIMITS.location}
              placeholder="City, country"
              onChange={(event) => set("location", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-timezone">Time zone</Label>
            <Select
              value={current.timezone}
              onValueChange={(value) => set("timezone", value ?? "")}
            >
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
          <div className="space-y-1.5 @xl:col-span-2">
            <Label htmlFor="settings-bio">Bio</Label>
            <Textarea
              id="settings-bio"
              rows={3}
              value={current.bio}
              maxLength={PROFILE_LIMITS.bio}
              placeholder="What you work on and what people can ask you about."
              onChange={(event) => set("bio", event.target.value)}
            />
            <p className="px-4 text-right text-xs text-on-surface-variant tabular-nums">
              {current.bio.length}/{PROFILE_LIMITS.bio}
            </p>
          </div>
          <div className="space-y-1.5 @xl:col-span-2">
            <Label htmlFor="settings-skill">Skills</Label>
            {current.skills.length ? (
              <ul aria-label="Your skills" className="flex flex-wrap gap-1.5">
                {current.skills.map((skill) => (
                  <li key={skill}>
                    <Chip
                      aria-label={`Remove ${skill}`}
                      onClick={() =>
                        set(
                          "skills",
                          current.skills.filter((entry) => entry !== skill),
                        )
                      }
                    >
                      {skill}
                      <CloseIcon aria-hidden className="ms-0 -me-2" />
                    </Chip>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <Input
                id="settings-skill"
                value={newSkill}
                maxLength={PROFILE_LIMITS.skill}
                list={skillListId}
                autoComplete="off"
                placeholder={
                  current.skills.length >= PROFILE_LIMITS.skills
                    ? `Up to ${PROFILE_LIMITS.skills} skills`
                    : "Add a skill, like Kafka or Pricing"
                }
                disabled={current.skills.length >= PROFILE_LIMITS.skills}
                onChange={(event) => setNewSkill(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSkill();
                  }
                }}
              />
              <datalist id={skillListId}>
                {(skillText.length >= 2 ? (suggestions.data ?? []) : []).map((item) => (
                  <option key={item.label} value={item.label} />
                ))}
              </datalist>
              <Button variant="outline" disabled={!canAddSkill} onClick={addSkill}>
                <AddIcon aria-hidden />
                Add
              </Button>
            </div>
            <p className="px-4 text-xs text-on-surface-variant">
              People find you by these in the directory. Suggestions come from your colleagues'
              skills and ESCO, the European skills list; any other skill works too.
            </p>
          </div>
        </div>
        {jobTitle || teamName ? (
          <dl className="grid gap-4 rounded-lg bg-pane p-4 text-sm @xl:grid-cols-2">
            {jobTitle ? (
              <div>
                <dt className="text-on-surface-variant">Job title</dt>
                <dd className="font-medium">{jobTitle}</dd>
              </div>
            ) : null}
            {teamName ? (
              <div>
                <dt className="text-on-surface-variant">Team</dt>
                <dd className="font-medium">{teamName}</dd>
              </div>
            ) : null}
            <p className="text-xs text-on-surface-variant @xl:col-span-2">
              From the HR system. Ask People Ops to change these.
            </p>
          </dl>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={!dirty || update.isPending} onClick={reset}>
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
          <CardDescription>
            Notifications wait until quiet hours end, in your time zone. Security alerts always come
            through.
          </CardDescription>
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
      <PasswordCard />
      <SessionsCard />
      <ConnectedAppsCard />
      <YourDataCard />
    </>
  );
}

const METHOD_LABEL: Record<string, string> = {
  email: "Email sign-in link",
  "magic-link": "Email sign-in link",
  password: "Password",
  google: "Google",
  microsoft: "Microsoft",
  sso: "Company single sign-on",
  development: "Development sign-in",
};

/** How they sign in: the methods linked to their account, and how this session signed in. */
function SignInCard() {
  const { data: session } = useQuery(sessionQuery());
  const out = useMutation({ mutationFn: signOut, onSuccess: () => window.location.assign("/") });
  if (!session) return <Skeleton className="h-40 rounded-lg" />;
  const development = session.authentication === "development";
  const methods = development ? ["development"] : session.linkedMethods;
  // Google, Microsoft and company SSO ask for their own second step; an email link proves the inbox.
  const providerSecured =
    session.signInMethod === "google" ||
    session.signInMethod === "microsoft" ||
    session.signInMethod === "sso";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in</CardTitle>
        <CardDescription>
          {development
            ? "This environment runs without sign-in (development mode)."
            : `Signed in as ${session.user.email ?? session.user.name}. Any of these opens your account.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-0.5">
          {methods.map((method) => (
            <li
              key={method}
              className="flex items-center gap-3 rounded-xs bg-pane px-4 py-3 first:rounded-t-lg last:rounded-b-lg"
            >
              {method === "google" || method === "microsoft" ? (
                <ConnectorLogo provider={method} size="sm" />
              ) : (
                <span
                  aria-hidden
                  className="grid size-8 place-items-center rounded-md bg-surface-container-high [&_svg]:size-4"
                >
                  {method === "sso" ? (
                    <VerifiedUserIcon />
                  ) : method === "password" ? (
                    <KeyIcon />
                  ) : (
                    <MailIcon />
                  )}
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{METHOD_LABEL[method] ?? method}</span>
                {method === "email" && session.user.email ? (
                  <span className="truncate text-xs text-on-surface-variant">
                    {session.user.email}
                  </span>
                ) : null}
              </span>
              {METHOD_LABEL[method] === METHOD_LABEL[session.signInMethod ?? ""] ? (
                <StatusChip tone="info" icon={<CheckIcon />}>
                  This session
                </StatusChip>
              ) : null}
            </li>
          ))}
          {development ? null : (
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
                  {providerSecured
                    ? `Set up in your ${METHOD_LABEL[session.signInMethod ?? ""]} account`
                    : "Email links prove you can open your inbox each time. Use Google, Microsoft or company SSO for 2-step verification."}
                </span>
              </span>
              {providerSecured ? (
                <StatusChip tone="success" icon={<CheckIcon />}>
                  Managed by provider
                </StatusChip>
              ) : (
                <StatusChip tone="neutral" icon={<WarningIcon />}>
                  Email link
                </StatusChip>
              )}
            </li>
          )}
        </ul>
        {development ? (
          <p className="text-sm text-on-surface-variant">
            Development mode has one built-in user and no sign-in, so there is nothing to sign out
            of. Set AUTH_MODE=accounts in apps/api/.env to sign in and out with real accounts.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" disabled={out.isPending} onClick={() => out.mutate()}>
              <LogoutIcon aria-hidden /> Sign out
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** A readable device from a browser's user agent: "Mac · Chrome", "iPhone · Safari". */
function describeDevice(userAgent: string | null): { label: string; mobile: boolean } {
  const ua = userAgent ?? "";
  const mobile = /iPhone|Android.+Mobile|Mobile Safari/i.test(ua);
  const os = ua.includes("iPhone")
    ? "iPhone"
    : ua.includes("iPad")
      ? "iPad"
      : ua.includes("Android")
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : ua.includes("Windows")
            ? "Windows"
            : ua.includes("Linux")
              ? "Linux"
              : null;
  const browser = ua.includes("Edg/")
    ? "Edge"
    : ua.includes("Firefox/")
      ? "Firefox"
      : ua.includes("Chrome/")
        ? "Chrome"
        : ua.includes("Safari/")
          ? "Safari"
          : null;
  return {
    label: [os ?? (mobile ? "Phone" : "Computer"), browser].filter(Boolean).join(" · "),
    mobile,
  };
}

/** "Where you're signed in" (prototype): this person's sessions, with sign-out per device. */
function SessionsCard() {
  const { data: session } = useQuery(sessionQuery());
  const devices = useQuery({ ...devicesQuery(), enabled: session?.authentication === "accounts" });
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: authKeys.devices() });
  const revokeOne = useMutation({
    mutationFn: signOutDevice,
    onSuccess: () => toast.success("Signed out of that device"),
    onSettled: refresh,
  });
  const revokeOthers = useMutation({
    mutationFn: signOutOtherDevices,
    onSuccess: () => toast.success("Signed out everywhere else"),
    onSettled: refresh,
  });
  const busy = revokeOne.isPending || revokeOthers.isPending;
  const others = (devices.data ?? []).filter((entry) => !entry.current);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Where you're signed in</CardTitle>
        {others.length ? (
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => revokeOthers.mutate()}>
            Sign out everywhere else
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {session?.authentication === "development" ? (
          <p className="text-sm text-on-surface-variant">
            Development mode has no sign-in sessions.
          </p>
        ) : devices.isPending ? (
          <Skeleton className="h-28 rounded-lg" />
        ) : devices.isError ? (
          <p className="text-sm text-on-surface-variant">Your sessions could not be loaded.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {devices.data.map((entry) => {
              const device = describeDevice(entry.userAgent);
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 rounded-xs bg-pane px-4 py-3 first:rounded-t-lg last:rounded-b-lg"
                >
                  <span
                    aria-hidden
                    className="grid size-8 place-items-center rounded-md bg-surface-container-high [&_svg]:size-4"
                  >
                    {device.mobile ? <SmartphoneIcon /> : <DesktopWindowsIcon />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium">{device.label}</span>
                    <span className="text-xs text-on-surface-variant">
                      {[
                        entry.signInMethod ? METHOD_LABEL[entry.signInMethod] : null,
                        entry.current ? "This device" : formatRelativeTime(entry.lastActiveAt),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {entry.current ? (
                    <StatusChip tone="info" icon={<CheckIcon />}>
                      This device
                    </StatusChip>
                  ) : (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busy}
                      onClick={() => revokeOne.mutate(entry.id)}
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
