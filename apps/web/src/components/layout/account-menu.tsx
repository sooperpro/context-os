import { useClerk, useOrganizationList, useUser } from "@clerk/react";
import type { Theme } from "@/components/theme-context";
import { Avatar, AvatarFallback, AvatarImage, avatarToneFor } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContrastIcon,
  DarkModeIcon,
  LightModeIcon,
  LogoutIcon,
  ManageAccountsIcon,
} from "@/components/ui/icons";
import { useTheme } from "@/hooks/use-theme";
import { initialsOf } from "@/lib/format";

const THEMES: Array<{ value: Theme; label: string; icon: React.ReactNode }> = [
  { value: "system", label: "Match system", icon: <ContrastIcon /> },
  { value: "light", label: "Light", icon: <LightModeIcon /> },
  { value: "dark", label: "Dark", icon: <DarkModeIcon /> },
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Account: ${name}`}
            className="ml-1 rounded-full outline-none transition-transform ease-spring-fast-spatial active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <Avatar size="sm" tone={avatarToneFor(user?.id ?? "account")}>
          {user?.imageUrl ? <AvatarImage src={user.imageUrl} alt="" /> : null}
          <AvatarFallback>{initialsOf(name) || "?"}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar size="md" tone={avatarToneFor(user?.id ?? "account")}>
            {user?.imageUrl ? <AvatarImage src={user.imageUrl} alt="" /> : null}
            <AvatarFallback>{initialsOf(name) || "?"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            {email ? <p className="truncate text-xs text-on-surface-variant">{email}</p> : null}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => clerk.openUserProfile()}>
          <ManageAccountsIcon /> Profile and security
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          {THEMES.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.icon} {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {memberships.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={activeOrganizationId}
              onValueChange={(organizationId: string) => void organizations.setActive?.({ organization: organizationId })}
            >
              <DropdownMenuLabel>Workspace</DropdownMenuLabel>
              {memberships.map((membership) => (
                <DropdownMenuRadioItem key={membership.organization.id} value={membership.organization.id}>
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
