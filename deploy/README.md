# Self-hosted SongBook: Ubuntu/Debian

This is a best-effort, single-instance hobby deployment. The ASP.NET Core
service serves the packaged `client/` files and API on one origin;
Caddy terminates HTTPS and forwards to Kestrel on `127.0.0.1:5080`.
The operator supplies the machine, router configuration, a DuckDNS name, a
dedicated Gmail sender, and a second machine for encrypted backups. Nothing
here provisions those accounts or uploads credentials.

Do not publish real user data until HTTPS, mail, authorization, backup restore,
and external monitoring have been checked. Keep the host patched and restrict
SSH to your LAN or a VPN; only ports 80 and 443 need internet forwarding.

## 1. Build a release on the development machine

From the `SongBookApi` monorepo root, install the .NET 10 SDK and Node.js,
review/commit the changes you intend to deploy, then run:

```sh
cd client
node --test tests/unit/*.test.mjs tests/integration/*.test.mjs tests/functional/*.test.mjs
cd ..
dotnet test server/SongBookApi.slnx
dotnet list server/src/SongBookApi.Service/SongBookApi.Service.csproj package --vulnerable --include-transitive
./deploy/publish.sh
```

The publish script prints a unique directory under `artifacts/`.
It includes `wwwroot/index.html`, `wwwroot/src/`, and `wwwroot/styles/`, and
excludes the Development settings file. There is no npm build or separate
client checkout. Do not deploy if a high/critical
dependency advisory remains unresolved or unapproved.

## 2. Prepare the host and public name

Use a current Ubuntu/Debian release with systemd credentials, the ASP.NET
Core **10 runtime**, Caddy, `sqlite3`, `restic`, `curl`, `rsync`, OpenSSH, and
`flock` (from `util-linux`). Install the runtime and Caddy using their
[official .NET Linux instructions](https://learn.microsoft.com/dotnet/core/install/linux)
and [Caddy Debian/Ubuntu instructions](https://caddyserver.com/docs/install#debian-ubuntu-raspbian).
The host does not need the .NET SDK. Install the remaining packages and
confirm that `dotnet --list-runtimes` includes `Microsoft.AspNetCore.App 10`:

```sh
sudo apt update
sudo apt install sqlite3 restic curl rsync openssh-client util-linux
dotnet --list-runtimes
```

Use SSH from the development machine over your LAN or a VPN for deployment;
do not forward port 22 to the internet. Check IPv6 firewall rules too.

Create a free DuckDNS subdomain. Ensure its A record resolves to the router's
public address, forward TCP 80/443 to this host, and permit those ports through
the host firewall. Verify reachability from outside the home network. If your
ISP uses CGNAT or blocks those ports, this design cannot obtain a public
certificate; choose a different ingress rather than exposing Kestrel directly.

Create a dedicated Gmail account, enable 2-Step Verification, and generate an
app password. This is a low-volume hobby sender; Google's sending limits and
delivery are not guaranteed. Its email address must be used for both SMTP
login and `FromAddress`.

On the host, create a service user and persistent directories:

```sh
sudo useradd --system --user-group --home-dir /var/lib/songbook --no-create-home \
  --shell /usr/sbin/nologin songbook
sudo install -d -o songbook -g songbook -m 0700 \
  /var/lib/songbook /var/lib/songbook/keys /var/lib/songbook/.ssh
sudo install -d -o root -g root -m 0755 /etc/songbook /usr/local/libexec/songbook
sudo install -d -o root -g root -m 0700 /etc/songbook/secrets
sudo install -d -o "$USER" -g "$(id -gn)" -m 0755 /opt/songbook/releases
```

Use these once-only commands only after checking that the named users and
directories do not already exist; adapt ownership for an existing host.
`/var/lib/songbook` is not part of a release and must survive deployments.

## 3. Install host configuration (never commit filled-in values)

From the development machine (while in `SongBookApi`), copy the templates to
the host; they contain no filled-in secrets:

```sh
rsync -a deploy/ HOST_USER@HOME_HOST:/tmp/songbook-deploy/
```

On the host, install the units, scripts, and **unpopulated** settings:

```sh
sudo install -m 0644 /tmp/songbook-deploy/*.service \
  /tmp/songbook-deploy/*.timer /etc/systemd/system/
sudo install -m 0755 /tmp/songbook-deploy/backup.sh \
  /tmp/songbook-deploy/duckdns-update.sh /usr/local/libexec/songbook/
sudo install -m 0600 /tmp/songbook-deploy/songbook.env.example \
  /etc/songbook/songbook.env
sudo install -m 0600 /tmp/songbook-deploy/backup.env.example \
  /etc/songbook/backup.env
sudoedit /etc/songbook/songbook.env /etc/songbook/backup.env
sudo systemctl daemon-reload
```

Run the `install` commands for the environment files **only once**: rerunning
them would overwrite your populated host settings with placeholders. The
scripts and unit files can be updated separately after reviewing new
releases. Do not install `publish.sh` on the host or copy filled-in host
settings back to a checkout. Replace **every** placeholder locally:

- `AllowedHosts`: the exact DuckDNS hostname, without scheme or wildcard.
- `AccountLinks__PublicOrigin`: `https://` followed by that hostname, without
  a path. Confirmation/reset links use this setting, never a request header.
- `Moderation__BootstrapSuperUserEmail`: an email address you control. After
  starting the service, register and confirm this account before signing in
  to manage users; no arbitrary first registrant is given privileges.
- `ConnectionStrings__SongBookConnection`: the persistent SQLite path already
  shown in the template. Start with a fresh database, not Development data.
- `DataProtection__KeyDirectory`: the protected key directory above. Protect
  this directory like credentials; cookie/reset tokens depend on its keys.
- `Backup__SuccessMarkerPath`: the path written only after a successful remote
  backup and integrity check.
- `Email__Smtp__UserName` and `FromAddress`: the dedicated Gmail address.
- `RESTIC_REPOSITORY`: a dedicated SFTP directory on the **second** machine.
  Create a backup-only user and a private directory there, enable its SFTP
  service, and confirm this host can reach it. Use storage independent of
  the app host's disk.

Create root-owned, mode `0600` files in `/etc/songbook/secrets/` for
`gmail-app-password`, `restic-password`, `backup-ssh-key`, and
`duckdns-curl.conf`. Enter the values on the host, not in shell history, chat,
repository files, or the release artifact. The DuckDNS curl file contains:

```text
url = "https://www.duckdns.org/update?domains=YOUR-SUBDOMAIN&token=YOUR-TOKEN"
```

Generate an SSH key dedicated to the second machine, authorize its **public**
key for that machine's backup user, and save its verified SSH host key in
`/var/lib/songbook/.ssh/known_hosts` (owned by `songbook`). Verify the host-key
fingerprint through a trusted channel; do not automatically accept an
unverified key. Keep the restic password somewhere safe **outside** both
machines as well; losing it makes backups unrecoverable.

Add the site block from `Caddyfile.example` to `/etc/caddy/Caddyfile` with
your real hostname. Preserve any existing sites; do not log account-link
query strings in a reverse-proxy access log. Then:

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

## 4. Initialize storage and start the site

From the development machine, upload the directory printed by `publish.sh`
to a **new** `/opt/songbook/releases/RELEASE_NAME/` on the host using SSH/rsync.
The login user owns `/opt/songbook/releases/`; the unprivileged `songbook`
user needs only read access to releases. Replace `RELEASE_NAME` in the commands
below with the published directory's basename (for example,
`release-20260930T173234Z`). From `SongBookApi`:

```sh
rsync -a artifacts/RELEASE_NAME/ \
  HOST_USER@HOME_HOST:/opt/songbook/releases/RELEASE_NAME/
```

The publish script makes release files readable by the service user even if
the build machine uses a restrictive umask. Upload to a new directory; never
rsync an in-progress build over `/opt/songbook/current`.

On the host:

```sh
sudo systemctl start duckdns-update.service
sudo systemctl enable --now duckdns-update.timer
sudo systemctl start songbook-backup@init.service
sudo ln -sfnT /opt/songbook/releases/RELEASE_NAME /opt/songbook/current
sudo systemctl start songbook-migrate.service
sudo systemctl enable --now songbook.service
```

The first `/health` check deliberately returns `503` until an off-host backup
has completed. Once the site is reachable through Caddy, generate an initial
key ring and verify the API responds:

```sh
curl --fail --silent --show-error --output /dev/null \
  https://YOUR-SUBDOMAIN.duckdns.org/auth/antiforgery
```

The response contains a sensitive antiforgery token, suppressed above: do not
share it. Check that `/var/lib/songbook/keys/` contains a `key-*.xml` file,
then complete the initial backup:

```sh
sudo systemctl start songbook-backup@backup.service
sudo systemctl start songbook-backup@restore-check.service
sudo systemctl enable --now songbook-backup.timer
```

Initialize the restic repository **once**, after SSH access to the second
machine is working. If it already exists, skip `@init`. `@restore-check`
restores the latest database and Data Protection keys into a new protected
`/var/lib/songbook/backup-staging/restore-check.*` directory and verifies
the SQLite copy. Read its exact location with
`journalctl -u songbook-backup@restore-check.service --no-pager`; inspect it,
then remove only that specific test directory. Never overwrite the live
database while the service is running.

The backup timer runs at midnight and noon, retains snapshots within 30 days,
and writes `last-backup-success` only after off-host backup, pruning, and
repository checks succeed. `/health` returns `503` if the database is absent,
migrations are pending, or that marker is more than 24 hours old.

Check locally and from another network:

```sh
systemctl --no-pager status songbook.service songbook-backup.timer duckdns-update.timer
curl --head http://YOUR-SUBDOMAIN.duckdns.org/
curl --fail https://YOUR-SUBDOMAIN.duckdns.org/health
curl --fail https://YOUR-SUBDOMAIN.duckdns.org/
```

The HTTP request must redirect to HTTPS with the trusted public hostname.
Check that `/src/main.js` and `/styles/app.css` load, and verify in a browser:
registration email, confirmation, login, book/song CRUD, Reader/Editor/Admin
isolation, password reset, and the SuperUser's **Manage users** view. Confirm
that a Moderator cannot grant roles or act on other moderators, and that a
banned account cannot sign in. The app should not expose
`/appsettings.json` or other source files. After trusted HTTPS works, change
`Security__HstsEnabled` to `true` in `/etc/songbook/songbook.env` and restart
`songbook.service`. Add the public `/health` URL to a free UptimeRobot monitor
and send alerts to your operator mailbox. The service logs to the systemd
journal; never paste tokens, credentials, or complete account links into
public issue reports. Entry HTML is served with `Cache-Control: no-store`,
unversioned CSS/JavaScript with `no-cache`, and all Production responses with
`Referrer-Policy: no-referrer` to avoid sending account-link query tokens as
referrers.

## 5. Release, recover, and operate

For each update, publish to a **new** release directory, upload it, then:

```sh
sudo systemctl stop songbook.service &&
sudo systemctl start songbook-backup@backup.service &&
sudo ln -sfnT /opt/songbook/releases/NEW_RELEASE_NAME /opt/songbook/current &&
sudo systemctl start songbook-migrate.service &&
sudo systemctl start songbook.service &&
curl --fail https://YOUR-SUBDOMAIN.duckdns.org/health
```

Stop and investigate on any failure; never migrate after a failed pre-release
backup. Save the previous release path before changing the symlink. If the new
version fails **without a schema change**, stop the service and point
`current` to the previous release. If a schema migration changed the
database, first restore its matching pre-migration database **and key ring**
from restic to an isolated directory, verify it, then restore those files
while the service is stopped. Do not assume an older binary works with a
newer schema. Practice this procedure before relying on the site.

Watch `journalctl -u songbook.service` and the backup/duckdns unit logs for
failures. Rotate the Gmail app password, SSH key, and restic password through
the host's protected files as needed. Keep a separate, offline copy of the
restic password and consider an offline backup: a compromised host can delete
its online off-host repository. Home power, ISP, free DNS, and Gmail outages
remain availability risks outside the application's control.
