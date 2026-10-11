# Run using the same Python environment as ComfyUI.
param(
    [Parameter(Mandatory=$true)][string]$ComfyRoot,
    [Parameter(Mandatory=$true)][string]$ComfyPython,
    [string]$Url = "http://127.0.0.1:8188",
    [switch]$LandingOnly,
    [switch]$Apply
)
$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$arguments = @((Join-Path $project "deploy\uninstall_h3.py"), "--comfy-root", $ComfyRoot, "--url", $Url)
if ($LandingOnly) { $arguments += "--landing-only" }
if ($Apply) { $arguments += "--apply" }
& $ComfyPython @arguments
exit $LASTEXITCODE
