package workspace

type ConflictScenario string

const (
	ScenarioAlreadyRegistered  ConflictScenario = "A_ALREADY_REGISTERED"
	ScenarioSamePathNewRoot    ConflictScenario = "B_SAME_PATH_DIFFERENT_ROOT"
	ScenarioLinkOtherDevice    ConflictScenario = "C_SAME_PATH_SAME_ROOT_DIFFERENT_DEVICE"
	ScenarioMovedPath          ConflictScenario = "D_DIFFERENT_PATH_SAME_ROOT"
	ScenarioSameDeviceConflict ConflictScenario = "E_SAME_NAME_PATH_DIFFERENT_SHA_SAME_DEVICE"
	ScenarioNewRegistration    ConflictScenario = "NEW_REGISTRATION"
)

type RegistryEntry struct {
	Name     string
	Path     string
	RootSHA  string
	DeviceID string
	History  []string
}

type ConflictDecision struct {
	Scenario ConflictScenario
	Message  string
	Entry    *RegistryEntry
}

func ClassifyAddConflict(entries []RegistryEntry, candidate RegistryEntry) ConflictDecision {
	for i := range entries {
		entry := &entries[i]
		samePath := entry.Path == candidate.Path
		sameRoot := entry.RootSHA == candidate.RootSHA
		sameDevice := entry.DeviceID == candidate.DeviceID
		sameName := entry.Name == candidate.Name

		switch {
		case samePath && sameRoot && sameDevice:
			return ConflictDecision{Scenario: ScenarioAlreadyRegistered, Message: "Already registered. Nothing to do.", Entry: entry}
		case samePath && !sameRoot && sameName && sameDevice:
			return ConflictDecision{Scenario: ScenarioSameDeviceConflict, Message: "Same name and path have different history on this device.", Entry: entry}
		case samePath && !sameRoot:
			return ConflictDecision{Scenario: ScenarioSamePathNewRoot, Message: "Same path has a different root SHA.", Entry: entry}
		case samePath && sameRoot && !sameDevice:
			return ConflictDecision{Scenario: ScenarioLinkOtherDevice, Message: "Repository linked from another device.", Entry: entry}
		case !samePath && sameRoot:
			return ConflictDecision{Scenario: ScenarioMovedPath, Message: "Repository moved; update local path.", Entry: entry}
		}
	}

	return ConflictDecision{Scenario: ScenarioNewRegistration, Message: "New repository registration."}
}
