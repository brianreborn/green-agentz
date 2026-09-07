# git archive of pack/MANIFEST.json paths. Does not copy into green-roomz.
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $Root
$Version = (Get-Content -Raw (Join-Path $Root 'docs\green-zkillz\VERSION')).Trim()
$Manifest = Get-Content -Raw (Join-Path $Root 'pack\MANIFEST.json') | ConvertFrom-Json
$Paths = [System.Collections.Generic.List[string]]::new()
function Add-PackPath([string]$p) {
  if (-not $Paths.Contains($p)) { [void]$Paths.Add($p) }
}
Add-PackPath 'pack/MANIFEST.json'
Add-PackPath 'pack/README.md'
foreach ($c in $Manifest.components) {
  foreach ($p in $c.paths) { Add-PackPath $p }
}
foreach ($p in $Manifest.docs) { Add-PackPath $p }
foreach ($p in $Manifest.installers) { Add-PackPath $p }
foreach ($p in $Paths) {
  $full = Join-Path $Root ($p -replace '/', [IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $full)) {
    throw "missing pack path: $p"
  }
}
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'dist') | Out-Null
$Out = Join-Path $Root "dist\green-zkillz-$Version.zip"
if (Test-Path $Out) { Remove-Item -LiteralPath $Out }
& git archive --format=zip -o $Out HEAD -- @($Paths)
if ($LASTEXITCODE -ne 0) { throw "git archive failed" }
Write-Output $Out
