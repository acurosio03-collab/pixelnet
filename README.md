# PIXELNEST — Own a Pixel. Make Your Mark.

Marketplace jual-beli ruang iklan berbentuk kotak pixel (terinspirasi The Million Dollar Homepage), dengan sistem
pemesanan, pembayaran otomatis, dan panel admin.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Supabase (PostgreSQL, Auth, Storage) · Vercel

> ⚠️ **Status build.** Kode ditulis tanpa bisa menjalankan `npm install` / `next build` (jaringan sesi pembuatan
> memblokir registry npm). Yang sudah diuji nyata: logika murni (`npm test`) dan seluruh SQL di PostgreSQL 16
> (lihat [Pengujian](#pengujian)). **Langkah pertama Anda: jalankan `npm install && npm run typecheck && npm run build`**
> dan perbaiki bila ada error kecil sebelum deploy.

---

## 1. Status fitur

### ✅ Sudah diimplementasikan dan diuji (SQL / logika murni)

- Reservasi area atomik dengan advisory lock: 12 pembeli berebut area yang sama → 1 menang, 11 ditolak.
- Penolakan area bertabrakan (sebagian, identik, terkandung), batas grid, area yang menempel di tepi tetap boleh.
- Harga dihitung di database dari tabel paket; browser tidak pernah mengirim harga.
- Aktivasi hanya lewat fungsi `activate_paid_order`: cocokkan order, provider, nominal, mata uang; idempotensi per `(provider, event_id)`;
  satu baris pembayaran `paid` per order (unique index).
- `expires_at = starts_at + 30 hari`, dihitung saat iklan benar-benar aktif; webhook ganda tidak memperpanjang.
- Pembayaran terlambat: aktif jika area masih kosong, selain itu `refund_required` (tanpa double booking).
- Perpanjangan: menambah 30 hari setelah masa tayang yang masih berjalan, hanya setelah pembayaran sukses.
- Kedaluwarsa: grid publik memfilter `expires_at` sehingga iklan lama tidak tampil walau cron terlambat; cron harian merapikan status.
- Moderasi dengan alasan wajib + audit log; aktivasi manual wajib alasan ≥ 20 karakter + referensi, tidak menulis baris `payments`.
- RLS: anon/user biasa tidak bisa mengubah harga, status pembayaran, posisi iklan, masa tayang, maupun memanggil fungsi bisnis.
- Validasi URL (HTTPS saja, tanpa IP/localhost/shortener/kredensial/port aneh), sanitasi teks, deteksi gambar lewat magic bytes (PNG/JPG/WebP ≤ 1 MB).

### ⚙️ Berfungsi tetapi perlu konfigurasi Anda

| Fitur | Yang perlu diisi |
| --- | --- |
| Database & login admin | Proyek Supabase, jalankan 3 file migrasi, buat user admin (bagian 3) |
| Pembayaran Midtrans | `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`; mulai dari **sandbox** |
| Email notifikasi pembeli | `RESEND_API_KEY` + `EMAIL_FROM` (tanpa ini email dilewati dan dicatat di log, tidak error) |
| Cek reputasi URL (opsional) | `GOOGLE_SAFE_BROWSING_API_KEY` |
| Cron kedaluwarsa | `CRON_SECRET` di Vercel (cron harian di `vercel.json`) |

### 🚫 Belum aktif — `NOT_CONFIGURED`

- **SpeedCash.** Dokumentasi API resmi tidak bisa dibaca dan diverifikasi saat pembuatan, jadi adapter sengaja tidak mengarang
  endpoint/tanda tangan. Ia tidak muncul sebagai pilihan bayar. Lihat [`docs/SPEEDCASH.md`](docs/SPEEDCASH.md).
  **Sampai itu selesai, Midtrans adalah satu-satunya metode bayar yang berfungsi** (QRIS, e-wallet, transfer bank, kartu — sesuai yang diaktifkan di akun Midtrans Anda).

### 🧪 Perlu Anda uji sebelum live

1. `npm run build` bersih (belum pernah dijalankan).
2. Alur penuh di Midtrans **sandbox**: pilih area → checkout → bayar → webhook → iklan aktif.
3. Webhook dari Midtrans benar-benar sampai ke `https://DOMAIN/api/webhooks/midtrans` (lihat bagian 4).
4. Host Get Status **produksi** Midtrans (`https://api.midtrans.com`) dan rumus `signature_key` — cocokkan ke dokumentasi resmi sebelum mode produksi.
5. Tampilan di HP Android sungguhan (pemilihan area, zoom, geser).
6. Panel admin dengan akun admin dan akun moderator (moderator tidak melihat Payments, Packages, Settings, Logs).
7. Email (Resend) dan, bila dipakai, Safe Browsing.
8. Halaman kebijakan (Privacy, Terms, Refund, Advertising) hanya **template** — wajib ditinjau pengacara sebelum launch.

---

## 2. Struktur proyek

```
src/app/                  halaman (landing, checkout/status pembayaran, kebijakan, login, admin/*)
src/app/api/              checkout, grid, orders/[n], renew, report, webhooks/[provider], cron/expire
src/app/admin/            dashboard, wall, ads, orders, payments, advertisers, packages, reports, settings, logs + actions.ts
src/components/           PixelWall (grid interaktif), form checkout, komponen admin
src/lib/payments/         types (PaymentProvider), midtrans, speedcash (NOT_CONFIGURED), process (idempotent apply)
src/lib/security/         url, image, sanitize, ratelimit, tokens
supabase/migrations/      0001_init (tabel, fungsi, RLS) · 0002_storage · 0003_moderation
supabase/tests/           skenario SQL + uji RLS (untuk PostgreSQL lokal)
tests/                    unit test logika murni
docs/SPEEDCASH.md         checklist mengaktifkan SpeedCash
```

Antarmuka `PaymentProvider`: `createCheckout()`, `verifyWebhook()`, `getTransactionStatus()`, `normalizePaymentStatus()`.
Webhook tidak pernah dipercaya mentah: setelah tanda tangan valid, server menanyakan status asli ke provider (challenge-response).
Halaman "sukses" hanya menampilkan apa yang database katakan — kembali dari halaman bayar **bukan** bukti pembayaran.

---

## 3. Setup dari HP Android

Semua langkah bisa dilakukan dari Chrome Android. Untuk situs yang halaman webnya sulit dipakai di layar kecil,
aktifkan **Desktop site** di menu Chrome.

### a. GitHub — unggah kode

Vercel men-deploy dari repositori Git, jadi kode harus ada di GitHub. Dari HP, cara paling andal adalah **Termux**
(unduh dari F-Droid, bukan Play Store):

```bash
pkg update && pkg install git unzip
termux-setup-storage                       # izinkan akses file
cd ~/storage/downloads && unzip pixelnest.zip && cd pixelnest
git init -b main && git add . && git commit -m "PIXELNEST"
# buat repo kosong (private) di github.com, lalu:
git remote add origin https://github.com/USERNAME/pixelnest.git
git push -u origin main                    # username GitHub + Personal Access Token sebagai password
```

Personal Access Token: GitHub → Settings → Developer settings → Fine-grained tokens → izin *Contents: Read and write* untuk repo itu.
Alternatif tanpa Termux: di github.com buka repo kosong → **Add file → Upload files**; Chrome Android sering tidak bisa mengunggah folder, jadi lebih mudah dari komputer bila ada.

Jangan pernah meng-commit `.env.local` (sudah ada di `.gitignore`).

### b. Supabase — database

1. supabase.com → **New project** (pilih region dekat pengguna, mis. Singapore). Catat password database.
2. **SQL Editor** → New query → tempel isi berkas berikut **berurutan**, tiap berkas **Run**:
   `supabase/migrations/0001_init.sql` → `0002_storage.sql` → `0003_moderation.sql`.
3. **Authentication → Providers → Email**: matikan **Allow new users to sign up** (hanya staf yang login) dan, bila mau, matikan "Confirm email" untuk akun admin pertama.
4. **Authentication → Users → Add user**: isi email + password admin (centang *Auto Confirm*).
5. Jadikan akun itu admin — SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'EMAIL-ADMIN-ANDA';
   ```
   (Staf berikutnya bisa diangkat dari **Admin → Settings → Staff access**.)
6. **Project Settings → API**: salin `Project URL`, `anon public key`, dan `service_role key`.
   `service_role` adalah **rahasia** — hanya untuk variabel server di Vercel.

Bucket Storage `ad-images` dibuat oleh `0002_storage.sql` (publik-baca, tanpa kebijakan tulis dari klien; unggahan lewat server).

### c. Vercel — deploy

1. vercel.com → **Add New → Project** → impor repo GitHub tadi. Framework otomatis terdeteksi sebagai Next.js.
2. **Environment Variables** — isi (lihat `.env.example`):

   | Variabel | Nilai |
   | --- | --- |
   | `NEXT_PUBLIC_SITE_URL` | `https://DOMAIN-ANDA` (tanpa garis miring akhir) |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (**jangan** pakai awalan `NEXT_PUBLIC_`) |
   | `CRON_SECRET` | string acak panjang |
   | `MIDTRANS_SERVER_KEY` / `MIDTRANS_CLIENT_KEY` | kunci **Sandbox** dulu |
   | `MIDTRANS_IS_PRODUCTION` | `false` |
   | `NEXT_PUBLIC_CONTACT_EMAIL` | email kontak untuk halaman kebijakan |
   | `RESEND_API_KEY`, `EMAIL_FROM` | opsional, untuk email |

3. **Deploy.** Setelah selesai, buka `/login`, masuk dengan akun admin, lalu `/admin`.
4. Cron: `vercel.json` menjadwalkan `/api/cron/expire` setiap hari 03:00 UTC (batas paket Hobby = sekali sehari; itu cukup karena grid publik
   selalu memfilter `expires_at`). Vercel mengirim `Authorization: Bearer $CRON_SECRET` otomatis.

### d. Midtrans — pembayaran (sandbox dulu)

1. Daftar di dashboard.sandbox.midtrans.com → **Settings → Access Keys** → salin Server Key & Client Key.
2. **Settings → Payment → Notification URL**: `https://DOMAIN-ANDA/api/webhooks/midtrans`.
3. Pastikan metode bayar (mis. QRIS, GoPay) aktif di Snap Preferences.
4. Lakukan satu pembelian uji: pilih area → checkout → bayar dengan simulator Midtrans → iklan muncul aktif. Cek **Admin → Payments** (baris pembayaran + riwayat webhook).
5. Mode produksi: ganti ke kunci produksi, `MIDTRANS_IS_PRODUCTION=true`, daftarkan Notification URL di dashboard produksi, dan selesaikan butir uji 4 di bagian 1.

### e. Pengembangan lokal (opsional, perlu komputer)

```bash
cp .env.example .env.local   # isi nilainya
npm install
npm run dev                  # http://localhost:3000
```

Tanpa Supabase terisi, situs tampil dalam **mode demo**: iklan contoh berlabel "(demo)", checkout menolak dengan pesan jelas.

---

## 4. Keamanan — ringkasan

- Secret hanya di server: `SUPABASE_SERVICE_ROLE_KEY`, kunci provider, `CRON_SECRET`. Modul klien Supabase admin memakai `server-only` sehingga build gagal bila terimpor ke komponen klien.
- Semua tulis ke data bisnis lewat fungsi Postgres `security definer` yang hanya bisa dipanggil `service_role`; RLS aktif di semua tabel.
- RBAC: role dibaca dari `profiles.role` di server pada layout, tiap halaman admin, dan tiap server action — menyembunyikan tombol bukan satu-satunya pagar.
- Tidak ada tombol "tandai lunas". Aktivasi manual: hanya admin, alasan ≥ 20 karakter, referensi eksternal, tercatat di `admin_logs`, tidak membuat baris `payments`.
- Rate limiting berbasis database (checkout per IP & email, webhook, status order). Honeypot di form checkout.
- Header keamanan di `next.config.mjs`. Tidak ada data kartu yang disimpan; pembayaran diproses penuh oleh provider.
- Token order: tautan pelacakan per-order diturunkan lewat HMAC dari server secret; database hanya menyimpan hash SHA-256.
- Penyaringan otomatis (daftar kata + URL) hanyalah lapis pertama. Untuk iklan yang aman, aktifkan **Admin → Settings → Review every ad before it goes live**.

---

## 5. Pengujian

```bash
npm test                                   # unit test logika murni (butuh Node ≥ 22.6)
```

Uji SQL pada PostgreSQL lokal (tidak menyentuh Supabase Anda):

```bash
createdb pn
psql -d pn -f supabase/tests/stub_supabase.sql                       # stub auth/storage/role
psql -d pn -f supabase/migrations/0001_init.sql -f supabase/migrations/0002_storage.sql -f supabase/migrations/0003_moderation.sql
psql -d pn -f supabase/tests/scenarios.sql                           # 42 pernyataan PASS
psql -d pn -f supabase/tests/rls.sql                                 # periksa hasil sesuai komentar "expect"
```

Hasil pada pembuatan: 8/8 unit test, 42/42 skenario SQL, uji RLS sesuai harapan, uji balapan 12 koneksi paralel → 1 pemenang.
Tidak tercakup oleh uji otomatis: render UI, route handler Next.js, panggilan jaringan ke Midtrans/Supabase/Resend.
