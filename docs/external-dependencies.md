# External dependencies

Snapshot: 2026-09-30. This inventory covers this monorepo's `client/`,
`server/`, and `deploy/` directories, including the current working tree.
`deploy/publish.sh` packages **this repository's** `client/` assets with the
API; no separate client checkout is required. The self-hosting design is
approved and locally rehearsed, **not verified on a public host**. Production
services below are requirements of that design, not claims that accounts or
machines have been provisioned.

## Browser client

There is no `package.json`, npm dependency, framework, bundler, CDN asset,
external font, analytics SDK, or third-party browser script. `client/index.html`
loads only local CSS and `client/src/main.js`; its imports, including pagination,
are local ES modules. The browser uses built-in DOM/Fetch APIs. Client tests use
built-in Node modules (`node:test`, `node:assert`, `node:fs`) and a local fake
browser, not an installed test framework.

The client's **required network dependency** is the same-origin SongBook API:
`/auth/*` (including `/auth/antiforgery` for mutations), `/songbooks/*`
(including nested songs and collaborators), and `/admin/users/*`. All requests
go through `client/src/httpClient.js` with same-origin cookies. There is no
direct client connection to Gmail, DuckDNS, the database, or another remote
API. Removing the SongBook API would require replacing authentication,
persistence, authorization, and these HTTP contracts, not merely changing a
URL.

## Direct NuGet dependencies

These are all 16 declared `PackageReference` entries in the four
`server/**/*.csproj` files: 15 distinct package IDs because the test project
also references `Microsoft.EntityFrameworkCore.Sqlite`. Projects target
`net10.0`; the ASP.NET Core/.NET shared frameworks are platform requirements,
not individually declared NuGet packages.

| Project | Package (version) | Purpose / removal assessment |
| --- | --- | --- |
| Domain | `Microsoft.Extensions.Logging.Abstractions` 10.0.10 | `SongService` uses `ILogger`; remove only by refactoring logging across the service boundary. Little benefit. |
| Infrastructure | `Microsoft.AspNetCore.Identity.EntityFrameworkCore` 10.0.10 | Identity users, roles, password hashes, and EF stores. Keep the selected cookie/confirmation model. |
| Infrastructure, Tests | `Microsoft.EntityFrameworkCore.Sqlite` 10.0.10 | Persistent application database and SQLite integration tests. Another provider needs new migrations, code, tests, and backup operations. |
| Infrastructure | `SQLitePCLRaw.bundle_e_sqlite3` 2.1.13 | Pins the embedded SQLite/native bundle above EF Core SQLite's 2.1.11 dependency. Do not drop without checking the resolved native version and advisories. |
| Service | `MailKit` 4.18.1 | TLS SMTP and MIME confirmation/reset emails; replace only alongside a tested sender implementation. |
| Service | `Microsoft.AspNetCore.OpenApi` 10.0.10 | Registers and maps a **Development-only** OpenAPI endpoint. Optional if nobody consumes the schema. |
| Service | `Microsoft.EntityFrameworkCore.Design` 10.0.10 | Design-time migration support, with `PrivateAssets=all`. Keep while using EF migrations; not an application feature. |
| Service | `Microsoft.OpenApi` 2.7.5 | Pins the OpenAPI dependency above `Microsoft.AspNetCore.OpenApi`'s 2.0.0 minimum. Remove with OpenAPI support, or confirm a safe transitive resolution before dropping just this pin. |
| Service | `QuestPDF` 2026.9.1 | Generates server-side song-book PDFs, including chorded lyrics; the Community license is free for eligible individual/open-source projects, but commercial deployment must check license eligibility. Keep until PDF generation is replaced. |
| Tests | `coverlet.collector` 10.0.1 | Optional coverage collection; candidate for removal if coverage is not used. |
| Tests | `Microsoft.AspNetCore.Mvc.Testing` 10.0.10 | `WebApplicationFactory` API integration tests. Keep. |
| Tests | `Microsoft.NET.Test.Sdk` 18.8.1 | `dotnet test` host/discovery. Keep with the current test runner. |
| Tests | `PdfPig` 0.1.16 | Extracts generated PDF text in tests to verify song selection and chord inclusion/exclusion; no runtime dependency. |
| Tests | `xunit` 2.9.3 | Assertion/test framework. Keep unless rewriting tests. |
| Tests | `xunit.runner.visualstudio` 3.1.5 | xUnit discovery and execution through the current test tooling. Keep. |

### Resolved transitive NuGet packages

The local `dotnet list server/SongBookApi.slnx package --include-transitive
--no-restore --format json` result has **89 distinct package IDs**: the 15
direct IDs above and the following **74 transitive IDs**. `Main/build` means
present in at least one non-test project's restore graph; it does **not** mean
every entry is shipped in the production publish (EF design tooling, for
example, is build-time). `Test-only` means absent from the non-test project
graphs. Versions are resolved snapshots, **not locked**: there is no committed
NuGet lock file.

Main/build graph (48):

```text
BouncyCastle.Cryptography@2.7.0
Humanizer.Core@2.14.1
Microsoft.AspNetCore.Cryptography.Internal@10.0.10
Microsoft.AspNetCore.Cryptography.KeyDerivation@10.0.10
Microsoft.Build.Framework@18.0.2
Microsoft.CodeAnalysis.Analyzers@3.11.0
Microsoft.CodeAnalysis.Common@5.0.0
Microsoft.CodeAnalysis.CSharp@5.0.0
Microsoft.CodeAnalysis.CSharp.Workspaces@5.0.0
Microsoft.CodeAnalysis.Workspaces.Common@5.0.0
Microsoft.CodeAnalysis.Workspaces.MSBuild@5.0.0
Microsoft.Data.Sqlite.Core@10.0.10
Microsoft.EntityFrameworkCore@10.0.10
Microsoft.EntityFrameworkCore.Abstractions@10.0.10
Microsoft.EntityFrameworkCore.Analyzers@10.0.10
Microsoft.EntityFrameworkCore.Relational@10.0.10
Microsoft.EntityFrameworkCore.Sqlite.Core@10.0.10
Microsoft.Extensions.Caching.Abstractions@10.0.10
Microsoft.Extensions.Caching.Memory@10.0.10
Microsoft.Extensions.Configuration@10.0.10
Microsoft.Extensions.Configuration.Abstractions@10.0.10
Microsoft.Extensions.Configuration.Binder@10.0.10
Microsoft.Extensions.DependencyInjection@10.0.10
Microsoft.Extensions.DependencyInjection.Abstractions@10.0.10
Microsoft.Extensions.DependencyModel@10.0.10
Microsoft.Extensions.Diagnostics@10.0.10
Microsoft.Extensions.Diagnostics.Abstractions@10.0.10
Microsoft.Extensions.Identity.Core@10.0.10
Microsoft.Extensions.Identity.Stores@10.0.10
Microsoft.Extensions.Logging@10.0.10
Microsoft.Extensions.Options@10.0.10
Microsoft.Extensions.Options.ConfigurationExtensions@10.0.10
Microsoft.Extensions.Primitives@10.0.10
Microsoft.VisualStudio.SolutionPersistence@1.0.52
MimeKit@4.18.1
Mono.TextTemplating@3.0.0
Newtonsoft.Json@13.0.3
SQLitePCLRaw.core@2.1.13
SQLitePCLRaw.lib.e_sqlite3@2.1.13
SQLitePCLRaw.provider.e_sqlite3@2.1.13
System.CodeDom@6.0.0
System.Composition@9.0.0
System.Composition.AttributedModel@9.0.0
System.Composition.Convention@9.0.0
System.Composition.Hosting@9.0.0
System.Composition.Runtime@9.0.0
System.Composition.TypedParts@9.0.0
System.Security.Cryptography.Pkcs@10.0.0
```

Test-only graph (26):

```text
Microsoft.AspNetCore.TestHost@10.0.10
Microsoft.CodeCoverage@18.8.1
Microsoft.Extensions.Configuration.CommandLine@10.0.10
Microsoft.Extensions.Configuration.EnvironmentVariables@10.0.10
Microsoft.Extensions.Configuration.FileExtensions@10.0.10
Microsoft.Extensions.Configuration.Json@10.0.10
Microsoft.Extensions.Configuration.UserSecrets@10.0.10
Microsoft.Extensions.FileProviders.Abstractions@10.0.10
Microsoft.Extensions.FileProviders.Physical@10.0.10
Microsoft.Extensions.FileSystemGlobbing@10.0.10
Microsoft.Extensions.Hosting@10.0.10
Microsoft.Extensions.Hosting.Abstractions@10.0.10
Microsoft.Extensions.Logging.Configuration@10.0.10
Microsoft.Extensions.Logging.Console@10.0.10
Microsoft.Extensions.Logging.Debug@10.0.10
Microsoft.Extensions.Logging.EventLog@10.0.10
Microsoft.Extensions.Logging.EventSource@10.0.10
Microsoft.TestPlatform.ObjectModel@18.8.1
Microsoft.TestPlatform.TestHost@18.8.1
System.Diagnostics.EventLog@10.0.10
xunit.abstractions@2.0.3
xunit.analyzers@1.18.0
xunit.assert@2.9.3
xunit.core@2.9.3
xunit.extensibility.core@2.9.3
xunit.extensibility.execution@2.9.3
```

Transitives include build/test tooling and must not all be characterized as
production runtime libraries. To refresh the snapshot after package changes:

```sh
dotnet restore server/SongBookApi.slnx
dotnet list server/SongBookApi.slnx package --include-transitive --no-restore
dotnet list server/SongBookApi.slnx package --vulnerable --include-transitive
```

A fresh NuGet restore needs a package source (normally NuGet.org or a mirror),
but the running site does not. OS package transitive dependencies and
individual .NET shared-framework assemblies are outside this NuGet list.

## Services, infrastructure, and tools

| Dependency / status | Used for | Replace or remove? |
| --- | --- | --- |
| Ubuntu/Debian host, .NET 10 ASP.NET Core runtime, systemd (approved deployment) | One API/client process; systemd units, timers, journal, and credentials. `fonts-dejavu-core` supplies a monospaced font for chorded PDFs. The .NET **SDK** is needed to build on the development machine, not on the host. | A managed host could replace the OS/process/secret integration, but requires new deployment, persistence, and proxy configuration. Cannot remove the server runtime without a rewrite. |
| Local SQLite file and protected ASP.NET Core Data Protection key directory | Durable users/books/songs, sessions and token keys. Both must survive releases and be restored together. | Not remote services. PostgreSQL/managed storage would add an external service and require provider-specific migrations, connection, backups, and single/multi-instance review; not a simplification here. |
| Gmail authenticated TLS SMTP (approved; real delivery pending) | Confirmation and password-reset messages via `SmtpAccountEmailSender`. Development logs links instead. | Can switch to another SMTP provider with configuration; using an HTTPS mail API could replace `MailKit`/MIME libraries with `HttpClient` plus new sender, error handling, and tests, but introduces provider/API coupling. Do not drop email while confirmed sign-in and recovery are required. |
| DuckDNS and its updater (approved; public setup pending) | Dynamic public DNS, updated by a systemd timer and `curl`. | Replace with another domain/DNS provider and update mechanism or a stable IP with an ordinary DNS record; the public hostname in certificates and account links remains necessary. |
| Caddy and a public ACME certificate issuer (approved; public TLS pending) | TLS termination, automatic certificate renewal, proxy to loopback Kestrel; router/ISP must allow public 80/443. | Replace with managed TLS or another maintained reverse proxy/certificate workflow, not plaintext HTTP or an exposed Kestrel port. Home power, ISP, and router availability remain external constraints. |
| Second machine with SSH/SFTP, `restic`, and `sqlite3` CLI (approved; only local restore rehearsal done) | Twice-daily consistent SQLite snapshots plus keys, encrypted off-host retention/restore, integrity checks, and `/health` backup-age marker. | Can use another independent off-site backup target/provider or implement an equivalent backup/restore process. Do not remove off-host storage, consistency, encryption, keys, retention, or restore checks merely to save a tool. |
| UptimeRobot and an operator alert mailbox (approved; external alert pending) | Independent public `/health` check and outage alerts. | Replace with another **external** checker/alert route; an on-host check alone cannot detect loss of public reachability. |
| `bash`, `curl`, `rsync`, OpenSSH, `flock`/`util-linux`, `sqlite3`, `restic` (deployment tools) | DuckDNS update, release transfer, SSH/SFTP transport, serialized backups, SQLite backup/check, retention/restore. See `deploy/`. | No frontend/runtime package manager uses these. Tools can change with the deployment/backup approach; avoid reimplementing reliable backups for a marginal dependency reduction. |
| Node.js (development only), optional `dotnet-ef` CLI, optional PowerShell `pwsh` | Built-in client tests; authoring/listing EF migrations; `server/utils/simpleCurl.ps1` smoke script, respectively. | None is needed on the production host. Keep Node for the current tests; install `dotnet-ef` only when working on migrations; PowerShell is optional. |
| Globally installed `lite-server` (historical only) | Older split-origin instructions in the client learning plan. Current Development serves client and API from ASP.NET Core HTTPS. | Already unnecessary for the current workflow; do not add it to a package manifest or deploy it. |

There is no configured Docker/container service, third-party authentication
provider, managed database, cloud file store, payment service, CDN, or CI/CD
service in the current application/deployment templates. Manual SSH releases
do not require a GitHub Actions runner.

## Practical reduction order

1. **Low risk:** Retire the old `lite-server` workflow. If coverage reports are
   not used, remove the tests-only `coverlet.collector` reference; this loses
   coverage collection, not test execution. `Microsoft.CodeCoverage` is also
   brought in by `Microsoft.NET.Test.Sdk` and would remain.
2. **Small change, conditional:** If the Development OpenAPI schema has no
   consumer, remove `AddOpenApi`/`MapOpenApi` from
   `server/src/SongBookApi.Service/Program.cs` and remove both OpenAPI
   references. Keeping only `Microsoft.AspNetCore.OpenApi` while removing the
   `Microsoft.OpenApi` pin would allow an older resolved dependency: review
   advisories and restore output first.
3. **More implementation:** Change email provider without changing the
   registration/recovery contract. Another SMTP service removes the Gmail
   dependency but retains `MailKit`; an HTTPS sender can remove that package
   chain but adds provider-specific code and a new external API. Likewise,
   another DNS/monitoring/backup provider may reduce a particular vendor
   dependency, not the underlying need for TLS, alerting, and off-host
   recovery.
4. **Keep for this design:** Identity, EF Core/SQLite, the patched native
   SQLite bundle, migration tooling, authentication/antiforgery, persistent
   keys, and the current test runner serve necessary behavior. In particular,
   EF Core SQLite currently asks for `SQLitePCLRaw.bundle_e_sqlite3` 2.1.11;
   the explicit 2.1.13 pin must not be removed without a safe replacement.

There is no committed NuGet lock file. If exact transitive versions matter for
repeatable releases, consider a lock file here while still updating and
scanning dependencies regularly.
