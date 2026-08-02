class Gitfuse < Formula
  desc "Sync committed git objects between trusted devices through an encrypted relay"
  homepage "https://gitfuse.dev"
  version "0.1.0"
  license "AGPL-3.0-only"

  # Template for VectorSolus/homebrew-tap. Replace every TODO SHA value after real v0.1.0 release artifacts are published.
  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/VectorSolus/GitFuse/releases/download/v#{version}/gitfuse_v#{version}_darwin_arm64.tar.gz"
      sha256 "TODO_REPLACE_WITH_DARWIN_ARM64_SHA256"
    else
      url "https://github.com/VectorSolus/GitFuse/releases/download/v#{version}/gitfuse_v#{version}_darwin_amd64.tar.gz"
      sha256 "TODO_REPLACE_WITH_DARWIN_AMD64_SHA256"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/VectorSolus/GitFuse/releases/download/v#{version}/gitfuse_v#{version}_linux_arm64.tar.gz"
      sha256 "TODO_REPLACE_WITH_LINUX_ARM64_SHA256"
    else
      url "https://github.com/VectorSolus/GitFuse/releases/download/v#{version}/gitfuse_v#{version}_linux_amd64.tar.gz"
      sha256 "TODO_REPLACE_WITH_LINUX_AMD64_SHA256"
    end
  end

  def install
    bin.install "gitfuse"
  end

  test do
    assert_match "gitfuse", shell_output("#{bin}/gitfuse --help")
  end
end
