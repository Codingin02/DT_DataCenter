# Konfigurasi

File `.env` di bawah direktori OS dan seluruh `private/` tidak dipublikasikan. Konfigurasi asal dipertahankan sebagai bukti, bukan diam-diam diubah menjadi konfigurasi produksi.

Template publik ada di `deployment/windows/.env.example` dan `deployment/linux/.env.example`. Wrapper Windows memakai root `.env.windows`; wrapper Linux memakai root `.env.server` atau path eksplisit `DT_ENV_FILE`. Pemilik harus memverifikasi env server sebelum menyalin credential/config ke lokasi operasional.

Detail seluruh variabel, lokasi dan batas rahasia: [CONFIGURATION.md](../docs/CONFIGURATION.md).
