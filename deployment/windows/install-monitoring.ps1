param(
    [Parameter(Mandatory = $true)][string]$Msi,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Fa-f0-9]{64}$')][string]$Sha256
)
$ErrorActionPreference = 'Stop'
if ((Get-FileHash -LiteralPath $Msi -Algorithm SHA256).Hash -ne $Sha256) { throw 'MSI checksum mismatch.' }
$Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$Principal = New-Object Security.Principal.WindowsPrincipal($Identity)
if (-not $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run elevated PowerShell.' }
# No firewall exception is created automatically. Authorize Docker Desktop's source separately.
$Process = Start-Process msiexec.exe -Wait -PassThru -ArgumentList @('/i', ('"' + (Resolve-Path -LiteralPath $Msi).Path + '"'), '/qn', 'ENABLED_COLLECTORS=net', 'LISTEN_PORT=9182', 'ADDLOCAL=DefaultFeature')
if ($Process.ExitCode -notin @(0, 3010)) { throw "Windows Exporter install failed ($($Process.ExitCode))." }
Set-Service windows_exporter -StartupType Manual
$Service = Get-CimInstance Win32_Service -Filter "Name='windows_exporter'"
if ($Service.StartMode -ne 'Manual') { throw 'Windows Exporter startup mode must be Manual.' }
Get-Service windows_exporter
