/**
 * Soft-hidden for the Oct 18 demo, as in the design reference (`CX.data.hidden`). The code and data
 * stay in place; set a flag to `false` to bring that part back. The team wants these views back
 * after the demo.
 * - `contributions`: the Contributions page and editor (their routes go to Home), the nav item, the
 *   employee Home card and every Contribute / Write it / Create article button.
 * - `homeTeamUpdates`: the team updates card on the employee Home.
 */
export const HIDDEN: { contributions: boolean; homeTeamUpdates: boolean } = {
  contributions: true,
  homeTeamUpdates: true,
};
