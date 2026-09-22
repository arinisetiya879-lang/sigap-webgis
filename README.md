# SIGAP WebGIS v13.6.6 — Incident Close FIX

Perbaikan:
- Tombol × pada panel Simulasi Insiden sekarang menjalankan fungsi `endAccidentSimulation()`.
- Tombol `Akhiri Simulasi` menjalankan fungsi yang sama.
- Saat ditutup, marker korban, route, service area, dispatch result, badge insiden, dan state simulasi dibersihkan.
- Posisi pengguna sebelumnya dikembalikan jika tersedia.
- Tombol diberi z-index/pointer-events agar dapat diklik.
- Fitur lain dari v13.6.5 tetap dipertahankan.
