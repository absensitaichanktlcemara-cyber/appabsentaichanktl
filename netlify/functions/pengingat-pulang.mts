import type { Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';

// Adapter pengiriman: endpoint HTTPS menerima JSON {to, message, attendanceId,
// options:[{label,url}]}; balasan 2xx berarti pesan diterima penyedia.
export default async () => {
    const endpoint = Netlify.env.get('WHATSAPP_WEBHOOK_URL');
    const token = Netlify.env.get('WHATSAPP_WEBHOOK_TOKEN');
    const site = Netlify.env.get('URL');
    if (!endpoint || !token || !site) return;
    if (new URL(endpoint).protocol !== 'https:') throw new Error('Endpoint WhatsApp harus HTTPS.');
    const pool = getDatabase().pool;
    const { rows } = await pool.query(`UPDATE absensi a SET pengingat_at=NOW()
        FROM staff s WHERE s.id=a.staff_id AND s.aktif AND a.waktu_pulang IS NULL
        AND NOT a.sedang_lembur AND a.selesai_at + INTERVAL '30 minutes' < NOW()
        AND a.tanggal >= to_char(NOW() AT TIME ZONE 'Asia/Jakarta' - INTERVAL '2 days','YYYY-MM-DD')
        AND a.pengingat_at IS NULL RETURNING a.id, a.tanggal, a.shift, s.nama, s.wa`);
    await Promise.all(rows.map(async (a: any) => {
        try {
            const link = new URL('/?aksi=pulang', site).href;
            const overtime = new URL('/?aksi=lembur', site).href;
            const response = await fetch(endpoint, {
                method: 'POST', signal: AbortSignal.timeout(10000),
                headers: {'content-type':'application/json', authorization: `Bearer ${token}`, 'idempotency-key': `pulang-${a.id}`},
                body: JSON.stringify({to:a.wa, attendanceId:a.id, message:`Halo ${a.nama}, Anda belum absen pulang ${a.shift} (${a.tanggal}), sudah lewat 30 menit. Pilih 1. Absen pulang: ${link} atau 2. Sedang Lembur: ${overtime}`,options:[{label:'Absen pulang',url:link},{label:'Sedang Lembur',url:overtime}]}),
            });
            if (!response.ok) throw new Error('Pengiriman gagal.');
        } catch {
            await pool.query('UPDATE absensi SET pengingat_at=NULL WHERE id=$1',[a.id]);
            console.error('Pengingat pulang gagal dikirim; menunggu percobaan berikutnya.');
        }
    }));
};
export const config: Config = { schedule: '*/5 * * * *' };
