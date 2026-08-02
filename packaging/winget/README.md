# Winget Publication

Public command:

```powershell
winget install GitFuse.GitFuse
```

This directory contains Winget template manifests for the Windows amd64 portable CLI archive:

- `gitfuse_<version>_windows_amd64.zip`
- SHA-256 from `checksums.txt`

## Local Validation

1. Replace template placeholders with a real release version, URL, and SHA-256.
2. Run `winget validate` when the Winget tooling is available.
3. Verify the portable command installs `gitfuse.exe` into PATH.
4. Confirm installation does not authenticate and does not create `~/.gitfuse`.

## External Submission

`winget install GitFuse.GitFuse` works through the default Winget source only after Microsoft community repository acceptance. Do not describe it as live before that acceptance and independent Windows amd64 verification.
