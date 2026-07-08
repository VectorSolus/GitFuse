package cmd

import (
	"fmt"
	"runtime"

	"github.com/spf13/cobra"
)

var (
	version         = "dev"
	commit          = "unknown"
	buildDate       = "unknown"
	defaultRelayURL = ""
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print gitfuse version and build metadata",
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Fprint(cmd.OutOrStdout(), renderVersionOutput())
		return nil
	},
}

func init() {
	rootCmd.Version = version
	rootCmd.SetVersionTemplate(renderVersionOutput())
	rootCmd.AddCommand(versionCmd)
}

func renderVersionOutput() string {
	return fmt.Sprintf(
		"gitfuse %s\ncommit: %s\nbuilt: %s\nplatform: %s/%s\n",
		currentCLIVersion(),
		commitOrUnknown(),
		buildDateOrUnknown(),
		runtime.GOOS,
		runtime.GOARCH,
	)
}

func currentCLIVersion() string {
	if version == "" {
		return "dev"
	}
	return version
}

func commitOrUnknown() string {
	if commit == "" {
		return "unknown"
	}
	return commit
}

func buildDateOrUnknown() string {
	if buildDate == "" {
		return "unknown"
	}
	return buildDate
}
