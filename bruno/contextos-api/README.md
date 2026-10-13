# ContextOS Bruno collection

Release target: Phase 1 first; later phases are deferred. Clerk and Google production configuration will be supplied later. The collection includes workspace/settings/setup, departments, teams and user organization APIs in folder `16`.

Use a **disposable development tenant** for full runs. Besides creating/deleting test resources, the suite updates the current user's demo preferences and workspace setup/settings. Workspace creation and member-org mutation are opt-in (`enableWorkspaceCreation`, `enableOrgMutation`); use disposable members. Workspace creation is not cleaned up automatically.

The extended collection includes identity, private conversations, flags/corrections, learning, onboarding, companion/preferences, reputation and configured Google Drive requests. Use-case and role documentation: [backend API guide](../../docs/backend-api-use-cases.md). Production limitations: [coverage and release gates](../../docs/backend-production-readiness.md).

`accessToken` adds a Clerk bearer token through `collection.bru`. Real tokens must be kept in git-ignored `environments/*.private.bru` files. Multi-user requests require the appropriate distinct reviewer/learner/mentor/manager session tokens and resource IDs. Live-provider requests are skipped unless their prerequisite variables are configured. A skipped request is not a passing integration test.

Open this directory as a collection in Bruno, then select `Local` from the environment dropdown in the top-right. You should see `baseUrl` set to `http://localhost:3000/api/v1` in the environment variables panel. Bruno does not activate a collection environment automatically when a collection is opened, so the dropdown may initially show `No Environment`.

For the CLI, select the same environment explicitly:

```bash
cd bruno/contextos-api
bru run . -r --env Local
```

Recommended request order:

1. Run **Health / Readiness**.
2. Run **Projects / Create Project**. Its post-response script saves `projectId`.
3. Run **Sources / Create Source**. It saves `sourceId` and queues processing.
4. Run **Sources / Wait for Processing**; it polls until ready and fails on processing errors/timeouts rather than testing empty knowledge APIs.
5. Exercise **Hub**, **Context**, **Ask**, and **Feedback**.
6. The full collection runs destructive source/project/thread/assignment/team/department cleanup last, in `99 Cleanup`. These remove only the captured test IDs; deleted test data is not recoverable without a backup.

`contextItemId`, `answerId`, and a failed `jobId` are captured by the corresponding list/create requests. You can also edit any value directly in `environments/Local.bru`.
