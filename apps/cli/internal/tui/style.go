package tui

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

var (
	titleStyle    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#7dd3fc"))
	activeStyle   = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#22d3ee"))
	mutedStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("#64748b"))
	helpStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("#64748b"))
	metadataStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#94a3b8"))
)

func truncate(value string, width int) string {
	if width <= 1 {
		return ""
	}
	runes := []rune(strings.TrimSpace(value))
	if len(runes) <= width {
		return string(runes)
	}
	return string(runes[:width-1]) + "…"
}

func terminalWidth(fallback int) int {
	if fallback <= 0 {
		return 80
	}
	return fallback
}
