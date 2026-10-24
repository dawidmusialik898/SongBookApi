#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
client_root="$repo_root/client"
output="${1:-$repo_root/artifacts/release-$(date -u +%Y%m%dT%H%M%SZ)}"

if [[ -e "$output" || -L "$output" ]]; then
    printf 'Release directory already exists: %s\n' "$output" >&2
    exit 1
fi
if [[ ! -f "$client_root/index.html" ||
      ! -d "$client_root/src" ||
      ! -d "$client_root/styles" ]]; then
    printf 'The client/ directory must contain index.html, src/, and styles/.\n' >&2
    exit 1
fi
if [[ -L "$client_root/index.html" ||
      -L "$client_root/src" ||
      -L "$client_root/styles" ||
      -n "$(find "$client_root/src" "$client_root/styles" -type l -print -quit)" ]]; then
    printf 'Client assets must not contain symbolic links.\n' >&2
    exit 1
fi

dotnet publish "$repo_root/server/src/SongBookApi.Service/SongBookApi.Service.csproj" \
    --configuration Release --output "$output"
mkdir -p -- "$output/wwwroot"
cp -- "$client_root/index.html" "$output/wwwroot/index.html"
cp -R -- "$client_root/src" "$client_root/styles" "$output/wwwroot/"

if [[ -f "$output/appsettings.Development.json" ]]; then
    rm -- "$output/appsettings.Development.json"
fi

chmod -R go-w,go+rX -- "$output"
printf 'Published SongBook API and client to %s\n' "$output"
