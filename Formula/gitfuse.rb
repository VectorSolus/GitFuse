class Gitfuse < Formula
  desc "Sync committed git objects between trusted devices through an encrypted relay"
  homepage "https://gitfuse.dev"
  version "0.1.1"
  license "AGPL-3.0-only"

  # Template for VectorSolus/homebrew-tap. Replace every TODO SHA value after real v0.1.1 release artifacts are published.
  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/VectorSolus/GitFuse/releases/download/v#{version}/gitfuse_#{version}_darwin_arm64.tar.gz"
      sha256 "d428507c42b45305811b5ecd1e0c4d79606b791d7a4e2f243e49da836c56dbb9"
    else
      url "https://github.com/VectorSolus/GitFuse/releases/download/v#{version}/gitfuse_#{version}_darwin_amd64.tar.gz"
      sha256 "6f09e617c35c1b311088cd823a14d7d85fa15d2365a32e5f4357daa5c32a2c21"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/VectorSolus/GitFuse/releases/download/v#{version}/gitfuse_#{version}_linux_arm64.tar.gz"
      sha256 "f4d18c41486b668af3431cb125951877d96b80e2d42ce28ef312e681952a8556"
    else
      url "https://github.com/VectorSolus/GitFuse/releases/download/v#{version}/gitfuse_#{version}_linux_amd64.tar.gz"
      sha256 "ff73569d8ed63979f67e2372580cce8e42503a3142fed84e4f06c4d2820c20ad"
    end
  end

  def install
    bin.install "gitfuse"
  end

  test do
    assert_match "gitfuse", shell_output("#{bin}/gitfuse --help")
  end
end
