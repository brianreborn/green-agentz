# Local CI loop for qodesh green-roomz. Totally offline. Append-only log.
$ErrorActionPreference = 'Continue'
$Root = 'C:\Users\brian\Documents\green-roomz'
$Node = 'C:\Program Files\nodejs\node.exe'
$Log = Join-Path $Root 'data\local-ci.log'
$IntervalSec = 300
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'data') | Out-Null

function Stamp { Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK' }

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Stamp), $msg
  Add-Content -Path $Log -Value $line
  Write-Output $line
}

Write-Log "local-ci start pid=$PID interval=${IntervalSec}s"
Set-Location $Root

while ($true) {
  $t0 = Get-Date
  $outFile = Join-Path $Root 'data\local-ci-last.txt'
  $code = -1
  try {
    & $Node --test .\test\*.test.mjs 2>&1 | Tee-Object -FilePath $outFile | Out-Null
    $code = $LASTEXITCODE
  } catch {
    Write-Log ("test-runner-exception: " + $_.Exception.Message)
    $code = 99
  }
  $tail = ''
  if (Test-Path $outFile) {
    $lines = Get-Content $outFile -ErrorAction SilentlyContinue
    # node --test prints "# tests N" / "# pass N" / "# fail N" (ASCII) plus unicode marks
    $summary = $lines | Where-Object {
      $_ -match '^# (tests|pass|fail|cancelled|skipped|todo|duration_ms)\b' -or
      $_ -match '^(tests |pass |fail |duration_ms)' -or
      $_ -match '[✖×].*fail'
    } | Select-Object -Last 10
    $passN = @($lines | Where-Object { $_ -match '^(\u2714|ok )' }).Count
    $failN = @($lines | Where-Object { $_ -match '^(\u2718|✖|not ok )' }).Count
    $tail = ("passmarks=$passN failmarks=$failN | " + ($summary -join ' | '))
  }
  $elapsed = [int]((Get-Date) - $t0).TotalSeconds
  if ($code -eq 0) {
    Write-Log "PASS exit=0 ${elapsed}s $tail"
  } else {
    Write-Log "FAIL exit=$code ${elapsed}s $tail"
  }

  # light health probe (non-fatal)
  try {
    $h = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/health' -TimeoutSec 3
    Write-Log ("health status=" + $h.status)
  } catch {
    Write-Log 'health down'
  }

  Start-Sleep -Seconds $IntervalSec
}
