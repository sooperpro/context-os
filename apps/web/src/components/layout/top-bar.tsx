import { OrganizationSwitcher, UserButton } from "@clerk/react";
import { useState, type FormEvent } from "react";
import { useAssistant } from "@/components/layout/assistant-context";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";

export const GLOBAL_SEARCH_ID = "global-search";

/**
 * Top bar (72px): search that hands its text to Context Bot, organization switcher and account.
 * On compact windows the brand moves here and search becomes an icon that opens the assistant.
 */
export function TopBar() {
  const { openAssistant } = useAssistant();
  const [query, setQuery] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    openAssistant(text.length > 0 ? text : undefined);
    setQuery("");
  };

  return (
    <header className="flex h-18 shrink-0 items-center gap-3 px-3 medium:px-4">
      <Brand compact className="medium:hidden" />

      <form
        role="search"
        onSubmit={submit}
        className="hidden h-14 max-w-2xl flex-1 items-center gap-3 rounded-full bg-surface-container-high px-5 text-on-surface-variant focus-within:ring-3 focus-within:ring-ring/50 medium:flex"
      >
        <SearchIcon className="size-5 shrink-0" aria-hidden />
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
          className="min-w-0 flex-1 bg-transparent text-base text-on-surface outline-none placeholder:text-on-surface-variant"
        />
        <kbd
          aria-hidden
          className="hidden rounded-xs bg-surface-container-highest px-1.5 py-0.5 font-mono text-xs expanded:inline"
        >
          /
        </kbd>
      </form>

      <span className="flex-1 medium:hidden" />

      <div className="flex items-center gap-1 medium:gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="medium:hidden"
          aria-label="Search or ask"
          onClick={() => openAssistant()}
        >
          <SearchIcon />
        </Button>
        <div className="hidden medium:block">
          <OrganizationSwitcher
            hidePersonal
            afterCreateOrganizationUrl="/"
            afterSelectOrganizationUrl="/"
            afterLeaveOrganizationUrl="/"
          />
        </div>
        <span className="medium:hidden">
          <ThemeToggle />
        </span>
        <UserButton />
      </div>
    </header>
  );
}
