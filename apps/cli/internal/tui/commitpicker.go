package tui

import (
	"fmt"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

type CommitOption struct {
	SHA     string
	Message string
}

func PickCommits(options []CommitOption) ([]CommitOption, error) {
	return PickCommitsWithTitle(options, "Select commits to sync")
}

func PickCommitsWithTitle(options []CommitOption, title string) ([]CommitOption, error) {
	if len(options) == 0 {
		return nil, fmt.Errorf("no commits available to pick")
	}
	if os.Getenv("GITFUSE_NONINTERACTIVE") == "1" {
		return []CommitOption{options[0]}, nil
	}
	model := commitPickerModel{options: options, selected: map[int]bool{}, title: title, width: 80}
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
		return nil, fmt.Errorf("no commits selected")
	}
	return commits, nil
}

type commitPickerModel struct {
	options   []CommitOption
	selected  map[int]bool
	title     string
	cursor    int
	width     int
	cancelled bool
}

func (m commitPickerModel) Init() tea.Cmd {
	return nil
}

func (m commitPickerModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
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
	case " ":
		m.selected[m.cursor] = !m.selected[m.cursor]
	case "a":
		next := !m.allSelected()
		for index := range m.options {
			m.selected[index] = next
		}
	case "enter":
		return m, tea.Quit
	}
	return m, nil
}

func (m commitPickerModel) View() string {
	var builder strings.Builder
	builder.WriteString(titleStyle.Render(m.title) + "\n\n")
	width := terminalWidth(m.width)
	messageWidth := width - 18
	if messageWidth < 20 {
		messageWidth = 20
	}
	for i, option := range m.options {
		cursor := " "
		if i == m.cursor {
			cursor = "›"
		}
		mark := "○"
		if m.selected[i] {
			mark = "◉"
		}
		row := fmt.Sprintf("%s %s %-7s %s", cursor, mark, shortSHA(option.SHA), truncate(option.Message, messageWidth))
		if i == m.cursor {
			builder.WriteString(activeStyle.Render(row) + "\n")
		} else {
			builder.WriteString(metadataStyle.Render(row) + "\n")
		}
	}
	builder.WriteString("\n" + helpStyle.Render("space toggle • enter sync • a select all • esc cancel") + "\n")
	return builder.String()
}

func (m commitPickerModel) allSelected() bool {
	if len(m.options) == 0 {
		return false
	}
	for index := range m.options {
		if !m.selected[index] {
			return false
		}
	}
	return true
}

func shortSHA(sha string) string {
	if len(sha) < 7 {
		return sha
	}
	return sha[:7]
}
