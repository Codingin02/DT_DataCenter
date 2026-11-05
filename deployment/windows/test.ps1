$ErrorActionPreference = 'Stop'
$Source = $PSScriptRoot
$Temporary = Join-Path ([IO.Path]::GetTempPath()) ('Digital Twin test ' + [guid]::NewGuid().ToString('N'))
$PreviousEnv = $env:DT_ENV_FILE
$PreviousDirectory = Get-Location
try {
    $Scripts = Join-Path $Temporary 'deployment/windows'
    [IO.Directory]::CreateDirectory($Scripts) | Out-Null
    Get-ChildItem -LiteralPath $Source -Filter *.ps1 | Copy-Item -Destination $Scripts
    Set-Content -LiteralPath (Join-Path $Temporary '.env.windows') -Value 'POSTGRES_PASSWORD=test-only'
    $env:DT_ENV_FILE = ''
    $global:Commands = [Collections.Generic.List[string]]::new()
    $global:FailValidation = $false
    function global:docker {
        $global:Commands.Add(($args | ConvertTo-Json -Compress))
        $global:LASTEXITCODE = 0
        if ($global:FailValidation -and $args -contains 'run' -and $args -contains 'nginx') {
            $global:LASTEXITCODE = 9
            return
        }
        if ($args -contains 'cp' -and $args[-2] -like 'postgres:*') {
            [IO.File]::WriteAllBytes($args[-1], [byte[]]@(0, 255, 128, 10, 13))
        }
    }
    & (Join-Path $Scripts 'start.ps1')
    if (-not ($global:Commands -match 'compose.windows.yaml') -or -not ($global:Commands -match '"--wait"')) { throw 'Missing Windows override/health wait.' }
    $global:Commands.Clear()
    & (Join-Path $Scripts 'stop.ps1')
    if ($global:Commands -match '"down"|"prune"|"--volumes"') { throw 'Destructive stop.' }
    $Backup = Join-Path $Temporary 'backups/test.dump'
    & (Join-Path $Scripts 'backup.ps1') -Archive $Backup
    if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($Backup)) -ne 'AP+ACg0=') { throw 'Binary archive corrupted.' }
    foreach ($Database in @('DT_DataCenter', 'postgres', 'dt_datacenter_restore_x;DROP')) {
        $global:Commands.Clear()
        $Rejected = $false
        try { & (Join-Path $Scripts 'restore.ps1') -Archive $Backup -Database $Database } catch { $Rejected = $true }
        if (-not $Rejected -or $global:Commands.Count) { throw 'Unsafe restore target accepted.' }
    }
    Set-Content -LiteralPath (Join-Path $Scripts 'backup.ps1') -Value "Write-Host 'backup fixture'"
    function global:git {
        $global:LASTEXITCODE = 0
        if ($args[0] -eq 'branch') { 'main' }
    }
    $global:Commands.Clear()
    & (Join-Path $Scripts 'update.ps1')
    $UpdateCommands = $global:Commands -join "`n"
    if ($UpdateCommands -notmatch '(?s)"nginx","nginx","-t".*"--force-recreate"') { throw 'Update did not validate before recreating.' }
    $global:Commands.Clear()
    $global:FailValidation = $true
    $Rejected = $false
    try { & (Join-Path $Scripts 'update.ps1') } catch { $Rejected = $true }
    if (-not $Rejected -or ($global:Commands -match '"up"')) { throw 'Invalid Nginx config reached startup.' }
    Write-Host 'PASS: Windows wrapper argument handling, stop, binary backup, restore guards and update validation/recreation (Docker/Git mocked).'
} finally {
    Set-Location $PreviousDirectory
    $env:DT_ENV_FILE = $PreviousEnv
    Remove-Item Function:\docker -ErrorAction SilentlyContinue
    Remove-Item Function:\git -ErrorAction SilentlyContinue
    Remove-Variable Commands -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable FailValidation -Scope Global -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $Temporary -Recurse -Force
}
