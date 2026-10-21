$ErrorActionPreference = 'Stop'
$Directory = 'D:\Tools\Digital_Twin\Scripts'
$Trees = @{}
foreach ($Name in @('Start-DigitalTwin.ps1', 'Stop-DigitalTwin.ps1')) {
    $Tokens = $null
    $Errors = $null
    $Tree = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $Directory $Name), [ref]$Tokens, [ref]$Errors)
    if ($Errors.Count) { throw "$Name parse failed: $($Errors.Message -join ', ')" }
    $Trees[$Name] = $Tree
    $Text = $Tree.Extent.Text
    if ($Text -match 'dt_acceptance|(?<!\d)3011(?!\d)|acceptance-data|down\s+-v|volume\s+prune|Stop-Service[^\n]+-Force') {
        throw "$Name contains retired or unsafe runtime behavior."
    }
    if ($Text -notmatch 'Global\\DT_DataCenter_Launcher') { throw "$Name has no shared ownership lock." }
}
$Subnet = $Trees['Start-DigitalTwin.ps1'].Find({ param($Node)
    $Node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $Node.Name -eq 'Get-Subnet'
}, $true)
Invoke-Expression $Subnet.Extent.Text
foreach ($Case in @(
    @('10.124.102.126', 24, '10.124.102.0/24'),
    @('10.124.102.126', 16, '10.124.0.0/16'),
    @('10.124.102.126', 32, '10.124.102.126/32'),
    @('10.124.102.126', 20, '10.124.96.0/20')
)) {
    if ((Get-Subnet $Case[0] $Case[1]) -ne $Case[2]) { throw 'Subnet calculation failed.' }
}
$Stop = $Trees['Stop-DigitalTwin.ps1'].Extent.Text
if ($Stop -notmatch 'CreationDate' -or $Stop -notmatch 'DependentServices' -or $Stop -notmatch 'ExecutablePath') {
    throw 'Stop lacks PID/service ownership validation.'
}
$Start = $Trees['Start-DigitalTwin.ps1'].Extent.Text
if ($Start -notmatch 'Get-NetAdapter -Physical' -or $Start -notmatch 'HOST_EXPORTER_URL = "http://host\.docker\.internal:9182/metrics"' -or $Start -notmatch 'Remove-Item Env:HOST_NETWORK_NIC') { throw 'Host monitoring must use the physical routed NIC and scoped exporter configuration.' }
$HostReadiness = $Trees['Start-DigitalTwin.ps1'].Find({ param($Node)
    $Node -is [System.Management.Automation.Language.AssignmentStatementAst] -and $Node.Left.Extent.Text -eq '$HostResults'
}, $true)
$script:WaitedPorts=@()
function Wait-Port {
    param($Port, $TimeoutSeconds)
    if ($TimeoutSeconds -le 0 -or $TimeoutSeconds -gt 60) { throw 'Host readiness wait must be bounded.' }
    $script:WaitedPorts += $Port
    return $true
}
Invoke-Expression $HostReadiness.Extent.Text
if (($script:WaitedPorts -join ',') -ne '3000,9090,9182' -or @($HostResults.Values | Where-Object { -not $_ }).Count) { throw 'Cold host startup must wait for listener readiness.' }
foreach ($Tree in $Trees.Values) {
    $Wait = $Tree.Find({ param($Node)
        $Node -is [System.Management.Automation.Language.CommandAst] -and
        $Node.GetCommandName() -eq 'Start-Process' -and
        @($Node.CommandElements | Where-Object { $_ -is [System.Management.Automation.Language.CommandParameterAst] -and $_.ParameterName -eq 'Wait' }).Count -gt 0
    }, $true)
    if ($Wait -or $Tree.Extent.Text -notmatch '\.WaitForExit\(\)') { throw 'Elevated launcher must wait only for its direct process.' }
}
$ServiceControl = $Trees['Start-DigitalTwin.ps1'].Find({ param($Node)
    $Node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $Node.Name -eq 'Start-DTService'
}, $true)
Invoke-Expression $ServiceControl.Extent.Text
function Get-Service { param($Name) $script:Service }
function Get-CimInstance { param($ClassName, $Filter) $script:Definition }
function Set-Service {
    param($Name, $StartupType)
    if ($Name -notin @('Grafana', 'windows_exporter') -or $StartupType -ne 'Manual') { throw 'Unsafe service startup change.' }
    $script:Manual = $true
}
function Save-RuntimeState { $script:SavedState = $true }
function Start-Service { param($Name) $script:Service.Status = 'Running'; $script:Starts++ }
function Stop-Service { param($Name) $script:Service.Status = 'Stopped' }
function Invoke-CimMethod {
    param($InputObject, $MethodName, $Arguments)
    if ($MethodName -ne 'Change' -or $Arguments.PathName -notmatch '--web.listen-address=127\.0\.0\.1:9182$') { throw 'Unsafe exporter listener change.' }
    $script:Definition.PathName = $Arguments.PathName
    [pscustomobject]@{ ReturnValue=0 }
}
function Get-NetFirewallRule {
    param($DisplayName, $ErrorAction)
    foreach ($Name in @('exporter-tcp','exporter-udp')) {
        [pscustomobject]@{ Name=$Name; Direction='Inbound'; Action='Allow'; Enabled='True' }
    }
}
function Get-NetFirewallApplicationFilter {
    param([Parameter(ValueFromPipeline)]$Rule)
    process { [pscustomobject]@{ Program='C:\Program Files\windows_exporter\windows_exporter.exe' } }
}
function Get-NetFirewallPortFilter {
    param([Parameter(ValueFromPipeline)]$Rule)
    process { [pscustomobject]@{ Protocol=$(if ($Rule.Name -eq 'exporter-tcp') { 'TCP' } else { 'UDP' }); LocalPort='Any' } }
}
function Get-NetFirewallAddressFilter {
    param([Parameter(ValueFromPipeline)]$Rule)
    process { [pscustomobject]@{ LocalAddress='Any'; RemoteAddress='Any' } }
}
function Disable-NetFirewallRule {
    param($Name)
    if ($Name -ne 'exporter-udp') { throw 'Unexpected firewall disable.' }
    $script:UdpDisabled=$true
}
function Set-NetFirewallRule {
    param($Name, $Protocol, $LocalPort, $LocalAddress, $RemoteAddress, $Profile, $EdgeTraversalPolicy)
    if ($Name -ne 'exporter-tcp' -or $Protocol -ne 'TCP' -or $LocalPort -ne 9182 -or $LocalAddress -ne '127.0.0.1' -or $RemoteAddress -ne '127.0.0.1' -or $EdgeTraversalPolicy -ne 'Block') {
        throw 'Exporter firewall must allow only IPv4 loopback TCP 9182.'
    }
    $script:TcpRestricted=$true
}
function Write-Log { param($Message) }
foreach ($Case in @(@('Grafana','Running',0), @('Grafana','Stopped',1), @('windows_exporter','Running',1), @('windows_exporter','Stopped',1), @('windows_exporter','Running',0,$true))) {
    $script:Service = [pscustomobject]@{ Status=$Case[1]; DependentServices=@() }
    $script:Service | Add-Member ScriptMethod WaitForStatus { param($Status, $Timeout) $this.Status=$Status }
    $script:Definition = [pscustomobject]@{ PathName='"C:\Program Files\windows_exporter\windows_exporter.exe" --config.file="config.yaml"'; StartMode='Auto' }
    if ($Case.Count -eq 4 -and $Case[3]) { $script:Definition.PathName += ' --web.listen-address=127.0.0.1:9182' }
    $script:Starts=0; $script:Manual=$false; $script:SavedState=$false; $script:UdpDisabled=$false; $script:TcpRestricted=$false
    $State=@{ Services=@() }
    Start-DTService $Case[0]
    if (-not $script:Manual -or -not $script:SavedState -or $script:Starts -ne $Case[2] -or $State.Services[0].Name -ne $Case[0]) {
        throw 'Manual service ownership or idempotent startup failed.'
    }
    if ($Case[0] -eq 'windows_exporter' -and (-not $script:UdpDisabled -or -not $script:TcpRestricted)) { throw 'Exporter firewall restriction failed.' }
}
if ($Start -notmatch 'UseSystemPasswordChar' -or $Start -notmatch 'user=current' -or $Start -notmatch 'VID_1A86&PID_55D3') {
    throw 'Local network provisioning boundaries are missing.'
}
$Readiness = $Trees['Start-DigitalTwin.ps1'].Find({ param($Node)
    $Node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $Node.Name -eq 'Wait-PhysicalSources'
}, $true)
Invoke-Expression $Readiness.Extent.Text
$ApplicationUrl = 'http://127.0.0.1:3010/'
function Invoke-RestMethod {
    param([string]$Uri, [int]$TimeoutSec)
    if ($Uri -notmatch '^http://127\.0\.0\.1:3010/api/assets/(sht31-a|sht31-b|rack-acoustic)/current-state$') {
        throw 'Invalid current-state URL.'
    }
    $Sources = switch ($Matches[1]) {
        'sht31-a' { 'sht31-a-temperature'; 'sht31-a-humidity' }
        'sht31-b' { 'sht31-b-temperature'; 'sht31-b-humidity' }
        'rack-acoustic' { 'rack-sound-rms'; 'rack-sound-peak' }
    }
    foreach ($Source in $Sources) {
        [pscustomobject]@{ device_id='rack-controller'; sensor_id=$Source; quality='good'; received_at=[DateTimeOffset]::UtcNow.AddSeconds(-1).ToString('o') }
    }
}
if (-not (Wait-PhysicalSources)) { throw 'Fresh six-source readiness failed.' }
if (-not (Wait-PhysicalSources -TimeoutSeconds 0)) { throw 'Healthy ESP32 must support a single non-blocking readiness check.' }
$ShellyRecovery = $Trees['Start-DigitalTwin.ps1'].Find({ param($Node)
    $Node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $Node.Name -eq 'Set-ShellyNetwork'
}, $true)
Invoke-Expression $ShellyRecovery.Extent.Text
$SavedIdentity = $env:SHELLY_MQTT_ID
$env:SHELLY_MQTT_ID = 'shellyplugpmg3-48f6eebbf3f4'
$NonInteractive = $true
function Get-NetNeighbor {
    param($InterfaceIndex, $AddressFamily, $ErrorAction)
    [pscustomobject]@{ IPAddress=$script:Candidate; LinkLayerAddress='48-F6-EE-BB-F3-F4' }
    [pscustomobject]@{ IPAddress='10.86.6.207'; LinkLayerAddress='00-11-22-33-44-55' }
}
function Write-Status { param($Label, $Status) $script:RecoveryStatus += "$Label $Status" }
function Resolve-DnsName { param($Name, $Type, [switch]$QuickTimeout, $ErrorAction) @() }
function Invoke-RestMethod {
    param([string]$Uri, [int]$TimeoutSec, $Method, $ContentType, $Body)
    if ($Method -or $Body) { throw 'Read-only recovery unexpectedly mutated a device.' }
    $script:Requests += $Uri
    switch -Regex ($Uri) {
        '/Shelly.GetDeviceInfo$' { [pscustomobject]@{ id=$script:DeviceIdentity; mac='48F6EEBBF3F4'; model='S3PL-30116EU' } }
        '/MQTT.GetConfig$' { [pscustomobject]@{ enable=$true; user='configured'; client_id=$env:SHELLY_MQTT_ID; topic_prefix=$env:SHELLY_MQTT_ID; server=$script:Server } }
        '/MQTT.GetStatus$' { [pscustomobject]@{ connected=$true } }
        default { throw "Unexpected discovery request: $Uri" }
    }
}
try {
    foreach ($Case in @(
        @('10.86.6.206', 'shellyplugpmg3-48f6eebbf3f4', '10.86.6.126:1883', 'PASS', 3),
        @('10.86.6.206', 'unrelated-device', '10.86.6.126:1883', 'NOT FOUND', 1),
        @('10.84.120.206', 'shellyplugpmg3-48f6eebbf3f4', '10.84.120.126:1883', 'NOT FOUND', 0),
        @('10.86.6.206', 'shellyplugpmg3-48f6eebbf3f4', '10.84.120.126:1883', 'NEEDS APPROVAL', 2)
    )) {
        $State=@{}; $script:Candidate=$Case[0]; $script:DeviceIdentity=$Case[1]; $script:Server=$Case[2]
        $script:Requests=@(); $script:RecoveryStatus=@()
        Set-ShellyNetwork '10.86.6.126' 10 24
        if ($script:Requests.Count -ne $Case[4] -or ($script:RecoveryStatus -join ';') -notmatch [regex]::Escape($Case[3])) {
            throw "Shelly identity/subnet/approval guard failed: $($Case[3])"
        }
        if ($script:Requests -match '10.86.6.207') { throw 'Discovery contacted an unrelated neighbor.' }
    }
} finally { $env:SHELLY_MQTT_ID=$SavedIdentity }
if ($Start -notmatch 'if \(\$Consent -ne \[Windows.Forms.DialogResult\]::Yes\)' -or $Start -match 'Switch.Set|PM1.SetConfig') { throw 'Shelly recovery must require consent without power control.' }
if ($Start -notmatch 'Wait-PhysicalSources -TimeoutSeconds 0' -or $Start -notmatch 'catch \{ Write-Status "MQTT network"') { throw 'Device provisioning must not fail healthy application startup.' }
if ($Start -notmatch 'up -d --pull never' -or $Start -notmatch 'build --pull=false backend' -or $Start -notmatch '\$State.BuildFingerprint -ne \$Fingerprint') { throw 'Unchanged source must not trigger an unnecessary image rebuild.' }
$BuildAssignment = $Trees['Start-DigitalTwin.ps1'].Find({param($Node)
    $Node -is [System.Management.Automation.Language.AssignmentStatementAst] -and $Node.Left.Extent.Text -eq '$BuildRequired'
}, $true)
$State=@{BuildFingerprint='current';BackendImage='image'}; $Fingerprint='current';$LocalImage='image'
Invoke-Expression $BuildAssignment.Extent.Text
if ($BuildRequired) { throw 'Unchanged image requested a rebuild.' }
$Fingerprint='changed'; Invoke-Expression $BuildAssignment.Extent.Text
if (-not $BuildRequired) { throw 'Changed source must rebuild the backend image before startup.' }
$Reuse = $Trees['Start-DigitalTwin.ps1'].Find({param($Node)
    $Node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $Node.Name -eq 'Test-RunningRuntime'
}, $true)
Invoke-Expression $Reuse.Extent.Text
$Healthy = @(1..4 | ForEach-Object { [pscustomobject]@{State='running';Health='healthy'} })
$Environment = @('HOST_EXPORTER_URL','HOST_EXPORTER_PLATFORM','HOST_DEVICE_ID','HOST_NETWORK_NIC') | ForEach-Object { "$_=$([Environment]::GetEnvironmentVariable($_,'Process'))" }
if (-not (Test-RunningRuntime $Healthy $Environment)) { throw 'Healthy unchanged runtime was not reused.' }
$Healthy[0].Health='unhealthy'
if (Test-RunningRuntime $Healthy $Environment) { throw 'Unhealthy runtime was incorrectly reused.' }
$Healthy[0].Health='healthy'
if (Test-RunningRuntime $Healthy @('HOST_NETWORK_NIC=unrelated-interface')) { throw 'Changed collector configuration was not reconciled.' }
$FingerprintFunction = $Trees['Start-DigitalTwin.ps1'].Find({param($Node)
    $Node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $Node.Name -eq 'Get-BuildFingerprint'
}, $true)
Invoke-Expression $FingerprintFunction.Extent.Text
$ProjectRoot=Split-Path $PSScriptRoot -Parent
$ComposeFile=Join-Path $ProjectRoot 'docker\compose.yaml'
$ActualFingerprint=Get-BuildFingerprint
if ($ActualFingerprint -ne (Get-BuildFingerprint)) { throw 'Source fingerprint is not stable.' }
$RuntimeFile=Join-Path $env:LOCALAPPDATA 'DT_DataCenter\launcher\owned-runtime.json'
$FrontendDecision = $Trees['Start-DigitalTwin.ps1'].Find({param($Node)
    $Node -is [System.Management.Automation.Language.IfStatementAst] -and
    $Node.Clauses[0].Item1.Extent.Text -match '\$State.FrontendFingerprint -ne'
}, $true)
if (-not $FrontendDecision) { throw 'Frontend build must be conditional.' }
$FrontendFingerprint='current'
function Test-Path { param($Path) $script:BundleExists }
function Invoke-NativeCommand { param($Command) $script:Builds++; [pscustomobject]@{ExitCode=$script:BuildExit;Output=''} }
foreach ($Case in @(@('current',$true,0),@('changed',$true,1),@('current',$false,1))) {
    $State=@{FrontendFingerprint=$Case[0]}; $script:BundleExists=$Case[1]; $script:Builds=0; $script:BuildExit=0
    Invoke-Expression $FrontendDecision.Extent.Text
    if ($script:Builds -ne $Case[2] -or $State.FrontendFingerprint -ne 'current') { throw 'Frontend build reuse/invalidation failed.' }
}
$State=@{FrontendFingerprint='changed'}; $script:BundleExists=$true; $script:BuildExit=1
try { Invoke-Expression $FrontendDecision.Extent.Text; throw 'Failed build was accepted.' }
catch { if ($_.Exception.Message -notmatch 'Frontend build failed' -or $State.FrontendFingerprint -ne 'changed') { throw } }
Remove-Item Function:Test-Path
if (Test-Path $RuntimeFile) {
    $Runtime=Get-Content $RuntimeFile -Raw|ConvertFrom-Json
    Write-Output "CHECK: PowerShell $($PSVersionTable.PSVersion); deployed source fingerprint matches = $($Runtime.BuildFingerprint -eq $ActualFingerprint)."
}
Write-Output 'PASS: Windows PowerShell parse, direct UAC wait, manual service ownership/startup, shared lock, subnet calculations and physical readiness.'
Write-Output 'PASS: bounded Shelly discovery, subnet/identity guards, healthy read-only operation, reboot approval and non-blocking ESP32 checks.'
Write-Output 'PASS: unchanged frontend skips build; changed/missing bundle rebuilds; failed build does not update its fingerprint.'
