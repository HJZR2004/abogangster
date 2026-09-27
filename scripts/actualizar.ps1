<#
.SYNOPSIS
  Updates Abogangster to the latest version of the repository.
.DESCRIPTION
  Run from the repository folder (for example over AnyDesk):
    powershell -ExecutionPolicy Bypass -File scripts\actualizar.ps1
  Steps: backs up the database, git pull, npm ci, tests, builds the installer and installs it
  silently. The lawyer's documents are never touched (they live in the workspace folder).
#>
param(
  [switch]$SinPruebas
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Paso($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }

Paso 'Respaldando la base de datos'
$settingsFile = Join-Path $env:APPDATA 'Abogangster\settings.json'
if (Test-Path $settingsFile) {
  $workspace = (Get-Content $settingsFile -Raw -Encoding UTF8 | ConvertFrom-Json).workspaceDir
  $db = Join-Path $workspace '.abogangster\abogangster.db'
  if (Test-Path $db) {
    $backupDir = Join-Path $workspace '.abogangster\respaldos'
    New-Item -ItemType Directory -Force $backupDir | Out-Null
    $stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
    Copy-Item $db (Join-Path $backupDir "abogangster_$stamp.db")
    foreach ($ext in '-wal', '-shm') { if (Test-Path "$db$ext") { Copy-Item "$db$ext" (Join-Path $backupDir "abogangster_$stamp.db$ext") } }
    Write-Host "Respaldo en $backupDir"
    # Keep the 10 most recent backups.
    Get-ChildItem $backupDir -Filter 'abogangster_*.db' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 10 | ForEach-Object {
      Remove-Item $_.FullName, "$($_.FullName)-wal", "$($_.FullName)-shm" -ErrorAction SilentlyContinue
    }
  }
} else {
  Write-Host 'No hay configuración previa; se omite el respaldo.'
}

Paso 'Descargando cambios (git pull)'
git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'git pull falló (¿hay cambios locales?). Revise con: git status' }

Paso 'Instalando dependencias'
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Falló npm ci' }

if (-not $SinPruebas) {
  Paso 'Ejecutando pruebas'
  npm test
  if ($LASTEXITCODE -ne 0) { throw 'Las pruebas fallaron; no se actualiza la app instalada.' }
}

Paso 'Construyendo el instalador'
npm run build:win
if ($LASTEXITCODE -ne 0) { throw 'Falló la construcción del instalador' }
$instalador = Get-ChildItem dist -Filter 'Abogangster-*-instalador.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1

Paso 'Cerrando Abogangster si está abierto'
Get-Process -Name 'Abogangster' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Paso "Instalando $($instalador.Name) (silencioso)"
Start-Process $instalador.FullName -ArgumentList '/S' -Wait

Write-Host "`nActualización terminada." -ForegroundColor Green
$exe = Join-Path $env:LOCALAPPDATA 'Programs\Abogangster\Abogangster.exe'
if (Test-Path $exe) { Start-Process $exe }
