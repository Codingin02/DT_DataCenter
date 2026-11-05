# Prosedur Pemulihan & Rollback Deployment (Recovery Guide)

Dokumen ini menjelaskan langkah-langkah pemulihan sistem jika terjadi kendala saat proses pembaruan source code atau aktivasi Tailscale Funnel.

---

## 1. Prinsip Utama Pemulihan

1. **Volume Data Terlindungi:** Kegagalan aplikasi atau kontainer tidak menghapus data sensor atau PostgreSQL karena volume Docker disimpan terpisah di `/var/lib/docker/volumes/`.
2. **Kredensial Produksi Terisolasi:** File `.env.server` asli selalu dicadangkan ke `/opt/backups/digital-twin/backup-<timestamp>/.env.server` sebelum pembaruan dimulai.
3. **Pemisahan Layanan:** Gangguan pada Tailscale atau port 8080 tidak mematikan layanan LAN port 80 atau broker MQTT 1883.

---

## 2. Prosedur Rollback Cepat via Orchestrator

Jika pembaruan source code menyebabkan kontainer gagal start atau error:

Jalankan:
```bash
su -
cd /opt/digital-twin-datacenter
bash deployment/linux/deploy.sh rollback
```

Skrip rollback otomatis:
1. Membaca direktori cadangan terakhir dari `/opt/backups/digital-twin/LATEST`.
2. Memulihkan file `.env.server` produksi yang sah.
3. Memulihkan konfigurasi Nginx dan Docker Compose sebelumnya.
4. Menjalankan ulang kontainer dengan konfigurasi lama yang terbukti stabil.

---

## 3. Pemulihan Database PostgreSQL (Hanya Jika Benar-Benar Diperlukan)

> [!WARNING]
> Jangan melakukan restore database jika hanya ada kendala pada frontend atau Tailscale! Restore database hanya dilakukan jika terjadi korupsi data tabel yang nyata dan telah disetujui administrator.

Jika restore database benar-benar dibutuhkan:

1. Periksa berkas cadangan dump yang tersedia:
   ```bash
   ls -lh /opt/backups/digital-twin/*/postgres-database.dump
   ```
2. Jalankan perintah restore terisolasi (menguji pada database verifikasi terlebih dahulu sesuai kontrak `manage.sh restore`):
   ```bash
   cd /opt/digital-twin-datacenter
   bash deployment/linux/manage.sh restore /path/to/postgres-database.dump dt_datacenter_restore_test
   ```

---

## 4. Penanganan Kendala Spesifik

### A. Kontainer Nginx Gagal Start Karena Port 8080 Konflik
**Gejala:** Error `bind: address already in use` untuk port 8080.
**Solusi:**
```bash
# Periksa proses apa yang menggunakan port 8080
ss -tulpn | grep 8080

# Hapus marker funnel sementara
rm -f /opt/digital-twin-datacenter/config/linux/funnel.enabled

# Restart Nginx dalam mode LAN standar (port 80 saja)
bash deployment/linux/start.sh
```

### B. Dashboard LAN Tidak Merespons Setelah Update
**Gejala:** `curl http://127.0.0.1:80/` mengembalikan connection refused.
**Solusi:**
```bash
# Periksa status seluruh kontainer
docker compose --env-file .env.server -f docker/compose.yaml -f docker/compose.linux.yaml ps

# Periksa log kontainer yang bermasalah (misal backend atau nginx)
docker logs dt-datacenter-backend --tail 50
docker logs dt-datacenter-nginx --tail 50
```

### C. Tailscale Mengunci Akses atau Error
**Gejala:** Daemon Tailscale macet atau error `failed to connect to local tailscaled`.
**Solusi:**
```bash
# Restart daemon
systemctl restart tailscaled

# Matikan Funnel darurat
tailscale funnel --https=443 off 2>/dev/null || true
tailscale serve reset 2>/dev/null || true
```
