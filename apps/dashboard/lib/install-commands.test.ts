import { describe, expect, it } from "vitest";

import { INSTALL_GUIDES, installCommandText } from "./install-commands";

describe("install commands", () => {
  it("keeps the homepage and docs public install contract exact", () => {
    expect(INSTALL_GUIDES.macos.commands).toEqual([
      "brew tap VectorSolus/gitfuse https://github.com/VectorSolus/GitFuse.git",
      "brew install VectorSolus/gitfuse/gitfuse",
      "gitfuse auth login",
      "gitfuse add .",
      "gitfuse sync",
    ]);
    expect(INSTALL_GUIDES.windows.commands).toEqual([
      "winget install gitfuse",
      "gitfuse auth login",
      "gitfuse add .",
      "gitfuse sync",
    ]);
    expect(INSTALL_GUIDES.linux.commands).toEqual([
      "curl -fsSL https://gitfuse.dev/install.sh | sh",
      "gitfuse auth login",
      "gitfuse add .",
      "gitfuse sync",
    ]);
  });

  it("renders command text from the same source", () => {
    expect(installCommandText("macos")).toBe(
      "brew tap VectorSolus/gitfuse https://github.com/VectorSolus/GitFuse.git\nbrew install VectorSolus/gitfuse/gitfuse\ngitfuse auth login\ngitfuse add .\ngitfuse sync",
    );
  });
});
