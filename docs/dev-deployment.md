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
3. In Clerk, allow `https://dev.contextos.sooper.pro` as an authorized frontend origin and verify
   the dev instance's sign-in URLs. Use the matching dev publishable and secret keys.
4. In the Google Cloud Console, open the OAuth 2.0 **Web application** client used by this
   deployment and add this exact Authorized redirect URI:

   ```text
   https://dev.contextos.sooper.pro/api/v1/connectors/google-drive/callback
   ```

   Do not add a trailing slash. It must be the same value as `GOOGLE_REDIRECT_URI`; Google rejects
   an otherwise-valid authorization request when the two differ.
5. Install Docker Engine and the Docker Compose plugin on the Ubuntu VM.

## Deploy

Check out the intended Git branch on the VM, then provide the deployment environment without
committing or uploading secrets to Git:

- `apps/api/.env`: `GEMINI_API_KEY`, Clerk publishable and secret keys, `AUTH_MODE=clerk`, plus any
  Google Drive connector credentials needed for dev.
- `.env`: `VITE_CLERK_PUBLISHABLE_KEY` matching the Clerk dev instance.

Set `NODE_ENV=production` in `apps/api/.env`; the API rejects production startup without Clerk
authentication and HTTPS origins. Restrict the env files to the deployment account (`chmod 600`).

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

## Notes

- Keep port 3000 and 8080 bound to `127.0.0.1`; only Caddy needs public HTTP/HTTPS ingress.
- SQLite persists in the `api-data` Docker volume. Back it up before replacing or removing that
  volume.
- The GitHub Actions CI workflow is currently disabled, so this setup is a manual VM deployment.
