import { createBrowserRouter } from "react-router";
import { RootLayout } from "@/app/root-layout";
import { RedirectHome } from "@/components/redirect-home";
import { RouteErrorBoundary } from "@/components/route-error-boundary";
import { AdminOnly } from "@/features/admin/components/admin-only";
import { OwnerOnly } from "@/features/conversations/components/owner-only";
import { HrOnly } from "@/features/people-ops/components/hr-only";
import { TemplatesOnly } from "@/features/people-ops/components/templates-only";
import { ManagerOnly } from "@/features/team/components/manager-only";
import { TeamMemberRedirect } from "@/features/team/components/team-member-redirect";
import { CuratorOnly } from "@/features/tutorials/components/curator-only";
import { HIDDEN } from "@/lib/hidden";
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
  // Soft-hidden for the demo (lib/hidden.ts): the pages stay in the code, their routes go Home.
  ...(HIDDEN.contributions
    ? [{ path: "contributions/*", Component: RedirectHome }]
    : [
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
      ]),
  {
    path: "team",
    lazy: async () => {
      const { TeamPage } = await import("@/features/team/pages/team-page");
      return {
        Component: () => (
          <ManagerOnly>
            <TeamPage />
          </ManagerOnly>
        ),
      };
    },
  },
  {
    // A person's onboarding is the Onboarding tab of their profile now (N-14).
    path: "team/:personId",
    Component: TeamMemberRedirect,
  },
  {
    path: "team/:personId/check-in",
    lazy: async () => {
      const { CheckinPage } = await import("@/features/team/pages/checkin-page");
      return {
        Component: () => (
          <ManagerOnly>
            <CheckinPage />
          </ManagerOnly>
        ),
      };
    },
  },
  {
    // Not manager-only: a proposed answer goes to the project's domain owner first, who may hold
    // any role, and the API lists only what the caller may review.
    path: "reviews",
    lazy: async () => {
      const { ReviewQueuePage } = await import("@/features/contributions/pages/review-queue-page");
      return { Component: ReviewQueuePage };
    },
  },
  {
    path: "connectors",
    lazy: async () => {
      const { ConnectorsPage } = await import("@/features/admin/pages/connectors-page");
      return {
        Component: () => (
          <AdminOnly>
            <ConnectorsPage />
          </AdminOnly>
        ),
      };
    },
  },
  {
    path: "access",
    lazy: async () => {
      const { AccessPage } = await import("@/features/admin/pages/access-page");
      return {
        Component: () => (
          <AdminOnly>
            <AccessPage />
          </AdminOnly>
        ),
      };
    },
  },
  {
    path: "ai",
    lazy: async () => {
      const { AiSettingsPage } = await import("@/features/admin/pages/ai-settings-page");
      return {
        Component: () => (
          <AdminOnly>
            <AiSettingsPage />
          </AdminOnly>
        ),
      };
    },
  },
  {
    path: "audit",
    lazy: async () => {
      const { AuditPage } = await import("@/features/admin/pages/audit-page");
      return {
        Component: () => (
          <AdminOnly alsoFor={["people_ops"]}>
            <AuditPage />
          </AdminOnly>
        ),
      };
    },
  },
  {
    path: "onboarding",
    lazy: async () => {
      const { OnboardingListPage } =
        await import("@/features/people-ops/pages/onboarding-list-page");
      return {
        Component: () => (
          <HrOnly>
            <OnboardingListPage />
          </HrOnly>
        ),
      };
    },
  },
  {
    path: "onboarding/:recordId",
    lazy: async () => {
      const { OnboardingRecordPage } =
        await import("@/features/people-ops/pages/onboarding-record-page");
      return {
        Component: () => (
          <HrOnly>
            <OnboardingRecordPage />
          </HrOnly>
        ),
      };
    },
  },
  {
    path: "probation",
    lazy: async () => {
      const { ProbationListPage } = await import("@/features/people-ops/pages/probation-list-page");
      return {
        Component: () => (
          <HrOnly>
            <ProbationListPage />
          </HrOnly>
        ),
      };
    },
  },
  {
    path: "probation/:reviewId",
    lazy: async () => {
      const { ProbationDetailPage } =
        await import("@/features/people-ops/pages/probation-detail-page");
      return {
        Component: () => (
          <HrOnly>
            <ProbationDetailPage />
          </HrOnly>
        ),
      };
    },
  },
  {
    path: "templates",
    lazy: async () => {
      const { TemplatesPage } = await import("@/features/people-ops/pages/templates-page");
      return {
        Component: () => (
          <TemplatesOnly>
            <TemplatesPage />
          </TemplatesOnly>
        ),
      };
    },
  },
  {
    path: "templates/:templateId",
    lazy: async () => {
      const { TemplateEditorPage } =
        await import("@/features/people-ops/pages/template-editor-page");
      return {
        Component: () => (
          <TemplatesOnly>
            <TemplateEditorPage />
          </TemplatesOnly>
        ),
      };
    },
  },
  {
    path: "tutorials",
    lazy: async () => {
      const { TutorialsPage } = await import("@/features/tutorials/pages/tutorials-page");
      return {
        Component: () => (
          <CuratorOnly>
            <TutorialsPage />
          </CuratorOnly>
        ),
      };
    },
  },
  {
    path: "tutorials/:tutorialId",
    lazy: async () => {
      const { TutorialStudioPage } =
        await import("@/features/tutorials/pages/tutorial-studio-page");
      return {
        Component: () => (
          <CuratorOnly>
            <TutorialStudioPage />
          </CuratorOnly>
        ),
      };
    },
  },
  {
    // Every role: managers and People Ops have it in the rail, and an employee's Home links here
    // when they have no onboarding roadmap. The API serves each person their own courses.
    path: "learning",
    lazy: async () => {
      const { MyLearningPage } = await import("@/features/learning/pages/my-learning-page");
      return { Component: MyLearningPage };
    },
  },
  {
    path: "learning/:courseId",
    lazy: async () => {
      const { CoursePage } = await import("@/features/learning/pages/course-page");
      return { Component: CoursePage };
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
      return {
        Component: () => (
          <AdminOnly alsoFor={["people_ops"]}>
            <MembersPage />
          </AdminOnly>
        ),
      };
    },
  },
  {
    path: "search",
    lazy: async () => {
      const { SearchPage } = await import("@/features/search/pages/search-page");
      return { Component: SearchPage };
    },
  },
  {
    path: "conversations",
    lazy: async () => {
      const { ConversationsPage } =
        await import("@/features/conversations/pages/conversations-page");
      return {
        Component: () => (
          <OwnerOnly>
            <ConversationsPage />
          </OwnerOnly>
        ),
      };
    },
  },
  {
    // Domain owners and admins; the API refuses everyone else and the page says so.
    path: "knowledge-gaps",
    lazy: async () => {
      const { KnowledgeGapsPage } =
        await import("@/features/knowledge-gaps/pages/knowledge-gaps-page");
      return { Component: KnowledgeGapsPage };
    },
  },
  {
    path: "notifications",
    lazy: async () => {
      const { NotificationsPage } =
        await import("@/features/notifications/pages/notifications-page");
      return { Component: NotificationsPage };
    },
  },
  {
    path: "workspace",
    lazy: async () => {
      const { WorkspacePage } = await import("@/features/admin/pages/workspace-page");
      return {
        Component: () => (
          <AdminOnly>
            <WorkspacePage />
          </AdminOnly>
        ),
      };
    },
  },
  {
    // Linked from the offboarding notification; the API lets only the manager and admins open it.
    path: "continuity/checklists/:checklistId",
    lazy: async () => {
      const { ChecklistPage } = await import("@/features/continuity/pages/checklist-page");
      return { Component: ChecklistPage };
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
      return {
        Component: () => (
          <AdminOnly>
            <SetupPage />
          </AdminOnly>
        ),
      };
    },
  },
  {
    // A knowledge item has its own page, outside the project's hub layout (prototype `#kb-<id>`).
    path: "projects/:projectId/items/:itemId",
    lazy: async () => {
      const { ContextItemPage } = await import("@/features/hub/pages/context-item-page");
      return { Component: ContextItemPage };
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

const welcomeRoute = async () => {
  const { WelcomePage } = await import("@/features/welcome/pages/welcome-page");
  return { Component: WelcomePage };
};

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
  // The first-day welcome is full screen, before the app (prototype `#welcome`).
  ...(import.meta.env.DEV
    ? [{ path: "/dev/welcome", ErrorBoundary: RouteErrorBoundary, lazy: welcomeRoute }]
    : []),
  { path: "/welcome", ErrorBoundary: RouteErrorBoundary, lazy: welcomeRoute },
  // The signed-out landing page (N-5), viewable while signed in during development.
  ...(import.meta.env.DEV
    ? [
        {
          path: "/dev/landing",
          ErrorBoundary: RouteErrorBoundary,
          lazy: async () => {
            const { LandingPage } = await import("@/features/landing/pages/landing-page");
            return { Component: LandingPage };
          },
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
