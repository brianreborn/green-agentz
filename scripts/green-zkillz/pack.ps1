$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $Root
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
if (-not $py) { throw 'python 3 required' }
& $py.Source (Join-Path $PSScriptRoot 'archive.py')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
