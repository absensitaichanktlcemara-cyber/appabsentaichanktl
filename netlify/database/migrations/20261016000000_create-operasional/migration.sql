CREATE TABLE staff (
  id SERIAL PRIMARY KEY,
  nama TEXT NOT NULL,
  jabatan TEXT NOT NULL DEFAULT 'Staff',
  wa TEXT NOT NULL,
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX staff_wa_aktif_idx ON staff (wa) WHERE aktif;

CREATE TABLE absensi (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  tanggal TEXT NOT NULL,
  waktu TEXT NOT NULL,
  shift TEXT NOT NULL,
  status TEXT NOT NULL,
  menit_telat INTEGER NOT NULL DEFAULT 0,
  foto_key TEXT,
  keterangan TEXT NOT NULL DEFAULT '',
  waktu_pulang TEXT,
  foto_pulang_key TEXT,
  lembur_jam NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, tanggal)
);

CREATE TABLE request_off (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  tanggal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE komplimen (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  item TEXT NOT NULL,
  periode TEXT NOT NULL,
  bulan TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE jadwal (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  hari TEXT NOT NULL,
  shift TEXT NOT NULL,
  UNIQUE (staff_id, hari)
);

INSERT INTO staff (nama, jabatan, wa) VALUES
  ('Aysah', 'Kasir', '087898041212'),
  ('Raya', 'Kasir', '081226420667'),
  ('Helen', 'Kasir', '083173563663'),
  ('Rizky', 'Taking Order', '0895630421445'),
  ('Hasby', 'Taking Order', '085763426090'),
  ('Aris', 'Barista (Head)', '0895618583876'),
  ('Gusti', 'Barista', '081200000000'),
  ('Iman', 'Kitchen', '082276201721'),
  ('Araufa', 'Kitchen', '082162123378'),
  ('Aga Setiawan', 'Kitchen', '082385554742'),
  ('Rangga', 'Kitchen', '082363054040'),
  ('Putri', 'Kitchen (Head)', '089524931428'),
  ('Ikmal', 'Panggang (Head)', '089518516734'),
  ('Zulfan', 'Panggang', '083168299587');
