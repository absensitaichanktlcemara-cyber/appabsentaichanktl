import type { Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';

// Hanya dijalankan otomatis pada deploy produksi yang dipublikasikan.
export default async () => {
    const pool = getDatabase().pool;
    const { rows: [batas] } = await pool.query(`SELECT to_char(
        (NOW() AT TIME ZONE 'Asia/Jakarta')::date - INTERVAL '3 months',
        'YYYY-MM-DD') AS tanggal`);
    const store = getStore({ name: 'foto-absen', consistency: 'strong' });
    const deadline = Date.now() + 20000;
    let dihapus = 0;

    // Pagination dan kelompok kecil menjaga pemakaian memori serta durasi fungsi.
    // Jika batas waktu tercapai, foto tersisa diproses pada jadwal berikutnya.
    for await (const page of store.list({ paginate: true })) {
        const lama = page.blobs.filter(({ key }) =>
            /^\d{4}-\d{2}-\d{2}\/(masuk|pulang)\//.test(key) &&
            key.slice(0, 10) < batas.tanggal);
        for (let i = 0; i < lama.length; i += 10) {
            if (Date.now() >= deadline) return;
            await Promise.all(lama.slice(i, i + 10).map(async ({ key }) => {
                await store.delete(key);
                dihapus++;
            }));
        }
        if (Date.now() >= deadline) return;
    }

    // Referensi baru dikosongkan setelah seluruh foto kedaluwarsa berhasil dihapus.
    // Aman diulang setelah kegagalan; data absensi dan rekap tetap utuh.
    await pool.query(`UPDATE absensi SET foto_key = NULL, foto_pulang_key = NULL
        WHERE tanggal < $1 AND (foto_key IS NOT NULL OR foto_pulang_key IS NOT NULL)`,
        [batas.tanggal]);
    console.info(`Pembersihan foto selesai: ${dihapus} foto dihapus.`);
};

// Setiap jam untuk melanjutkan antrean bila foto lama berjumlah banyak.
export const config: Config = { schedule: '0 * * * *' };
