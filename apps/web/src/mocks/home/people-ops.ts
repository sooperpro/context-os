import { HOME_ENDPOINTS as E } from "@/features/home/api/home.api";
import { mockGet } from "@/mocks/define";
import { needsHrCount, probationReviewList, starterList } from "@/mocks/people-ops";

/**
 * Elena's view of onboarding across the organization, as in the prototype's HR Home. The probation
 * reviews, starters, overdue milestones and templates come from the People Ops store
 * (mocks/people-ops.ts), so changes made on the HR pages show here.
 */
export const peopleOpsMocks = [
  mockGet(E.peopleOpsOverview)(() => ({
    activeOnboardings: { count: 23, changeVsLastMonth: 4 },
    atRiskOrBlocked: { count: 5, changeThisWeek: 1 },
    reviewsNext30Days: { count: probationReviewList(30).items.length, needAction: needsHrCount() },
    startingNext14Days: {
      count: 6,
      notReady: starterList(14).filter(
        (starter) => !(starter.accountsReady && starter.buddyAssigned && starter.roadmapAssigned),
      ).length,
    },
    teams: [
      { team: "Engineering", onTrack: 7, atRisk: 1, blocked: 1 },
      { team: "Sales", onTrack: 4, atRisk: 1, blocked: 0 },
      { team: "Support", onTrack: 3, atRisk: 0, blocked: 1 },
      { team: "Design", onTrack: 2, atRisk: 0, blocked: 0 },
      { team: "Data", onTrack: 1, atRisk: 1, blocked: 0 },
      { team: "Finance", onTrack: 1, atRisk: 0, blocked: 0 },
    ],
  })),
];
