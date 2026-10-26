# Relay/Ops test-floor dashboard

[![Deploy](https://github.com/rheslar1/react_app1/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/rheslar1/react_app1/actions/workflows/deploy.yml)

Relay/Ops is a React/Vite operations console backed by a Go API and MySQL. It
provides self-service accounts, revocable server-side sessions, and truthful
API/database/deployment status. The operator and supervisor consoles are
frontend previews populated with clearly labeled sample station, run, alert,
and yield data; the backend does not yet provide station APIs or user roles.
They do not control equipment or grant operator or supervisor permissions.

## Run locally with Docker Compose

1. Copy `.env.example` to `.env` and change both local database passwords.
2. Start the stack from the repository root:

   ```sh
   docker compose up --build -d
   ```

3. Open <http://localhost:8080>, choose **Create account**, and register the
   first account. There is no seeded account or default production password.
4. Stop the stack with `docker compose down`. MySQL data persists in the
   `mysql-data` volume; remove it only when intentionally resetting local data:

   ```sh
   docker compose down -v
   ```

Compose starts Nginx/React, the Go API, and MySQL. The browser talks only to
same-origin `/api` paths; Nginx proxies those requests to the private API
container. MySQL and the API have no published host ports.

## Operator and supervisor previews

After signing in, switch between the **Operator** station-console preview and
the **Supervisor** line-overview preview. The sample state selector and
supervisor alert/station actions only change local preview state in the browser;
they do not send equipment commands or persist actions. API health remains a
real authenticated check, separate from the sample test-floor data.

The preview follows the design-plan boundary: station agents own test verdicts
and safety interlocks. The supervisor view is read-only for station activity
and cannot start or stop runs, change limits or procedures, release stations,
or override a refusal. Production use requires real station/line APIs,
server-enforced roles and authorization, audit logging, and a validated safety
implementation.

## Firmware update references

For future device-firmware work, see the upstream projects:

* [SWUpdate](https://swupdate.org/) — a Linux update framework for deploying
  signed software updates to embedded devices.
* [MCUboot](https://www.mcuboot.com/) — a secure bootloader for microcontroller
  firmware images, including image validation and firmware upgrade flows.

These are references only; this web dashboard does not currently build, sign,
or install firmware, and no SWUpdate or MCUboot integration is implemented.
Any production update flow must define device-specific signing keys, rollback
and recovery behavior, authorization, and audit requirements.

## API and security behavior

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/register` | Create an account (`email`, `password`) and sign in |
| `POST /api/auth/login` | Authenticate and issue a session |
| `GET /api/auth/me` | Restore the current session |
| `POST /api/auth/logout` | Revoke the session and clear its cookie |
| `GET /api/health` | Authenticated live API/database and deployment status |
| `GET /healthz` | Readiness probe; returns success only when MySQL responds |

Passwords are bcrypt-hashed. Sessions are random opaque tokens stored as
SHA-256 digests in MySQL; the browser cookie is `HttpOnly`, `SameSite=Lax`,
expires after 24 hours, and is `Secure` by default (disable only with
`COOKIE_SECURE=false` for local HTTP). The API
validates payloads, uses parameterized queries, sends no permissive CORS
headers, and rejects cross-origin auth POSTs. Configure HTTPS and set
`COOKIE_SECURE=true` explicitly before exposing an installation publicly.
Self-registration is open; before public production use, add an appropriate
signup policy, abuse controls/rate limits, and email-verification/account
recovery flows.

### API environment

`MYSQL_PASSWORD` is required. The API also accepts `MYSQL_USER` (default
`relay`), `MYSQL_HOST` (default `mysql:3306`), and `MYSQL_DATABASE` (default
`relayops`). Compose obtains these values from the ignored local `.env` file.
The API waits for MySQL, applies idempotent table initialization, and then
starts. Supply database credentials via your deployment secret manager outside
local development; never put real credentials in Helm values or source.

Optional deployment metadata is set on the API process:

* `APP_VERSION`
* `APP_REVISION`
* `APP_IMAGE_DIGEST`
* `APP_ENVIRONMENT`

Unset metadata is shown as unconfigured/unknown, never synthesized.

## Development checks

```sh
npm ci
npm test
npm run lint
npm run build
cd backend
go test ./...
go vet ./...
```

## Kubernetes / Argo CD deployment

The Helm chart deploys the frontend, Go API, and a single-replica MySQL
StatefulSet with a persistent volume claim. API and MySQL services are internal
ClusterIPs; the chart publishes neither service outside the namespace. Network
policies allow frontend-to-API and API-to-MySQL traffic only, plus DNS. CI
builds, scans, signs, and pins both application images by digest. The DB
credentials are never stored in Helm values: the namespace's `relayops-db`
Secret (keys `password` and `root-password`) is delivered as a Sealed Secret.
Seal it with `scripts/seal-relayops-db.ps1` (needs `kubeseal` and the Sealed
Secrets controller in `kube-system`), then commit the generated
`helm/react-app/templates/relayops-db-sealedsecret.yaml`. Only the cluster can
decrypt it. Argo CD creates the Secret from it.

### Local Docker Desktop Kubernetes

Enable Kubernetes in Docker Desktop and verify that
`kubectl config current-context` is `docker-desktop`. Build the Compose images
into the local Docker image store without starting Compose:

```powershell
docker compose --env-file .env.example build
```

Create the namespace and Secret using local files that are ignored by Git.
PowerShell prompts keep the passwords out of the command text; remove the
temporary secret files after Kubernetes has accepted them:

```powershell
kubectl create namespace react-dashboard-local --dry-run=client -o yaml | kubectl apply -f -
$db = Read-Host "Database password" -AsSecureString
$root = Read-Host "MySQL root password" -AsSecureString
$dbText = [Net.NetworkCredential]::new("", $db).Password
$rootText = [Net.NetworkCredential]::new("", $root).Password
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path (Get-Location) ".local-db-password"), $dbText, $utf8)
[IO.File]::WriteAllText((Join-Path (Get-Location) ".local-db-root-password"), $rootText, $utf8)
kubectl -n react-dashboard-local create secret generic relayops-db `
  --from-file=password=.local-db-password `
  --from-file=root-password=.local-db-root-password `
  --dry-run=client -o yaml | kubectl apply -f -
Remove-Item .local-db-password, .local-db-root-password
```

Install the chart using the local image tags. Docker Desktop Kubernetes can
consume these when they are present in its image store; if pods report
`ImagePullBackOff`, load the local images into the Kubernetes image store or
build/push them to a registry accessible to the cluster and use those image
references instead.

```powershell
helm upgrade --install relayops-local .\helm\react-app `
  --namespace react-dashboard-local `
  --create-namespace `
  --set image.repository=react-app `
  --set-string image.tag=local `
  --set-string image.digest= `
  --set api.image.repository=relay-api `
  --set-string api.image.tag=local `
  --set-string api.image.digest= `
  --set image.pullPolicy=IfNotPresent `
  --set api.image.pullPolicy=IfNotPresent `
  --set mysql.image.pullPolicy=IfNotPresent `
  --set api.cookieSecure=false
kubectl -n react-dashboard-local rollout status statefulset/react-app-mysql --timeout=5m
kubectl -n react-dashboard-local rollout status deployment/react-app-api --timeout=3m
kubectl -n react-dashboard-local rollout status deployment/react-app --timeout=3m
```

Forward the frontend Service to a local port and open <http://localhost:18080>:

```powershell
kubectl -n react-dashboard-local port-forward service/react-app 18080:80
```

Keep the port-forward command running while using the dashboard, then register
the first user. The frontend Service remains ClusterIP by default; an optional
NodePort is available for clusters that expose node ports to the host. The
local-only `api.cookieSecure=false` override is required because browsers do
not send Secure cookies over HTTP. Do not use that override in production. The
Docker Desktop installation uses a separate namespace and does not replace the
existing `react-app` namespace deployment.

### Argo CD and production requirements

The existing Argo CD Application deploys this chart from Git. On the first
sync, bootstrap the `react-app` namespace and the Sealed Secrets controller
(the `relayops-db` Secret comes from the committed SealedSecret), and provide Docker Hub pull
credentials if either image repository is private. Keep plaintext secrets outside
Git/Helm values. Configure TLS and leave `api.cookieSecure=true` for HTTPS.
CI publishes API images to
`docker.io/<DOCKERHUB_USERNAME>/relay-api` and frontend images to
`docker.io/<DOCKERHUB_USERNAME>/react-app`; configure the corresponding
repository access/secrets before running a deploy workflow.

The bundled MySQL StatefulSet is a single-node convenience for local
development and small non-critical installations, not a managed database:
production requires supported persistent storage, tested backups/restores,
monitoring, upgrades, and secret rotation. Use a managed MySQL service for
production where feasible, and review NetworkPolicy support in the selected
CNI. Its PVC is intentionally retained when Helm uninstalls the release; remove
it only after confirming backups and that data deletion is intended. Public
self-registration additionally needs abuse controls and account recovery/email
verification before exposure.
