# Homebrew Publication

Public command:

```sh
brew install gitfuse
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

`brew install gitfuse` works through standard discovery only after Homebrew publication or acceptance. A temporary tap may be used for internal release verification, but it is not the public installation command.
