package tui

import (
	"fmt"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type RepoOption struct {
	Name  string
	Path  string
	State string
}

func PickRepo(options []RepoOption) (RepoOption, error) {
	if len(options) == 0 {
		return RepoOption{}, fmt.Errorf("no registered gitfuse repos found")
	}
	if os.Getenv("GITFUSE_NONINTERACTIVE") == "1" {
		return options[0], nil
	}
	model := repoPickerModel{options: options}
	result, err := tea.NewProgram(model).Run()
	if err != nil {
		return RepoOption{}, err
	}
	picked := result.(repoPickerModel)
	if picked.cancelled {
		return RepoOption{}, fmt.Errorf("repo selection cancelled")
	}
	return picked.options[picked.cursor], nil
}

type repoPickerModel struct {
	options   []RepoOption
	cursor    int
	cancelled bool
}

func (m repoPickerModel) Init() tea.Cmd {
	return nil
}

func (m repoPickerModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	key, ok := msg.(tea.KeyMsg)
	if !ok {
		return m, nil
	}
	switch key.String() {
	case "ctrl+c", "esc":
		m.cancelled = true
		return m, tea.Quit
	case "up", "k":
		if m.cursor > 0 {
			m.cursor--
		}
	case "down", "j":
		if m.cursor < len(m.options)-1 {
			m.cursor++
		}
	case "enter":
		return m, tea.Quit
	}
	return m, nil
}

func (m repoPickerModel) View() string {
	title := lipgloss.NewStyle().Bold(true).Render("Choose a gitfuse repo")
	var builder strings.Builder
	builder.WriteString(title + "\n\n")
	for i, option := range m.options {
		cursor := " "
		if i == m.cursor {
			cursor = ">"
		}
		builder.WriteString(fmt.Sprintf("%s %s  %s  %s\n", cursor, option.Name, option.State, option.Path))
	}
	builder.WriteString("\nEnter selects. Esc cancels.\n")
	return builder.String()
}
