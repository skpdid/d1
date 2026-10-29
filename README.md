# Cloudflare D1 API Perantara

Worker ini adalah API perantara untuk tabel `refresh_tokens` di Cloudflare D1. Semua field token dimasukkan manual melalui API; tidak ada import Python, `get_profile()`, atau `get_new_token()`.

## Isi repository

```text
worker.js       # Cloudflare Worker API
schema.sql      # Struktur tabel D1
wrangler.toml   # Konfigurasi Worker dan binding D1
package.json    # Perintah npm dan Wrangler
README.md       # Tutorial ini
```

## Endpoint

Semua endpoint memerlukan API key melalui salah satu header berikut:

```http
Authorization: Bearer API_KEY
```

atau:

```http
X-API-Key: API_KEY
```

Endpoint yang tersedia:

- `GET /health` — pemeriksaan layanan.
- `GET /tokens` — mengambil semua data. `refresh_token` disamarkan secara default.
- `GET /tokens/{uuid}` — mengambil satu data berdasarkan UUID.
- `POST /tokens` — menambah data baru atau memperbarui data dengan UUID yang sama.
- `PATCH /tokens/{uuid}` — memperbarui field tertentu.
- `DELETE /tokens/{uuid}` — menghapus satu data.
- `DELETE /tokens` — menghapus seluruh data.

## Data POST wajib

Endpoint `POST /tokens` menerima enam field berikut secara manual:

```json
{
  "uuid": "user-001",
  "msisdn": "08123456789",
  "subscriber_id": "subscriber-001",
  "subscription_type": "prepaid",
  "refresh_token": "isi-refresh-token",
  "fingerprint": "fingerprint-device"
}
```

Jika `uuid` sudah ada, keenam nilai tersebut akan diperbarui. Jika ada field yang kosong, API mengembalikan status `400` beserta daftar field yang kurang.

## Prasyarat

- Akun Cloudflare.
- Node.js 18 atau lebih baru.
- Wrangler 4 melalui dependency project.
- API Token Cloudflare dengan izin mengelola Workers dan D1.

## Langkah 1 — Buat database D1

1. Buka **Cloudflare Dashboard → Storage & databases → D1**.
2. Klik **Create database**.
3. Gunakan nama, misalnya `d1-api`.
4. Salin **Database ID** berbentuk UUID.

Atau melalui Wrangler:

```bash
npx wrangler login
npx wrangler d1 create d1-api
```

Perintah tersebut menampilkan `database_id`.

## Langkah 2 — Atur `wrangler.toml`

Buka file `wrangler.toml`, lalu ubah nilai berikut:

```toml
name = "d1-api"
main = "worker.js"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "NAMA_DATABASE_D1"
database_id = "UUID_DATABASE_D1"
```

Contoh:

```toml
[[d1_databases]]
binding = "DB"
database_name = "d1-api"
database_id = "6258a476-0fb4-4a67-80a0-58f7cc91ddee"
```

`binding = "DB"` harus tetap sama karena kode menggunakan `env.DB`.

## Langkah 3 — Terapkan schema D1

Dari root repository, jalankan:

```bash
npm install
npx wrangler d1 execute NAMA_DATABASE_D1 --remote --file=./schema.sql
```

Verifikasi tabel:

```bash
npx wrangler d1 execute NAMA_DATABASE_D1 --remote \\
  --command "SELECT name FROM sqlite_master WHERE type = 'table'"
```

Hasil minimal harus memuat:

```text
refresh_tokens
```

Jalankan schema sebelum deploy Worker agar endpoint tidak menghasilkan error tabel belum ada.

## Langkah 4 — Buat API key

Buat nilai acak, contohnya:

```bash
openssl rand -hex 32
```

Simpan sebagai secret Worker:

```bash
npx wrangler secret put API_KEY
```

Saat diminta, tempel nilai API key lalu tekan Enter. Jangan memasukkan API key ke `worker.js`, `wrangler.toml`, GitHub, atau README.

### Melalui Dashboard

1. Buka **Workers & Pages**.
2. Pilih Worker.
3. Buka **Settings → Variables and Secrets**.
4. Klik **Add**.
5. Pilih **Secret**.
6. Nama: `API_KEY`.
7. Isi nilai acak yang dibuat sebelumnya.
8. Simpan lalu deploy ulang.

## Langkah 5 — Deploy melalui Wrangler

```bash
npm install
npx wrangler deploy
```

URL Worker akan tampil, misalnya:

```text
https://d1-api.username.workers.dev
```

Jangan mengubah nama Worker setelah deploy tanpa menyesuaikan URL API yang dipakai aplikasi.

## Langkah 6 — Deploy melalui Dashboard / GitHub

Jika repository GitHub sudah terhubung ke Cloudflare Workers:

1. Buka **Workers & Pages → Create application → Import a repository**.
2. Pilih repository `skpdid/d1`.
3. Atur **Production branch** ke `main`.
4. Build command: `npm run check` atau kosongkan jika dashboard menolak build command.
5. Build output directory: kosongkan; Worker ini bukan aplikasi Pages.
6. Pastikan entry point adalah `worker.js` atau gunakan konfigurasi `wrangler.toml` dari repository.
7. Deploy.
8. Tambahkan secret `API_KEY` di **Settings → Variables and Secrets**.
9. Deploy ulang setelah secret dibuat.

Untuk **Workers Edit code**, salin isi `worker.js` ke editor Worker. Namun binding D1 tetap harus dibuat di **Settings → Bindings → D1 database bindings**:

- Variable name: `DB`
- D1 database: pilih database yang dibuat pada Langkah 1

Kemudian tambahkan secret `API_KEY` dan deploy ulang. Schema `schema.sql` tetap harus dijalankan melalui D1 Console atau Wrangler.

## Langkah 7 — Uji API

Ganti `API_DOMAIN` dan `API_KEY` sesuai konfigurasi.

### Health check

```bash
curl https://API_DOMAIN/health \\
  -H 'Authorization: Bearer API_KEY'
```

Respons:

```json
{"status":true,"service":"d1-api"}
```

### Tambah data manual

```bash
curl -X POST https://API_DOMAIN/tokens \\
  -H 'Authorization: Bearer API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "uuid":"user-001",
    "msisdn":"08123456789",
    "subscriber_id":"subscriber-001",
    "subscription_type":"prepaid",
    "refresh_token":"isi-refresh-token",
    "fingerprint":"fingerprint-device"
  }'
```

Respons normal menyamarkan `refresh_token`:

```json
{
  "status": true,
  "data": {
    "uuid": "user-001",
    "msisdn": "08123456789",
    "subscriber_id": "subscriber-001",
    "subscription_type": "prepaid",
    "refresh_token": "[REDACTED]",
    "fingerprint": "fingerprint-device"
  }
}
```

### Ambil data

```bash
curl https://API_DOMAIN/tokens/user-001 \\
  -H 'X-API-Key: API_KEY'
```

### Perbarui sebagian data

```bash
curl -X PATCH https://API_DOMAIN/tokens/user-001 \\
  -H 'Authorization: Bearer API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{"msisdn":"08999999999"}'
```

## Keamanan

- `refresh_token` hanya disamarkan pada respons; tetap tersimpan sebagai plaintext di D1. Batasi akses database dan API key.
- Jangan menaruh API key atau refresh token di source code.
- Jangan mengaktifkan endpoint ini tanpa `API_KEY`.
- Endpoint `GET /tokens?include_secrets=1` mengembalikan refresh token asli. Gunakan hanya untuk kebutuhan internal dan jangan expose ke aplikasi publik.
- Gunakan satu API key per environment bila memungkinkan dan rotasi jika pernah bocor.
- CORS tidak dibuka untuk domain publik secara default; panggil API dari backend atau tambahkan kebijakan CORS yang spesifik bila benar-benar diperlukan.

## Troubleshooting

### `Unauthorized`

Pastikan secret Worker bernama tepat `API_KEY`, lalu deploy ulang. Pastikan header menggunakan `Authorization: Bearer ...` atau `X-API-Key`.

### `no such table: refresh_tokens`

Schema belum diterapkan ke database remote. Jalankan:

```bash
npx wrangler d1 execute NAMA_DATABASE_D1 --remote --file=./schema.sql
```

### Binding `DB` tidak ditemukan

Pastikan `wrangler.toml` memiliki binding `DB`, atau pada Dashboard tambahkan D1 binding dengan variable name `DB`.

### Deploy gagal karena `database_id`

Gunakan UUID Database ID dari halaman D1, bukan nama database. Jangan memakai placeholder.

### Melihat log Worker

```bash
npx wrangler tail
```

## Pemeriksaan sebelum rilis

```bash
node --check worker.js
npm run check
```

`npm run check` hanya memeriksa bundling dan konfigurasi binding. Schema remote tetap harus diverifikasi dengan query `sqlite_master`.
