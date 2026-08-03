class Gitfuse < Formula
  desc "Sync committed git objects between trusted devices through an encrypted relay"
  homepage "https://gitfuse.dev"
  version "0.1.0"
  license "AGPL-3.0-only"

  # Template for VectorSolus/homebrew-tap. Replace every TODO SHA value after real v0.1.0 release artifacts are published.
  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/VectorSolus/GitFuse/releases/download/v#{version}/gitfuse_v#{version}_darwin_arm64.tar.gz"
      sha256 "c3bdc15bc0c7c4341e25a87ba85ad877c3aee475336b6c070cc9e3bc60a9561e"
    else
      url "https://github.com/VectorSolus/GitFuse/releases/download/v#{version}/gitfuse_v#{version}_darwin_amd64.tar.gz"
      sha256 "23f9417b73551020ca3a52c456f6ddb7c361bd68ec17e9e998a01268b1aaa82c"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/VectorSolus/GitFuse/releases/download/v#{version}/gitfuse_v#{version}_linux_arm64.tar.gz"
      sha256 "3f2b24efe00bdac4cff40808e7236f8ab07b37b36ef905dcad0288c847a4dcfd"
    else
      url "https://github.com/VectorSolus/GitFuse/releases/download/v#{version}/gitfuse_v#{version}_linux_amd64.tar.gz"
      sha256 "3221d497096e6f6064ba39289f601f07ea6257645307e1ddc3e0e285490e22ef"
    end
  end

  def install
    bin.install "gitfuse"
  end

  test do
    assert_match "gitfuse", shell_output("#{bin}/gitfuse --help")
  end
end
