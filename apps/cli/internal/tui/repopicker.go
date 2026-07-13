package tui

import (
	"fmt"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

type RepoOption struct {
	Name  string
	Path  string
	State string
}

func PickRepo(options []RepoOption) (RepoOption, error) {
	return PickRepoWithTitle(options, "Choose a GitFuse repository")
}

func PickRepoWithTitle(options []RepoOption, title string) (RepoOption, error) {
	if len(options) == 0 {
		return RepoOption{}, fmt.Errorf("no registered gitfuse repos found")
	}
	if os.Getenv("GITFUSE_NONINTERACTIVE") == "1" {
		return options[0], nil
	}
	model := repoPickerModel{options: options, title: title, width: 80}
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
	title     string
	cursor    int
	width     int
	cancelled bool
}

func (m repoPickerModel) Init() tea.Cmd {
	return nil
}

func (m repoPickerModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	key, ok := msg.(tea.KeyMsg)
	if size, ok := msg.(tea.WindowSizeMsg); ok {
		m.width = size.Width
		return m, nil
	}
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
	var builder strings.Builder
	builder.WriteString(titleStyle.Render(m.title) + "\n\n")
	width := terminalWidth(m.width)
	nameWidth := width - 26
	if nameWidth < 18 {
		nameWidth = 18
	}
	for i, option := range m.options {
		cursor := " "
		if i == m.cursor {
			cursor = "›"
		}
		name := truncate(option.Name, nameWidth)
		state := truncate(option.State, 18)
		row := fmt.Sprintf("%s %-*s %s", cursor, nameWidth, name, state)
		if i == m.cursor {
			builder.WriteString(activeStyle.Render(row) + "\n")
		} else {
			builder.WriteString(mutedStyle.Render(row[:2]) + metadataStyle.Render(row[2:]) + "\n")
		}
	}
	builder.WriteString("\n" + helpStyle.Render("↑/↓ navigate • enter select • esc cancel") + "\n")
	return builder.String()
}
