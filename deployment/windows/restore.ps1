param([Parameter(Mandatory = $true)][string]$Archive, [Parameter(Mandatory = $true)][string]$Database)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'manage.ps1') -Action restore -Archive $Archive -Database $Database
