import { createBrowserRouter } from "react-router";
import { RootLayout } from "@/app/root-layout";
import { RouteErrorBoundary } from "@/components/route-error-boundary";
import { NotFoundPage } from "@/pages/not-found-page";

/** Development-only routes: the component gallery lives outside the app shell and auth gate. */
const devRoutes = import.meta.env.DEV
  ? [
      {
        path: "/dev/ui",
        ErrorBoundary: RouteErrorBoundary,
        lazy: async () => {
          const { UiGalleryPage } = await import("@/dev/ui-gallery-page");
          return { Component: UiGalleryPage };
        },
      },
    ]
  : [];

/** The application's routes under the shell, shared by "/" and the development shell preview. */
const appChildren = [
  {
    index: true,
    lazy: async () => {
      const { HomePage } = await import("@/features/home/pages/home-page");
      return { Component: HomePage };
    },
  },
  {
    path: "knowledge",
    lazy: async () => {
      const { KnowledgeHubPage } = await import("@/features/knowledge/pages/knowledge-hub-page");
      return { Component: KnowledgeHubPage };
    },
  },
  {
    path: "roadmap",
    lazy: async () => {
      const { RoadmapPage } = await import("@/features/learning/pages/roadmap-page");
      return { Component: RoadmapPage };
    },
  },
  {
    path: "roadmap/modules/:moduleId",
    lazy: async () => {
      const { ModulePage } = await import("@/features/learning/pages/module-page");
      return { Component: ModulePage };
    },
  },
  {
    path: "roadmap/lessons/:lessonId",
    lazy: async () => {
      const { LessonPage } = await import("@/features/learning/pages/lesson-page");
      return { Component: LessonPage };
    },
  },
  {
    path: "roadmap/checks/:checkId",
    lazy: async () => {
      const { CheckPage } = await import("@/features/learning/pages/check-page");
      return { Component: CheckPage };
    },
  },
  {
    path: "contributions",
    lazy: async () => {
      const { ContributionsPage } =
        await import("@/features/contributions/pages/contributions-page");
      return { Component: ContributionsPage };
    },
  },
  {
    path: "contributions/new",
    lazy: async () => {
      const { ContributionEditorPage } =
        await import("@/features/contributions/pages/contribution-editor-page");
      return { Component: ContributionEditorPage };
    },
  },
  {
    path: "people",
    lazy: async () => {
      const { PeoplePage } = await import("@/features/people/pages/people-page");
      return { Component: PeoplePage };
    },
  },
  {
    path: "people/:personId",
    lazy: async () => {
      const { PersonPage } = await import("@/features/people/pages/person-page");
      return { Component: PersonPage };
    },
  },
  {
    path: "members",
    lazy: async () => {
      const { MembersPage } = await import("@/features/members/pages/members-page");
      return { Component: MembersPage };
    },
  },
  {
    path: "settings",
    lazy: async () => {
      const { SettingsPage } = await import("@/features/settings/pages/settings-page");
      return { Component: SettingsPage };
    },
  },
  {
    path: "setup",
    lazy: async () => {
      const { SetupPage } = await import("@/features/setup/pages/setup-page");
      return { Component: SetupPage };
    },
  },
  {
    path: "projects/:projectId",
    // Project pages are code-split: this chunk loads only when a project is opened.
    lazy: async () => {
      const { ProjectLayout } = await import("@/components/layout/project-layout");
      return { Component: ProjectLayout };
    },
    children: [
      {
        index: true,
        lazy: async () => {
          const { ProjectHubPage } = await import("@/features/hub/pages/project-hub-page");
          return { Component: ProjectHubPage };
        },
      },
      {
        path: "ask",
        lazy: async () => {
          const { AskPage } = await import("@/features/ask/pages/ask-page");
          return { Component: AskPage };
        },
      },
      {
        path: "sources",
        lazy: async () => {
          const { SourcesPage } = await import("@/features/sources/pages/sources-page");
          return { Component: SourcesPage };
        },
      },
    ],
  },
  { path: "*", Component: NotFoundPage },
];

export const router = createBrowserRouter([
  ...devRoutes,
  // Development only: the same shell and pages without a session, for visual checks. The API in
  // development mode needs no token; links inside still point at the real routes.
  ...(import.meta.env.DEV
    ? [
        {
          path: "/dev/shell",
          Component: RootLayout,
          ErrorBoundary: RouteErrorBoundary,
          children: appChildren,
        },
      ]
    : []),
  {
    path: "/",
    Component: RootLayout,
    ErrorBoundary: RouteErrorBoundary,
    children: appChildren,
  },
]);
