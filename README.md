# Absensi Taichan KTL Cemara Asri

Aplikasi web (PWA) absensi dan operasional staff Sate Taichan KTL Cemara Asri: absen masuk dengan foto, absen pulang & lembur, request off, jadwal shift per periode mingguan (Senin–Minggu), komplimen, tinjauan alasan telat, kirim SP via WhatsApp, dan rekap bulanan ke Excel.

## Teknologi

- Frontend statis: `public/index.html` (Alpine.js + Tailwind CDN + SheetJS), service worker & manifest PWA
- Backend: satu Netlify Function di `/api/*` (`netlify/functions/api.mts`)
- Data: Netlify Database (Postgres) — migrasi SQL di `netlify/database/migrations/`
- Foto absen: Netlify Blobs (store `foto-absen`)

## Konfigurasi

PIN supervisor default adalah **271002**. Untuk menggantinya, set environment variable **`SUPERVISOR_PIN`** di pengaturan Netlify (Project configuration → Environment variables); nilai env selalu diutamakan. Staff login memakai nomor WhatsApp yang terdaftar di tabel `staff`.

## Menjalankan lokal

```bash
npm install
netlify dev
```

## Aturan operasional tambahan

Supervisor mengatur koordinat GPS outlet, radius (10–1000 meter), serta tanggal pengingat request off melalui Pengaturan. Koordinat awal sengaja kosong; absensi diblokir sampai lokasi outlet ditentukan. Request off tetap dapat diajukan sepanjang bulan sesuai aturan yang sudah ada; tanggal pengingat tidak membatasi pengajuan. Kamera langsung dan izin GPS diperlukan saat mengambil foto. Server memeriksa jarak, akurasi, dan umur koordinat maksimal dua menit. Pemeriksaan ini menggunakan GPS perangkat, bukan analisis isi foto atau jaminan anti-pemalsuan perangkat.

Shift awal tetap 11:00–20:00 dan 15:00–00:00. Absen masuk dibuka 30 menit sebelum mulai, dispensasi sampai 10 menit, dan lewat 60 menit berstatus Tidak Masuk serta tidak dihitung dalam rekap hadir/lembur. Jam selesai disimpan saat absen masuk sehingga perubahan pengaturan shift tidak mengubah batas pulang absensi berjalan. Shift yang selesai sebelum atau sama dengan jam mulai dianggap selesai esok hari. Absen pulang hanya sekali, setelah jam selesai, termasuk untuk shift yang melewati tengah malam.

Komplimen diajukan staff tanggal 15 dan 30, masing-masing satu menu makanan dan satu menu minuman per periode. Pengajuan memerlukan review supervisor; data disetujui terlihat semua staff. Februari tidak memiliki periode tanggal 30. Kasbon diajukan tanggal 16 dan 26, satu jawaban per periode; Tidak disimpan sebagai Rp0. Staff hanya menerima data kasbon miliknya sendiri, supervisor melihat seluruh pengajuan bulan berjalan.

## Pengingat pulang dan WhatsApp

Pengingat aplikasi muncul setelah 30 menit dari jam selesai shift. Pilihan Sedang Lembur menghentikan pengingat berikutnya, tetapi tidak menggantikan kewajiban absen pulang. Tautan WhatsApp membuka aplikasi dan tetap memerlukan login serta tindakan staff; membuka tautan tidak langsung mengubah absensi.

Function terjadwal memeriksa setiap lima menit pada deploy produksi yang dipublikasikan. Pengiriman WhatsApp belum aktif tanpa layanan pengiriman. Konfigurasikan `WHATSAPP_WEBHOOK_URL` (HTTPS), `WHATSAPP_WEBHOOK_TOKEN`, dan URL situs melalui environment pengaturan Netlify. Jangan masukkan kredensial ke kode. Adapter layanan menerima POST JSON berisi `to`, `attendanceId`, `message`, dan `options` (daftar `label`/`url`), dengan header Bearer dan `idempotency-key`. Adapter harus mengirim pesan WhatsApp melalui penyedia pilihan dan mengembalikan 2xx setelah diterima. Gunakan kunci idempotensi untuk mencegah duplikasi saat retry. Kegagalan pengiriman dicoba pada pemeriksaan berikutnya. Pengingat aplikasi tetap tersedia tanpa adapter. Uji pengiriman nyata setelah penyedia dikonfigurasi; preview tidak menjalankan cron otomatis.


Supervisor memilih tanggal dalam minggu pada menu Jadwal, lalu mengatur shift atau Off untuk setiap staff dari Senin sampai Minggu. Setiap periode disimpan terpisah; minggu yang belum disusun ditampilkan kosong dan tidak mengambil jadwal minggu sebelumnya. Jadwal lama per bulan tetap tersimpan sebagai data historis, tetapi tidak digunakan sebagai jadwal mingguan baru. Absensi menggunakan jadwal minggu berjalan berdasarkan waktu Asia/Jakarta.
