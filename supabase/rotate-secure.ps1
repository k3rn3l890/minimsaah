#Requires -Version 5.1
<#
  MINIMSAAH — rotate-secure.ps1
  Secure host for password rotation on Windows consoles where Node stdin
  drops pasted input. Prompts via Read-Host -AsSecureString (host-rendered
  '*' echo, works in every PowerShell host), holds secrets only in process
  memory, spawns node with process-scoped env, then exits (env dies with it).
  Nothing is written to disk, shell history, or logs.

  Run: powershell -ExecutionPolicy Bypass -File .\supabase\rotate-secure.ps1
  (ExecutionPolicy flag needed only if local scripts are restricted; the
  command itself contains no secrets.)
#>
$ErrorActionPreference = 'Stop'

function Read-Secret([string]$Label) {
  $s = Read-Host $Label -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

$key = Read-Secret 'SUPABASE_SERVICE_ROLE_KEY'
if (-not $key -or $key.Trim().Length -lt 100) { Write-Error 'Service key missing or truncated — aborting, nothing changed.'; exit 1 }

$pwAdmin = Read-Secret 'New password for admin@minimsaah.com (16+ chars)'
$pwEditor = Read-Secret 'New password for editor@minimsaah.com (16+ chars)'
$pwWriter = Read-Secret 'New password for writer@minimsaah.com (16+ chars)'
$pwVideo = Read-Secret 'New password for video@minimsaah.com (16+ chars)'
foreach ($p in @($pwAdmin, $pwEditor, $pwWriter, $pwVideo)) {
  if (-not $p -or $p.Length -lt 16) { Write-Error 'A password is missing or shorter than 16 chars — aborting, nothing changed.'; exit 1 }
}

$env:SUPABASE_SERVICE_ROLE_KEY = $key.Trim(); $key = $null
$env:STAFF_ADMIN_PASSWORD = $pwAdmin; $pwAdmin = $null
$env:STAFF_EDITOR_PASSWORD = $pwEditor; $pwEditor = $null
$env:STAFF_WRITER_PASSWORD = $pwWriter; $pwWriter = $null
$env:STAFF_VIDEO_PASSWORD = $pwVideo; $pwVideo = $null
$env:MINIMSAAH_SECURE_WRAPPER = '1'

& node (Join-Path $PSScriptRoot 'auth-rotate.js') --live-env
$code = $LASTEXITCODE
Remove-Item Env:\SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:\STAFF_ADMIN_PASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:\STAFF_EDITOR_PASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:\STAFF_WRITER_PASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:\STAFF_VIDEO_PASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:\MINIMSAAH_SECURE_WRAPPER -ErrorAction SilentlyContinue
exit $code
