param([string]$Archive)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'manage.ps1') -Action backup -Archive $Archive
