#Requires -Version 5.1
<#
  MINIMSAAH — rotate-secure.ps1
  Secure host for password rotation on Windows consoles where pasting into
  secure prompts collapses to one character. The 200+ char service key is
  captured from the CLIPBOARD (proven working on this machine) instead of
  being pasted into a prompt; the four memorable-length passwords are typed
  (typing is proven working). Secrets live only in process memory; the
  clipboard is cleared immediately after capture. Nothing reaches disk,
  shell history, or logs.

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

Write-Host 'Step 1/2: copy the SUPABASE_SERVICE_ROLE_KEY to your clipboard now (Dashboard > Project Settings > API > service_role), then press Enter here.'
Read-Host 'Press Enter when the key is copied' | Out-Null
$key = ((Get-Clipboard -Raw) | Out-String).Trim()
try { Set-Clipboard -Value ' ' } catch {}
if (-not $key -or $key.Length -lt 100) { Write-Error 'Clipboard did not hold a full key — aborting, nothing changed.'; exit 1 }
Write-Host ('Key captured (' + $key.Length + ' chars), clipboard cleared.')

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
