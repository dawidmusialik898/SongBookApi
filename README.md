# SongBook

One repository contains the ASP.NET Core API and its vanilla JavaScript
client. The backend serves the client and API on the same origin; there is no
separate frontend server or npm build.

```text
client/   Browser assets, Node tests, and the original learning plan
server/   .NET solution, API source, tests, and API documentation
deploy/   Release packaging and optional self-hosted deployment templates
```

## Run locally

Install the .NET 10 SDK. From the repository root:

```sh
dotnet dev-certs https --trust
dotnet run --project server/src/SongBookApi.Service/SongBookApi.Service.csproj \
  --launch-profile https
```

Open `https://localhost:7152/`. In Development, the backend serves the
files in `client/`, applies database migrations at startup, and writes email
confirmation/reset links to its terminal.

## Check and publish

With Node.js and the .NET SDK available, run from the repository root:

```sh
dotnet test server/SongBookApi.slnx
node --test client/tests/unit/*.test.mjs \
  client/tests/integration/*.test.mjs \
  client/tests/functional/*.test.mjs
./deploy/publish.sh
```

The publish command creates an ignored directory under `artifacts/` with
the API and only `client/index.html`, `client/src/`, and `client/styles/`
packaged as public assets. See [the deployment guide](deploy/README.md)
before hosting for real users, and [the API README](server/README.md) for
routes, authentication, and persistence details. The client learning plan in
`client/docs/` records earlier stages when client and server lived in
separate repositories.
