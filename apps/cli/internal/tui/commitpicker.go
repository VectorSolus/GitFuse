package tui

import (
	"fmt"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type CommitOption struct {
	SHA     string
	Message string
}

func PickCommits(options []CommitOption) ([]CommitOption, error) {
	if len(options) == 0 {
		return nil, fmt.Errorf("no commits available to pick")
	}
	if os.Getenv("GITFUSE_NONINTERACTIVE") == "1" {
		return []CommitOption{options[0]}, nil
	}
	model := commitPickerModel{options: options, selected: map[int]bool{}}
	result, err := tea.NewProgram(model).Run()
	if err != nil {
		return nil, err
	}
	picked := result.(commitPickerModel)
	if picked.cancelled {
		return nil, fmt.Errorf("commit selection cancelled")
	}
	var commits []CommitOption
	for index, selected := range picked.selected {
		if selected {
			commits = append(commits, picked.options[index])
		}
	}
	if len(commits) == 0 {
		commits = append(commits, picked.options[picked.cursor])
	}
	return commits, nil
}

type commitPickerModel struct {
	options   []CommitOption
	selected  map[int]bool
	cursor    int
	cancelled bool
}

func (m commitPickerModel) Init() tea.Cmd {
	return nil
}

func (m commitPickerModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
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
	case " ":
		m.selected[m.cursor] = !m.selected[m.cursor]
	case "enter":
		return m, tea.Quit
	}
	return m, nil
}

func (m commitPickerModel) View() string {
	title := lipgloss.NewStyle().Bold(true).Render("Pick commits")
	var builder strings.Builder
	builder.WriteString(title + "\n\n")
	for i, option := range m.options {
		cursor := " "
		if i == m.cursor {
			cursor = ">"
		}
		mark := "[ ]"
		if m.selected[i] {
			mark = "[x]"
		}
		builder.WriteString(fmt.Sprintf("%s %s %s %s\n", cursor, mark, shortSHA(option.SHA), option.Message))
	}
	builder.WriteString("\nSpace toggles. Enter selects. Esc cancels.\n")
	return builder.String()
}

func shortSHA(sha string) string {
	if len(sha) < 12 {
		return sha
	}
	return sha[:12]
}
