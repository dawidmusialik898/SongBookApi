#!/usr/bin/env bash
set -euo pipefail

config="${CREDENTIALS_DIRECTORY:?A systemd credential directory is required}/duckdns-curl.conf"
response="$(curl --silent --show-error --fail --config "$config")"
if [[ "$response" != "OK" ]]; then
    printf 'DuckDNS did not confirm the IP address update.\n' >&2
    exit 1
fi
