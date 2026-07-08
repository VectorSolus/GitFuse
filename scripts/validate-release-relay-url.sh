#!/bin/sh
set -eu

url="${1:-${GITFUSE_RELEASE_RELAY_URL:-}}"

fail() {
  printf '%s\n' "release relay URL invalid: $*" >&2
  exit 1
}

[ "$url" ] || fail "empty"

case "$url" in
  https://*) ;;
  *) fail "must use HTTPS" ;;
esac

host="$(printf '%s\n' "$url" | sed -n 's#^https://\([^/:]*\).*#\1#p')"
[ "$host" ] || fail "missing host"

case "$host" in
  localhost | 127.0.0.1 | ::1 | *.local | *.test) fail "development host $host is not allowed" ;;
esac

case "$host" in
  10.* | 192.168.* | 172.16.* | 172.17.* | 172.18.* | 172.19.* | 172.20.* | 172.21.* | 172.22.* | 172.23.* | 172.24.* | 172.25.* | 172.26.* | 172.27.* | 172.28.* | 172.29.* | 172.30.* | 172.31.*)
    fail "private network host $host is not allowed"
    ;;
esac

printf '%s\n' "release relay URL ok: $url"
