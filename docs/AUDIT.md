# Audit dan penataan USB

## Sebelum

```text
DEBIAN 13_7/
  deploy-nginx-lab.sh
  Digital Twin/
    Digital_Twin/                 source utama, env dan data lokal
    server-deployment/            paket image/dependency + salinan project
    offline-deployment-20261030/   duplikat paket
    SETUP_SERVER.sh
    PANDUAN_DEBIAN_SERVER.txt
```

Inventaris awal proyek: 1.987 file, dengan SHA-256, ukuran dan mtime. Instalasi Debian di root USB dipertahankan; tidak diformat/dihapus.

## Sesudah

```text
Digital Twin/
  README.md .gitignore .dockerignore
  backend/ frontend/ assets/ api/
  database/migrations/ database/tests/ database/README.md
  docker/compose.yaml
  docker/compose.windows.yaml docker/compose.linux.yaml docker/compose.funnel.yaml
  docker/mosquitto/ infra/nginx/
  deployment/windows/ deployment/linux/
  deployment/resources/              satu salinan image/paket, privat
  config/windows/ config/linux/ config/private/
  firmware/ESP32/ firmware/esp32s3_datacenter/
  docs/ scripts/ backups/ observability/
  build/                             bukti pemulihan Arduino, privat
```

Source utama dipindahkan dari wrapper `Digital_Twin/` ke root tanpa menimpa collision. Metadata Git diambil dari clone GitHub; tidak ada checkout source GitHub ke USB. Build firmware aktif dipertahankan karena `.ino` asli belum ditemukan, bukan dianggap cache yang aman dihapus.

## Perbandingan awal GitHub

Referensi main: `3878e474eb8b4e9a03244c0b506e745ab036a23f`.

- 127 file identik byte.
- 10 file berbeda; 7 hanya akhir baris.
- 1.618 file hanya di USB, kebanyakan build/data runtime/asset privat.
- 0 file hanya di GitHub.

Perubahan isi nyata: scripts/runtime.sh, scripts/setup-linux.sh, scripts/shelly-sync.sh. Perbedaan CRLF/LF: .gitattributes, .gitignore, .npmrc, .prettierignore, mqtt/acl, scripts/Check-DT-Environment.ps1, firmware/esp32s3_datacenter/tests/run_host_tests.ps1. Akhir baris tidak dijadikan alasan mengganti source atau membuat perubahan massal.

## Pembersihan

230 file dari dua paket dipetakan terlebih dahulu ke 119 tujuan unik dalam `config/private/cleanup-plan.json`. Image/paket dan evidence dipindahkan ke deployment/resources; seluruh penghapusan salinan diverifikasi terhadap hash tujuan. Kedua salinan project paket identik satu sama lain, tetapi empat konfigurasi berbeda dari source utama: .env.example, docker/compose.server.yaml, scripts/runtime.sh, docs/architecture-nginx.md. Perbedaan itu disimpan sebagai provenance privat, bukan dijadikan aplikasi kedua.

Panduan/setup lama disimpan privat karena memuat informasi sensitif dan perilaku konfigurasi yang tidak lagi cocok. Skrip root USB deploy-nginx-lab.sh juga dipindahkan ke arsip privat. Tidak dijalankan untuk mengubah server. Folder wrapper/paket kosong dihapus setelah konsolidasi, demikian pula placeholder kosong hardware/tests/tools/prometheus/grafana. 131 file metadata AppleDouble macOS yang terverifikasi dibersihkan, bukan source/data proyek.

Tidak ada backup DB, private header, env asli, migration, source aplikasi atau asset aktif yang dihapus. Tidak ditemukan PostgreSQL dump pada inventaris awal. Runtime data Mosquitto/Prometheus dipertahankan dan tidak dipublikasikan.

## Ketidaksesuaian yang tidak ditutupi

- USB NIC enp0s3 vs referensi Debian enp11s0; source collector tetap sama.
- Env USB backend 3010 bind 0.0.0.0 vs template baru loopback.
- Broker firmware recovery 10.124.102.126:1883 vs referensi deployment 192.168.1.167:1883; tidak ada reflash/perubahan firmware.
- Database USB/Compose DT_DataCenter vs salah eja pada catatan pengguna yang belum terverifikasi; tidak mengganti nama DB.
- .env.server produksi belum dapat diperoleh; tidak diklaim tersinkronisasi.

## Perubahan teknis dan alasan

- Wrapper OS dan override Compose: satu source, OS-specific exporter, persistence MQTT dan pemilihan volume DB existing.
- Dockerfile: build dari lockfile/source, bukan ketergantungan node_modules laptop atau dist lama.
- Compose MQTT env: client ID/expiry/payload limit memakai variabel dengan default existing, agar env tidak diabaikan.
- Nginx: listener Funnel read-only terpisah dan loopback host, tanpa menutup fitur LAN.
- Setup/runtime compatibility: delegasi ke jalur baru; tidak menambah alias IP atau mengubah Shelly otomatis.
- Tool Shelly: gate persetujuan serta dua IPv4 eksplisit; tidak ada discovery/scan subnet, mencegah kandidat host salah atau probe server lain.
- Ignore: melindungi private notes, recovered firmware, resource archive, env, dump dan key.
- Dokumentasi: nama resmi Digital Twin, path root konsisten, perintah OS serta batas verifikasi aktual.
- Review independen: fitur MSI Windows Exporter dikoreksi ke DefaultFeature, startup Manual diverifikasi, konfigurasi bind-mount divalidasi/recreate pada update.
- Dependency security: hanya fast-uri 3.1.5 → 3.1.9 dan ip-address 10.5.0 → 10.7.6 diperbarui dalam lockfile setelah audit menemukan advisory; tidak ada dependency baru atau perubahan API aplikasi.
- Konfigurasi cache npm diubah dari path absolut Windows ke `.cache/npm` yang relatif dan diabaikan Git; cache/log yang dihasilkan saat pemeriksaan dihapus dari staging sebelum commit.

Tidak ada perubahan backend ingestion, parser/rate RX/TX, algoritma firmware, frontend UI, schema migration atau topic/payload sensor.

## Bukti audit privat

`config/private/audit/` menyimpan inventaris awal, perbandingan lengkap per file, hasil scan tersensor dan laporan awal. Nilai credential tidak ditulis ke dokumentasi ini. Lihat [COMPLETION.md](COMPLETION.md) untuk status pengujian dan publikasi terkini.
