# KPAR GKJW — Aplikasi Internal

Aplikasi internal untuk KPAR GKJW, dibuat dengan Next.js, Tailwind CSS,
Firebase Authentication, dan Cloud Firestore. Seluruh halaman aplikasi
memerlukan login. Tidak ada pendaftaran publik atau data contoh yang
ditampilkan kepada pengunjung tanpa akun.

## Menjalankan lokal

```bash
npm install
cp .env.example .env.local
npm run dev
```

Lengkapi `.env.local` menggunakan konfigurasi aplikasi Web dari Firebase
Console. Konfigurasi `NEXT_PUBLIC_FIREBASE_*` mengidentifikasi aplikasi
Firebase; akses data tetap dijaga Firebase Authentication dan Firestore Rules.

## Akses dan peran

1. Aktifkan provider **Email/Password** di Firebase Authentication.
2. Atur variabel server-only di `.env.local`: `FIREBASE_PROJECT_ID`,
   `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY_ID`, dan
   `FIREBASE_PRIVATE_KEY`. Jangan beri prefix `NEXT_PUBLIC_` pada kredensial
   Admin SDK. Kunci privat tidak disimpan di repositori.
3. Jalankan `npm run firebase:create-admin -- novitawilber05@gmail.com novitasari`
   dari terminal interaktif untuk membuat akun admin awal. Sandi dimasukkan
   melalui prompt tersembunyi, tidak menjadi argumen perintah. Skrip menolak
   menimpa akun yang sudah ada. Pembuatan akun publik tidak tersedia.
4. Skrip memberi custom claims `internal: true`, `admin: true`, serta username,
   dan membuat `users/{uid}` di Firestore dengan profil, status, dan
   `roles: ["internal", "admin"]`. Untuk pengguna lain, buat alur provisioning
   tepercaya yang juga menyinkronkan Auth claims dan profil Firestore; jangan
   menetapkan claim dari browser:
   - `internal: true` untuk anggota/pelayan yang boleh masuk, membaca database
     anak, dan mencatat absensi.
   - `coordinator: true` untuk koordinator yang dapat membuat akun anggota dan
     wali kelas. Admin yang memberi role koordinator.
   - `waliKelas: true` beserta `className` untuk wali kelas yang ditunjuk.
   - `admin: true` untuk pengelola yang boleh masuk serta membuat, mengubah,
     menghapus, dan menerbitkan agenda, mengelola data anak, serta membuat
     seluruh peran.
5. Pengguna dengan claim yang baru diubah mungkin perlu keluar dan masuk lagi
   agar Firebase ID token diperbarui.
6. Deploy rules dengan `npx firebase-tools deploy --only firestore:rules
   --project kpar-a6d9a`. Akun service account perlu izin Firebase Rules/
   Firestore untuk deployment serta izin Service Usage untuk pemeriksaan API.

Pengguna masuk memakai username dan sandi. API server mencari username di
`usernames/{username}` lalu mengautentikasi sandi melalui Firebase Authentication;
email akun tidak dikirim ke browser. API membuat custom token hanya setelah
kredensial valid dan profil berstatus aktif. Karena itu, variabel Admin SDK
server-only (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY`) dan `NEXT_PUBLIC_FIREBASE_API_KEY` harus diisi juga di
Vercel Production dan Preview. Jangan beri prefix `NEXT_PUBLIC_` pada private
key ataupun service account.

Username unik dan disimpan lowercase di koleksi `usernames`, yang tidak dapat
dibaca oleh client. Provision akun harus membuat/memperbarui profil `users`
dan dokumen username secara konsisten menggunakan Admin SDK.

Dashboard dan halaman internal memeriksa claim sebelum menampilkan fungsi
aplikasi. Firestore Rules/API server tetap menjadi batas keamanan data yang
otoritatif—pemeriksaan antarmuka saja bukan pengganti rules.

## Data agenda

Agenda disimpan di koleksi `events`:

```text
events/{eventId}
  title:       string
  description: string
  startsAt:    timestamp
  location:    string
  category:    string
  published:   boolean
```

Pengguna internal dapat membaca agenda; hanya admin dapat menulis. Agenda
ditampilkan di dashboard dan tersedia untuk absensi jika `published` bernilai
`true`.

Profil pengguna disimpan di `users/{uid}` (ID dokumen adalah Firebase Auth UID)
dengan field `uid`, `email`, `username`, `displayName`, `roles`, `status`,
`createdAt`, dan `updatedAt`. Pengguna internal dapat membaca profil sendiri;
admin dapat membaca profil pengguna. Penulisan profil dan perubahan peran
dilakukan hanya oleh trusted Admin SDK—client Firestore dilarang mengubahnya.

## Anak, wali kelas, dan absensi

- `/anggota`: admin dan koordinator membuat akun dengan nama, email, username,
  sandi awal (minimal 12 karakter), dan peran. Koordinator hanya dapat membuat
  anggota atau wali kelas; admin dapat menetapkan admin/koordinator. Sandi awal
  hanya dikirim ke Firebase Authentication dan tidak disimpan di Firestore.
- Satu wali kelas aktif ditetapkan untuk setiap kelas (`Balita`, `Pratama`,
  `Madya`, `Remaja`). Penetapan dicatat di `classAssignments/{className}`;
  transaksi Firestore mencegah dua wali terpilih untuk kelas yang sama.
- `/anak`: hanya admin menambah/mengubah/menonaktifkan data anak. Data minimum
  yang disimpan adalah nama dan kelas; semua pengguna internal yang sudah masuk
  dapat membaca daftar dan QR.
  Data disimpan di `children/{childId}`.
- Setiap kartu QR berisi kode acak `KPAR1:<UUID>` saja—bukan nama atau tanggal
  lahir. Nonaktifkan kartu/anak dengan mengubah status, jangan memakai QR sebagai
  bukti identitas yang cukup tanpa pemeriksaan visual anak.
- `/absensi`: pengguna internal memilih kegiatan terbit lalu memindai QR dengan
  kamera ponsel (HTTPS diperlukan) atau memasukkan kode manual. Catatan di
  `attendance/{eventId}__{childId}` berisi UID anak, kegiatan, waktu, dan UID
  petugas; Rules menolak duplikasi dan perubahan/penghapusan catatan.
- Nama anak adalah data pribadi. Batasi akun internal, lindungi perangkat,
  jangan bagikan daftar/QR secara publik, dan minta persetujuan wali sesuai
  kebijakan gereja.

## Deploy otomatis ke Vercel

1. Push repositori ke GitHub, lalu impor ke Vercel melalui **Add New → Project**.
2. Tambahkan keenam variabel `NEXT_PUBLIC_FIREBASE_*` pada **Project Settings →
   Environment Variables** untuk Production dan Preview.
3. Aktifkan Vercel Deployment Protection untuk Production dan Preview jika
   tersedia pada paket/team yang digunakan. Ini menambahkan pembatas di lapisan
   hosting; login Firebase dan Firestore Rules tetap wajib.
4. Vercel menjalankan deployment Preview untuk pull request dan deployment
   Production otomatis setelah perubahan digabungkan ke production branch.

Jangan commit `.env.local`. Metadata `noindex` hanya mencegah pengindeksan mesin
pencari; itu bukan kontrol akses. Firebase Authentication dan Firestore Rules
tetap diperlukan untuk melindungi aplikasi dan datanya.
