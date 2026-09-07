# Point Grok at this clone's skills/. Does not copy files into ~/.grok/skills or green-roomz.
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Skills = (Join-Path $Root 'skills') -replace '\\', '/'
$Brainz = (Join-Path $Root 'systems\green-brainz') -replace '\\', '/'
$ConfigPath = Join-Path $env:USERPROFILE '.grok\config.toml'

if (-not (Test-Path -LiteralPath (Join-Path $Root 'skills\green-zkillz\SKILL.md'))) {
  throw "not a green-agentz checkout: $Root"
}

$block = @"
[skills]
paths = ["$Skills"]
"@

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $ConfigPath) | Out-Null
  Set-Content -LiteralPath $ConfigPath -Value $block -Encoding utf8
  Write-Output "wrote $ConfigPath"
} else {
  $text = Get-Content -Raw -LiteralPath $ConfigPath
  if ($text -match [regex]::Escape($Skills)) {
    Write-Output "already configured: $Skills"
  } elseif ($text -match '(?m)^\[skills\]') {
    throw "config already has [skills]; add paths = [`"$Skills`"] by hand: $ConfigPath"
  } else {
    $nl = if ($text.EndsWith("`n")) { '' } else { "`r`n" }
    Add-Content -LiteralPath $ConfigPath -Value "$nl$block" -Encoding utf8
    Write-Output "appended [skills] to $ConfigPath"
  }
}

Write-Output "GREEN_BRAINZ_ROOT=$Brainz"
Write-Output "GREEN_WORKSPACE=$Root"
Write-Output "GDICT_STATIC=$Root/skills/green-zkillz/assets"
