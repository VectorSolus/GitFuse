package main

import (
	"os"

	"github.com/gitfuse/gitfuse/apps/cli/cmd"
)

func main() {
	if err := cmd.Execute(); err != nil {
		os.Exit(1)
	}
}
