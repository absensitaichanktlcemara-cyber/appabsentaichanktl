CREATE TABLE shift_operasional (nama TEXT PRIMARY KEY, mulai TEXT NOT NULL, selesai TEXT NOT NULL);
INSERT INTO shift_operasional VALUES ('Shift 1','11:00','20:00'),('Shift 2','15:00','00:00');
CREATE TABLE pengaturan (id INTEGER PRIMARY KEY CHECK(id=1), latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, radius INTEGER NOT NULL DEFAULT 100, off_hari INTEGER);
INSERT INTO pengaturan(id) VALUES(1);
ALTER TABLE absensi ADD COLUMN lokasi JSONB, ADD COLUMN lokasi_pulang JSONB, ADD COLUMN selesai_at TIMESTAMPTZ, ADD COLUMN sedang_lembur BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN pengingat_at TIMESTAMPTZ;
ALTER TABLE komplimen ADD COLUMN makanan TEXT NOT NULL DEFAULT '', ADD COLUMN minuman TEXT NOT NULL DEFAULT '', ADD COLUMN status TEXT NOT NULL DEFAULT 'Disetujui';
CREATE UNIQUE INDEX komplimen_periode_baru ON komplimen(staff_id,bulan,periode) WHERE makanan <> '';
CREATE TABLE kasbon (id SERIAL PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id), bulan TEXT NOT NULL, periode INTEGER NOT NULL CHECK(periode IN (1,2)), jumlah INTEGER NOT NULL CHECK(jumlah=0 OR jumlah BETWEEN 50000 AND 250000), status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Disetujui','Ditolak')), UNIQUE(staff_id,bulan,periode));
-- Simpan jam selesai absensi lama menurut jam operasional saat migrasi.
UPDATE absensi a SET selesai_at = (a.tanggal || ' ' || s.selesai)::timestamp AT TIME ZONE 'Asia/Jakarta'
  + CASE WHEN s.selesai <= s.mulai THEN INTERVAL '1 day' ELSE INTERVAL '0 day' END
FROM shift_operasional s WHERE a.shift=s.nama AND a.selesai_at IS NULL;
