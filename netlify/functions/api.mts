// API absensi & operasional Taichan KTL Cemara Asri.
// Semua endpoint ada di /api/*; staff login dengan nomor WA (header x-wa),
// supervisor dengan PIN dari env SUPERVISOR_PIN (header x-pin).
import { Buffer } from 'node:buffer';
import type { Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';

const TZ = 'Asia/Jakarta';
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const menit = (jam: string) => jam.split(':').reduce((h, m) => h * 60 + Number(m), 0);
const akhirShift = (tanggal: string, mulai: string, selesai: string) => new Date(new Date(tanggal + 'T' + selesai + ':00+07:00').getTime() + (menit(selesai) <= menit(mulai) ? 86400000 : 0));
async function validLokasi(l: any) {
    const [outlet] = await q('SELECT * FROM pengaturan WHERE id=1');
    if (outlet.latitude == null || outlet.longitude == null) fail(400, 'Lokasi outlet belum diatur supervisor.');
    if (!l || !Number.isFinite(l.latitude) || !Number.isFinite(l.longitude) || Math.abs(l.latitude)>90 || Math.abs(l.longitude)>180 || !Number.isFinite(l.accuracy) || l.accuracy < 0 || l.accuracy > outlet.radius || !Number.isFinite(l.timestamp) || Math.abs(Date.now()-l.timestamp)>120000) fail(400, 'Aktifkan GPS akurat dan ambil ulang foto di outlet.');
    const rad = (v: number) => v * Math.PI / 180;
    const a = Math.sin(rad(l.latitude-outlet.latitude)/2)**2 + Math.cos(rad(outlet.latitude))*Math.cos(rad(l.latitude))*Math.sin(rad(l.longitude-outlet.longitude)/2)**2;
    if (6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)) > outlet.radius) fail(400, 'Anda berada di luar radius outlet. Absen tidak dapat disimpan.');
    return JSON.stringify(l);
}
const JATAH_OFF = 4;

type User = { id: number; nama: string; jabatan: string; role: 'staff' | 'supervisor'; wa?: string };

const pool = () => getDatabase().pool;
const fotoStore = () => getStore({ name: 'foto-absen', consistency: 'strong' });

async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
    const res = await pool().query(text, params);
    return res.rows as T[];
}

class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
}

const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };

// ---------- Waktu (WIB) ----------
function now() {
    const d = new Date();
    const tanggal = d.toLocaleDateString('en-CA', { timeZone: TZ });
    const waktu = d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const [h, m] = waktu.split(':').map(Number);
    const hari = HARI[new Date(tanggal + 'T00:00:00Z').getUTCDay()];
    return { tanggal, waktu, menit: h * 60 + m, hari, bulan: tanggal.slice(0, 7) };
}

const isBulan = (b: unknown): b is string => typeof b === 'string' && /^\d{4}-\d{2}$/.test(b);
const isTanggal = (t: unknown): t is string => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t);
const normWa = (wa: unknown) => String(wa ?? '').replace(/[^0-9]/g, '').replace(/^62/, '0');

// ---------- Auth ----------
async function findStaffByWa(wa: string): Promise<User | null> {
    const n = normWa(wa);
    if (!n) return null;
    const rows = await q(`SELECT id, nama, jabatan, wa FROM staff WHERE aktif AND regexp_replace(regexp_replace(wa, '[^0-9]', '', 'g'), '^62', '0') = $1 LIMIT 1`, [n]);
    return rows[0] ? { ...rows[0], role: 'staff' } : null;
}

function checkPin(pin: string | null) {
    // PIN default 271002; env SUPERVISOR_PIN (jika diisi) tetap diutamakan.
    const expected = Netlify.env.get('SUPERVISOR_PIN') || '271002';
    return !!pin && pin === expected;
}

async function auth(req: Request): Promise<User> {
    const pin = req.headers.get('x-pin');
    if (pin !== null) {
        if (checkPin(pin)) return { id: 0, nama: 'Supervisor', jabatan: 'Supervisor', role: 'supervisor' };
        fail(401, 'PIN supervisor salah.');
    }
    const wa = req.headers.get('x-wa');
    if (wa) {
        const st = await findStaffByWa(wa);
        if (st) return st;
    }
    return fail(401, 'Sesi tidak valid. Silakan login ulang.');
}

const requireSupervisor = (u: User) => { if (u.role !== 'supervisor') fail(403, 'Hanya supervisor yang dapat melakukan ini.'); };
const requireStaff = (u: User) => { if (u.role !== 'staff') fail(403, 'Hanya staff yang dapat melakukan ini.'); };

// ---------- Foto ----------
async function saveFoto(dataUrl: unknown, prefix: string): Promise<string | null> {
    if (typeof dataUrl !== 'string' || !dataUrl) return null;
    const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!m) fail(400, 'Format foto tidak valid.');
    const bytes = Buffer.from(m![2], 'base64');
    if (bytes.length > 3 * 1024 * 1024) fail(400, 'Ukuran foto terlalu besar.');
    const key = `${prefix}/${crypto.randomUUID()}`;
    await fotoStore().set(key, new Uint8Array(bytes).buffer, { metadata: { type: m![1] } });
    return key;
}

const fotoUrl = (key: string | null) => (key ? '/api/foto/' + key : '');

// ---------- Mapper ----------
const mapAbsen = (a: any) => ({
    id: a.id,
    staffId: a.staff_id,
    nama: a.nama,
    jabatan: a.jabatan,
    tanggal: a.tanggal,
    waktu: a.waktu,
    shift: a.shift,
    status: a.status,
    menitTelat: a.menit_telat,
    keterangan: a.keterangan,
    waktuPulang: a.waktu_pulang,
    lembur: Number(a.lembur_jam) || 0,
    lokasi: a.lokasi, lokasiPulang: a.lokasi_pulang, selesaiAt: a.selesai_at, sedangLembur: a.sedang_lembur, dihitungKerja: a.menit_telat <= 60,
    foto: fotoUrl(a.foto_key),
    fotoPulang: fotoUrl(a.foto_pulang_key),
});

const mapOff = (r: any) => ({ id: r.id, staffId: r.staff_id, namaStaff: r.nama, tanggal: r.tanggal, status: r.status });
const mapKomplimen = (k: any) => ({ id: k.id, staffId: k.staff_id, namaStaff: k.nama, item: k.item, makanan: k.makanan, minuman: k.minuman, status: k.status, periode: k.periode, bulan: k.bulan });
const mapJadwal = (j: any) => ({ id: j.id, staffId: j.staff_id, hari: j.hari, shift: j.shift, minggu: j.minggu });

// Setiap periode adalah Senin–Minggu; tidak mewarisi jadwal periode lain.
function awalMinggu(tanggal: string) {
    const d = new Date(tanggal + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
    return d.toISOString().slice(0, 10);
}
function isTanggalValid(value: unknown): value is string {
    if (!isTanggal(value)) return false;
    const d = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
async function jadwalUntuk(tanggal: string) {
    const minggu = awalMinggu(tanggal);
    const rows = await q(`SELECT j.* FROM jadwal_per_minggu j JOIN staff s ON s.id = j.staff_id WHERE s.aktif AND j.minggu = $1`, [minggu]);
    return { minggu, list: rows.map(mapJadwal) };
}

async function shiftHariIni(staffId: number) {
    const t = now();
    const [off] = await q(`SELECT 1 FROM request_off WHERE staff_id = $1 AND tanggal = $2 AND status = 'Disetujui'`, [staffId, t.tanggal]);
    if (off) return 'Off';
    const { list } = await jadwalUntuk(t.tanggal);
    return list.find((j) => j.staffId === staffId && j.hari === t.hari)?.shift ?? null;
}

// ---------- Handler ----------
async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    const [res, idStr, action] = parts;
    const method = req.method;
    const body = method === 'POST' ? await req.json().catch(() => ({})) : {};

    // Foto absen (dimuat lewat <img>, jadi tanpa header auth; kunci berupa UUID acak)
    if (res === 'foto' && method === 'GET') {
        const key = parts.slice(1).join('/');
        const blob = await fotoStore().getWithMetadata(key, { type: 'arrayBuffer' });
        if (!blob) return new Response('Not found', { status: 404 });
        return new Response(blob.data, {
            headers: { 'content-type': String(blob.metadata?.type || 'image/jpeg'), 'cache-control': 'private, max-age=31536000, immutable' },
        });
    }

    if (res === 'login' && method === 'POST') {
        if (body.type === 'supervisor') {
            if (!checkPin(String(body.value ?? ''))) fail(401, 'PIN supervisor salah.');
            return json({ ok: true });
        }
        const st = await findStaffByWa(body.value);
        if (!st) fail(401, 'Nomor WhatsApp tidak terdaftar sebagai staff aktif.');
        return json({ ok: true });
    }

    const user = await auth(req);
    const t = now();
    const id = Number(idStr);

    if (res === 'data' && method === 'GET') {
        const isSpv = user.role === 'supervisor';
        const [staff, absen, off, komplimen, jadwal, shifts, settings, kasbon] = await Promise.all([
            q(`SELECT id, nama, jabatan, wa FROM staff WHERE aktif ORDER BY id`),
            q(`SELECT a.*, s.nama, s.jabatan FROM absensi a JOIN staff s ON s.id = a.staff_id WHERE a.tanggal LIKE $1 OR (a.waktu_pulang IS NULL AND a.tanggal >= $2) ORDER BY a.tanggal DESC, a.waktu DESC`, [t.bulan + '%', new Date(Date.now()-86400000).toLocaleDateString('en-CA',{timeZone:TZ})]),
            q(`SELECT r.*, s.nama FROM request_off r JOIN staff s ON s.id = r.staff_id WHERE s.aktif AND r.tanggal >= $1 ORDER BY r.tanggal`, [t.bulan + '-01']),
            q(`SELECT k.*, s.nama FROM komplimen k JOIN staff s ON s.id = k.staff_id WHERE k.bulan = $1 ORDER BY k.id DESC`, [t.bulan]),
            jadwalUntuk(t.tanggal),
            q('SELECT * FROM shift_operasional ORDER BY mulai'),
            q('SELECT * FROM pengaturan WHERE id=1'),
            isSpv ? q('SELECT k.*, s.nama FROM kasbon k JOIN staff s ON s.id=k.staff_id WHERE bulan=$1 ORDER BY k.id DESC',[t.bulan]) : q('SELECT periode, jumlah, status FROM kasbon WHERE staff_id=$1 AND bulan=$2',[user.id,t.bulan]),
        ]);
        return json({
            user: { id: user.id, nama: user.nama, jabatan: user.jabatan, role: user.role },
            // Nomor WA staff lain hanya terlihat oleh supervisor
            staffList: staff.map((s: any) => ({ id: s.id, nama: s.nama, jabatan: s.jabatan, ...(isSpv || s.id === user.id ? { wa: s.wa } : { wa: '' }) })),
            absenList: absen.map(mapAbsen),
            requestOffList: off.map(mapOff),
            komplimenList: komplimen.filter(k => isSpv || k.status === 'Disetujui' || k.staff_id === user.id).map(mapKomplimen),
            shifts, settings: settings[0], kasbonList: kasbon,
            jadwalMingguanList: jadwal.list,
        });
    }

    // ----- Absen masuk -----
    if (res === 'absen' && !idStr && method === 'POST') {
        requireStaff(user);
        const shift = String(body.shift);
        const [operasional] = await q('SELECT * FROM shift_operasional WHERE nama=$1',[shift]);
        if (!operasional) fail(400, 'Shift tidak valid.');
        const jadwalShift = await shiftHariIni(user.id);
        if (jadwalShift && jadwalShift !== shift) fail(400, 'Pilih shift sesuai jadwal Anda.');
        if (t.menit < menit(operasional.mulai)-30) fail(400, 'Absen masuk dibuka 30 menit sebelum shift dimulai.');
        const lokasi = await validLokasi(body.lokasi);
        if ((await shiftHariIni(user.id)) === 'Off') fail(400, 'Jadwal Anda hari ini adalah OFF.');
        const [sudah] = await q(`SELECT 1 FROM absensi WHERE staff_id = $1 AND tanggal = $2`, [user.id, t.tanggal]);
        if (sudah) fail(400, 'Anda sudah absen hari ini.');
        if (!body.foto) fail(400, 'Wajib mengambil foto wajah di lokasi outlet!');

        const menitTelat = Math.max(0, t.menit - menit(operasional.mulai));
        const keterangan = String(body.keterangan ?? '').trim().slice(0, 500);
        const status = menitTelat > 60 ? 'Tidak Masuk' : menitTelat <= 10 ? 'Tepat Waktu' : keterangan ? 'Menunggu Review' : 'Telat';
        const fotoKey = await saveFoto(body.foto, `${t.tanggal}/masuk`);
        try {
            await q(
                `INSERT INTO absensi (staff_id, tanggal, waktu, shift, status, menit_telat, foto_key, keterangan, lokasi, selesai_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                [user.id, t.tanggal, t.waktu, shift, status, menitTelat, fotoKey, keterangan, lokasi, akhirShift(t.tanggal, operasional.mulai, operasional.selesai)],
            );
        } catch (e: any) {
            if (e?.code === '23505') fail(400, 'Anda sudah absen hari ini.');
            throw e;
        }
        return json({ status, waktu: t.waktu, menitTelat });
    }

    // ----- Review alasan telat -----
    if (res === 'absen' && action === 'review' && method === 'POST') {
        requireSupervisor(user);
        const status = body.keputusan === 'Diterima' ? 'Sudah Izin' : body.keputusan === 'Ditolak' ? 'Telat' : fail(400, 'Keputusan tidak valid.');
        const rows = await q(`UPDATE absensi SET status = $1 WHERE id = $2 AND status = 'Menunggu Review' AND menit_telat <= 60 RETURNING id`, [status, id]);
        if (!rows.length) fail(404, 'Data absensi tidak ditemukan.');
        return json({ ok: true });
    }

    // ----- Absen pulang & lembur -----
    if (res === 'pulang' && method === 'POST') {
        requireStaff(user);
        const [rec] = await q(`SELECT * FROM absensi WHERE staff_id=$1 AND waktu_pulang IS NULL ORDER BY tanggal DESC LIMIT 1`,[user.id]);
        if (!rec) fail(400, 'Tidak ada absen masuk yang menunggu absen pulang.');
        if (!rec.selesai_at) fail(400, 'Jam selesai absensi lama belum tersedia. Hubungi supervisor.');
        if (Date.now() <= new Date(rec.selesai_at).getTime()) fail(400, 'Absen pulang hanya dibuka setelah jam selesai shift.');
        if (!body.foto) fail(400, 'Wajib mengambil foto pulang di lokasi outlet.');
        const lokasi = await validLokasi(body.lokasi);
        const lembur = Math.min(5, Math.max(0, Math.round((Number(body.lembur) || 0) * 2) / 2));
        const fotoKey = await saveFoto(body.foto, `${rec.tanggal}/pulang`);
        const updated = await q(`UPDATE absensi SET waktu_pulang=$1, foto_pulang_key=$2, lembur_jam=$3, lokasi_pulang=$4 WHERE id=$5 AND waktu_pulang IS NULL RETURNING id`,[t.waktu,fotoKey,lembur,lokasi,rec.id]);
        if (!updated.length) fail(409, 'Absen pulang sudah tersimpan.');
        return json({ ok: true });
    }

    // ----- Request off -----
    if (res === 'off' && !idStr && method === 'POST') {
        requireStaff(user);
        const tanggal = body.tanggal;
        if (!isTanggal(tanggal)) fail(400, 'Tanggal tidak valid.');
        const day = new Date(tanggal + 'T00:00:00Z').getUTCDay();
        if (day === 0 || day === 6) fail(400, 'Off hanya bisa diambil hari Senin - Jumat.');
        if (tanggal < t.tanggal) fail(400, 'Tidak bisa request off untuk tanggal yang sudah lewat.');
        const [dup] = await q(`SELECT 1 FROM request_off WHERE staff_id = $1 AND tanggal = $2 AND status <> 'Ditolak'`, [user.id, tanggal]);
        if (dup) fail(400, 'Anda sudah mengajukan off pada tanggal ini.');
        const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM request_off WHERE staff_id = $1 AND status <> 'Ditolak' AND tanggal LIKE $2`, [user.id, tanggal.slice(0, 7) + '%']);
        if (n >= JATAH_OFF) fail(400, `Jatah off bulan ini sudah habis (${JATAH_OFF} hari).`);
        await q(`INSERT INTO request_off (staff_id, tanggal) VALUES ($1, $2)`, [user.id, tanggal]);
        return json({ ok: true });
    }

    if (res === 'off' && idStr && !action && method === 'DELETE') {
        const rows = user.role === 'supervisor'
            ? await q(`DELETE FROM request_off WHERE id = $1 RETURNING id`, [id])
            : await q(`DELETE FROM request_off WHERE id = $1 AND staff_id = $2 RETURNING id`, [id, user.id]);
        if (!rows.length) fail(404, 'Request off tidak ditemukan.');
        return json({ ok: true });
    }

    if (res === 'off' && action === 'status' && method === 'POST') {
        requireSupervisor(user);
        if (!['Disetujui', 'Ditolak', 'Pending'].includes(body.status)) fail(400, 'Status tidak valid.');
        const rows = await q(`UPDATE request_off SET status = $1 WHERE id = $2 RETURNING id`, [body.status, id]);
        if (!rows.length) fail(404, 'Request off tidak ditemukan.');
        return json({ ok: true });
    }

    // ----- Komplimen -----
    if (res === 'komplimen' && !idStr && method === 'POST') {
        requireStaff(user);
        const day = Number(t.tanggal.slice(8));
        if (![15,30].includes(day)) fail(400, 'Pengisian komplimen hanya tanggal 15 dan 30.');
        const makanan = String(body.makanan ?? '').trim().slice(0,100);
        const minuman = String(body.minuman ?? '').trim().slice(0,100);
        if (!makanan || !minuman) fail(400, 'Isi satu menu makanan dan satu menu minuman.');
        const rows = await q(`INSERT INTO komplimen(staff_id,item,makanan,minuman,periode,bulan,status) VALUES($1,$2,$3,$4,$5,$6,'Pending') ON CONFLICT DO NOTHING RETURNING id`,[user.id,makanan+' + '+minuman,makanan,minuman,'Tanggal '+day,t.bulan]);
        if (!rows.length) fail(409, 'Komplimen periode ini sudah diajukan.');
        return json({ok:true});
    }
    if (res === 'komplimen' && action === 'review' && method === 'POST') {
        requireSupervisor(user);
        if (!['Disetujui','Ditolak'].includes(body.status)) fail(400,'Status tidak valid.');
        await q(`UPDATE komplimen SET status=$1 WHERE id=$2 AND status='Pending'`,[body.status,id]);
        return json({ok:true});
    }

    if (res === 'komplimen' && idStr && method === 'DELETE') {
        requireSupervisor(user);
        await q(`DELETE FROM komplimen WHERE id = $1`, [id]);
        return json({ ok: true });
    }

    // ----- Jadwal (pola 1 minggu per bulan) -----
    if (res === 'jadwal' && method === 'GET') {
        requireSupervisor(user);
        const tanggal = url.searchParams.get('minggu');
        if (!isTanggalValid(tanggal)) fail(400, 'Tanggal periode tidak valid.');
        return json(await jadwalUntuk(tanggal!));
    }

    if (res === 'jadwal' && method === 'POST') {
        requireSupervisor(user);
        const minggu = body.minggu;
        if (!isTanggalValid(minggu) || awalMinggu(minggu) !== minggu) fail(400, 'Periode harus dimulai hari Senin.');
        if (!Array.isArray(body.items)) fail(400, 'Daftar jadwal tidak valid.');
        const shiftValid = (await q('SELECT nama FROM shift_operasional')).map(s => s.nama);
        const staffValid = new Set((await q('SELECT id FROM staff WHERE aktif')).map(s => s.id));
        const items: { staffId: number; hari: string; shift: string }[] = body.items;
        const keys = new Set<string>();
        for (const it of items) {
            if (!it || !Number.isInteger(it.staffId) || !staffValid.has(it.staffId) || !HARI.includes(it.hari) || ![...shiftValid, 'Off'].includes(it.shift)) fail(400, 'Staff, hari, atau shift jadwal tidak valid.');
            const key = it.staffId + '|' + it.hari;
            if (keys.has(key)) fail(400, 'Jadwal staff pada hari yang sama tidak boleh ganda.');
            keys.add(key);
        }
        const client = await pool().connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['jadwal:' + minggu]);
            await client.query('DELETE FROM jadwal_per_minggu WHERE minggu = $1', [minggu]);
            for (const it of items) {
                await client.query('INSERT INTO jadwal_per_minggu (staff_id, hari, shift, minggu) VALUES ($1, $2, $3, $4)', [it.staffId, it.hari, it.shift, minggu]);
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
        return json({ ok: true });
    }

    if (res === 'settings' && method === 'POST') {
        requireSupervisor(user);
        const {latitude,longitude,radius,off_hari} = body;
        if (!Number.isFinite(latitude) || Math.abs(latitude)>90 || !Number.isFinite(longitude) || Math.abs(longitude)>180 || !Number.isInteger(radius) || radius<10 || radius>1000 || (off_hari !== null && (!Number.isInteger(off_hari) || off_hari<1 || off_hari>31))) fail(400,'Koordinat, radius (10–1000 meter), atau tanggal off tidak valid.');
        await q('UPDATE pengaturan SET latitude=$1, longitude=$2, radius=$3, off_hari=$4 WHERE id=1',[latitude,longitude,radius,off_hari]);
        return json({ok:true});
    }
    if (res === 'shifts' && method === 'POST') {
        requireSupervisor(user);
        const nama = String(body.nama ?? '').trim().slice(0,50);
        const jam = (v: unknown) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
        if (!nama || nama === 'Off' || !jam(body.mulai) || !jam(body.selesai) || body.mulai === body.selesai) fail(400,'Isi nama dan jam shift yang valid.');
        await q('INSERT INTO shift_operasional VALUES($1,$2,$3) ON CONFLICT(nama) DO UPDATE SET mulai=$2, selesai=$3',[nama,body.mulai,body.selesai]);
        return json({ok:true});
    }
    if (res === 'lembur' && method === 'POST') {
        requireStaff(user);
        await q('UPDATE absensi SET sedang_lembur=TRUE WHERE staff_id=$1 AND waktu_pulang IS NULL AND selesai_at < NOW()',[user.id]);
        return json({ok:true});
    }
    if (res === 'kasbon' && !idStr && method === 'POST') {
        requireStaff(user);
        const day = Number(t.tanggal.slice(8));
        if (![16,26].includes(day)) fail(400,'Request kasbon hanya tanggal 16 dan 26.');
        const jumlah = Number(body.jumlah);
        if (!Number.isInteger(jumlah) || (jumlah !== 0 && (jumlah<50000 || jumlah>250000))) fail(400,'Kasbon minimal Rp50.000 dan maksimal Rp250.000. Pilih Tidak untuk Rp0.');
        const rows = await q('INSERT INTO kasbon(staff_id,bulan,periode,jumlah) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',[user.id,t.bulan,day===16?1:2,jumlah]);
        if (!rows.length) fail(409,'Jawaban kasbon periode ini sudah tersimpan.');
        return json({ok:true});
    }
    if (res === 'kasbon' && action === 'review' && method === 'POST') {
        requireSupervisor(user);
        if (!['Disetujui','Ditolak'].includes(body.status)) fail(400,'Status tidak valid.');
        await q(`UPDATE kasbon SET status=$1 WHERE id=$2 AND status='Pending'`,[body.status,id]);
        return json({ok:true});
    }

    // ----- Staff -----
    if (res === 'staff' && !idStr && method === 'POST') {
        requireSupervisor(user);
        const nama = String(body.nama ?? '').trim();
        const wa = normWa(body.wa);
        if (!nama || !wa) fail(400, 'Lengkapi nama dan nomor WhatsApp staff.');
        if (await findStaffByWa(wa)) fail(400, 'Nomor WhatsApp sudah terdaftar untuk staff aktif.');
        await q(`INSERT INTO staff (nama, jabatan, wa) VALUES ($1, $2, $3)`, [nama.slice(0, 100), String(body.jabatan ?? '').trim().slice(0, 100) || 'Staff', wa]);
        return json({ ok: true });
    }

    if (res === 'staff' && idStr && method === 'DELETE') {
        requireSupervisor(user);
        // Nonaktifkan saja agar riwayat absensi tetap ada untuk rekap
        await q(`UPDATE staff SET aktif = FALSE WHERE id = $1`, [id]);
        return json({ ok: true });
    }

    // ----- Rekap bulanan (Excel) -----
    if (res === 'rekap' && method === 'GET') {
        requireSupervisor(user);
        const bulan = url.searchParams.get('bulan') || t.bulan;
        if (!isBulan(bulan)) fail(400, 'Bulan tidak valid.');
        const rows = await q(`SELECT a.*, s.nama, s.jabatan FROM absensi a JOIN staff s ON s.id = a.staff_id WHERE a.tanggal LIKE $1 ORDER BY s.nama, a.tanggal`, [bulan + '%']);
        return json({ bulan, rows: rows.map(mapAbsen) });
    }

    return fail(404, 'Endpoint tidak ditemukan.');
}

export default async (req: Request) => {
    try {
        return await handle(req);
    } catch (e) {
        if (e instanceof HttpError) return json({ error: e.message }, e.status);
        console.error(e);
        return json({ error: 'Terjadi kesalahan pada server.' }, 500);
    }
};

export const config: Config = {
    path: '/api/*',
};
