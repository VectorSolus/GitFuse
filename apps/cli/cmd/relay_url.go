package cmd

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
)

type relayURLSource string

const (
	relayURLSourceEnvironment relayURLSource = "environment"
	relayURLSourcePersisted   relayURLSource = "persisted config"
	relayURLSourceBuild       relayURLSource = "build default"
	relayURLSourceDevelopment relayURLSource = "development fallback"
)

type resolvedRelayURL struct {
	URL    string
	Source relayURLSource
}

func resolveRelayURL() (resolvedRelayURL, error) {
	if value, ok := os.LookupEnv("GITFUSE_RELAY_URL"); ok && strings.TrimSpace(value) != "" {
		normalized, err := normalizeRelayURL(value)
		return resolvedRelayURL{URL: normalized, Source: relayURLSourceEnvironment}, err
	}

	cfg, err := config.ReadGlobalConfig()
	if err != nil {
		return resolvedRelayURL{}, err
	}
	if strings.TrimSpace(cfg.RelayURL) != "" {
		normalized, err := normalizeRelayURL(cfg.RelayURL)
		return resolvedRelayURL{URL: normalized, Source: relayURLSourcePersisted}, err
	}

	if strings.TrimSpace(defaultRelayURL) != "" {
		normalized, err := normalizeRelayURL(defaultRelayURL)
		if err != nil {
			return resolvedRelayURL{}, err
		}
		if isLocalRelayHost(normalized) {
			return resolvedRelayURL{}, fmt.Errorf("production relay URL must not use localhost")
		}
		return resolvedRelayURL{URL: normalized, Source: relayURLSourceBuild}, nil
	}

	if currentCLIVersion() == "dev" {
		return resolvedRelayURL{
			URL:    "http://localhost:8787",
			Source: relayURLSourceDevelopment,
		}, nil
	}

	return resolvedRelayURL{}, fmt.Errorf("relay URL is not configured")
}

func relayBaseURLOrError() (string, error) {
	resolved, err := resolveRelayURL()
	if err != nil {
		return "", err
	}
	return resolved.URL, nil
}

func relayBaseURL() string {
	url, err := relayBaseURLOrError()
	if err != nil {
		return ""
	}
	return url
}

func normalizeRelayURL(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", fmt.Errorf("relay URL must not be empty")
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return "", fmt.Errorf("parse relay URL: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("relay URL must use http or https")
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("relay URL must include a host")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return strings.TrimRight(parsed.String(), "/"), nil
}

func validateProductionRelayURL(raw string) error {
	normalized, err := normalizeRelayURL(raw)
	if err != nil {
		return err
	}
	parsed, err := url.Parse(normalized)
	if err != nil {
		return err
	}
	if parsed.Scheme != "https" {
		return fmt.Errorf("production relay URL must use HTTPS")
	}
	if isLocalRelayHost(normalized) || isPrivateDevelopmentHost(parsed.Hostname()) {
		return fmt.Errorf("production relay URL must not use a local development host")
	}
	return nil
}

func isLocalRelayHost(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func isPrivateDevelopmentHost(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "" {
		return true
	}
	if strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".test") {
		return true
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast()
}
