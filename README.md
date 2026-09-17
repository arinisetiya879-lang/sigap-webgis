# SIGAP WebGIS v13.6.4 — GitHub Pages Ready

Versi ini disiapkan untuk GitHub Pages.

Struktur folder yang harus di-upload ke ROOT repository:

index.html
style.css
script.js
.nojekyll
assets/
  sigap-semarang-rescue-bg.png
data/
  fasilitas_semarang.geojson
  damkar_semarang.json

Perbaikan GitHub Pages:
- Path CSS dan JavaScript menggunakan path relatif.
- Asset gambar menggunakan path relatif.
- Data GeoJSON dan Damkar menggunakan `document.baseURI`, sehingga tetap bekerja ketika repository berada pada subpath GitHub Pages.
- Tidak menggunakan path absolut `/data/...`.
- Ditambahkan `.nojekyll`.
- Ditambahkan cache-busting untuk style.css dan script.js.

Contoh:
Jika repository bernama `sigap-webgis`, halaman dapat berjalan dari:
https://USERNAME.github.io/sigap-webgis/

Jangan upload folder `SIGAP_WebGIS_v13_6_4_GitHub_Pages` sebagai satu folder di dalam repository. Upload ISI folder ini ke root repository.
