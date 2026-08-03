# Homebrew Publication

Public command:

```sh
brew tap VectorSolus/gitfuse https://github.com/VectorSolus/GitFuse.git
brew install VectorSolus/gitfuse/gitfuse
```

This repository includes Cask template metadata for the macOS release archives:

- `gitfuse_<version>_darwin_amd64.tar.gz`
- `gitfuse_<version>_darwin_arm64.tar.gz`
- `checksums.txt`

## Local Validation

1. Run a snapshot release build.
2. Substitute the real version and SHA-256 values into `gitfuse.rb.template`.
3. Validate on Apple Silicon and Intel macOS.
4. Confirm installation does not create `~/.gitfuse`.
5. Confirm `gitfuse version` or `gitfuse --help` works after installation.

## External Submission

Official Homebrew discovery remains separate from the public repository tap command above.
