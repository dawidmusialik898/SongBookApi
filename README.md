# SongBook

One repository contains the ASP.NET Core API and its vanilla JavaScript
client. The backend serves the client and API on the same origin; there is no
separate frontend server or npm build.
Song books, songs, collaborators, and managed users load in 50-item pages;
song lists contain summaries rather than full lyrics.
Song parts can also carry optional guitar chords anchored above individual
lyric characters; the song view can show or hide them without changing the
lyrics.
Owners can save whole-book or selected-song PDFs with or without chords.
Anyone with read access can download saved PDFs and see when a book change
has made an export outdated.

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
before hosting for real users, [the API README](server/README.md) for
routes, authentication, and persistence details, and
[the external dependency inventory](docs/external-dependencies.md) for
packages, services, and reduction options. The client learning plan in
`client/docs/` records earlier stages when client and server lived in
separate repositories.
