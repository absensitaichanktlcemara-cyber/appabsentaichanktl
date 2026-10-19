# AGENTS.md

## Arsitektur
- `public/` — situs statis tanpa build step. `index.html` berisi seluruh UI (Alpine.js). Jangan pindahkan ke framework kecuali diminta.
- `netlify/functions/api.mts` — satu function router untuk semua endpoint `/api/*` (login, data, absen, pulang, off, komplimen, jadwal, staff, rekap, foto).
- `netlify/database/migrations/` — migrasi SQL mentah (driver native `@netlify/database`, tanpa Drizzle). Jangan ubah migrasi yang sudah ada; tambahkan file baru.
- Foto disimpan di Netlify Blobs store `foto-absen`, disajikan lewat `/api/foto/<key>`.

## Konvensi & keputusan
- Bahasa UI/pesan error: Bahasa Indonesia. Zona waktu: Asia/Jakarta; tanggal disimpan sebagai teks `YYYY-MM-DD`, bulan `YYYY-MM`, jam `HH:MM`.
- Auth sederhana: header `x-wa` (nomor WA staff aktif) atau `x-pin` (dibandingkan dengan env `SUPERVISOR_PIN`, default `271002` bila env kosong).
- Telat dihitung dari jam mulai shift (Shift 1 11:00, Shift 2 15:00). Telat + alasan → `Menunggu Review`; supervisor menerima → `Sudah Izin`, menolak → `Telat`.
- Jadwal: periode tanggal Senin–Minggu disimpan terpisah di `jadwal_per_minggu`; minggu yang belum disusun kosong tanpa fallback. Tabel `jadwal` lama dipertahankan sebagai arsip.
- Hapus staff = nonaktifkan (`aktif = false`) agar rekap tetap lengkap.
- Backend direkonstruksi dari kontrak frontend (`api()` di index.html) karena kode function asli tidak ikut dalam arsip upload.
