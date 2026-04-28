$ErrorActionPreference = "Stop"

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeCandidates = @(
  "node",
  "$env:LOCALAPPDATA\OpenAI\Codex\bin\node.exe"
)

$nodeExe = $null
foreach ($candidate in $nodeCandidates) {
  $command = Get-Command $candidate -ErrorAction SilentlyContinue
  if ($command) {
    $nodeExe = $command.Source
    break
  }
}

if (-not $nodeExe) {
  Write-Host "Node.js was not found." -ForegroundColor Red
  Write-Host "Install Node.js from https://nodejs.org, then run this script again."
  exit 1
}

Set-Location $appDir
Write-Host "Starting CMPA web app at http://localhost:4173"
Write-Host "Press Ctrl+C to stop the server."
& $nodeExe "server.mjs"
