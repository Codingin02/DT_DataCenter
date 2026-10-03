$ErrorActionPreference = 'Stop'
$srcDir = Join-Path $PSScriptRoot '..\main'
$testDir = $PSScriptRoot
$outDir = Join-Path $PSScriptRoot 'build'

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$commonFlags = @('-std=c11', '-msse2', '-mfpmath=sse', '-Wall', '-Wextra', '-Werror', '-O2', "-I$srcDir")

$tests = @(
    @{
        Name = 'sht31_test'
        Sources = @("$srcDir\sht31_decode.c", "$testDir\sht31_test.c")
        ExtraFlags = @()
    },
    @{
        Name = 'inmp441_test'
        Sources = @("$srcDir\inmp441_samples.c", "$testDir\inmp441_test.c")
        ExtraFlags = @()
    },
    @{
        Name = 'acoustic_processing_test'
        Sources = @("$srcDir\acoustic_processing.c", "$testDir\acoustic_processing_test.c")
        ExtraFlags = @()
    },
    @{
        Name = 'measurement_runtime_test'
        Sources = @("$srcDir\measurement_model.c", "$testDir\measurement_runtime_test.c")
        ExtraFlags = @()
    },
    @{
        Name = 'connectivity_policy_test'
        Sources = @("$srcDir\connectivity_policy.c", "$srcDir\measurement_model.c", "$testDir\connectivity_policy_test.c")
        ExtraFlags = @()
    },
    @{
        Name = 'telemetry_record_test'
        Sources = @("$srcDir\telemetry_record.c", "$srcDir\measurement_model.c", "$srcDir\acoustic_processing.c", "$testDir\telemetry_record_test.c")
        ExtraFlags = @("-I$testDir\host_compat")
    }
)

$passed = 0
$failed = 0

foreach ($test in $tests) {
    $exe = Join-Path $outDir "$($test.Name).exe"
    $compileArgs = $commonFlags + $test.ExtraFlags + @('-o', $exe) + $test.Sources + @('-lm')
    Write-Host "BUILD  $($test.Name)" -ForegroundColor Cyan
    & gcc @compileArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAIL   $($test.Name) (compile)" -ForegroundColor Red
        $failed++
        continue
    }
    Write-Host "RUN    $($test.Name)" -ForegroundColor Cyan
    & $exe
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAIL   $($test.Name) (exit=$LASTEXITCODE)" -ForegroundColor Red
        $failed++
    } else {
        Write-Host "PASS   $($test.Name)" -ForegroundColor Green
        $passed++
    }
}

Write-Host "`n$passed passed, $failed failed" -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Red' })
exit $failed
