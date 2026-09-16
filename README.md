# SIGAP WebGIS Semarang v12 — Stable Dispatch

Versi ini dibangun ulang langsung dari **v10.1**, yaitu versi stabil yang sudah berhasil untuk:
- klik Simulasi Kecelakaan;
- Gunakan Lokasi Saat Ini;
- Pilih Titik di Peta;
- klik peta sebagai lokasi korban;
- menampilkan fasilitas medis dan kepolisian terdekat.

Kode pemilihan lokasi v10.1 sengaja tidak diubah.

## Fitur baru
Setelah titik korban berhasil aktif, panel menampilkan **Hitung Simulasi Respons**.

Saat ditekan ada loading, lalu sistem menghitung:
1. Medis terdekat → korban.
2. Polisi terdekat → korban.
3. Korban → fasilitas medis terdekat.

Output:
- estimasi menit;
- jarak jaringan jalan;
- kartu hasil yang dapat diklik untuk menampilkan rute.

Jika OSRM public server gagal, titik korban dan fitur dasar tetap aktif karena dispatch dibuat sebagai modul terpisah.

> Catatan: estimasi ini adalah simulasi waktu perjalanan jaringan jalan, bukan waktu dispatch resmi petugas.
