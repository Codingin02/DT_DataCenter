# Network dan RX/TX

## Alamat referensi dan bukti

| Perangkat                                | Referensi               | Status verifikasi                                          |
| ---------------------------------------- | ----------------------- | ---------------------------------------------------------- |
| Debian dedicated                         | 192.168.1.167 / enp11s0 | dari pengguna; SSH timeout pada pengerjaan lokal           |
| Shelly Plug PM Gen3                      | 192.168.1.166           | belum di-query langsung                                    |
| ESP32-S3                                 | 192.168.1.172           | alamat historis DHCP; jangan dianggap statis               |
| NIC pada env USB                         | enp0s3                  | terbukti dari isi .env/.env.debian                         |
| Broker pada local_config.h artefak build | 10.124.102.126:1883     | terbukti dari artefak, bukan bukti konfigurasi board aktif |

Tidak ada alias IP, SSID, password Wi-Fi atau broker perangkat yang diubah pada penataan ini.

## Port deployment OS

| Layanan          | Container/host             | Windows                                    | Debian                                               |
| ---------------- | -------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| PostgreSQL       | 5432 internal              | tidak dipublikasikan                       | tidak dipublikasikan                                 |
| MQTT             | 1883                       | template loopback; LAN hanya dengan izin   | template bind LAN 192.168.1.167                      |
| Backend          | 3000 container → host 3010 | template 127.0.0.1:3010                    | template 127.0.0.1:3010                              |
| Nginx LAN        | 80                         | 0.0.0.0:80                                 | 0.0.0.0:80                                           |
| Nginx Funnel     | 8080                       | tidak diaktifkan workflow Windows          | opsional 127.0.0.1:8080                              |
| Node Exporter    | 9100 host network          | tidak dijalankan                           | bind configurable, wajib firewall                    |
| Windows Exporter | 9182 service host          | hanya sumber Docker Desktop yang diizinkan | tidak diperlukan                                     |
| Funnel publik    | HTTPS 443                  | bukan target pekerjaan ini                 | TLS dikelola Tailscale; 8443/10000 juga didukung CLI |

Nilai env existing dapat berbeda. Daftar ini mendeskripsikan template/workflow baru, **bukan** hasil `ss` server yang belum terakses. MQTT TLS 8883 hanya opsi lanjutan, tidak digunakan workflow LAN default.

## RX/TX

`backend/host-network.js` memfilter **label device/nic persis**. Linux: node_network_receive/transmit_bytes_total, packets_total, errs_total, drop_total, speed_bytes, up. Windows: windows_net_* dan status operasi. Collector membaca keseluruhan trafik NIC host, bukan hanya ESP32/MQTT.

Poll 5 detik. Throughput = delta byte / delta waktu monotonik; sample pertama belum memiliki rate. Counter reset/elapsed tidak valid membuang rate interval itu. Current bandwidth berasal dari speed exporter (bytes/s); link utilization full-duplex = max(RX rate, TX rate) / speed, bukan RX+TX. Algoritma tidak diubah.

Hasil collector → canonical envelope → MQTT → ingestion PostgreSQL → API/SSE → dashboard. Jika MQTT putus, collector tidak menerbitkan; jangan mengisi data palsu agar terlihat hidup.

## Pemeriksaan host

```bash
ip -br address
ip -br link
ip route
ip -s link show enp11s0
sudo ss -lntup
curl --fail --silent http://127.0.0.1:9100/metrics | grep 'node_network_.*device="enp11s0"'
```

Perintah terakhir hanya benar setelah NIC/port host diverifikasi. Uji juga request exporter dari container backend melalui `host.docker.internal`; sukses dari host loopback saja tidak cukup. Untuk Windows gunakan `Get-NetAdapter`, `Get-NetIPConfiguration`, `Get-NetRoute`, `Get-NetTCPConnection -State Listen`.

Jangan membuka router forwarding/UPnP untuk DB, MQTT, backend atau exporter. Tailscale Funnel mempublikasikan HTTP read-only gateway saja; bukan cara mengamankan service lain yang sudah telanjur terbuka.
