# Backups

Simpan archive database di `backups/postgresql/` dan salinan konfigurasi sensitif di `backups/config/`. Isi backup tidak dipublikasikan; hanya README ini dikecualikan dari aturan ignore. Jangan membuat salinan seluruh deployment sebagai folder baru.

Backup/restore: [docs/DATABASE.md](../docs/DATABASE.md). History backup database boleh memiliki timestamp untuk membedakan titik pemulihan, bukan sebagai identitas deployment. Jangan menghapus backup penting tanpa kebijakan retensi yang disetujui.

Tidak ditemukan PostgreSQL dump di inventaris awal USB. Data runtime Mosquitto/Prometheus bukan pengganti backup PostgreSQL. Backup produksi terbaru belum dapat dibuat karena server belum terakses.
