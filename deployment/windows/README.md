# Deployment Windows

Gunakan satu source pada root `Digital Twin`, Docker Desktop Linux containers, `.env.windows`, dan override `docker/compose.windows.yaml`. Panduan lengkap: [WINDOWS.md](../../docs/WINDOWS.md).

Skrip: install/start/stop/status/update/backup/restore. `install-monitoring.ps1` memasang MSI Windows Exporter yang SHA256-nya sudah diverifikasi. `test.ps1` menguji wrapper dengan Docker mock; bukan uji Windows/Docker runtime.
