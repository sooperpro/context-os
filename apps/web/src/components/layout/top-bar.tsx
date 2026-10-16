import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { AccountMenu } from "@/components/layout/account-menu";
import { useAssistant } from "@/components/layout/assistant-context";
import { Brand } from "@/components/layout/brand";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ViewAsPill } from "@/components/layout/view-as-pill";
import { Button } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";

export const GLOBAL_SEARCH_ID = "global-search";

/**
 * Top bar (72px), as in the prototype: search that opens the results page (where asking Context Bot
 * is one option; an empty search opens the bot), the "View as" pill, theme, notifications and the
 * account menu (which also switches workspaces). On compact windows the brand moves here and
 * search becomes an icon that opens the assistant.
 */
export function TopBar() {
  const { openAssistant } = useAssistant();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (text.length >= 2) void navigate(`/search?q=${encodeURIComponent(text)}`);
    else openAssistant();
    setQuery("");
  };

  return (
    <header className="flex h-18 shrink-0 items-center gap-2 py-2 pr-4 pl-3 medium:pl-1">
      <Brand compact className="medium:hidden" />

      <form
        role="search"
        onSubmit={submit}
        className="hidden h-12 shrink grow-0 basis-180 items-center gap-1 rounded-full bg-field pr-2 pl-4 text-on-surface-variant transition-[background-color,box-shadow] duration-[140ms] focus-within:bg-pane focus-within:shadow-elevation-2 medium:flex"
      >
        <SearchIcon className="size-6 shrink-0" aria-hidden />
        <label htmlFor={GLOBAL_SEARCH_ID} className="sr-only">
          Search knowledge or ask a question
        </label>
        <input
          id={GLOBAL_SEARCH_ID}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search knowledge, people and projects, or ask a question"
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-base text-on-surface outline-none placeholder:text-on-surface-variant"
        />
        <kbd
          aria-hidden
          className="mr-2 hidden rounded-xs bg-surface-container-highest px-1.5 py-0.5 font-mono text-xs expanded:inline"
        >
          /
        </kbd>
      </form>

      {/* Prototype topbar-spacer: the actions always sit at the far right. */}
      <span className="flex-1" />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="medium:hidden"
          aria-label="Search or ask"
          onClick={() => openAssistant()}
        >
          <SearchIcon />
        </Button>
        <ViewAsPill />
        <ThemeToggle />
        <NotificationsMenu />
        <AccountMenu />
      </div>
    </header>
  );
}
