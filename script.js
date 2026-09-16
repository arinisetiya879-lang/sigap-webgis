// ======================================================
// SIGAP WEBGIS KOTA SEMARANG
// GitHub Pages Stable Version
// ======================================================

const map = L.map('map', { zoomControl: true })
  .setView([-7.005, 110.425], 12);

const baseLayers = {
  light: L.tileLayer(
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }
  ),

  osm: L.tileLayer(
    'https://tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors, Tiles style by HOT'
    }
  )
};

let activeBase = baseLayers.light.addTo(map);

let features = [];
let markers = [];
let activeCat = 'Semua';
let userLatLng = null;
let userMarker = null;
let routeLayer = null;
let selected = null;
let boundaryLayer = null;
let isoLayer = null;

let transportMode = 'car';


// ======================================================
// MODE TRANSPORTASI
// ======================================================

window.setTransportMode = function(mode) {

  transportMode = mode;

  const car = document.getElementById('modeCar');
  const motor = document.getElementById('modeMotor');

  if (car) car.classList.toggle('active', mode === 'car');
  if (motor) motor.classList.toggle('active', mode === 'motorcycle');

  const note = document.getElementById('transportNote');

  if (note) {
    note.textContent =
      mode === 'motorcycle'
        ? 'Motor: menggunakan profil motorcycle Valhalla, sehingga pilihan jalan dapat berbeda dari mobil.'
        : 'Mobil: rute mengikuti profil driving OSRM.';
  }

  if (selected) {
    routeTo(selected.properties.id);
  }
};


// ======================================================
// DECODE POLYLINE VALHALLA
// ======================================================

function decodePolyline6(str) {

  let index = 0;
  let lat = 0;
  let lon = 0;
  let coordinates = [];

  while (index < str.length) {

    let b;
    let shift = 0;
    let result = 0;

    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat =
      (result & 1)
        ? ~(result >> 1)
        : (result >> 1);

    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlon =
      (result & 1)
        ? ~(result >> 1)
        : (result >> 1);

    lon += dlon;

    coordinates.push([
      lon / 1e6,
      lat / 1e6
    ]);
  }

  return coordinates;
}


// ======================================================
// DATA DASAR
// ======================================================

const list = document.getElementById('nearestList');

const colors = {
  Medis: '#bf2d2d',
  Keamanan: '#46678f',
  Bencana: '#4f7d62',
  Kebakaran: '#d9822b'
};

let searchQuery = '';


// ======================================================
// HITUNG JARAK HAVERSINE
// ======================================================

function hav(a, b) {

  const R = 6371;

  const toR = x =>
    x * Math.PI / 180;

  const dLat =
    toR(b.lat - a.lat);

  const dLon =
    toR(b.lng - a.lng);

  const q =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(a.lat)) *
    Math.cos(toR(b.lat)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R *
    Math.asin(Math.sqrt(q));
}


// ======================================================
// ICON FASILITAS
// ======================================================

function icon(cat) {

  const symbol =
    cat === 'Medis'
      ? '✚'
      : cat === 'Keamanan'
      ? '●'
      : cat === 'Kebakaran'
      ? '🔥'
      : '!';

  return L.divIcon({

    className: '',

    html: `
      <div style="
        width:30px;
        height:30px;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        background:${colors[cat] || '#c83e3e'};
        border:3px solid white;
        box-shadow:0 2px 8px #0004">

        <span style="
          display:block;
          transform:rotate(45deg);
          text-align:center;
          line-height:24px;
          color:white;
          font-size:12px">

          ${symbol}

        </span>

      </div>
    `,

    iconSize: [30, 30],
    iconAnchor: [15, 30]

  });
}


// ======================================================
// FILTER DATA
// ======================================================

const filtered = () =>
  features.filter(f => {

    const p = f.properties || {};

    const catOk =
      activeCat === 'Semua' ||
      p.kategori === activeCat;

    const hay = (
      (p.nama || '') + ' ' +
      (p.alamat || '') + ' ' +
      (p.kecamatan || '') + ' ' +
      (p.jenis || '')
    ).toLowerCase();

    return (
      catOk &&
      (!searchQuery ||
       hay.includes(searchQuery))
    );
  });


// ======================================================
// RENDER MARKER
// ======================================================

function renderMarkers() {

  markers.forEach(m =>
    map.removeLayer(m)
  );

  markers = [];

  filtered().forEach(f => {

    if (!f.geometry ||
        !Array.isArray(f.geometry.coordinates)) {
      return;
    }

    const [lng, lat] =
      f.geometry.coordinates;

    const p =
      f.properties || {};

    const m =
      L.marker(
        [lat, lng],
        {
          icon: icon(p.kategori)
        }
      ).addTo(map);

    const phone =
      p.telepon
        ? `<br>☎ ${p.telepon}`
        : '';

    m.bindPopup(`
      <b>${p.nama || 'Fasilitas'}</b>
      <br>
      ${p.jenis || ''}
      <br>
      ${p.alamat || ''}
      ${phone}
      <br>
      <button onclick="routeTo('${p.id}')">
        Lihat rute
      </button>
    `);

    markers.push(m);

  });

  renderNearest();

  const ms =
    document.getElementById(
      'mapStatusText'
    );

  if (ms) {
    ms.textContent =
      `${filtered().length} fasilitas ditampilkan`;
  }
}


// ======================================================
// FASILITAS TERDEKAT
// ======================================================

function renderNearest() {

  if (!list) return;

  const base =
    userLatLng || {
      lat: -7.0476,
      lng: 110.4407
    };

  const arr =
    filtered()
      .map(f => {

        const [lng, lat] =
          f.geometry.coordinates;

        return {
          f,
          d: hav(
            base,
            { lat, lng }
          )
        };

      })

      .sort(
        (a, b) =>
          a.d - b.d
      )

      .slice(0, 5);

  if (!arr.length) {

    list.innerHTML =
      '<p>Belum ada fasilitas untuk ditampilkan.</p>';

    return;
  }

  list.innerHTML =
    arr.map(x => {

      const p =
        x.f.properties;

      return `
        <div class="facility">

          <div class="row">

            <div>

              <h4>
                ${p.nama}
              </h4>

              <p>
                ${p.jenis || ''}
                <br>
                ${p.kecamatan ||
                  'Kota Semarang'}
              </p>

            </div>

            <span class="dist">
              ${x.d.toFixed(1)} km
            </span>

          </div>

          <button
            onclick="focusFacility('${p.id}')">

            Lihat Detail / Rute

          </button>

        </div>
      `;

    }).join('');
}


// ======================================================
// FOCUS FASILITAS
// ======================================================

window.focusFacility = id => {

  const f =
    features.find(
      x =>
        x.properties.id === id
    );

  if (!f) return;

  const [lng, lat] =
    f.geometry.coordinates;

  map.setView(
    [lat, lng],
    15
  );

  selected = f;

  markers.forEach(m => {

    const ll =
      m.getLatLng();

    if (
      Math.abs(ll.lat - lat) < 1e-6 &&
      Math.abs(ll.lng - lng) < 1e-6
    ) {
      m.openPopup();
    }

  });
};


// ======================================================
// ROUTING
// ======================================================

window.routeTo =
async id => {

  const f =
    features.find(
      x =>
        x.properties.id === id
    );

  if (!f) return;

  selected = f;

  if (!userLatLng) {

    alert(
      'Aktifkan Lokasi Saya terlebih dahulu. SIGAP akan memakai titik demo Tembalang jika izin lokasi tidak aktif.'
    );

    setDemoLocation();
  }

  const [lng, lat] =
    f.geometry.coordinates;

  try {

    let geometry;
    let distance;
    let duration;

    if (
      transportMode ===
      'motorcycle'
    ) {

      const req = {

        locations: [
          {
            lat: userLatLng.lat,
            lon: userLatLng.lng
          },
          {
            lat: lat,
            lon: lng
          }
        ],

        costing:
          'motorcycle',

        units:
          'kilometers',

        directions_options: {
          units:
            'kilometers'
        }
      };

      const u =
        'https://valhalla1.openstreetmap.de/route?json=' +
        encodeURIComponent(
          JSON.stringify(req)
        );

      const r =
        await fetch(u);

      const j =
        await r.json();

      if (
        !j.trip?.legs?.length
      ) {
        throw Error(
          'motorcycle route unavailable'
        );
      }

      const leg =
        j.trip.legs[0];

      geometry = {
        type: 'LineString',
        coordinates:
          decodePolyline6(
            leg.shape
          )
      };

      distance =
        j.trip.summary.length *
        1000;

      duration =
        j.trip.summary.time;

    } else {

      const u =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${userLatLng.lng},${userLatLng.lat};` +
        `${lng},${lat}` +
        `?overview=full&geometries=geojson`;

      const r =
        await fetch(u);

      const j =
        await r.json();

      if (!j.routes?.length) {
        throw Error(
          'car route unavailable'
        );
      }

      const rt =
        j.routes[0];

      geometry =
        rt.geometry;

      distance =
        rt.distance;

      duration =
        rt.duration;
    }

    if (routeLayer) {
      map.removeLayer(
        routeLayer
      );
    }

    routeLayer =
      L.geoJSON(
        geometry,
        {
          style: {
            color:
              '#c83e3e',
            weight: 6,
            opacity: .85
          }
        }
      ).addTo(map);

    map.fitBounds(
      routeLayer.getBounds(),
      {
        padding:
          [40, 40]
      }
    );

    const routeTitle =
      document.getElementById(
        'routeTitle'
      );

    if (routeTitle) {
      routeTitle.textContent =
        f.properties.nama;
    }

    const routeDistance =
      document.getElementById(
        'routeDistance'
      );

    if (routeDistance) {
      routeDistance.textContent =
        (distance / 1000)
          .toFixed(1) +
        ' km';
    }

    const routeTime =
      document.getElementById(
        'routeTime'
      );

    if (routeTime) {
      routeTime.textContent =
        Math.round(
          duration / 60
        ) +
        ' menit';
    }

    document
      .getElementById(
        'routeCard'
      )
      ?.classList
      .remove('hidden');

    const isoStatus =
      document.getElementById(
        'isoStatus'
      );

    if (isoStatus) {
      isoStatus.textContent =
        '';
    }

  } catch (e) {

    alert(
      transportMode ===
      'motorcycle'

        ? 'Rute motor belum dapat dihitung oleh layanan routing saat ini. Coba lagi saat terhubung internet atau pilih Mobil.'

        : 'Routing mobil belum dapat dihitung. Coba lagi saat terhubung internet.'
    );
  }
};


// ======================================================
// LOKASI USER
// ======================================================

function setUser(
  lat,
  lng,
  label = 'Lokasi Anda'
) {

  userLatLng =
    { lat, lng };

  if (userMarker) {
    map.removeLayer(
      userMarker
    );
  }

  userMarker =
    L.circleMarker(
      [lat, lng],
      {
        radius: 8,
        color:
          '#172033',
        fillColor:
          '#fff',
        fillOpacity: 1,
        weight: 4
      }
    )
    .addTo(map)
    .bindTooltip(label);

  map.setView(
    [lat, lng],
    14
  );

  renderNearest();
}


function setDemoLocation() {

  setUser(
    -7.0476,
    110.4407,
    'Lokasi demo Tembalang'
  );
}


document
  .getElementById('locBtn')
  ?.addEventListener(
    'click',
    () => {

      if (
        navigator.geolocation
      ) {

        navigator.geolocation
          .getCurrentPosition(

            p => {

              setUser(
                p.coords.latitude,
                p.coords.longitude
              );

            },

            () => {

              setDemoLocation();

              alert(
                'Izin lokasi tidak aktif. SIGAP memakai titik demo Tembalang.'
              );

            },

            {
              enableHighAccuracy:
                true,

              timeout:
                8000
            }
          );

      } else {

        setDemoLocation();

      }
    }
  );


// ======================================================
// FILTER KATEGORI
// ======================================================

document
  .querySelectorAll('.filter')
  .forEach(b => {

    b.addEventListener(
      'click',
      () => {

        document
          .querySelectorAll(
            '.filter'
          )
          .forEach(x =>
            x.classList
              .remove(
                'active'
              )
          );

        b.classList
          .add('active');

        activeCat =
          b.dataset.cat;

        renderMarkers();
      }
    );
  });


// ======================================================
// CLEAR ROUTE
// ======================================================

function clearRoute() {

  if (routeLayer) {

    map.removeLayer(
      routeLayer
    );

    routeLayer =
      null;
  }

  if (isoLayer) {

    map.removeLayer(
      isoLayer
    );

    isoLayer =
      null;
  }

  document
    .getElementById(
      'routeCard'
    )
    ?.classList
    .add('hidden');
}


document
  .getElementById(
    'clearRoute'
  )
  ?.addEventListener(
    'click',
    clearRoute
  );


document
  .getElementById(
    'closeRoute'
  )
  ?.addEventListener(
    'click',
    clearRoute
  );


// ======================================================
// SERVICE AREA
// ======================================================

document
  .getElementById(
    'serviceAreaBtn'
  )
  ?.addEventListener(
    'click',
    async () => {

      if (!selected) {
        return;
      }

      const status =
        document.getElementById(
          'isoStatus'
        );

      const [lng, lat] =
        selected.geometry.coordinates;

      if (status) {
        status.textContent =
          'Menghitung service area jaringan jalan…';
      }

      try {

        const q = {

          locations: [
            {
              lat,
              lon: lng
            }
          ],

          costing:
            transportMode ===
            'motorcycle'
              ? 'motorcycle'
              : 'auto',

          contours: [
            { time: 5 },
            { time: 10 },
            { time: 15 }
          ],

          polygons: true
        };

        const u =
          'https://valhalla1.openstreetmap.de/isochrone?json=' +
          encodeURIComponent(
            JSON.stringify(q)
          );

        const r =
          await fetch(u);

        if (!r.ok) {
          throw Error(
            'HTTP ' +
            r.status
          );
        }

        const j =
          await r.json();

        if (isoLayer) {
          map.removeLayer(
            isoLayer
          );
        }

        isoLayer =
          L.geoJSON(
            j,
            {
              style: f => {

                const c =
                  Number(
                    f.properties
                      ?.contour ??
                    f.properties
                      ?.time ??
                    15
                  );

                return {

                  color:
                    c <= 5
                      ? '#4f7d62'
                      : c <= 10
                      ? '#d9822b'
                      : '#c83e3e',

                  weight: 2,

                  fillOpacity:
                    .14
                };
              }
            }
          ).addTo(map);

        isoLayer
          .bringToBack();

        map.fitBounds(
          isoLayer
            .getBounds(),
          {
            padding:
              [30, 30]
          }
        );

        if (status) {
          status.textContent =
            'Service area 5, 10, dan 15 menit berhasil ditampilkan.';
        }

      } catch (e) {

        if (status) {
          status.textContent =
            'Service area belum dapat dimuat dari server publik. Routing utama tetap dapat digunakan.';
        }
      }
    }
  );


// ======================================================
// BATAS KOTA SEMARANG
// ======================================================

async function loadBoundary() {

  const s =
    document.getElementById(
      'boundaryStatus'
    );

  try {

    const u =
      'https://nominatim.openstreetmap.org/search?format=geojson&polygon_geojson=1&limit=1&q=' +
      encodeURIComponent(
        'Kota Semarang, Jawa Tengah, Indonesia'
      );

    const r =
      await fetch(
        u,
        {
          headers: {
            'Accept-Language':
              'id'
          }
        }
      );

    if (!r.ok) {
      throw Error();
    }

    const j =
      await r.json();

    if (
      !j.features?.length
    ) {
      throw Error();
    }

    boundaryLayer =
      L.geoJSON(
        j.features[0],
        {
          style: {
            color:
              '#172033',
            weight: 2,
            dashArray:
              '7 6',
            fillOpacity:
              .02
          }
        }
      ).addTo(map);

    boundaryLayer
      .bringToBack();

    if (s) {
      s.textContent =
        'Batas Kota Semarang aktif (OSM/Nominatim).';
    }

  } catch (e) {

    if (s) {
      s.textContent =
        'Batas administrasi belum termuat; peta utama tetap dapat digunakan.';
    }
  }
}


document
  .getElementById(
    'boundaryToggle'
  )
  ?.addEventListener(
    'change',
    e => {

      if (
        !boundaryLayer
      ) {
        return;
      }

      if (
        e.target.checked
      ) {
        boundaryLayer
          .addTo(map);
      } else {
        map.removeLayer(
          boundaryLayer
        );
      }
    }
  );


// ======================================================
// DAMKAR
// ======================================================

function toFeature(
  d,
  lat,
  lng
) {

  return {

    type:
      'Feature',

    geometry: {

      type:
        'Point',

      coordinates:
        [lng, lat]
    },

    properties: {

      id: d.id,

      nama:
        d.nama,

      kategori:
        'Kebakaran',

      jenis:
        d.jenis,

      alamat:
        d.alamat,

      kecamatan:
        d.kecamatan,

      telepon:
        d.telepon,

      sumber_instansi:
        'Dinas Pemadam Kebakaran Kota Semarang / OSM',

      catatan_verifikasi:
        'Pos sektor resmi; lokasi dipetakan dari koordinat/OSM'
    }
  };
}


function sleep(ms) {

  return new Promise(
    r =>
      setTimeout(
        r,
        ms
      )
  );
}


async function geocodeDamkar(d) {

  const cacheKey =
    'sigap_geocode_' +
    d.id;

  try {

    const c =
      JSON.parse(
        localStorage.getItem(
          cacheKey
        ) ||
        'null'
      );

    if (
      c?.lat &&
      c?.lng
    ) {
      return c;
    }

  } catch (e) {}


  const q =
    d.geocode_query ||
    `${d.nama}, ${d.alamat}, Kota Semarang, Indonesia`;


  const u =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' +
    encodeURIComponent(q);


  const r =
    await fetch(
      u,
      {
        headers: {
          'Accept-Language':
            'id'
        }
      }
    );


  if (!r.ok) {
    throw Error();
  }


  const j =
    await r.json();


  if (!j.length) {
    throw Error();
  }


  const out = {

    lat:
      Number(
        j[0].lat
      ),

    lng:
      Number(
        j[0].lon
      )
  };


  localStorage.setItem(
    cacheKey,
    JSON.stringify(out)
  );


  return out;
}


async function loadDamkar() {

  const note =
    document.getElementById(
      'damkarNotice'
    );

  try {

    // PENTING:
    // file berada di ROOT repository GitHub
    const r =
      await fetch(
        './damkar_semarang.json'
      );


    if (!r.ok) {
      throw Error(
        'HTTP ' +
        r.status
      );
    }


    const arr =
      await r.json();


    let ok = 0;
    let failed = 0;


    for (
      const d of arr
    ) {

      let lat =
        d.lat;

      let lng =
        d.lng;


      if (
        lat == null ||
        lng == null
      ) {

        try {

          const g =
            await geocodeDamkar(
              d
            );

          lat =
            g.lat;

          lng =
            g.lng;

          await sleep(
            1100
          );

        } catch (e) {

          failed++;

          continue;
        }
      }


      features.push(
        toFeature(
          d,
          lat,
          lng
        )
      );

      ok++;
    }


    renderMarkers();


    if (note) {

      note.textContent =
        `🔥 ${ok} pos sektor Damkar aktif di peta` +
        (
          failed
            ? `; ${failed} lokasi belum berhasil digeocode`
            : ''
        ) +
        '.';

      note.classList
        .add(
          'success'
        );
    }

  } catch (e) {

    console.error(
      'DAMKAR ERROR:',
      e
    );

    if (note) {
      note.textContent =
        '🔥 Data Damkar belum dapat dimuat; kategori lain tetap dapat digunakan.';
    }
  }
}


// ======================================================
// LOAD DATA UTAMA
// KHUSUS GITHUB PAGES
// ======================================================

async function loadMainFacilities() {

  try {

    // FILE BERADA DI ROOT REPOSITORY
    const r =
      await fetch(
        './fasilitas_semarang.geojson',
        {
          cache:
            'no-store'
        }
      );


    if (!r.ok) {

      throw new Error(
        'HTTP ' +
        r.status
      );
    }


    const j =
      await r.json();


    if (
      !j ||
      !Array.isArray(
        j.features
      )
    ) {

      throw new Error(
        'Format GeoJSON tidak valid'
      );
    }


    features =
      j.features;


    console.log(
      'Fasilitas berhasil dimuat:',
      features.length
    );


    renderMarkers();


    const ms =
      document.getElementById(
        'mapStatusText'
      );


    if (ms) {

      ms.textContent =
        `${features.length} fasilitas berhasil dimuat`;
    }


  } catch (error) {

    console.error(
      'SIGAP FACILITY ERROR:',
      error
    );


    if (list) {

      list.innerHTML =
        `
        <p>
          Data fasilitas belum dapat dimuat.
          Pastikan fasilitas_semarang.geojson
          berada di root repository.
        </p>
        `;
    }
  }
}


// ======================================================
// LOAD DATA TERPISAH
// ======================================================

// Fasilitas utama
loadMainFacilities();

// Batas administrasi tidak akan
// mematikan fasilitas jika gagal
loadBoundary();

// Damkar juga dimuat terpisah
loadDamkar();


// ======================================================
// ANALISIS CAKUPAN KOTA
// ======================================================

let cityCoverageLayers = [];


window.clearCityCoverage =
function() {

  cityCoverageLayers
    .forEach(
      l => {

        try {
          map.removeLayer(l);
        } catch (e) {}

      }
    );


  cityCoverageLayers = [];


  const s =
    document.getElementById(
      'coverageStatus'
    );


  if (s) {
    s.textContent =
      'Analisis cakupan dihapus.';
  }


  const st =
    document.getElementById(
      'coverageStats'
    );


  if (st) {
    st.classList
      .add('hidden');
  }
};


// ======================================================
// ANALISIS CAKUPAN
// ======================================================

window.analyzeCityCoverage =
async function() {

  if (
    activeCat ===
    'Semua'
  ) {

    alert(
      'Pilih satu kategori terlebih dahulu: Medis, Keamanan, Kebakaran, atau Bencana.'
    );

    return;
  }


  const candidates =
    features.filter(
      f =>
        f.properties
          .kategori ===
        activeCat
    );


  if (
    !candidates.length
  ) {

    alert(
      'Tidak ada fasilitas pada kategori ini.'
    );

    return;
  }


  clearCityCoverage();


  const status =
    document.getElementById(
      'coverageStatus'
    );


  if (status) {
    status.textContent =
      `Menghitung cakupan ${activeCat}: 0/${candidates.length} fasilitas...`;
  }


  let ok = 0;
  let failed = 0;

  const bounds = [];


  for (
    let i = 0;
    i < candidates.length;
    i++
  ) {

    const f =
      candidates[i];


    const [lon, lat] =
      f.geometry.coordinates;


    try {

      const q = {

        locations: [
          {
            lat,
            lon
          }
        ],

        costing:
          transportMode ===
          'motorcycle'
            ? 'motorcycle'
            : 'auto',

        contours: [
          { time: 5 },
          { time: 10 },
          { time: 15 }
        ],

        polygons:
          true
      };


      const url =
        'https://valhalla1.openstreetmap.de/isochrone?json=' +
        encodeURIComponent(
          JSON.stringify(q)
        );


      const r =
        await fetch(url);


      if (!r.ok) {
        throw Error(
          'HTTP ' +
          r.status
        );
      }


      const gj =
        await r.json();


      if (
        !gj.features?.length
      ) {

        throw Error(
          'empty isochrone'
        );
      }


      const layer =
        L.geoJSON(
          gj,
          {
            style:
              feature => {

                const c =
                  Number(
                    feature
                      .properties
                      ?.contour
                  );


                return {

                  color:
                    c <= 5
                      ? '#4F7D62'
                      : c <= 10
                      ? '#D9822B'
                      : '#C83E3E',

                  fillColor:
                    c <= 5
                      ? '#4F7D62'
                      : c <= 10
                      ? '#D9822B'
                      : '#C83E3E',

                  weight:
                    1.3,

                  fillOpacity:
                    .10,

                  opacity:
                    .55
                };
              }
          }
        )
        .addTo(map);


      cityCoverageLayers
        .push(layer);


      bounds.push(
        layer.getBounds()
      );


      ok++;

    } catch (e) {

      failed++;
    }


    if (status) {

      status.textContent =
        `Menghitung cakupan ${activeCat}: ${i + 1}/${candidates.length} fasilitas...`;
    }


    await new Promise(
      res =>
        setTimeout(
          res,
          180
        )
    );
  }


  if (
    bounds.length
  ) {

    let b =
      bounds[0];


    for (
      let i = 1;
      i < bounds.length;
      i++
    ) {

      b.extend(
        bounds[i]
      );
    }


    map.fitBounds(
      b,
      {
        padding:
          [25, 25]
      }
    );
  }


  const covFacilities =
    document.getElementById(
      'covFacilities'
    );

  const cov5 =
    document.getElementById(
      'cov5'
    );

  const cov10 =
    document.getElementById(
      'cov10'
    );

  const cov15 =
    document.getElementById(
      'cov15'
    );


  if (covFacilities) {
    covFacilities.textContent =
      ok;
  }

  if (cov5) {
    cov5.textContent =
      '≤5 mnt';
  }

  if (cov10) {
    cov10.textContent =
      '≤10 mnt';
  }

  if (cov15) {
    cov15.textContent =
      '≤15 mnt';
  }


  document
    .getElementById(
      'coverageStats'
    )
    ?.classList
    .remove('hidden');


  if (status) {

    status.textContent =
      failed

        ? `Selesai: ${ok} fasilitas berhasil dianalisis, ${failed} gagal dari layanan routing publik.`

        : `Selesai: ${ok} fasilitas ${activeCat} dianalisis. Area di luar zona merah berada di luar cakupan 15 menit dari fasilitas yang berhasil dihitung.`;
  }
};


// ======================================================
// SPLASH + ONBOARDING
// ======================================================

(function() {

  const flow =
    document.getElementById(
      'welcomeFlow'
    );

  const splash =
    document.getElementById(
      'splashScreen'
    );

  const onboard =
    document.getElementById(
      'onboardingScreen'
    );

  const enter =
    document.getElementById(
      'enterOnboarding'
    );

  const skip =
    document.getElementById(
      'skipOnboarding'
    );

  const next =
    document.getElementById(
      'nextOnboarding'
    );

  const dots = [
    ...document.querySelectorAll(
      '#onboardDots button'
    )
  ];

  const slides = [
    ...document.querySelectorAll(
      '.onboard-slide'
    )
  ];

  let idx = 0;


  function showSlide(i) {

    idx = i;


    slides.forEach(
      (s, n) =>
        s.classList.toggle(
          'active',
          n === i
        )
    );


    dots.forEach(
      (d, n) =>
        d.classList.toggle(
          'active',
          n === i
        )
    );


    if (next) {

      next.innerHTML =
        i ===
        slides.length - 1

          ? 'Masuk SIGAP <span>→</span>'

          : 'Lanjut <span>→</span>';
    }
  }


  function openOnboarding() {

    if (
      !flow ||
      !splash ||
      !onboard
    ) {
      return;
    }


    flow.classList
      .remove('hidden');


    splash.classList
      .add('hidden');


    onboard.classList
      .remove('hidden');


    showSlide(0);
  }


  function closeFlow() {

    if (!flow) return;


    flow.classList
      .add('hidden');


    setTimeout(
      () => {

        try {
          map.invalidateSize();
        } catch (e) {}

      },
      100
    );
  }


  if (enter) {

    enter.addEventListener(
      'click',
      openOnboarding
    );
  }


  if (skip) {

    skip.addEventListener(
      'click',
      closeFlow
    );
  }


  if (next) {

    next.addEventListener(
      'click',
      () => {

        if (
          idx <
          slides.length - 1
        ) {

          showSlide(
            idx + 1
          );

        } else {

          closeFlow();
        }
      }
    );
  }


  dots.forEach(
    (d, i) => {

      d.addEventListener(
        'click',
        () =>
          showSlide(i)
      );
    }
  );


  // Selalu tampilkan splash
  // saat halaman direfresh
  localStorage.removeItem(
    'sigap_onboarding_v8'
  );


  if (flow) {
    flow.classList
      .remove('hidden');
  }

  if (splash) {
    splash.classList
      .remove('hidden');
  }

  if (onboard) {
    onboard.classList
      .add('hidden');
  }


  window.reopenGuide =
    () =>
      openOnboarding();

})();


// ======================================================
// SEARCH
// ======================================================

const searchEl =
  document.getElementById(
    'facilitySearch'
  );


searchEl
  ?.addEventListener(
    'input',
    e => {

      searchQuery =
        e.target.value
          .trim()
          .toLowerCase();

      renderMarkers();
    }
  );


document
  .getElementById(
    'clearSearch'
  )
  ?.addEventListener(
    'click',
    () => {

      searchQuery = '';

      if (searchEl) {

        searchEl.value = '';

        searchEl.focus();
      }

      renderMarkers();
    }
  );


// ======================================================
// BASEMAP
// ======================================================

const baseBtn =
  document.getElementById(
    'basemapBtn'
  );

const baseMenu =
  document.getElementById(
    'basemapMenu'
  );


baseBtn
  ?.addEventListener(
    'click',
    () =>
      baseMenu
        ?.classList
        .toggle('hidden')
  );


document
  .querySelectorAll(
    '[data-base]'
  )
  .forEach(
    b => {

      b.addEventListener(
        'click',
        () => {

          const key =
            b.dataset.base;


          if (activeBase) {

            map.removeLayer(
              activeBase
            );
          }


          activeBase =
            baseLayers[key]
              .addTo(map);


          activeBase
            .bringToBack();


          document
            .querySelectorAll(
              '[data-base]'
            )
            .forEach(
              x =>
                x.classList
                  .remove(
                    'active'
                  )
            );


          b.classList
            .add('active');


          const span =
            baseBtn
              ?.querySelector(
                'span'
              );


          if (span) {

            span.textContent =
              key === 'light'
                ? 'OpenStreetMap'
                : 'Peta Humanitarian';
          }


          baseMenu
            ?.classList
            .add('hidden');
        }
      );
    }
  );


// ======================================================
// HEADER NAVIGATION
// ======================================================

function activateNav(btn) {

  document
    .querySelectorAll(
      '.nav-btn'
    )
    .forEach(
      x =>
        x.classList
          .remove('active')
    );


  btn.classList
    .add('active');
}


document
  .querySelectorAll(
    '.nav-btn'
  )
  .forEach(
    btn => {

      btn.addEventListener(
        'click',
        () => {

          activateNav(btn);


          const target =
            btn.dataset.nav;


          if (
            target ===
            'guide'
          ) {

            window.reopenGuide();

            return;
          }


          if (
            target ===
            'about'
          ) {

            document
              .getElementById(
                'aboutModal'
              )
              ?.classList
              .remove('hidden');

            return;
          }


          if (
            target ===
            'map'
          ) {

            map.setView(
              [-7.005, 110.425],
              12
            );

            map.invalidateSize();

            return;
          }


          if (
            target ===
            'analysis'
          ) {

            document
              .querySelector(
                '.city-analysis'
              )
              ?.scrollIntoView(
                {
                  behavior:
                    'smooth',

                  block:
                    'center'
                }
              );

            return;
          }


          if (
            target ===
            'home'
          ) {

            document
              .querySelector(
                '.panel'
              )
              ?.scrollTo(
                {
                  top: 0,
                  behavior:
                    'smooth'
                }
              );


            map.setView(
              [-7.005, 110.425],
              12
            );
          }
        }
      );
    }
  );


document
  .querySelectorAll(
    '[data-close]'
  )
  .forEach(
    b => {

      b.addEventListener(
        'click',
        () => {

          document
            .getElementById(
              b.dataset.close
            )
            ?.classList
            .add('hidden');
        }
      );
    }
  );


document
  .querySelectorAll(
    '.simple-modal'
  )
  .forEach(
    m => {

      m.addEventListener(
        'click',
        e => {

          if (
            e.target === m
          ) {

            m.classList
              .add('hidden');
          }
        }
      );
    }
  );


// ======================================================
// CATEGORY + COVERAGE
// ======================================================

document
  .querySelectorAll(
    '.filter'
  )
  .forEach(
    btn => {

      btn.addEventListener(
        'click',
        () => {

          if (
            typeof clearCityCoverage ===
            'function'
          ) {

            clearCityCoverage();
          }


          const ms =
            document.getElementById(
              'mapStatusText'
            );


          if (ms) {

            ms.textContent =
              `Kategori ${btn.dataset.cat}`;
          }
        }
      );
    }
  );


// ======================================================
// SIMULASI KECELAKAAN
// ======================================================

let accidentMarker = null;
let accidentPickMode = false;
let nearestMedicalFeature = null;
let nearestPoliceFeature = null;
let previousUserLatLng = null;

let dispatchLayer = null;
let dispatchLabel = null;

let dispatchRoutes = {
  medical: null,
  police: null,
  evacuation: null
};


function victimIcon() {

  return L.divIcon({

    className: '',

    html: `
      <div class="victim-marker-wrap">

        <span class="victim-marker-ring">
        </span>

        <span class="victim-marker-core">
          !
        </span>

      </div>
    `,

    iconSize:
      [46, 46],

    iconAnchor:
      [23, 23]

  });
}


function nearestByCategory(
  lat,
  lng,
  category
) {

  const candidates =
    features.filter(
      f =>
        f.properties
          ?.kategori ===
        category
    );


  if (
    !candidates.length
  ) {
    return null;
  }


  return candidates

    .map(
      f => {

        const [flng, flat] =
          f.geometry.coordinates;


        return {

          f,

          d: hav(
            { lat, lng },
            {
              lat: flat,
              lng: flng
            }
          )
        };
      }
    )

    .sort(
      (a, b) =>
        a.d - b.d
    )[0];
}


// ======================================================
// DISPATCH ROUTING
// ======================================================

async function fetchDispatchRoute(
  start,
  end
) {

  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${start.lng},${start.lat};` +
    `${end.lng},${end.lat}` +
    `?overview=full&geometries=geojson`;


  const response =
    await fetch(url);


  if (!response.ok) {

    throw new Error(
      'HTTP ' +
      response.status
    );
  }


  const data =
    await response.json();


  if (
    !data.routes?.length
  ) {

    throw new Error(
      'Rute tidak tersedia'
    );
  }


  const r =
    data.routes[0];


  return {

    geometry:
      r.geometry,

    distance:
      r.distance,

    duration:
      r.duration
  };
}


function clearDispatchMapRoute() {

  if (dispatchLayer) {

    try {
      map.removeLayer(
        dispatchLayer
      );
    } catch (e) {}

    dispatchLayer =
      null;
  }


  if (dispatchLabel) {

    try {
      map.removeLayer(
        dispatchLabel
      );
    } catch (e) {}

    dispatchLabel =
      null;
  }
}


function showDispatchRoute(
  result,
  color,
  label
) {

  if (!result) {
    return;
  }


  clearDispatchMapRoute();


  dispatchLayer =
    L.geoJSON(
      result.geometry,
      {
        style: {
          color,
          weight: 6,
          opacity: .88
        }
      }
    )
    .addTo(map);


  try {

    map.fitBounds(
      dispatchLayer
        .getBounds(),
      {
        padding:
          [45, 45]
      }
    );

  } catch (e) {}


  const coords =
    result.geometry
      ?.coordinates ||
    [];


  if (
    coords.length
  ) {

    const mid =
      coords[
        Math.floor(
          coords.length / 2
        )
      ];


    dispatchLabel =
      L.marker(
        [
          mid[1],
          mid[0]
        ],
        {
          icon:
            L.divIcon(
              {
                className:
                  'dispatch-route-label',

                html:
                  label,

                iconSize:
                  null
              }
            )
        }
      )
      .addTo(map);
  }
}


function resetDispatchPanel() {

  dispatchRoutes = {

    medical:
      null,

    police:
      null,

    evacuation:
      null
  };


  clearDispatchMapRoute();


  document
    .getElementById(
      'dispatchLoading'
    )
    ?.classList
    .add('hidden');


  document
    .getElementById(
      'dispatchResults'
    )
    ?.classList
    .add('hidden');


  const btn =
    document.getElementById(
      'calculateDispatchBtn'
    );


  if (btn) {

    btn.disabled =
      false;


    btn.innerHTML =
      '<span class="dispatch-btn-icon">▶</span><span>Hitung Simulasi Respons</span>';
  }
}


async function calculateDispatchSimulation() {

  if (
    !userLatLng ||
    !nearestMedicalFeature ||
    !nearestPoliceFeature
  ) {

    alert(
      'Tentukan lokasi korban terlebih dahulu.'
    );

    return;
  }


  const btn =
    document.getElementById(
      'calculateDispatchBtn'
    );

  const loading =
    document.getElementById(
      'dispatchLoading'
    );

  const results =
    document.getElementById(
      'dispatchResults'
    );

  const status =
    document.getElementById(
      'dispatchStatus'
    );


  if (btn) {

    btn.disabled =
      true;

    btn.innerHTML =
      '<span class="dispatch-btn-icon">…</span><span>Menghitung...</span>';
  }


  loading
    ?.classList
    .remove('hidden');


  results
    ?.classList
    .add('hidden');


  const victim = {

    lat:
      userLatLng.lat,

    lng:
      userLatLng.lng
  };


  const [
    medLng,
    medLat
  ] =
    nearestMedicalFeature
      .f.geometry
      .coordinates;


  const [
    polLng,
    polLat
  ] =
    nearestPoliceFeature
      .f.geometry
      .coordinates;


  const medical = {

    lat:
      medLat,

    lng:
      medLng
  };


  const police = {

    lat:
      polLat,

    lng:
      polLng
  };


  try {

    const settled =
      await Promise.allSettled(
        [

          fetchDispatchRoute(
            medical,
            victim
          ),

          fetchDispatchRoute(
            police,
            victim
          ),

          fetchDispatchRoute(
            victim,
            medical
          )

        ]
      );


    dispatchRoutes.medical =
      settled[0].status ===
      'fulfilled'
        ? settled[0].value
        : null;


    dispatchRoutes.police =
      settled[1].status ===
      'fulfilled'
        ? settled[1].value
        : null;


    dispatchRoutes.evacuation =
      settled[2].status ===
      'fulfilled'
        ? settled[2].value
        : null;


    const fill =
      (
        route,
        timeId,
        distId
      ) => {

        const time =
          document.getElementById(
            timeId
          );

        const dist =
          document.getElementById(
            distId
          );


        if (time) {

          time.textContent =
            route

              ? Math.max(
                  1,
                  Math.round(
                    route.duration /
                    60
                  )
                ) +
                ' mnt'

              : 'Gagal';
        }


        if (dist) {

          dist.textContent =
            route

              ? (
                  route.distance /
                  1000
                )
                .toFixed(1) +
                ' km jaringan jalan'

              : 'Rute belum tersedia';
        }
      };


    fill(
      dispatchRoutes.medical,
      'dispatchMedicalTime',
      'dispatchMedicalDistance'
    );


    fill(
      dispatchRoutes.police,
      'dispatchPoliceTime',
      'dispatchPoliceDistance'
    );


    fill(
      dispatchRoutes.evacuation,
      'dispatchEvacuationTime',
      'dispatchEvacuationDistance'
    );


    results
      ?.classList
      .remove('hidden');


    const ok =
      [
        dispatchRoutes.medical,
        dispatchRoutes.police,
        dispatchRoutes.evacuation
      ]
      .filter(Boolean)
      .length;


    if (status) {

      status.textContent =
        ok === 3

          ? 'Selesai. Klik salah satu hasil untuk menampilkan rutenya.'

          : `Selesai sebagian: ${ok}/3 rute berhasil. Coba hitung ulang jika server publik sedang sibuk.`;
    }


    if (
      dispatchRoutes.medical
    ) {

      showDispatchRoute(
        dispatchRoutes.medical,
        '#bf2d2d',
        'Medis → Korban'
      );
    }


  } catch (e) {

    results
      ?.classList
      .remove('hidden');


    if (status) {

      status.textContent =
        'Server routing belum merespons. Titik korban tetap aktif; silakan coba Hitung Ulang.';
    }


  } finally {

    loading
      ?.classList
      .add('hidden');


    if (btn) {

      btn.disabled =
        false;


      btn.innerHTML =
        '<span class="dispatch-btn-icon">↻</span><span>Hitung Ulang Respons</span>';
    }
  }
}


// ======================================================
// SET TITIK KORBAN
// ======================================================

function setAccidentPoint(
  lat,
  lng
) {

  resetDispatchPanel();

  accidentPickMode =
    false;


  document.body
    .classList
    .remove(
      'map-pick-cursor'
    );


  previousUserLatLng =
    previousUserLatLng ||
    userLatLng;


  userLatLng = {
    lat,
    lng
  };


  if (userMarker) {

    map.removeLayer(
      userMarker
    );

    userMarker =
      null;
  }


  if (
    accidentMarker
  ) {

    map.removeLayer(
      accidentMarker
    );
  }


  accidentMarker =
    L.marker(
      [lat, lng],
      {
        icon:
          victimIcon(),

        zIndexOffset:
          1200
      }
    )
    .addTo(map)
    .bindPopup(
      '<b>🚨 Titik Korban Kecelakaan</b><br>Lokasi simulasi insiden<br><small>Menjadi titik awal perhitungan fasilitas terdekat dan routing.</small>'
    )
    .openPopup();


  map.setView(
    [lat, lng],
    15
  );


  renderNearest();


  nearestMedicalFeature =
    nearestByCategory(
      lat,
      lng,
      'Medis'
    );


  nearestPoliceFeature =
    nearestByCategory(
      lat,
      lng,
      'Keamanan'
    );


  const victimCoords =
    document.getElementById(
      'victimCoords'
    );


  if (victimCoords) {

    victimCoords.textContent =
      `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }


  if (
    nearestMedicalFeature
  ) {

    const name =
      document.getElementById(
        'nearestMedicalName'
      );

    const distance =
      document.getElementById(
        'nearestMedicalDistance'
      );


    if (name) {

      name.textContent =
        nearestMedicalFeature
          .f.properties
          .nama;
    }


    if (distance) {

      distance.textContent =
        `± ${nearestMedicalFeature.d.toFixed(1)} km garis lurus`;
    }
  }


  if (
    nearestPoliceFeature
  ) {

    const name =
      document.getElementById(
        'nearestPoliceName'
      );

    const distance =
      document.getElementById(
        'nearestPoliceDistance'
      );


    if (name) {

      name.textContent =
        nearestPoliceFeature
          .f.properties
          .nama;
    }


    if (distance) {

      distance.textContent =
        `± ${nearestPoliceFeature.d.toFixed(1)} km garis lurus`;
    }
  }


  document
    .getElementById(
      'incidentPanel'
    )
    ?.classList
    .remove('hidden');


  document
    .getElementById(
      'incidentModeBadge'
    )
    ?.classList
    .remove('hidden');


  const badge =
    document.getElementById(
      'incidentBadgeText'
    );


  if (badge) {

    badge.textContent =
      'Titik korban aktif · klik Rute untuk respons';
  }


  document
    .getElementById(
      'accidentModal'
    )
    ?.classList
    .add('hidden');
}


// ======================================================
// AKHIRI SIMULASI
// ======================================================

function endAccidentSimulation() {

  resetDispatchPanel();


  if (
    accidentMarker
  ) {

    map.removeLayer(
      accidentMarker
    );

    accidentMarker =
      null;
  }


  accidentPickMode =
    false;


  document.body
    .classList
    .remove(
      'map-pick-cursor'
    );


  document
    .getElementById(
      'incidentPanel'
    )
    ?.classList
    .add('hidden');


  document
    .getElementById(
      'incidentModeBadge'
    )
    ?.classList
    .add('hidden');


  if (routeLayer) {

    map.removeLayer(
      routeLayer
    );

    routeLayer =
      null;
  }


  if (isoLayer) {

    map.removeLayer(
      isoLayer
    );

    isoLayer =
      null;
  }


  document
    .getElementById(
      'routeCard'
    )
    ?.classList
    .add('hidden');


  selected =
    null;


  nearestMedicalFeature =
    null;


  nearestPoliceFeature =
    null;


  if (
    previousUserLatLng
  ) {

    setUser(
      previousUserLatLng.lat,
      previousUserLatLng.lng,
      'Lokasi Anda'
    );

  } else {

    userLatLng =
      null;

    renderNearest();
  }


  previousUserLatLng =
    null;
}


// ======================================================
// EVENT SIMULASI
// ======================================================

document
  .getElementById(
    'accidentBtn'
  )
  ?.addEventListener(
    'click',
    () => {

      document
        .getElementById(
          'accidentModal'
        )
        ?.classList
        .remove('hidden');
    }
  );


document
  .getElementById(
    'closeAccidentModal'
  )
  ?.addEventListener(
    'click',
    () => {

      document
        .getElementById(
          'accidentModal'
        )
        ?.classList
        .add('hidden');
    }
  );


// ======================================================
// LOKASI KORBAN DARI GPS
// ======================================================

document
  .getElementById(
    'useVictimCurrentLocation'
  )
  ?.addEventListener(
    'click',
    () => {

      if (
        navigator.geolocation
      ) {

        navigator.geolocation
          .getCurrentPosition(

            p => {

              setAccidentPoint(
                p.coords.latitude,
                p.coords.longitude
              );
            },

            () => {

              alert(
                'Lokasi browser tidak tersedia. Silakan pilih titik korban langsung pada peta.'
              );


              document
                .getElementById(
                  'accidentModal'
                )
                ?.classList
                .add('hidden');


              accidentPickMode =
                true;


              document.body
                .classList
                .add(
                  'map-pick-cursor'
                );


              document
                .getElementById(
                  'incidentModeBadge'
                )
                ?.classList
                .remove('hidden');


              const badge =
                document.getElementById(
                  'incidentBadgeText'
                );


              if (badge) {

                badge.textContent =
                  'Klik peta untuk menentukan lokasi korban';
              }

            },

            {
              enableHighAccuracy:
                true,

              timeout:
                8000
            }
          );
      }
    }
  );


// ======================================================
// PILIH TITIK KORBAN DI PETA
// ======================================================

document
  .getElementById(
    'pickVictimOnMap'
  )
  ?.addEventListener(
    'click',
    () => {

      document
        .getElementById(
          'accidentModal'
        )
        ?.classList
        .add('hidden');


      accidentPickMode =
        true;


      document.body
        .classList
        .add(
          'map-pick-cursor'
        );


      document
        .getElementById(
          'incidentModeBadge'
        )
        ?.classList
        .remove('hidden');


      const badge =
        document.getElementById(
          'incidentBadgeText'
        );


      if (badge) {

        badge.textContent =
          'Klik peta untuk menentukan lokasi korban';
      }
    }
  );


map.on(
  'click',
  e => {

    if (
      accidentPickMode
    ) {

      setAccidentPoint(
        e.latlng.lat,
        e.latlng.lng
      );
    }
  }
);


// ======================================================
// ROUTE FASILITAS RESPON
// ======================================================

document
  .getElementById(
    'routeNearestMedical'
  )
  ?.addEventListener(
    'click',
    () => {

      if (
        nearestMedicalFeature
      ) {

        routeTo(
          nearestMedicalFeature
            .f.properties.id
        );
      }
    }
  );


document
  .getElementById(
    'routeNearestPolice'
  )
  ?.addEventListener(
    'click',
    () => {

      if (
        nearestPoliceFeature
      ) {

        routeTo(
          nearestPoliceFeature
            .f.properties.id
        );
      }
    }
  );


document
  .getElementById(
    'endAccidentSimulation'
  )
  ?.addEventListener(
    'click',
    endAccidentSimulation
  );


document
  .getElementById(
    'closeIncidentPanel'
  )
  ?.addEventListener(
    'click',
    () => {

      document
        .getElementById(
          'incidentPanel'
        )
        ?.classList
        .add('hidden');
    }
  );


// ======================================================
// QUICK FEATURE
// ======================================================

document
  .querySelectorAll(
    '.feature-tile'
  )
  .forEach(
    btn => {

      btn.addEventListener(
        'click',
        () => {

          const f =
            btn.dataset.feature;


          if (
            f ===
            'incident'
          ) {

            document
              .getElementById(
                'accidentBtn'
              )
              ?.click();

            return;
          }


          if (
            f ===
            'nearest'
          ) {

            document
              .getElementById(
                'locBtn'
              )
              ?.click();

            return;
          }


          if (
            f ===
            'route'
          ) {

            const first =
              document.querySelector(
                '#nearestList button, .facility-card button'
              );


            if (first) {

              first.click();

            } else {

              alert(
                'Aktifkan Lokasi Saya terlebih dahulu untuk menampilkan fasilitas terdekat.'
              );
            }
          }
        }
      );
    }
  );


// ======================================================
// DISPATCH BUTTON
// ======================================================

document
  .getElementById(
    'calculateDispatchBtn'
  )
  ?.addEventListener(
    'click',
    calculateDispatchSimulation
  );


document
  .getElementById(
    'showMedicalDispatch'
  )
  ?.addEventListener(
    'click',
    () => {

      if (
        dispatchRoutes.medical
      ) {

        showDispatchRoute(
          dispatchRoutes.medical,
          '#bf2d2d',
          'Medis → Korban'
        );
      }
    }
  );


document
  .getElementById(
    'showPoliceDispatch'
  )
  ?.addEventListener(
    'click',
    () => {

      if (
        dispatchRoutes.police
      ) {

        showDispatchRoute(
          dispatchRoutes.police,
          '#46678f',
          'Polisi → Korban'
        );
      }
    }
  );


document
  .getElementById(
    'showEvacuationDispatch'
  )
  ?.addEventListener(
    'click',
    () => {

      if (
        dispatchRoutes.evacuation
      ) {

        showDispatchRoute(
          dispatchRoutes.evacuation,
          '#4f7d62',
          'Korban → Medis'
        );
      }
    }
  );


// ======================================================
// SIGAP READY
// ======================================================

console.log(
  'SIGAP WebGIS berhasil dijalankan.'
);
