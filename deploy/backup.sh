#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${CREDENTIALS_DIRECTORY:?A systemd credential directory is required}"
: "${RESTIC_REPOSITORY:?An off-host restic repository is required}"
if [[ "$RESTIC_REPOSITORY" != sftp:* ]]; then
    printf 'RESTIC_REPOSITORY must point to an off-host SFTP repository.\n' >&2
    exit 1
fi

state_dir="${SONGBOOK_STATE_DIR:-/var/lib/songbook}"
if [[ "$state_dir" != /* || ! -d "$state_dir" ]]; then
    printf 'SONGBOOK_STATE_DIR must be an existing absolute directory.\n' >&2
    exit 1
fi

export RESTIC_PASSWORD_FILE="$CREDENTIALS_DIRECTORY/restic-password"
restic_args=(
    -o "sftp.args=-i $CREDENTIALS_DIRECTORY/backup-ssh-key -o IdentitiesOnly=yes -o UserKnownHostsFile=$state_dir/.ssh/known_hosts -o StrictHostKeyChecking=yes"
)

case "${1:-backup}" in
    init|--init)
        restic "${restic_args[@]}" init
        exit
        ;;
    check|--check)
        restic "${restic_args[@]}" check
        exit
        ;;
    restore-check|--restore-check)
        install -d -m 0700 -- "$state_dir/backup-staging"
        restore_root="$(mktemp -d "$state_dir/backup-staging/restore-check.XXXXXXXX")"
        restic "${restic_args[@]}" restore latest --tag songbook --target "$restore_root"
        restored_database="$restore_root$state_dir/backup-staging/songbook.db"
        restored_keys="$restore_root$state_dir/keys"
        if [[ ! -f "$restored_database" ||
              ! -d "$restored_keys" ||
              -z "$(find "$restored_keys" -name 'key-*.xml' -type f -print -quit)" ||
              "$(sqlite3 "$restored_database" 'PRAGMA integrity_check;')" != "ok" ]]; then
            printf 'The restored database or Data Protection keys failed verification in %s\n' \
                "$restore_root" >&2
            exit 1
        fi
        printf 'Verified restored database and keys in %s\n' "$restore_root"
        exit
        ;;
    backup)
        ;;
    *)
        printf 'Usage: backup.sh [backup|init|check|restore-check]\n' >&2
        exit 2
        ;;
esac

database="$state_dir/songbook.db"
keys="$state_dir/keys"
if [[ ! -f "$database" || ! -d "$keys" ]]; then
    printf 'The SongBook database and Data Protection keys must exist before backup.\n' >&2
    exit 1
fi
if [[ -z "$(find "$keys" -maxdepth 1 -name 'key-*.xml' -type f -print -quit)" ]]; then
    printf 'No Data Protection keys exist yet; start the API and request /auth/antiforgery first.\n' >&2
    exit 1
fi

install -d -m 0700 -- "$state_dir/backup-staging"
snapshot="$state_dir/backup-staging/songbook.db"
exec 9>"$state_dir/backup.lock"
if ! flock -n 9; then
    printf 'A SongBook backup is already running.\n' >&2
    exit 1
fi

trap 'rm -f -- "$snapshot"' EXIT
rm -f -- "$snapshot"
sqlite3 -cmd '.timeout 5000' "$database" ".backup '$snapshot'"
if [[ "$(sqlite3 "$snapshot" 'PRAGMA integrity_check;')" != "ok" ]]; then
    printf 'The SQLite backup failed its integrity check.\n' >&2
    exit 1
fi

restic "${restic_args[@]}" backup --tag songbook "$snapshot" "$keys"
restic "${restic_args[@]}" forget --tag songbook --group-by host,tags \
    --keep-within 30d --prune
restic "${restic_args[@]}" check
touch -- "$state_dir/last-backup-success"
