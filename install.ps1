# Native Windows installer for H3 Higgsfield; no WSL or Bash required.
param(
    [string]$ComfyRoot = "",
    [string]$ComfyPython = "",
    [ValidateRange(1, 65535)][int]$Port = 8188,
    [ValidateSet("127.0.0.1", "0.0.0.0")][string]$Bind = "127.0.0.1",
    [switch]$Preflight,
    [switch]$NoStart,
    [switch]$NoUpdate,
    [switch]$ControlNet,
    [switch]$Refine,
    [switch]$SkipRefine,
    [ValidateSet("", "int8", "bf16", "int8,bf16")][string]$QwenImageProfiles = "int8",
    [string[]]$ModelsRoot = @(),
    [switch]$Turbo,
    [switch]$SkipControlNet,
    [switch]$VideoOnly,
    [switch]$SkipSmoke,
    [switch]$Status,
    [string]$Url = ""
)
$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$installer = Join-Path $project "deploy\launcher.py"
$candidates = New-Object 'System.Collections.Generic.List[string]'
if ($ComfyPython) { $candidates.Add($ComfyPython) }
if ($ComfyRoot) {
    $candidates.Add((Join-Path $ComfyRoot "python_embeded\python.exe"))
    $candidates.Add((Join-Path $ComfyRoot "..\python_embeded\python.exe"))
}
$candidates.Add((Join-Path $project "..\ComfyUI_windows_portable\python_embeded\python.exe"))
foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        $hostPython = (Resolve-Path -LiteralPath $candidate).Path
        break
    }
}
$prefix = @()
if (-not $hostPython) {
    $launcher = Get-Command py -ErrorAction SilentlyContinue
    if ($launcher) {
        $hostPython = $launcher.Source
        foreach ($version in @("-3.13", "-3.12", "-3")) {
            try {
                $hostCheck = if ($Preflight -or $Status) { "import sys" } else { "import sys; assert (3,12) <= sys.version_info[:2] <= (3,13)" }
                & $hostPython $version -c $hostCheck 2>$null
                if ($LASTEXITCODE -eq 0) { $prefix = @($version); break }
            } catch {
                # The Python launcher reports an unavailable version on stderr.
                continue
            }
        }
        if ($prefix.Count -eq 0) { $hostPython = $null }
    }
    if (-not $hostPython) {
        $launcher = Get-Command python -ErrorAction SilentlyContinue
        if ($launcher) {
            try {
                $hostCheck = if ($Preflight -or $Status) { "import sys" } else { "import sys; assert (3,12) <= sys.version_info[:2] <= (3,13)" }
                & $launcher.Source -c $hostCheck 2>$null
                if ($LASTEXITCODE -eq 0) { $hostPython = $launcher.Source }
            } catch { $hostPython = $null }
        }
    }
}
if (-not $hostPython) {
    if ($Preflight -or $Status) { throw "A Python interpreter is needed to read this plan/report; no installation was attempted." }
    $packageManager = Get-Command winget -ErrorAction SilentlyContinue
    if ($packageManager) {
        Write-Host "Preparing Python 3.13 with Windows Package Manager..."
        & $packageManager.Source install --id Python.Python.3.13 --exact --silent --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -eq 0) {
            foreach ($candidate in @((Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\python.exe"), "C:\Program Files\Python313\python.exe")) {
                if (Test-Path -LiteralPath $candidate -PathType Leaf) { $hostPython = $candidate; break }
            }
        }
    }
    if (-not $hostPython) { throw "Python 3 was not found and automatic provisioning was unavailable. Use ComfyUI Portable or install Python 3.13, then rerun." }
}
$arguments = @($installer, "--port", "$Port", "--bind", $Bind)
if ($ComfyRoot) { $arguments += @("--comfy-root", $ComfyRoot) }
if ($ComfyPython) { $arguments += @("--comfy-python", $ComfyPython) }
if ($Preflight) { $arguments += "--preflight" }
if ($NoStart) { $arguments += "--no-start" }
if ($NoUpdate) { $arguments += "--no-update" }
if ($ControlNet) { $arguments += "--controlnet" }
if ($Refine -and $SkipRefine) { throw "Choose either -Refine or -SkipRefine." }
if ($Refine) { $arguments += "--refine" }
if ($SkipRefine) { $arguments += "--no-refine" }
if ($QwenImageProfiles) { $arguments += @("--qwen-image-profiles", $QwenImageProfiles) }
foreach ($storagePath in $ModelsRoot) { $arguments += @("--models-root", $storagePath) }
if ($Turbo) { $arguments += "--turbo" }
if ($SkipControlNet) { $arguments += "--no-controlnet" }
if ($VideoOnly) { $arguments += "--video-only" }
if ($SkipSmoke) { $arguments += "--skip-smoke" }
if ($Status) { $arguments += "--status" }
if ($Url) { $arguments += @("--url", $Url) }
& $hostPython @prefix @arguments
exit $LASTEXITCODE
