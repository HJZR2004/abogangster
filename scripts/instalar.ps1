<#
.SYNOPSIS
  First-time install of Abogangster on the lawyer's Windows machine.
.DESCRIPTION
  Run from the repository folder:
    powershell -ExecutionPolicy Bypass -File scripts\instalar.ps1
  Checks prerequisites, installs dependencies, runs the tests, builds the installer and runs it.
#>
param(
  [switch]$SinPruebas
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Paso($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }

Paso 'Verificando requisitos'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Falta Git. Instálelo desde https://git-scm.com/download/win' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Falta Node.js. Instale la versión LTS desde https://nodejs.org' }
$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) { throw "Node.js $(node -v) es muy antiguo. Instale la versión 22 o superior." }
Write-Host "Node $(node -v), npm $(npm -v)"
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Write-Warning 'Ollama no está instalado (opcional, necesario para IA local): https://ollama.com/download'
}

Paso 'Instalando dependencias (npm ci)'
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Falló npm ci' }

if (-not $SinPruebas) {
  Paso 'Ejecutando pruebas'
  npm test
  if ($LASTEXITCODE -ne 0) { throw 'Las pruebas fallaron; no se instala.' }
}

Paso 'Construyendo el instalador'
npm run build:win
if ($LASTEXITCODE -ne 0) { throw 'Falló la construcción del instalador' }

$instalador = Get-ChildItem dist -Filter 'Abogangster-*-instalador.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $instalador) { throw 'No se encontró el instalador en dist\' }

Paso "Abriendo el instalador: $($instalador.Name)"
Start-Process $instalador.FullName -Wait
Write-Host "`nListo. Abra Abogangster desde el acceso directo del escritorio y configure la IA en Configuración." -ForegroundColor Green
