# Database

Schema canonical berada di `migrations/`; tidak dibuat salinan schema kedua. `tests/foundation.sql` adalah pemeriksaan database untuk verifikasi restore. Data runtime lokal dipertahankan tetapi diabaikan Git.

Lihat [database dan backup/restore](../docs/DATABASE.md). Migration foundation menetapkan ownership kepada `bagus`; instalasi database baru harus mempertahankan role tersebut atau memiliki migration ownership yang ditinjau, bukan mengganti PGUSER secara sembarangan.
