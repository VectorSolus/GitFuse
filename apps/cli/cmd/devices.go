package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/spf13/cobra"
)

type deviceRecord struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	LastActiveAt *string `json:"lastActiveAt"`
	CreatedAt    string  `json:"createdAt"`
	RevokedAt    *string `json:"revokedAt"`
}

var devicesCmd = &cobra.Command{
	Use:   "devices",
	Short: "List and revoke registered gitfuse devices",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runDevices(cmd.Context(), cmd)
	},
}

var devicesRevokeCmd = &cobra.Command{
	Use:   "revoke <id>",
	Short: "Revoke a registered gitfuse device",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return runDeviceRevoke(cmd.Context(), cmd, args[0])
	},
}

func init() {
	devicesCmd.AddCommand(devicesRevokeCmd)
	rootCmd.AddCommand(devicesCmd)
}

func runDevices(ctx context.Context, cmd *cobra.Command) error {
	devices, err := loadDevices(ctx)
	if err != nil {
		return err
	}
	fmt.Fprintln(cmd.OutOrStdout(), "ID\tNAME\tLAST ACTIVE\tREVOKED")
	for _, device := range devices {
		lastActive := "-"
		if device.LastActiveAt != nil && *device.LastActiveAt != "" {
			lastActive = *device.LastActiveAt
		}
		revoked := "false"
		if device.RevokedAt != nil && *device.RevokedAt != "" {
			revoked = "true"
		}
		fmt.Fprintf(cmd.OutOrStdout(), "%s\t%s\t%s\t%s\n", device.ID, device.Name, lastActive, revoked)
	}
	return nil
}

func runDeviceRevoke(ctx context.Context, cmd *cobra.Command, id string) error {
	if fixture := os.Getenv("GITFUSE_DEVICES_FIXTURE"); fixture != "" {
		if err := writeRevocationFixture(id); err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Revoked device %s.\n", id)
		return nil
	}
	relayURL, err := relayBaseURLOrError()
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, relayURL+"/v1/devices/"+id, nil)
	if err != nil {
		return err
	}
	if _, _, err := doAuthorizedRequest(req); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Revoked device %s.\n", id)
	return nil
}

func loadDevices(ctx context.Context) ([]deviceRecord, error) {
	if fixture := os.Getenv("GITFUSE_DEVICES_FIXTURE"); fixture != "" {
		content, err := os.ReadFile(fixture)
		if err != nil {
			return nil, err
		}
		return decodeDevices(content)
	}
	relayURL, err := relayBaseURLOrError()
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, relayURL+"/v1/devices", nil)
	if err != nil {
		return nil, err
	}
	body, _, err := doAuthorizedRequest(req)
	if err != nil {
		return nil, err
	}
	return decodeDevices(body)
}

func decodeDevices(content []byte) ([]deviceRecord, error) {
	var decoded struct {
		Devices []deviceRecord `json:"devices"`
	}
	if err := json.Unmarshal(content, &decoded); err != nil {
		return nil, err
	}
	return decoded.Devices, nil
}

func writeRevocationFixture(id string) error {
	path := os.Getenv("GITFUSE_DEVICE_REVOKE_LOG")
	if path == "" {
		return nil
	}
	return os.WriteFile(path, []byte(fmt.Sprintf("revoked=%s at=%s\n", id, time.Now().UTC().Format(time.RFC3339))), 0o600)
}
