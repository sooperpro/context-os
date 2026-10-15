# Dev VM deployment

The dev deployment uses the existing Google Compute Engine VM and the GoDaddy DNS zone for
`sooper.pro`. Caddy terminates HTTPS for `dev.contextos.sooper.pro`; the web container proxies
`/api/` to the API over Docker's private network. The API and web container ports bind to loopback
only.

## One-time setup

1. Reserve a static external IPv4 address in the VM's `asia-south1` region and attach it to the VM.
   The current VM address is ephemeral and may change if the instance is stopped.
2. In GoDaddy DNS for `sooper.pro`, add an A record named `dev.contextos` pointing to that address.
   Leave the apex and `www` records in place; they currently point to Vercel.
3. Sign-in runs in the API (no external auth service). For "Continue with Google", add
   `https://dev.contextos.sooper.pro/api/v1/auth/callback/google` to the same OAuth client below;
   for Microsoft, register `https://dev.contextos.sooper.pro/api/v1/auth/callback/microsoft` on the
   Entra ID app. Configure an SMTP account for sign-in links and invitations.
4. In the Google Cloud Console, open the OAuth 2.0 **Web application** client used by this
   deployment and add this exact Authorized redirect URI:

   ```text
   https://dev.contextos.sooper.pro/api/v1/connectors/google-drive/callback
   ```

   Do not add a trailing slash. It must be the same value as `GOOGLE_REDIRECT_URI`; Google rejects
   an otherwise-valid authorization request when the two differ.

5. Install Docker Engine and the Docker Compose plugin on the Ubuntu VM.

## Deploy manually

Check out the intended Git branch on the VM, then provide the deployment environment without
committing or uploading secrets to Git:

- `apps/api/.env`: `GEMINI_API_KEY`, `AUTH_MODE=accounts`, `AUTH_SECRET` (`openssl rand -base64 48`),
  `AUTH_URL=https://dev.contextos.sooper.pro`, `SMTP_URL` and `EMAIL_FROM`, plus any Google Drive /
  Microsoft credentials needed for dev.

Set `NODE_ENV=production` in `apps/api/.env`; the API rejects production startup without
`AUTH_MODE=accounts`, SMTP and HTTPS origins. Restrict the env files to the deployment account (`chmod 600`).

From the repository root, run:

```sh
docker compose -f docker-compose.yml -f docker-compose.vm.yml up -d --build
```

Then verify the API readiness endpoint from the VM and load `https://dev.contextos.sooper.pro` in a
browser. Caddy obtains and renews the TLS certificate automatically once DNS resolves to the VM and
ports 80/443 are reachable.

For Google Drive, the VM compose override sets `GOOGLE_REDIRECT_URI` to the public HTTPS callback
above. After deploying, confirm the running container received it:

```sh
docker compose -f docker-compose.yml -f docker-compose.vm.yml exec api printenv GOOGLE_REDIRECT_URI
```

## Deploy from GitHub Actions

`.github/workflows/deploy-dev.yml` deploys pushes to the `dev` branch. It packages the checked-out
Git revision, transfers it through Google Cloud IAP,
then builds and restarts the Compose services. Each deployment replaces the source tree from a
clean staging directory, preserving the VM's `.env` files and Docker volumes. API credentials
stay on the VM and are not sent to GitHub. The VM override selects `AUTH_MODE=accounts`; the API
env file must provide `AUTH_SECRET` and `SMTP_URL`. Startup failures include container status and
recent API logs in the workflow output.

### One-time access setup

The workflow uses GitHub OIDC with Google Workload Identity Federation and an SSH key limited to
this VM. It does not use a service account key JSON or expose SSH to the public internet.

1. Create a dedicated Ed25519 key pair on a trusted workstation. Add the public key to
   `/home/sooperapp_pro/.ssh/authorized_keys` on the VM with the `restrict` option. Store the
   private key as the GitHub repository secret `DEV_VM_DEPLOY_SSH_PRIVATE_KEY`.
2. Pin the VM's SSH host public key as the GitHub repository variable `DEV_VM_KNOWN_HOSTS`, in
   this format (use the actual host public key from `/etc/ssh/ssh_host_ed25519_key.pub`):

   ```text
   [localhost]:2222 ssh-ed25519 <VM SSH host public key>
   ```

3. Allow IAP TCP forwarding to port 22 from `35.235.240.0/20`, targeted to this VM. For example,
   add a network tag such as `contextos-dev-iap-ssh` and create a firewall rule with that target
   tag, source range `35.235.240.0/20`, and only `tcp:22`. Restrict any existing SSH rule to the
   same IAP range and target the VM. Do not open SSH to `0.0.0.0/0`.
4. Create a Google service account for deployment and a Workload Identity Pool/Provider. Limit the
   provider to this repository and `refs/heads/dev`. Grant the service account
   `roles/compute.viewer` on project `contextos-511517` and `roles/iap.tunnelResourceAccessor` on
   this VM through the IAP SSH and TCP resource policy (the Compute Engine instance IAM command
   does not support the IAP role). Grant the pool identity `roles/iam.workloadIdentityUser` on that
   service account.
5. Add these GitHub repository variables:

   - `GCP_WORKLOAD_IDENTITY_PROVIDER`: full provider resource name.
   - `GCP_DEPLOY_SERVICE_ACCOUNT`: deployment service account email.

   The SSH key and pinned known-host line use the secret and variable names from steps 1 and 2.

Example Workload Identity setup commands (run with an administrator account that can create IAM
resources; replace the project number if this is run in another project):

```sh
PROJECT_ID=contextos-511517
PROJECT_NUMBER=514544294031
REPO=sooperpro/context-os
POOL_ID=github-actions
PROVIDER_ID=context-os-dev
SERVICE_ACCOUNT=github-deploy-dev

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com iap.googleapis.com \
  --project="$PROJECT_ID"
gcloud compute instances add-tags instance-20261013-174005 \
  --project="$PROJECT_ID" --zone=asia-south1-c --tags=contextos-dev-iap-ssh
gcloud compute firewall-rules create allow-contextos-dev-iap-ssh \
  --project="$PROJECT_ID" --network=default --direction=INGRESS --action=ALLOW \
  --rules=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=contextos-dev-iap-ssh
# Restrict the existing default SSH rule to IAP and this VM as well.
gcloud compute firewall-rules update default-allow-ssh \
  --project="$PROJECT_ID" --source-ranges=35.235.240.0/20 \
  --target-tags=contextos-dev-iap-ssh
gcloud iam workload-identity-pools create "$POOL_ID" \
  --project="$PROJECT_ID" --location=global
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '$REPO' && assertion.ref == 'refs/heads/dev'"
gcloud iam service-accounts create "$SERVICE_ACCOUNT" --project="$PROJECT_ID"
DEPLOY_SA="$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --project="$PROJECT_ID" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/attribute.repository/$REPO"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/compute.viewer
# In Cloud Console, open Security > Identity-Aware Proxy > SSH and TCP resources,
# select this VM, and grant roles/iap.tunnelResourceAccessor to serviceAccount:$DEPLOY_SA.
gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
  --format='value(name)'
```

The last command prints the value for `GCP_WORKLOAD_IDENTITY_PROVIDER`. Push this workflow to
`dev` after the GitHub variables, secret, VM key, firewall rule, and IAM bindings are configured.

## Notes

- Keep port 3000 and 8080 bound to `127.0.0.1`; only Caddy needs public HTTP/HTTPS ingress.
- SQLite persists in the `api-data` Docker volume. Back it up before replacing or removing that
  volume.
- The existing CI workflow runs on `main` and pull requests; the deploy workflow is separate and
  runs only for `dev`.
