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

Set-Location $appDir
Write-Host "Starting CMPA web app at http://localhost:4173"
Write-Host "Press Ctrl+C to stop the server."

if ($nodeExe) {
  & $nodeExe "server.mjs"
  exit $LASTEXITCODE
}

Write-Host "Node.js was not found. Using the built-in PowerShell server instead." -ForegroundColor Yellow

$prefix = "http://localhost:4173/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()

function Send-TextResponse {
  param(
    [System.Net.HttpListenerResponse] $Response,
    [int] $Status,
    [string] $Body,
    [string] $ContentType = "text/plain; charset=utf-8"
  )
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
  $Response.StatusCode = $Status
  $Response.ContentType = $ContentType
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.OutputStream.Close()
}

function Decode-Html {
  param([string] $Value)
  return [System.Net.WebUtility]::HtmlDecode($Value)
}

function Normalize-ExtractedText {
  param([string] $Value)
  return ($Value `
    -replace 'https?://\S+', ' ' `
    -replace '\bwww\.\S+', ' ' `
    -replace '\b\S+@\S+\.\S+\b', ' ' `
    -replace '\s+', ' ').Trim()
}

function Get-BrowserHeaders {
  return @{
    "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    "Accept" = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    "Accept-Language" = "en-US,en;q=0.9"
    "Cache-Control" = "no-cache"
  }
}

function Extract-ProgramText {
  param([string] $Html)

  $title = ""
  if ($Html -match '(?is)<title[^>]*>(.*?)</title>') {
    $title = Decode-Html $Matches[1].Trim()
  }

  $body = $Html `
    -replace '(?is)<script.*?</script>', ' ' `
    -replace '(?is)<style.*?</style>', ' ' `
    -replace '(?is)<noscript.*?</noscript>', ' ' `
    -replace '(?is)<svg.*?</svg>', ' ' `
    -replace '(?is)<nav.*?</nav>', ' ' `
    -replace '(?is)<header.*?</header>', ' ' `
    -replace '(?is)<footer.*?</footer>', ' ' `
    -replace '(?i)</(h1|h2|h3|h4|p|li|tr|section|article|div)>', "`n" `
    -replace '(?i)<br\s*/?>', "`n" `
    -replace '<[^>]+>', ' '

  $programSignals = @(
    "about this program", "admission requirements", "capstone", "career", "careers",
    "concentration", "course", "courses", "curriculum", "degree requirements",
    "field placement", "internship", "learning outcome", "learning outcomes",
    "major requirements", "minor requirements", "overview", "practicum", "program description",
    "program highlights", "program requirements", "research", "students will",
    "study", "target", "who should apply"
  )

  $junkSignals = @(
    "accessibility", "alumni", "apply now", "calendar", "campus map", "contact us",
    "cookie", "copyright", "directory", "donate", "events", "facebook", "financial aid",
    "instagram", "login", "privacy", "request information", "search", "site map",
    "skip to", "twitter", "youtube"
  )

  $lines = (Decode-Html $body) -split "`n+" | ForEach-Object { Normalize-ExtractedText $_ } | Where-Object { $_ }
  $kept = @()
  foreach ($line in $lines) {
    $lower = $line.ToLowerInvariant()
    if ($line.Length -lt 35) { continue }
    if (($junkSignals | Where-Object { $lower.Contains($_) }).Count -gt 0) { continue }
    if (($programSignals | Where-Object { $lower.Contains($_) }).Count -gt 0) { $kept += $line }
  }

  if ($kept.Count -lt 4) {
    $kept = $lines |
      Where-Object { $_.Length -ge 45 } |
      Where-Object {
        $lower = $_.ToLowerInvariant()
        ($junkSignals | Where-Object { $lower.Contains($_) }).Count -eq 0
      } |
      Select-Object -First 45
  }

  return @{
    title = $title
    text = (($kept -join " ") -replace '\s+', ' ').Trim()
    sectionsKept = @($kept).Count
  }
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    if ($request.Url.AbsolutePath -eq "/api/extract") {
      $target = $request.QueryString["url"]
      if (-not $target -or $target -notmatch '^https?://') {
        Send-TextResponse $response 400 '{"error":"Provide a valid http or https URL."}' "application/json; charset=utf-8"
        continue
      }

      try {
        $page = Invoke-WebRequest -Uri $target -UseBasicParsing -Headers (Get-BrowserHeaders) -TimeoutSec 20
        $extracted = Extract-ProgramText $page.Content
        Send-TextResponse $response 200 ($extracted | ConvertTo-Json -Compress) "application/json; charset=utf-8"
      } catch {
        $message = $_.Exception.Message
        if ($message -match "403|Forbidden") {
          $message = "This website blocks automated fetching. Open the page in your browser, copy the program description/course/outcome text, and use Pasted website copy."
        } elseif ($message -match "timed out|timeout") {
          $message = "The webpage took too long to respond. Paste the program text or try again later."
        } else {
          $message = "Could not fetch the webpage. $message"
        }
        $payload = @{ error = $message } | ConvertTo-Json -Compress
        Send-TextResponse $response 500 $payload "application/json; charset=utf-8"
      }
      continue
    }

    $path = [Uri]::UnescapeDataString($request.Url.AbsolutePath.TrimStart("/"))
    if (-not $path) { $path = "index.html" }
    $filePath = Join-Path $appDir $path
    $resolved = [System.IO.Path]::GetFullPath($filePath)
    $root = [System.IO.Path]::GetFullPath($appDir)

    if (-not $resolved.StartsWith($root)) {
      Send-TextResponse $response 403 "Forbidden"
      continue
    }

    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
      $resolved = Join-Path $appDir "index.html"
    }

    $extension = [System.IO.Path]::GetExtension($resolved).ToLowerInvariant()
    $contentType = switch ($extension) {
      ".html" { "text/html; charset=utf-8" }
      ".css" { "text/css; charset=utf-8" }
      ".js" { "text/javascript; charset=utf-8" }
      ".md" { "text/markdown; charset=utf-8" }
      default { "application/octet-stream" }
    }

    $bytes = [System.IO.File]::ReadAllBytes($resolved)
    $response.StatusCode = 200
    $response.ContentType = $contentType
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.OutputStream.Close()
  }
} finally {
  $listener.Stop()
}
