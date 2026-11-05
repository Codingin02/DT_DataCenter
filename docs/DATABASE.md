# PostgreSQL dan pemulihan

Database canonical USB/Compose adalah `DT_DataCenter`, user default `bagus`; nama server aktual harus diverifikasi. Catatan `DT_DataCenten` tidak dibetulkan otomatis. Port 5432 hanya network internal Compose, tanpa host port.

## Skema

`database/migrations/foundation.sql`: registry/canonical state dan ingestion foundation; `production-identity.sql`: ESP32-S3 rack-controller dan enam identitas sensor; `shelly.sql`: integrasi Shelly; `system-measurements.sql`: metrik sistem. Source schema adalah migration ini, bukan schema kedua yang diduplikasi. Relasi detail dan aturan transaksi di `docs/contracts/foundation.md`.

Registry meliputi sites/assets/devices/sensors; pengukuran historis dan current state tetap PostgreSQL sebagai sumber canonical. Registrasi spasial dapat ditulis dari LAN, tetapi diblokir pada listener publik Funnel.

SQL init dijalankan image postgres hanya jika volume baru kosong. Volume existing tidak otomatis dimigrasikan karena file migration berubah. Jangan menambahkan/mengubah skema untuk merapikan deployment; pekerjaan ini tidak mengubah migration.

## Backup

Linux:

```bash
bash deployment/linux/backup.sh
# Atau path tujuan baru, tidak boleh sudah ada:
bash deployment/linux/backup.sh backups/postgresql/manual.dump
```

Windows:

```powershell
& ./deployment/windows/backup.ps1
& ./deployment/windows/backup.ps1 -Archive D:\Data\DigitalTwin.dump
```

Wrapper mengambil custom-format `pg_dump -Fc` dari **POSTGRES_DB container aktif**, memvalidasi table-of-contents dengan pg_restore, menyalin biner tanpa konversi teks, lalu menerbitkan archive lokal tanpa overwrite. Password dibaca dari env container, tidak diberikan pada command line host. File sementara container dihapus saat selesai/gagal. Simpan checksum archive di media aman dan uji restore sebelum mengandalkannya.

## Restore verification yang tidak menimpa data

```bash
bash deployment/linux/restore.sh backups/postgresql/manual.dump dt_datacenter_restore_verify
```

```powershell
& ./deployment/windows/restore.ps1 -Archive D:\Data\DigitalTwin.dump -Database dt_datacenter_restore_verify
```

Target harus database **baru** bernama `dt_datacenter_restore_*`, maksimal 63 karakter, huruf kecil/angka/underscore. `createdb` menolak nama existing. Restore memakai single transaction dan exit-on-error, lalu menjalankan `database/tests/foundation.sql` dengan `FOUNDATION_ALREADY_APPLIED=1`. Database verifikasi dipertahankan agar dapat diperiksa; tidak dihapus otomatis bila gagal. Ini bukan restore produksi.

Sebelum pemulihan produksi: hentikan writer pada jadwal yang disetujui, backup terbaru, restore ke database/volume baru, cocokkan schema, row counts, current state, histori dan sampel sensor nyata, lalu alihkan konfigurasi secara terkontrol. Pertahankan volume lama untuk rollback; jangan menimpa database berjalan atau menghapus histori baru.

Tool Node `scripts/postgres-backup.js` tetap tersedia untuk koneksi host dengan klien PostgreSQL terpasang. Ia mengharuskan PGDATABASE canonical, PG_BACKUP_FILE dan PGRESTORE_DATABASE; tool verify Node menghapus database disposable yang ia buat setelah verifikasi, berbeda dari wrapper OS yang mempertahankan target. Jangan menggunakannya dengan PGHOST=postgres di host yang tidak mengenali network Docker.

## Cek database

Gunakan `psql` di container dengan SQL read-only pada [operasi](OPERATIONS.md). Jangan mencetak PGPASSWORD/POSTGRES_PASSWORD atau `docker inspect` env. Perubahan env password pada volume lama tidak mengubah role password database secara otomatis.
