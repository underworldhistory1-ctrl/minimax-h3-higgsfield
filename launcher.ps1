# The existing PowerShell entry point selects ComfyUI Portable or Python 3.13/3.12.
& (Join-Path $PSScriptRoot "install.ps1") @args
exit $LASTEXITCODE
