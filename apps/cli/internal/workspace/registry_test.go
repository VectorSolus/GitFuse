package workspace

import "testing"

func TestConflictScenarioMatrix(t *testing.T) {
	existing := []RegistryEntry{
		{Name: "repo", Path: "/work/repo", RootSHA: "root-a", DeviceID: "device-a", History: []string{"old"}},
	}

	tests := []struct {
		name      string
		candidate RegistryEntry
		want      ConflictScenario
	}{
		{
			name:      "A same path already registered",
			candidate: RegistryEntry{Name: "repo", Path: "/work/repo", RootSHA: "root-a", DeviceID: "device-a"},
			want:      ScenarioAlreadyRegistered,
		},
		{
			name:      "B same path different root",
			candidate: RegistryEntry{Name: "other", Path: "/work/repo", RootSHA: "root-b", DeviceID: "device-b"},
			want:      ScenarioSamePathNewRoot,
		},
		{
			name:      "C same path same root different device",
			candidate: RegistryEntry{Name: "repo", Path: "/work/repo", RootSHA: "root-a", DeviceID: "device-b"},
			want:      ScenarioLinkOtherDevice,
		},
		{
			name:      "D different path same root",
			candidate: RegistryEntry{Name: "repo", Path: "/new/repo", RootSHA: "root-a", DeviceID: "device-b"},
			want:      ScenarioMovedPath,
		},
		{
			name:      "E same name and path different SHA same device",
			candidate: RegistryEntry{Name: "repo", Path: "/work/repo", RootSHA: "root-e", DeviceID: "device-a"},
			want:      ScenarioSameDeviceConflict,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ClassifyAddConflict(existing, tt.candidate)
			if got.Scenario != tt.want {
				t.Fatalf("scenario = %s, want %s", got.Scenario, tt.want)
			}
		})
	}
}
