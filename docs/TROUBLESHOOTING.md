# Troubleshooting

| Gejala                                      | Pemeriksaan / tindakan aman                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| SSH server timeout                          | pastikan jaringan Lab HINT/VPN sah, routing dan server dedicated benar; timeout bukan bukti server mati; jangan scan rack/server lain |
| POSTGRES_PASSWORD required                  | env privat salah lokasi/kosong; periksa **nama** variabel tanpa mencetak nilai; jangan mengganti password volume existing             |
| DB authentication failed                    | credential env berbeda dari role existing; env image tidak mengubah password role setelah init                                        |
| Schema tidak tersedia                       | pastikan volume/DB benar; init hanya volume baru; jangan reset volume untuk memaksa init                                              |
| Build gagal COPY node_modules               | gunakan Dockerfile baru yang memakai npm ci, bukan image/script build lama                                                            |
| Image tidak ditemukan pada start            | jalankan install/build yang disetujui dahulu; start sengaja tidak menarik image otomatis                                              |
| Port 80 bentrok                             | periksa ss/Get-NetTCPConnection; jangan menghentikan layanan orang lain; pilih port template lain bila disetujui                      |
| MQTT perangkat offline                      | periksa bind alamat LAN, broker/credential yang benar dan firewall; jangan mengganti SSID atau broker perangkat otomatis              |
| Shelly sync diblokir                        | disengaja: tool dapat mengubah perangkat/reboot; tidak diperlukan untuk startup biasa                                                 |
| RX/TX kosong                                | cocokkan label exporter NIC; enp0s3 USB bukan bukti enp11s0 server; periksa route container ke exporter, MQTT dan schema              |
| Throughput pertama kosong                   | perlu dua sample valid; poll 5 detik; reset counter membuang interval rate                                                            |
| Exporter sehat di host tetapi backend gagal | bind loopback tidak dijangkau host gateway; periksa bind dan firewall Docker subnet                                                   |
| Windows mencoba Node Exporter               | pastikan compose.windows.yaml digunakan; jangan aktifkan profile linux-only                                                           |
| Windows backup rusak                        | gunakan wrapper cp biner, bukan pipe/redirection PowerShell 5.1                                                                       |
| Restore target existing                     | gunakan nama disposable baru; jangan drop DB existing secara otomatis                                                                 |
| Funnel gateway 403 registrasi               | disengaja; administrasi hanya LAN; jangan menargetkan port 80 untuk menghindari proteksi                                              |
| Funnel 502                                  | cek gateway 127.0.0.1:8080, nginx -t, backend health, marker config/linux/funnel.enabled                                              |
| Funnel tidak diizinkan                      | cek login, MagicDNS, HTTPS dan policy capability akun; jangan menimpa ACL tailnet otomatis                                            |
| Git push 403                                | akun harus diberi izin Codingin02/DT_DataCenter; jangan mengubah remote ke repo lain diam-diam                                        |
| Permission 600 tidak efektif di USB         | FAT32 tidak mendukung permission Unix penuh; gunakan penyimpanan host aman dan kontrol fisik                                          |

Selalu simpan konfigurasi privat/backup sebelum perubahan produksi. Jangan gunakan fake sensor data untuk menutupi kegagalan koneksi. Lihat [operasi](OPERATIONS.md) untuk perintah yang sesuai service proyek.
