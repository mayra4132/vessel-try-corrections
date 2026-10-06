# Starts this workspace's built application; credentials are read from its ignored .env.
$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$runtimePath = 'E:\vessel-system-test-9a39304'
if (-not (Test-Path -LiteralPath "$workspacePath\dist\server.cjs")) { throw 'Run npm run build first.' }
$env:NODE_ENV = 'production'
$env:TEMP = "$runtimePath\temp"
$env:TMP = $env:TEMP
$process = Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'dist/server.cjs' -WorkingDirectory $workspacePath -WindowStyle Hidden -RedirectStandardOutput "$runtimePath\connected-app-output.log" -RedirectStandardError "$runtimePath\connected-app-error.log" -PassThru
$process.Id | Set-Content -LiteralPath "$runtimePath\connected-app.pid"
Write-Output "Database-connected preview: http://localhost:3000 (PID $($process.Id))"
