# Updates an installed Productive Browser with the app files from `npx electron-builder --win --dir`
# (dist\win-unpacked), without building or running a new installer. Run from an elevated PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\update-installed.ps1
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '..\dist\win-unpacked\resources'
$target = 'C:\Program Files\Productive Browser\resources'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole('Administrators')) {
  throw 'Run this from PowerShell opened with "Run as administrator".'
}
if (-not (Test-Path "$source\app.asar")) { throw "No build found at $source. Run: npx electron-builder --win --dir" }
if (-not (Test-Path $target)) { throw "Productive Browser isn't installed at $target." }

Get-Process 'Productive Browser' -ErrorAction SilentlyContinue | Stop-Process -Force
& "$target\winsw\ProductiveBrowserService.exe" stop | Out-Null
Copy-Item "$source\app.asar" "$target\app.asar" -Force
Remove-Item "$target\app.asar.unpacked" -Recurse -Force
Copy-Item "$source\app.asar.unpacked" "$target\app.asar.unpacked" -Recurse -Force
& "$target\winsw\ProductiveBrowserService.exe" start | Out-Null
Write-Host 'Productive Browser updated. Open it, choose a content filter under Limits, and save.'
