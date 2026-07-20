#!/usr/bin/env bash
set -u

GITFUSE_OWNER="${GITFUSE_OWNER:-gitfuse}"
GITFUSE_REPO="${GITFUSE_REPO:-gitfuse}"
GITFUSE_DOMAIN="${GITFUSE_DOMAIN:-gitfuse.dev}"
GITFUSE_WINGET_ID="${GITFUSE_WINGET_ID:-GitFuse.GitFuse}"
GITFUSE_WINGET_VERSION="${GITFUSE_WINGET_VERSION:-0.1.0}"
GITFUSE_PRESENCE_CONNECT_TIMEOUT="${GITFUSE_PRESENCE_CONNECT_TIMEOUT:-5}"
GITFUSE_PRESENCE_MAX_TIME="${GITFUSE_PRESENCE_MAX_TIME:-15}"

log() {
  printf '[distribution-presence] %s\n' "$*"
}

http_status() {
  local url="$1"
  local status

  if ! command -v curl >/dev/null 2>&1; then
    printf '%s\n' "NO_CURL"
    return 0
  fi

  status="$(
    curl -fsSIL \
      --connect-timeout "$GITFUSE_PRESENCE_CONNECT_TIMEOUT" \
      --max-time "$GITFUSE_PRESENCE_MAX_TIME" \
      -o /dev/null \
      -w '%{http_code}' \
      "$url" 2>/dev/null || true
  )"
  [ -n "$status" ] || status="000"
  printf '%s\n' "$status"
}

is_present_status() {
  case "$1" in
    2* | 3*) return 0 ;;
    *) return 1 ;;
  esac
}

check_url() {
  local label="$1"
  local url="$2"
  local status

  status="$(http_status "$url")"
  log "$label status=$status url=$url"
  is_present_status "$status"
}

any_url_present() {
  local label="$1"
  shift
  local url
  local present=1

  for url in "$@"; do
    if check_url "$label" "$url"; then
      present=0
    fi
  done

  return "$present"
}

winget_manifest_path() {
  local id_path
  local first_letter
  id_path="$(printf '%s' "$GITFUSE_WINGET_ID" | tr '.' '/')"
  first_letter="$(printf '%s' "$GITFUSE_WINGET_ID" | cut -c 1 | tr '[:upper:]' '[:lower:]')"
  printf '%s/%s/%s/%s.yaml\n' "$first_letter" "$id_path" "$GITFUSE_WINGET_VERSION" "$GITFUSE_WINGET_ID"
}

tap_repo_url="https://github.com/$GITFUSE_OWNER/homebrew-tap"
tap_formula_main_url="https://raw.githubusercontent.com/$GITFUSE_OWNER/homebrew-tap/main/Formula/gitfuse.rb"
tap_formula_master_url="https://raw.githubusercontent.com/$GITFUSE_OWNER/homebrew-tap/master/Formula/gitfuse.rb"

official_homebrew_urls=(
  "https://raw.githubusercontent.com/Homebrew/homebrew-core/HEAD/Formula/g/gitfuse.rb"
  "https://raw.githubusercontent.com/Homebrew/homebrew-core/HEAD/Formula/gitfuse.rb"
  "https://raw.githubusercontent.com/Homebrew/homebrew-cask/HEAD/Casks/g/gitfuse.rb"
  "https://raw.githubusercontent.com/Homebrew/homebrew-cask/HEAD/Casks/gitfuse.rb"
)

winget_url="https://raw.githubusercontent.com/microsoft/winget-pkgs/master/manifests/$(winget_manifest_path)"
curl_installer_url="https://$GITFUSE_DOMAIN/install.sh"
raw_install_url="https://raw.githubusercontent.com/$GITFUSE_OWNER/$GITFUSE_REPO/main/install.sh"

custom_tap_repo_present=NO
custom_tap_formula_present=NO
custom_homebrew_tap_present=NO
official_homebrew_entry_present=NO
winget_entry_present=NO
curl_installer_present=NO
raw_install_present=NO

if check_url "custom Homebrew tap repo" "$tap_repo_url"; then
  custom_tap_repo_present=YES
fi

if any_url_present "custom Homebrew formula raw" "$tap_formula_main_url" "$tap_formula_master_url"; then
  custom_tap_formula_present=YES
fi

if [ "$custom_tap_repo_present" = YES ] && [ "$custom_tap_formula_present" = YES ]; then
  custom_homebrew_tap_present=YES
fi

if any_url_present "official Homebrew core/cask" "${official_homebrew_urls[@]}"; then
  official_homebrew_entry_present=YES
fi

if check_url "WinGet manifest" "$winget_url"; then
  winget_entry_present=YES
fi

if check_url "curl installer" "$curl_installer_url"; then
  curl_installer_present=YES
fi

if check_url "raw GitHub install.sh" "$raw_install_url"; then
  raw_install_present=YES
fi

log "CUSTOM_HOMEBREW_TAP_REPO_PRESENT=$custom_tap_repo_present"
log "CUSTOM_HOMEBREW_FORMULA_PRESENT=$custom_tap_formula_present"
log "RAW_GITHUB_INSTALL_SH_PRESENT=$raw_install_present"

printf '%s\n' "CUSTOM_HOMEBREW_TAP_PRESENT=$custom_homebrew_tap_present"
printf '%s\n' "OFFICIAL_HOMEBREW_ENTRY_PRESENT=$official_homebrew_entry_present"
printf '%s\n' "WINGET_ENTRY_PRESENT=$winget_entry_present"
printf '%s\n' "CURL_INSTALLER_PRESENT=$curl_installer_present"
printf '%s\n' "DISTRIBUTION_PRESENCE_CHECK_COMPLETED=YES"
