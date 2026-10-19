-- Jadwal lama tetap tersimpan; periode mingguan baru diatur secara mandiri.
CREATE TABLE jadwal_per_minggu (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  minggu TEXT NOT NULL CHECK (minggu ~ '^\d{4}-\d{2}-\d{2}$' AND EXTRACT(ISODOW FROM minggu::date) = 1),
  hari TEXT NOT NULL CHECK (hari IN ('Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu')),
  shift TEXT NOT NULL,
  UNIQUE (minggu, staff_id, hari)
);
