-- Jadwal mingguan kini disusun per bulan: satu pola 1 minggu (Senin–Minggu) berlaku untuk seluruh bulan tersebut
ALTER TABLE jadwal ADD COLUMN bulan TEXT;
UPDATE jadwal SET bulan = '2026-10' WHERE bulan IS NULL;
ALTER TABLE jadwal ALTER COLUMN bulan SET NOT NULL;
ALTER TABLE jadwal DROP CONSTRAINT IF EXISTS jadwal_staff_id_hari_key;
ALTER TABLE jadwal ADD CONSTRAINT jadwal_staff_bulan_hari_key UNIQUE (staff_id, bulan, hari);
