# Foreground executable for an approved Windows service manager. This creates no service.
param(
  [Parameter(Mandatory)] [string] $ReleaseRoot,
  [Parameter(Mandatory)] [string] $ConfigFile,
  [Parameter(Mandatory)] [string] $KitEnvFile
)
$ErrorActionPreference = 'Stop'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$config = (Resolve-Path -LiteralPath $ConfigFile).Path
$kit = (Resolve-Path -LiteralPath $KitEnvFile).Path
Push-Location -LiteralPath $ReleaseRoot
try {
  & $node "--env-file=$config" "--env-file=$kit" scripts/demo-host-readiness.mjs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & $node "--env-file=$config" "--env-file=$kit" --import=tsx apps/api/src/index.ts
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
