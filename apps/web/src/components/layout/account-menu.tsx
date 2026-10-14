import { useClerk, useOrganizationList, useUser } from "@clerk/react";
import { Link } from "react-router";
import type { Theme } from "@/components/theme-context";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  avatarShapeFor,
  avatarToneFor,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRadioItemIcon,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContrastFilledIcon,
  ContrastIcon,
  DarkModeFilledIcon,
  DarkModeIcon,
  LightModeFilledIcon,
  LightModeIcon,
  LogoutIcon,
  ManageAccountsIcon,
  NotificationsIcon,
  PersonIcon,
  type MaterialIcon,
} from "@/components/ui/icons";
import { useTheme } from "@/hooks/use-theme";
import { initialsOf } from "@/lib/format";

const THEMES: Array<{
  value: Theme;
  label: string;
  icon: MaterialIcon;
  checkedIcon: MaterialIcon;
}> = [
  { value: "system", label: "Match system", icon: ContrastIcon, checkedIcon: ContrastFilledIcon },
  { value: "light", label: "Light", icon: LightModeIcon, checkedIcon: LightModeFilledIcon },
  { value: "dark", label: "Dark", icon: DarkModeIcon, checkedIcon: DarkModeFilledIcon },
];

/**
 * The prototype's account menu on our own avatar: name and email, account management (Clerk's
 * profile), theme with "Match system", workspace switching, and sign out.
 */
export function AccountMenu() {
  const { user } = useUser();
  const clerk = useClerk();
  const { theme, setTheme } = useTheme();
  const organizations = useOrganizationList({ userMemberships: true });

  const name = user?.fullName ?? user?.firstName ?? "Account";
  const email = user?.primaryEmailAddress?.emailAddress;
  const memberships = organizations.isLoaded ? organizations.userMemberships.data : [];
  const activeOrganizationId = clerk.organization?.id ?? "";
  // Your avatar wears your shape, as on your profile (prototype `.avatar.shape-*`).
  const tone = avatarToneFor(user?.id ?? "account");
  const shape = avatarShapeFor(user?.id ?? "account");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Account: ${name}`}
            className="ml-1 rounded-full transition-transform ease-spring-fast-spatial outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
          />
        }
      >
        <Avatar size="sm" tone={tone} shape={shape}>
          {user?.imageUrl ? <AvatarImage src={user.imageUrl} alt="" /> : null}
          <AvatarFallback>{initialsOf(name) || "?"}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        <div className="flex items-center gap-3 p-3">
          <Avatar size="lg" tone={tone} shape={shape}>
            {user?.imageUrl ? <AvatarImage src={user.imageUrl} alt="" /> : null}
            <AvatarFallback>{initialsOf(name) || "?"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-base font-medium">{name}</p>
            {email ? <p className="truncate text-xs text-on-surface-variant">{email}</p> : null}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/settings" />}>
          <PersonIcon /> Profile & preferences
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/settings?tab=notifications" />}>
          <NotificationsIcon /> Notifications
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => clerk.openUserProfile()}>
          <ManageAccountsIcon /> Sign-in and security
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          {THEMES.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <DropdownMenuRadioItemIcon icon={option.icon} checkedIcon={option.checkedIcon} />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {memberships.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={activeOrganizationId}
              onValueChange={(organizationId: string) =>
                void organizations.setActive?.({ organization: organizationId })
              }
            >
              <DropdownMenuLabel>Workspace</DropdownMenuLabel>
              {memberships.map((membership) => (
                <DropdownMenuRadioItem
                  key={membership.organization.id}
                  value={membership.organization.id}
                >
                  {membership.organization.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void clerk.signOut({ redirectUrl: "/" })}>
          <LogoutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
