$Root = "E:\Projects\Digital_Twin"

Write-Host ""
Write-Host "=== DT_DataCenter ENVIRONMENT ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "PROJECT" -ForegroundColor Yellow
Write-Host "Root           : $Root"
Write-Host "Git branch     : $(git -C $Root branch --show-current)"
Write-Host ""

Write-Host "DEVELOPMENT" -ForegroundColor Yellow
git --version
node --version
npm --version
python --version
Write-Host ""

Write-Host "DOCKER" -ForegroundColor Yellow
docker --version
docker compose version
Write-Host "Context        : $(docker context show)"
Write-Host ""

Write-Host "PROJECT PATHS" -ForegroundColor Yellow

$Paths = @(
    "$Root\backend",
    "$Root\database",
    "$Root\docker",
    "$Root\mqtt",
    "$Root\assets",
    "$Root\scripts",
    "$Root\docs",
    "$Root\logs",
    "$Root\backups",
    "$Root\assets\3d\source",
    "$Root\assets\3d\blender",
    "$Root\assets\3d\web"
)

foreach ($Path in $Paths) {
    if (Test-Path $Path) {
        Write-Host "OK      $Path" -ForegroundColor Green
    } else {
        Write-Host "MISSING $Path" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "SERVICES" -ForegroundColor Yellow

$Services = @(
    "postgresql-x64-17",
    "windows_exporter",
    "Grafana"
)

foreach ($Name in $Services) {
    $Service = Get-Service $Name -ErrorAction SilentlyContinue

    if ($Service) {
        $StartMode = (Get-CimInstance Win32_Service -Filter "Name='$Name'").StartMode
        Write-Host "$Name : $($Service.Status) / $StartMode"
    } else {
        Write-Host "$Name : NOT FOUND" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "PORTABLE TOOLS" -ForegroundColor Yellow

$Tools = @(
    "D:\Tools\Digital_Twin\Prometheus\prometheus.exe",
    "D:\Program Files\Mosquitto\mosquitto.exe"
)

foreach ($Tool in $Tools) {
    if (Test-Path $Tool) {
        Write-Host "OK      $Tool" -ForegroundColor Green
    } else {
        Write-Host "MISSING $Tool" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== COMPLETE ===" -ForegroundColor Cyan
