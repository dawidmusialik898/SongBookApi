# 13 - Production Readiness

## Goal

Turn the finished learning application into a deliberately deployable service.
"Production ready" does not mean adding every possible technology. It means
making explicit decisions about hosting, data, security, monitoring, and
failure recovery before real users depend on the application.

Do this only after the local CRUD, authentication, and private song-book
sharing workflows from the earlier guides are complete.
The Development physical-file host, SQLite database, logged email links, local
certificate, and localhost configuration are not a production deployment.

## AI implementation specification

### Status and blocking rule

This stage is **decision-blocked**. An AI model must not implement production
infrastructure or migrate providers by selecting hosting, database, email,
secret, monitoring, and recovery services on the user's behalf.

The first deliverable is a decision record and a provider-specific
implementation plan. Code changes begin only after the user approves it.

### Required decisions

Ask these one at a time, using recommended choices where appropriate:

1. **Hosting target:** which provider/runtime/container environment?
2. **Application database:** SQLite for one durable instance, or managed
   PostgreSQL for multi-instance/managed operation?
3. **Email delivery:** which provider sends confirmation and password-reset
   messages?
4. **Domain and TLS:** which domain owns the trusted certificate?
5. **Data Protection keys:** where are cookie/token encryption keys persisted?
6. **Recovery:** acceptable data-loss window and backup retention?
7. **Monitoring:** who receives health/error alerts?
8. **Delivery:** manual release, provider integration, or CI/CD workflow?

If the user wants a recommended small-app baseline, propose:

```text
one HTTPS origin
ASP.NET Core serves the static client and API
relative client routes under /auth and /songbooks
one durable database selected for the hosting topology
the point-11 ASP.NET Core Identity cookie model retained
the point-12 private song-book ownership and access model retained
production email delivery for confirmation and password reset
managed TLS and secrets
automated backup plus tested restore
health check and structured logs
repeatable deployment from a protected branch
```

This is a proposal, not permission to implement.

### Decision record requirements

Before coding, add a clearly marked decision section to this document with:

```text
deployment provider and topology
public domains/origins
database engine and hosting
confirmation/password-reset email provider
secret storage
Data Protection key storage
backup retention and restore target
monitoring/alert destination
deployment and rollback method
```

Do not store credentials, account identifiers, private domains, or tokens in
the repository.

### Implementation phases after approval

#### Phase A: release configuration

- Package and serve the existing relative `/auth` and `/songbooks` client/API
  routes from the approved same-origin host.
- Keep development configuration working without editing committed source for
  every environment.
- Keep production CORS disabled for the selected same-origin model.
- Add safe production exception handling and consistent `ProblemDetails`.
- Add a health endpoint that does not expose sensitive details.

#### Phase B: durable persistence

- Adapt the point-12 song-book, access, song, and ordered-part schema to the
  approved production database provider.
- Preserve owner, Reader, and Editor authorization data during migration.
- Generate migrations against the chosen provider or maintain a separate
  provider-specific migration assembly. SQLite migrations must not be applied
  unchanged to PostgreSQL or another provider; revalidate mappings such as
  `DateTimeOffset`, indexes, constraints, and cascade behavior.
- Add a controlled migration command.
- Retain integration tests for scoped CRUD, access changes, and persisted part
  array order.
- Configure backups and perform a documented restore test before launch.

#### Phase C: authentication and authorization

- Harden the point-11 ASP.NET Core Identity cookie model for the approved host.
- Keep authentication on all song-book routes.
- Keep Reader, Editor, and owner-only administration checks from point 12.
- Verify unauthenticated (`401`) and unauthorized (`403`) behavior.
- Configure cookies/tokens with secure production settings.
- Retain and test antiforgery protection on every state-changing request.
- Replace the development email logger with the approved email provider.

#### Phase D: static hosting and browser security

- Replace the Development sibling-directory physical file provider with the
  approved packaged production static hosting mechanism.
- Serve a trusted HTTPS certificate and redirect HTTP.
- Add HSTS only after the HTTPS deployment is confirmed.
- Configure Content Security Policy and other relevant security headers.
- Define cache behavior: short/no cache for HTML and versioned caching for
  immutable assets.
- Confirm no frontend file contains a secret.

#### Phase E: release automation

- Build and test both repositories in a repeatable pipeline.
- Run dependency vulnerability scans.
- Apply migrations using the approved deployment strategy.
- Deploy to a staging environment first.
- Run the point-10 CRUD checks plus the point-11 authentication and point-12
  sharing/authorization matrices against staging.
- Define health verification and rollback criteria.

#### Phase F: operations

- Emit structured logs without credentials or unnecessary song content.
- Monitor health, server errors, latency, and database availability.
- When deployed behind a proxy/load balancer, configure forwarded headers with
  an explicit trusted-proxy/network allowlist before using client IPs for rate
  limiting or logs.
- Route alerts to the approved recipient.
- Document backup restore, rollback, credential rotation, and incident steps.

### Production validation gates

The release is blocked unless:

- [ ] `dotnet list package --vulnerable --include-transitive` has no
      unaccepted high/critical issue. The baseline `Microsoft.OpenApi` warning
      must be resolved or explicitly risk-accepted with an upgrade plan.
- [ ] Durable CRUD and migration tests pass.
- [ ] A backup has been restored successfully.
- [ ] Authorization tests prove private book isolation and the full
      Reader/Editor/Admin matrix.
- [ ] Production contains no localhost URL, development certificate, or
      wildcard origin.
- [ ] Secrets come from approved deployment configuration.
- [ ] Staging passes the point-10 CRUD/accessibility, point-11 authentication,
      and point-12 authorization matrices.
- [ ] Health checks, logs, alerts, and rollback have been exercised.

### Validation commands

The exact provider commands belong in the approved file-level plan. At
minimum, every release candidate must run:

From the API repository:

```sh
dotnet build SongBookApi.slnx --configuration Release
dotnet test SongBookApi.slnx --configuration Release
dotnet list src/SongBookApi.Service/SongBookApi.Service.csproj \
  package --vulnerable --include-transitive
```

From the client repository:

```sh
node --check src/main.js
node --check src/httpClient.js
node --check src/authApi.js
node --check src/songBooksApi.js
node --check src/songsApi.js
node --check src/songForm.js
```

It must also run the approved database migration/integration tests, staging
CRUD checks, authentication/authorization checks, health probe, and
provider-specific deployment verification.

### Files in scope

Exact files depend on approved choices. The AI must produce a file-level plan
before editing. Likely areas include:

```text
SongBookApi/src/SongBookApi.Service/Program.cs
SongBookApi/src/SongBookApi.Service/Endpoints/
SongBookApi/src/SongBookApi.Service/appsettings*.json
SongBookApi/src/SongBookApi.Infrastructure/
SongBookApi/src/SongBookApi.Domain/
SongBookClient/src/httpClient.js
SongBookClient/src/authApi.js
SongBookClient/src/songBooksApi.js
SongBookClient/src/songsApi.js
deployment/pipeline files approved by the user
```

### Non-goals

- Do not choose a cloud vendor, database, email provider, domain, or monitoring
  service.
- Do not add Docker, CI workflows, Entity Framework packages, auth packages,
  or infrastructure files speculatively.
- Do not weaken private song-book access or expose unscoped song endpoints.
- Do not call the application production-ready based only on a successful
  build.

## Fixed product decisions

Production planning must retain the decisions from points 11 and 12:

- Same-origin ASP.NET Core Identity cookie authentication.
- Public self-registration with confirmed email before login.
- Private song books.
- One song belongs to one book.
- Creator is sole Admin.
- Collaborators are existing registered users with Reader or Editor access.
- No public reads.
- Song-book names are unique per owner, case-insensitively.

Changing any of these is a separate product-design task, not an infrastructure
choice.

## Recommended deployment shape

For this small application, prefer one public HTTPS origin:

```text
https://songbook.example
  -> static client files
  -> /auth requests handled by Identity endpoints
  -> /songbooks requests handled by scoped repository endpoints
```

With a single origin, the browser does not need CORS for normal application
requests. Keep all client API URLs relative. A split-origin deployment is not
part of the selected cookie/antiforgery architecture and requires a new
security design before implementation.

## Required areas of work

| Area | What needs to change | Why it matters |
| --- | --- | --- |
| Hosting | Replace the Development sibling-directory provider with packaged static assets on the approved host. | Production must not depend on sibling source repositories. |
| Frontend configuration | Preserve relative same-origin routes and remove Development-only paths. | Release configuration must be portable and reproducible. |
| Persistence | Run the point-12 schema on an approved durable production database. | Provider, migration, scaling, and backup behavior must be deliberate. |
| Data protection | Back up the database and practice restoring a backup. | A database without tested restores is not reliable storage. |
| API validation | Preserve request DTOs and server validation for auth, books, access entries, and songs. | Browsers are not the only possible API callers. |
| Identity | Harden the implemented Identity cookies, antiforgery, confirmation, reset, and resource authorization. | Development defaults and logged emails are not production services. |
| Secrets | Put connection strings, signing keys, and credentials in deployment secrets or environment variables. | Source control and frontend JavaScript cannot safely hold secrets. |
| Transport security | Use a trusted HTTPS certificate, redirect HTTP, and enable HSTS only after HTTPS is working. | Protects data and login sessions in transit. |
| Browser security | Keep CORS disabled for same-origin hosting and configure security headers plus an appropriate Content Security Policy. | Reduces cross-origin and script-injection risk. |
| Reliability | Add structured logs, health checks, safe error responses, and monitoring. | Operators need to discover and diagnose failures. |
| Delivery | Add repeatable build, test, migration, and deployment steps. | Manual releases are hard to reproduce and roll back. |

## Frontend changes

### 1. Make API configuration deployable

The client should already use relative `/auth` and `/songbooks` routes. Preserve
that same-origin contract in production rather than introducing an environment
specific absolute URL.

Do not place secrets in `config.js`. A browser user can read every JavaScript
file and every public configuration value.

### 2. Serve static files correctly

Deploy the client as static files through a production web server, a CDN, or
the API host. Configure:

- HTTPS for the public domain.
- Cache headers for versioned CSS and JavaScript assets.
- A non-cached or short-cached HTML entry page so new releases are found.
- A fallback/error page appropriate for the hosting model.

Vanilla JavaScript does not require a bundler to deploy. Minification or asset
fingerprinting can be added later when caching and payload size justify it.

### 3. Keep user feedback safe

Continue showing useful error messages, but never display stack traces,
connection strings, raw exception details, or authorization tokens. Log
technical detail on the server instead.

## API and data changes

### 1. Deploy persistent song-book data

Point 12 already replaces the static dictionary with EF Core persistence.
Choose and configure the production database provider without changing the
ownership or permission model.

Plan these before moving data:

- Existing schema for users, books, access entries, songs, parts, and explicit
  persisted array position.
- Migration process for every deployment.
- Development, staging, and production connection configuration.
- Automated backup schedule.
- Restore procedure and a test restore.

### 2. Stabilize the API contract

Complete the route-ID and part-ID work from document 02. Define separate
request and response DTOs where useful, validate input, and document response
status codes.

Use `ProblemDetails` or another consistent JSON error shape so the client can
handle validation, not-found, conflict, and server errors predictably.

### 3. Preserve authentication and resource authorization

Deploy the point-11 Identity cookie and point-12 resource access model without
weakening it. Confirmed accounts, antiforgery validation, Reader/Editor/Admin
checks, rate limiting, and safe 401/403/404 behavior remain required.

### 4. Harden the service boundary

Add only controls that fit the expected use:

- Rate limiting for public or untrusted traffic.
- Request-size limits for lyrics and other text.
- Secure Identity, antiforgery, and Data Protection settings.
- No production CORS middleware for the selected same-origin deployment.
- Health endpoints for load balancers and monitoring.
- Structured logs with request context but without song text or secrets unless
  there is a justified logging policy.

## Deployment workflow

Create a repeatable release process before the first real deployment:

1. Run client and API tests.
2. Build the API and prepare static client assets.
3. Run database migrations in a controlled step.
4. Deploy to a staging environment with production-like configuration.
5. Exercise the CRUD acceptance script against staging.
6. Confirm logs, health checks, and backup status.
7. Deploy the production release.
8. Verify a basic health endpoint and one authenticated Reader journey.
9. Monitor errors and rollback if the release is unhealthy.

Keep environment values out of source control. A deployment pipeline should
inject them from a protected secret store or hosting configuration.

## Security baseline

Before exposing the application publicly, verify:

- [ ] Production uses a trusted HTTPS certificate.
- [ ] HTTP redirects to HTTPS.
- [ ] Production CORS is disabled for the selected same-origin deployment.
- [ ] No development origins, wildcard CORS, or local certificates are used.
- [ ] All song-book routes require authentication and the intended resource
      permission.
- [ ] Identity confirmation/reset email uses the approved provider.
- [ ] Data Protection keys persist securely across instances/restarts.
- [ ] Database credentials and signing secrets are not committed.
- [ ] Server errors return safe, consistent responses.
- [ ] Dependency vulnerability alerts are reviewed and addressed.
- [ ] Request and authentication logs do not contain secrets.
- [ ] Database backups exist and at least one restore has been tested.

## Alternatives

### Same-origin ASP.NET Core hosting

Host the static client files from the API application or a reverse proxy in
front of it.

- Good for: a small application with one deployment unit and no production
  CORS requirement.
- Trade-off: frontend and API releases are coupled.

### Separate static host and API (not selected)

Host the client on a CDN or static hosting service and the API elsewhere.

- Good for: independent frontend caching and deployment.
- Trade-off: requires production CORS, cross-origin configuration, and more
  deployment coordination.

It also requires a new cookie/antiforgery security design and explicit user
approval before replacing the selected same-origin model.

### Managed platform services

Use a managed database, email service, and hosted application platform while
retaining the selected ASP.NET Core Identity application model.

- Good for: reducing infrastructure maintenance.
- Trade-off: platform costs, vendor-specific configuration, and a learning
  curve.

### Private deployment

Deploy only within a trusted network or VPN.

- Good for: a small group with controlled access.
- Trade-off: network restrictions do not replace application authorization,
  backups, or safe data handling.

## Resources

- [Microsoft: ASP.NET Core deployment overview](https://learn.microsoft.com/aspnet/core/host-and-deploy/)
- [Microsoft: ASP.NET Core configuration](https://learn.microsoft.com/aspnet/core/fundamentals/configuration/)
- [Microsoft: ASP.NET Core authentication and authorization](https://learn.microsoft.com/aspnet/core/security/authentication/)
- [Microsoft: ASP.NET Core health checks](https://learn.microsoft.com/aspnet/core/host-and-deploy/health-checks)
- [Microsoft: ASP.NET Core rate limiting](https://learn.microsoft.com/aspnet/core/performance/rate-limit)
- [OWASP: Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP: Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [MDN: HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)

## Checkpoint

This point is complete when the application has a documented production
architecture, durable and recoverable private song-book storage, production
email/session protection, enforced Reader/Editor/Admin isolation,
environment-specific configuration, a repeatable deployment process, and
enough monitoring to discover a failure before users report it.
