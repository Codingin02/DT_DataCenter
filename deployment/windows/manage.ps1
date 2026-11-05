param(
    [ValidateSet('install', 'start', 'stop', 'status', 'update', 'backup', 'restore')]
    [string]$Action = 'status',
    [string]$Archive,
    [string]$Database
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location -LiteralPath $Root
$EnvironmentFile = if ($env:DT_ENV_FILE) { $env:DT_ENV_FILE } else { Join-Path $Root '.env.windows' }
if ($Action -eq 'restore') {
    if ($Database -cnotmatch '^dt_datacenter_restore_[a-z0-9_]+$' -or $Database.Length -gt 63) {
        throw 'Restore requires a NEW dt_datacenter_restore_* database; production restore is not automated.'
    }
    if (-not $Archive -or -not (Test-Path -LiteralPath $Archive -PathType Leaf)) { throw 'Archive not found.' }
}
if (-not (Test-Path -LiteralPath $EnvironmentFile -PathType Leaf)) {
    if ($Action -eq 'install') { Copy-Item -LiteralPath (Join-Path $PSScriptRoot '.env.example') -Destination $EnvironmentFile }
    throw "Configure private environment first: $EnvironmentFile"
}
$Compose = @('compose', '--env-file', $EnvironmentFile, '-p', 'dt_datacenter', '-f', (Join-Path $Root 'docker/compose.yaml'), '-f', (Join-Path $Root 'docker/compose.windows.yaml'))
function Invoke-Docker {
    & docker @args
    if ($LASTEXITCODE -ne 0) { throw "Docker command failed (exit $LASTEXITCODE)." }
}
function Invoke-Compose { Invoke-Docker @Compose @args }
Invoke-Docker info | Out-Null
Invoke-Compose config --quiet
switch ($Action) {
    'start' { Invoke-Compose up -d --no-build --wait --wait-timeout 120 }
    'stop' { Invoke-Compose stop --timeout 30 }
    'status' { Invoke-Compose ps }
    'install' {
        Invoke-Compose pull postgres mosquitto nginx
        Invoke-Compose build --pull backend
        Write-Host 'Images ready. Run deployment/windows/start.ps1; no devices were reconfigured.'
    }
    'update' {
        $Status = & git status --porcelain
        if ($LASTEXITCODE -ne 0 -or $Status) { throw 'Working tree has changes or is not a Git repository.' }
        $Branch = & git branch --show-current
        if ($LASTEXITCODE -ne 0 -or $Branch -ne 'main') { throw 'Update requires branch main.' }
        & (Join-Path $PSScriptRoot 'backup.ps1')
        & git pull --ff-only origin main
        if ($LASTEXITCODE -ne 0) { throw 'Git update failed.' }
        Invoke-Compose config --quiet
        Invoke-Compose build --pull backend
        Invoke-Compose run --rm --no-deps nginx nginx -t
        Invoke-Compose run --rm --no-deps --entrypoint /bin/sh mosquitto -ec 'mosquitto_passwd -b -c /run/mosquitto/passwords "$MQTT_USERNAME" "$MQTT_PASSWORD"; chown mosquitto:mosquitto /run/mosquitto/passwords; exec mosquitto -c /mosquitto/config/mosquitto.conf --test-config'
        Invoke-Compose up -d --no-build --force-recreate --wait --wait-timeout 120 mosquitto backend nginx
        Invoke-Compose up -d --no-build --wait --wait-timeout 120
    }
    'backup' {
        if (-not $Archive) { $Archive = Join-Path $Root ('backups/postgresql/DT_DataCenter-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '.dump') }
        $Archive = [IO.Path]::GetFullPath($Archive)
        if (Test-Path -LiteralPath $Archive) { throw 'Backup exists; refusing overwrite.' }
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Archive)) | Out-Null
        $Temporary = '/tmp/dt-backup-' + [guid]::NewGuid().ToString('N') + '.dump'
        $Lock = [IO.File]::Open($Archive + '.lock', [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try {
            Invoke-Compose exec -T postgres sh -ec 'umask 077; export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$1"; pg_restore --list "$1" >/dev/null' sh $Temporary
            Invoke-Compose cp ('postgres:' + $Temporary) ($Archive + '.partial')
            [IO.File]::Move(($Archive + '.partial'), $Archive)
            Write-Host "Backup: $Archive"
        } finally {
            & docker @Compose exec -T postgres rm -f -- $Temporary | Out-Null
            $Lock.Dispose()
            Remove-Item -LiteralPath ($Archive + '.lock') -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath ($Archive + '.partial') -ErrorAction SilentlyContinue
        }
    }
    'restore' {
        $Temporary = '/tmp/dt-restore-' + [guid]::NewGuid().ToString('N') + '.dump'
        $TestSql = $Temporary + '.sql'
        try {
            Invoke-Compose cp $Archive ('postgres:' + $Temporary)
            Invoke-Compose cp (Join-Path $Root 'database/tests/foundation.sql') ('postgres:' + $TestSql)
            Invoke-Compose exec -T postgres sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_restore --list "$1" >/dev/null; createdb -U "$POSTGRES_USER" --maintenance-db="$POSTGRES_DB" --template=template0 "$2"; pg_restore --exit-on-error --single-transaction --no-owner --no-privileges -U "$POSTGRES_USER" -d "$2" "$1"; psql -X -v ON_ERROR_STOP=1 -v FOUNDATION_ALREADY_APPLIED=1 -U "$POSTGRES_USER" -d "$2" -f "$3"' sh $Temporary $Database $TestSql
            Write-Host "Restore verified in $Database; operational database unchanged. Verification database retained."
        } finally {
            & docker @Compose exec -T postgres rm -f -- $Temporary $TestSql | Out-Null
        }
    }
}
