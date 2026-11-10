$ErrorActionPreference = 'Stop'
try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8766/health' -TimeoutSec 2; if ($health.engine -eq 'edge-tts') { Write-Host 'Edge TTS já está ativo.'; exit 0 } } catch {}
$taskPython = (Get-Command pythonw -ErrorAction Stop).Source
$taskServer = Join-Path $PSScriptRoot 'edge_tts_server.py'
Start-Process -FilePath $taskPython -ArgumentList ('"' + $taskServer + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
Write-Host 'Serviço Edge TTS iniciado em 127.0.0.1:8766.'
