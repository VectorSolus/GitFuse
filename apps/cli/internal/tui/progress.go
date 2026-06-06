package tui

import "fmt"

func ReplayProgress(commitCount int) string {
	if commitCount <= 5 {
		return ""
	}
	return fmt.Sprintf("Replaying %d commits...\nProgress: 100%%", commitCount)
}
