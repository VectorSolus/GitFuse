package cmd

import (
	"context"
	"fmt"
	"net/http"

	"github.com/spf13/cobra"
)

type accountLimitsResponse struct {
	Tier    string `json:"tier"`
	Devices struct {
		Limit   *int `json:"limit"`
		Current int  `json:"current"`
	} `json:"devices"`
	RetentionDays *int `json:"retention_days"`
}

var limitsCmd = &cobra.Command{
	Use:   "limits",
	Short: "Show current gitfuse account limits",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runLimits(cmd.Context(), cmd)
	},
}

func init() {
	rootCmd.AddCommand(limitsCmd)
}

func runLimits(ctx context.Context, cmd *cobra.Command) error {
	limits, err := loadAccountLimits(ctx)
	if err != nil {
		return err
	}
	fmt.Fprintln(cmd.OutOrStdout(), renderAccountLimits(limits))
	return nil
}

func loadAccountLimits(ctx context.Context) (accountLimitsResponse, error) {
	var limits accountLimitsResponse
	token := deviceToken()
	if token == "" {
		return limits, fmt.Errorf(notAuthenticatedMessage)
	}
	relayURL, err := relayBaseURLOrError()
	if err != nil {
		return limits, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, relayURL+"/v1/account/limits", nil)
	if err != nil {
		return limits, err
	}
	return loadAccountLimitsFromRequest(req, token)
}

func renderAccountLimits(limits accountLimitsResponse) string {
	deviceLimit := "unlimited"
	if limits.Devices.Limit != nil {
		deviceLimit = fmt.Sprintf("%d", *limits.Devices.Limit)
	}
	retention := "unlimited"
	if limits.RetentionDays != nil {
		retention = fmt.Sprintf("%d days", *limits.RetentionDays)
	}
	return fmt.Sprintf("Tier: %s\nDevices: %d / %s\nRetention: %s", titleForCLI(limits.Tier), limits.Devices.Current, deviceLimit, retention)
}

func renderDeviceLimitMessage(limits accountLimitsResponse) string {
	if limits.Devices.Limit == nil {
		return "You're on a paid tier with unlimited devices."
	}
	return fmt.Sprintf(
		"You're on the %s tier (%d/%d devices used). Upgrade at gitfuse.dev/upgrade to add more devices.",
		titleForCLI(limits.Tier),
		limits.Devices.Current,
		*limits.Devices.Limit,
	)
}

func titleForCLI(value string) string {
	switch value {
	case "free":
		return "Free"
	case "paid":
		return "Paid"
	default:
		if value == "" {
			return "Unknown"
		}
		return value
	}
}
