$ErrorActionPreference = 'Stop'
$root = 'C:\Users\brian\Documents\Codex\2026-08-28\files-pasted-by-the-user-1\outputs\green-roomz'
$node = 'C:\Users\brian\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
Set-Location $root
$os = Get-CimInstance Win32_OperatingSystem
$freeGB = [math]::Round($os.FreePhysicalMemory/1MB, 2)
$totalGB = [math]::Round($os.TotalVisibleMemorySize/1MB, 2)
Write-Output ("RAM totalGB={0} freeGB={1}" -f $totalGB, $freeGB)
Write-Output '=== leftover procs ==='
Get-Process node,llama-server -ErrorAction SilentlyContinue | Format-Table Id,ProcessName,WorkingSet64 -AutoSize | Out-String
Write-Output '=== validate ==='
& $node .\bin\green-roomz.mjs validate --manifest .\config\agents.windows.json | Out-File -FilePath .\data\qwen3-4b-validate.json -Encoding utf8
Write-Output '=== doctor ==='
& $node .\bin\green-roomz.mjs doctor --manifest .\config\agents.windows.json | Out-File -FilePath .\data\qwen3-4b-doctor.json -Encoding utf8
Write-Output '=== general-text-speculator from validate ==='
$raw = Get-Content .\data\qwen3-4b-validate.json -Raw
if ($raw[0] -eq [char]0xFEFF) { $raw = $raw.Substring(1) }
$v = $raw | ConvertFrom-Json
$agent = $v.agents | Where-Object { $_.id -eq 'general-text-speculator' }
Write-Output ("alias={0} availability={1} reasons={2}" -f $agent.id, $agent.availability, ($agent.unavailable_reasons -join ';'))
Write-Output '=== degraded ids ==='
$v.degraded | ForEach-Object { Write-Output $_.id }
Write-Output 'DONE validate/doctor'
