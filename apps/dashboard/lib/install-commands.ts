export const INSTALL_GUIDES = {
  macos: {
    label: "macOS",
    shell: "zsh",
    commands: [
      "brew tap VectorSolus/gitfuse https://github.com/VectorSolus/GitFuse.git",
      "brew install VectorSolus/gitfuse/gitfuse",
      "gitfuse auth login",
      "gitfuse add .",
      "gitfuse sync",
    ],
    note: "Uses the public GitFuse repository tap on Apple Silicon and Intel Macs.",
  },
  windows: {
    label: "Windows",
    shell: "PowerShell",
    commands: [
      "winget install gitfuse",
      "gitfuse auth login",
      "gitfuse add .",
      "gitfuse sync",
    ],
    note: "Works through the default Winget source after package acceptance.",
  },
  linux: {
    label: "Linux",
    shell: "bash / zsh",
    commands: [
      "curl -fsSL https://install.gitfuse.dev | sh",
      "gitfuse auth login",
      "gitfuse add .",
      "gitfuse sync",
    ],
    note: "Uses the canonical checksummed installer served from install.gitfuse.dev.",
  },
} as const;

export type InstallGuideKey = keyof typeof INSTALL_GUIDES;

export function installCommandText(key: InstallGuideKey) {
  return INSTALL_GUIDES[key].commands.join("\n");
}

export function installCommandRows() {
  return (Object.keys(INSTALL_GUIDES) as InstallGuideKey[]).map((key) => ({
    key,
    ...INSTALL_GUIDES[key],
  }));
}
