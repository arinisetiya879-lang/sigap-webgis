// =====================================================
// SIGAP WEBGIS v13.6.6
// GITHUB PAGES — FULL SCRIPT
// =====================================================

// GitHub repository structure:
// index.html
// style.css
// script.js
// fasilitas_semarang.geojson
// damkar_semarang.json
// sigap-semarang-intro.png
// sigap-semarang-rescue-bg.png


// =====================================================
// ASSET URL
// =====================================================

function assetURL(path){
  return new URL(
    String(path).replace(/^\.?\//,''),
    document.baseURI
  ).href;
}


// =====================================================
// MAP
// =====================================================

const map = L.map('map',{
  zoomControl:true
}).setView([
  -7.005,
  110.425
],12);


const baseLayers={

  light:L.tileLayer(
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom:19,
      attribution:'© OpenStreetMap contributors'
    }
  ),

  osm:L.tileLayer(
    'https://tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    {
      maxZoom:19,
      attribution:
        '© OpenStreetMap contributors, Tiles style by HOT'
    }
  )

};


let activeBase=
  baseLayers.light.addTo(map);


// =====================================================
// GLOBAL VARIABLES
// =====================================================

let features=[];

let markers=[];

let activeCat='Semua';

let userLatLng=null;

let userMarker=null;

let routeLayer=null;

let selected=null;

let boundaryLayer=null;

let isoLayer=null;

let transportMode='car';


// =====================================================
// LIVE NAVIGATION
// =====================================================

let liveNavWatchId=null;

let liveNavActive=false;

let liveNavLastRouteAt=0;

let liveNavLastRoutedPoint=null;


const LIVE_NAV_MIN_REROUTE_MS=12000;

const LIVE_NAV_MIN_MOVE_M=25;


// =====================================================
// TRANSPORT MODE
// =====================================================

window.setTransportMode=function(mode){

  transportMode=mode;


  const car=
    document.getElementById('modeCar');

  const motor=
    document.getElementById('modeMotor');


  if(car){

    car.classList.toggle(
      'active',
      mode==='car'
    );

  }


  if(motor){

    motor.classList.toggle(
      'active',
      mode==='motorcycle'
    );

  }


  const note=
    document.getElementById(
      'transportNote'
    );


  if(note){

    note.textContent=

      mode==='motorcycle'

      ? 'Motor: menggunakan profil motorcycle Valhalla, sehingga pilihan jalan dapat berbeda dari mobil.'

      : 'Mobil: rute mengikuti profil driving OSRM.';

  }


  if(selected){

    routeTo(
      selected.properties.id
    );

  }

};


// =====================================================
// DECODE VALHALLA POLYLINE
// =====================================================

function decodePolyline6(str){

  let index=0;

  let lat=0;

  let lon=0;

  let coordinates=[];


  while(index<str.length){

    let b;

    let shift=0;

    let result=0;


    do{

      b=
        str.charCodeAt(index++)
        -63;

      result|=
        (b&0x1f)<<shift;

      shift+=5;

    }while(b>=0x20);


    const dlat=

      (result&1)

      ? ~(result>>1)

      : (result>>1);


    lat+=dlat;


    shift=0;

    result=0;


    do{

      b=
        str.charCodeAt(index++)
        -63;

      result|=
        (b&0x1f)<<shift;

      shift+=5;

    }while(b>=0x20);


    const dlon=

      (result&1)

      ? ~(result>>1)

      : (result>>1);


    lon+=dlon;


    coordinates.push([
      lon/1e6,
      lat/1e6
    ]);

  }


  return coordinates;

}


// =====================================================
// FACILITY CONFIG
// =====================================================

const list=
  document.getElementById(
    'nearestList'
  );


const colors={

  Medis:'#bf2d2d',

  Keamanan:'#46678f',

  Bencana:'#4f7d62',

  Kebakaran:'#d9822b'

};


let searchQuery='';


// =====================================================
// HAVERSINE
// =====================================================

function hav(a,b){

  const R=6371;

  const toR=x=>
    x*Math.PI/180;


  const dLat=
    toR(b.lat-a.lat);

  const dLon=
    toR(b.lng-a.lng);


  const q=

    Math.sin(dLat/2)**2

    +

    Math.cos(toR(a.lat))

    *

    Math.cos(toR(b.lat))

    *

    Math.sin(dLon/2)**2;


  return 2*R*
    Math.asin(
      Math.sqrt(q)
    );

}


// =====================================================
// FACILITY ICON
// =====================================================

function icon(cat){

  const symbol=

    cat==='Medis'
      ? '✚'

    : cat==='Keamanan'
      ? '●'

    : cat==='Kebakaran'
      ? '🔥'

    : '!';


  return L.divIcon({

    className:'',

    html:`

      <div style="
        width:30px;
        height:30px;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        background:${colors[cat]||'#c83e3e'};
        border:3px solid white;
        box-shadow:0 2px 8px #0004;
      ">

        <span style="
          display:block;
          transform:rotate(45deg);
          text-align:center;
          line-height:24px;
          color:white;
          font-size:12px;
        ">

          ${symbol}

        </span>

      </div>

    `,

    iconSize:[30,30],

    iconAnchor:[15,30]

  });

}


// =====================================================
// FILTER
// =====================================================

const filtered=()=>features.filter(f=>{

  const p=
    f.properties||{};


  const catOk=

    activeCat==='Semua'

    ||

    p.kategori===activeCat;


  const hay=(

    (p.nama||'')

    +' '+

    (p.alamat||'')

    +' '+

    (p.kecamatan||'')

    +' '+

    (p.jenis||'')

  ).toLowerCase();


  return catOk

    &&

    (
      !searchQuery

      ||

      hay.includes(searchQuery)
    );

});


// =====================================================
// MARKERS
// =====================================================

function renderMarkers(){

  markers.forEach(m=>{

    try{

      map.removeLayer(m);

    }catch(e){}

  });


  markers=[];


  filtered().forEach(f=>{

    if(
      !f.geometry ||
      !Array.isArray(
        f.geometry.coordinates
      )
    ){

      return;

    }


    const [lng,lat]=
      f.geometry.coordinates;


    const p=
      f.properties||{};


    const marker=
      L.marker(
        [lat,lng],
        {
          icon:icon(
            p.kategori
          )
        }
      )
      .addTo(map);


    const phone=

      p.telepon

      ? `<br>☎ ${p.telepon}`

      : '';


    marker.bindPopup(`

      <b>${p.nama||'Fasilitas'}</b>

      <br>

      ${p.jenis||''}

      <br>

      ${p.alamat||''}

      ${phone}

      <br>

      <button
        onclick="routeTo('${p.id}')"
      >
        Lihat rute
      </button>

    `);


    markers.push(marker);

  });


  renderNearest();


  const ms=
    document.getElementById(
      'mapStatusText'
    );


  if(ms){

    ms.textContent=
      `${filtered().length} fasilitas ditampilkan`;

  }

}


// =====================================================
// NEAREST FACILITIES
// =====================================================

function renderNearest(){

  if(!list){

    return;

  }


  const base=

    userLatLng

    ||

    {
      lat:-7.0476,
      lng:110.4407
    };


  const arr=

    filtered()

    .map(f=>{

      const [lng,lat]=
        f.geometry.coordinates;


      return{

        f,

        d:hav(
          base,
          {lat,lng}
        )

      };

    })

    .sort(
      (a,b)=>a.d-b.d
    )

    .slice(0,5);


  list.innerHTML=

    arr.map(x=>{

      const p=
        x.f.properties;


      return `

        <div class="facility">

          <div class="row">

            <div>

              <h4>
                ${p.nama}
              </h4>

              <p>

                ${p.jenis||''}

                <br>

                ${p.kecamatan||'Kota Semarang'}

              </p>

            </div>


            <span class="dist">

              ${x.d.toFixed(1)} km

            </span>

          </div>


          <button
            onclick="focusFacility('${p.id}')"
          >

            Lihat Detail / Rute

          </button>

        </div>

      `;

    })

    .join('');

}


// =====================================================
// FOCUS FACILITY
// =====================================================

window.focusFacility=id=>{

  const f=
    features.find(
      x=>x.properties.id===id
    );


  if(!f){

    return;

  }


  const [lng,lat]=
    f.geometry.coordinates;


  map.setView(
    [lat,lng],
    15
  );


  selected=f;


  markers.forEach(m=>{

    const ll=
      m.getLatLng();


    if(

      Math.abs(
        ll.lat-lat
      )<1e-6

      &&

      Math.abs(
        ll.lng-lng
      )<1e-6

    ){

      m.openPopup();

    }

  });

};


// =====================================================
// ROUTING
// =====================================================

window.routeTo=async(
  id,
  opts={}
)=>{

  const f=
    features.find(
      x=>x.properties.id===id
    );


  if(!f){

    return;

  }


  selected=f;


  if(!userLatLng){

    alert(
      'Aktifkan Lokasi Saya terlebih dahulu. SIGAP akan memakai titik demo Tembalang jika izin lokasi tidak aktif.'
    );


    setDemoLocation();

  }


  const [lng,lat]=
    f.geometry.coordinates;


  try{

    let geometry;

    let distance;

    let duration;


    // MOTOR
    if(
      transportMode===
      'motorcycle'
    ){

      const req={

        locations:[

          {
            lat:userLatLng.lat,
            lon:userLatLng.lng
          },

          {
            lat:lat,
            lon:lng
          }

        ],

        costing:'motorcycle',

        units:'kilometers',

        directions_options:{
          units:'kilometers'
        }

      };


      const url=

        'https://valhalla1.openstreetmap.de/route?json='

        +

        encodeURIComponent(
          JSON.stringify(req)
        );


      const response=
        await fetch(url);


      const data=
        await response.json();


      if(
        !data.trip?.legs?.length
      ){

        throw new Error(
          'motorcycle route unavailable'
        );

      }


      const leg=
        data.trip.legs[0];


      geometry={

        type:'LineString',

        coordinates:
          decodePolyline6(
            leg.shape
          )

      };


      distance=
        data.trip.summary.length
        *1000;


      duration=
        data.trip.summary.time;

    }


    // MOBIL
    else{

      const url=

        `https://router.project-osrm.org/route/v1/driving/`

        +

        `${userLatLng.lng},${userLatLng.lat};`

        +

        `${lng},${lat}`

        +

        '?overview=full&geometries=geojson';


      const response=
        await fetch(url);


      const data=
        await response.json();


      if(
        !data.routes?.length
      ){

        throw new Error(
          'car route unavailable'
        );

      }


      const route=
        data.routes[0];


      geometry=
        route.geometry;


      distance=
        route.distance;


      duration=
        route.duration;

    }


    if(routeLayer){

      map.removeLayer(
        routeLayer
      );

    }


    routeLayer=
      L.geoJSON(

        geometry,

        {

          style:{

            color:'#c83e3e',

            weight:6,

            opacity:.85

          }

        }

      ).addTo(map);


    if(!opts.keepView){

      map.fitBounds(

        routeLayer.getBounds(),

        {
          padding:[40,40]
        }

      );

    }


    const routeTitle=
      document.getElementById(
        'routeTitle'
      );


    const routeDistance=
      document.getElementById(
        'routeDistance'
      );


    const routeTime=
      document.getElementById(
        'routeTime'
      );


    const routeCard=
      document.getElementById(
        'routeCard'
      );


    const isoStatus=
      document.getElementById(
        'isoStatus'
      );


    if(routeTitle){

      routeTitle.textContent=
        f.properties.nama;

    }


    if(routeDistance){

      routeDistance.textContent=

        (distance/1000)
        .toFixed(1)

        +' km';

    }


    if(routeTime){

      routeTime.textContent=

        Math.round(
          duration/60
        )

        +' menit';

    }


    routeCard?.classList.remove(
      'hidden'
    );


    if(isoStatus){

      isoStatus.textContent='';

    }


    return{

      distance,

      duration,

      geometry

    };

  }


  catch(error){

    console.error(
      'Routing error:',
      error
    );


    alert(

      transportMode==='motorcycle'

      ? 'Rute motor belum dapat dihitung oleh layanan routing saat ini. Coba lagi saat terhubung internet atau pilih Mobil.'

      : 'Routing mobil belum dapat dihitung. Coba lagi saat terhubung internet.'

    );

  }

};


// =====================================================
// USER LOCATION
// =====================================================

function setUser(
  lat,
  lng,
  label='Lokasi Anda',
  opts={}
){

  userLatLng={
    lat,
    lng
  };


  if(userMarker){

    map.removeLayer(
      userMarker
    );

  }


  if(liveNavActive){

    userMarker=
      L.marker(

        [lat,lng],

        {

          icon:L.divIcon({

            className:'',

            html:
              '<div class="live-user-marker"></div>',

            iconSize:[18,18],

            iconAnchor:[9,9]

          })

        }

      )
      .addTo(map)
      .bindTooltip(label);

  }


  else{

    userMarker=
      L.circleMarker(

        [lat,lng],

        {

          radius:8,

          color:'#172033',

          fillColor:'#fff',

          fillOpacity:1,

          weight:4

        }

      )
      .addTo(map)
      .bindTooltip(label);

  }


  if(!opts.keepView){

    map.setView(
      [lat,lng],
      14
    );

  }


  renderNearest();

}


function setDemoLocation(){

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
  ()=>{

    if(
      navigator.geolocation
    ){

      navigator.geolocation
      .getCurrentPosition(

        position=>{

          setUser(

            position.coords.latitude,

            position.coords.longitude

          );

        },

        ()=>{

          setDemoLocation();


          alert(
            'Izin lokasi tidak aktif. SIGAP memakai titik demo Tembalang.'
          );

        },

        {

          enableHighAccuracy:true,

          timeout:8000

        }

      );

    }

    else{

      setDemoLocation();

    }

  }
);


// =====================================================
// LIVE NAV UI
// =====================================================

function setLiveNavUI(
  active,
  message='',
  accuracy=null
){

  const box=
    document.querySelector(
      '.live-nav-box'
    );


  const status=
    document.getElementById(
      'liveNavStatus'
    );


  const acc=
    document.getElementById(
      'liveNavAccuracy'
    );


  const start=
    document.getElementById(
      'startLiveNav'
    );


  const stop=
    document.getElementById(
      'stopLiveNav'
    );


  box?.classList.toggle(
    'nav-active',
    active
  );


  start?.classList.toggle(
    'hidden',
    active
  );


  stop?.classList.toggle(
    'hidden',
    !active
  );


  if(status){

    status.textContent=

      message

      ||

      (
        active
        ? 'Navigasi aktif'
        : 'Belum aktif'
      );

  }


  if(acc){

    acc.textContent=

      accuracy!=null

      ? `Akurasi GPS ±${Math.round(accuracy)} m · rute diperbarui saat posisi berubah.`

      : 'GPS akan diperbarui selama perjalanan.';

  }

}


// =====================================================
// REFRESH LIVE ROUTE
// =====================================================

async function refreshLiveRoute(
  force=false
){

  if(
    !liveNavActive ||
    !selected ||
    !userLatLng
  ){

    return;

  }


  const now=
    Date.now();


  const moved=

    liveNavLastRoutedPoint

    ? hav(
        liveNavLastRoutedPoint,
        userLatLng
      )*1000

    : Infinity;


  if(

    !force

    &&

    (
      now-liveNavLastRouteAt
      <
      LIVE_NAV_MIN_REROUTE_MS

      ||

      moved
      <
      LIVE_NAV_MIN_MOVE_M
    )

  ){

    return;

  }


  liveNavLastRouteAt=
    now;


  liveNavLastRoutedPoint={
    ...userLatLng
  };


  await routeTo(

    selected.properties.id,

    {
      keepView:true
    }

  );

}


// =====================================================
// START LIVE NAVIGATION
// =====================================================

function startLiveNavigation(){

  if(!selected){

    alert(
      'Pilih fasilitas dan tampilkan rute terlebih dahulu.'
    );

    return;

  }


  if(
    !navigator.geolocation
  ){

    alert(
      'Browser ini tidak mendukung pelacakan lokasi.'
    );

    return;

  }


  if(
    liveNavWatchId!==null
  ){

    navigator.geolocation
    .clearWatch(
      liveNavWatchId
    );

  }


  liveNavActive=true;

  liveNavLastRouteAt=0;

  liveNavLastRoutedPoint=null;


  setLiveNavUI(
    true,
    'Menunggu GPS…'
  );


  liveNavWatchId=

    navigator.geolocation
    .watchPosition(

      async position=>{

        if(!liveNavActive){

          return;

        }


        const {
          latitude,
          longitude,
          accuracy
        }=
          position.coords;


        setUser(

          latitude,

          longitude,

          'Posisi Anda — navigasi aktif',

          {
            keepView:true
          }

        );


        setLiveNavUI(

          true,

          'Navigasi aktif',

          accuracy

        );


        await refreshLiveRoute(
          false
        );

      },


      error=>{

        const msg=

          error.code===1

          ? 'Izin lokasi ditolak. Aktifkan izin lokasi browser.'

          : error.code===2

          ? 'Posisi GPS belum tersedia.'

          : 'GPS terlalu lama merespons.';


        setLiveNavUI(
          true,
          msg
        );

      },


      {

        enableHighAccuracy:true,

        maximumAge:3000,

        timeout:12000

      }

    );

}


// =====================================================
// STOP LIVE NAVIGATION
// =====================================================

function stopLiveNavigation(){

  if(
    liveNavWatchId!==null
  ){

    navigator.geolocation
    .clearWatch(
      liveNavWatchId
    );


    liveNavWatchId=null;

  }


  liveNavActive=false;

  liveNavLastRouteAt=0;

  liveNavLastRoutedPoint=null;


  setLiveNavUI(
    false,
    'Navigasi dihentikan'
  );


  if(userLatLng){

    setUser(

      userLatLng.lat,

      userLatLng.lng,

      'Lokasi Anda',

      {
        keepView:true
      }

    );

  }

}


document
.getElementById('startLiveNav')
?.addEventListener(
  'click',
  startLiveNavigation
);


document
.getElementById('stopLiveNav')
?.addEventListener(
  'click',
  stopLiveNavigation
);


// =====================================================
// CATEGORY FILTER
// =====================================================

document
.querySelectorAll('.filter')
.forEach(button=>{

  button.onclick=()=>{

    document
    .querySelectorAll('.filter')
    .forEach(item=>
      item.classList.remove(
        'active'
      )
    );


    button.classList.add(
      'active'
    );


    activeCat=
      button.dataset.cat;


    renderMarkers();

  };

});


// =====================================================
// CLEAR ROUTE
// =====================================================

function clearRoute(){

  if(liveNavActive){

    stopLiveNavigation();

  }


  if(routeLayer){

    map.removeLayer(
      routeLayer
    );

    routeLayer=null;

  }


  if(isoLayer){

    map.removeLayer(
      isoLayer
    );

    isoLayer=null;

  }


  document
  .getElementById('routeCard')
  ?.classList.add(
    'hidden'
  );

}


document
.getElementById('clearRoute')
?.addEventListener(
  'click',
  clearRoute
);


document
.getElementById('closeRoute')
?.addEventListener(
  'click',
  clearRoute
);


// =====================================================
// SERVICE AREA
// =====================================================

document
.getElementById('serviceAreaBtn')
?.addEventListener(
  'click',
  async()=>{

    if(!selected){

      return;

    }


    const status=
      document.getElementById(
        'isoStatus'
      );


    const [lng,lat]=
      selected.geometry.coordinates;


    if(status){

      status.textContent=
        'Menghitung service area jaringan jalan…';

    }


    try{

      const query={

        locations:[
          {
            lat,
            lon:lng
          }
        ],

        costing:
          transportMode==='motorcycle'
          ? 'motorcycle'
          : 'auto',

        contours:[

          {time:5},

          {time:10},

          {time:15}

        ],

        polygons:true

      };


      const url=

        'https://valhalla1.openstreetmap.de/isochrone?json='

        +

        encodeURIComponent(
          JSON.stringify(query)
        );


      const response=
        await fetch(url);


      if(!response.ok){

        throw new Error(
          'HTTP '+response.status
        );

      }


      const data=
        await response.json();


      if(isoLayer){

        map.removeLayer(
          isoLayer
        );

      }


      isoLayer=
        L.geoJSON(

          data,

          {

            style:feature=>{

              const contour=
                Number(

                  feature.properties?.contour

                  ??

                  feature.properties?.time

                  ??

                  15

                );


              return{

                color:
                  contour<=5
                  ? '#4f7d62'
                  : contour<=10
                  ? '#d9822b'
                  : '#c83e3e',

                weight:2,

                fillOpacity:.14

              };

            }

          }

        )
        .addTo(map);


      isoLayer.bringToBack();


      map.fitBounds(

        isoLayer.getBounds(),

        {
          padding:[30,30]
        }

      );


      if(status){

        status.textContent=
          'Service area 5, 10, dan 15 menit berhasil ditampilkan.';

      }

    }


    catch(error){

      console.error(
        'Service area error:',
        error
      );


      if(status){

        status.textContent=
          'Service area belum dapat dimuat dari server publik. Routing utama tetap dapat digunakan.';

      }

    }

  }
);


// =====================================================
// BOUNDARY
// =====================================================

async function loadBoundary(){

  const status=
    document.getElementById(
      'boundaryStatus'
    );


  try{

    const url=

      'https://nominatim.openstreetmap.org/search'

      +

      '?format=geojson'

      +

      '&polygon_geojson=1'

      +

      '&limit=1'

      +

      '&q='

      +

      encodeURIComponent(
        'Kota Semarang, Jawa Tengah, Indonesia'
      );


    const response=
      await fetch(

        url,

        {
          headers:{
            'Accept-Language':'id'
          }
        }

      );


    if(!response.ok){

      throw new Error();

    }


    const data=
      await response.json();


    if(
      !data.features?.length
    ){

      throw new Error();

    }


    boundaryLayer=
      L.geoJSON(

        data.features[0],

        {

          style:{

            color:'#172033',

            weight:2,

            dashArray:'7 6',

            fillOpacity:.02

          }

        }

      )
      .addTo(map);


    boundaryLayer.bringToBack();


    if(status){

      status.textContent=
        'Batas Kota Semarang aktif (OSM/Nominatim).';

    }

  }


  catch(error){

    if(status){

      status.textContent=
        'Batas administrasi belum termuat; peta utama tetap dapat digunakan.';

    }

  }

}


document
.getElementById('boundaryToggle')
?.addEventListener(
  'change',
  event=>{

    if(!boundaryLayer){

      return;

    }


    if(event.target.checked){

      boundaryLayer.addTo(map);

    }

    else{

      map.removeLayer(
        boundaryLayer
      );

    }

  }
);


// =====================================================
// DAMKAR FEATURE
// =====================================================

function toFeature(
  d,
  lat,
  lng
){

  return{

    type:'Feature',

    geometry:{

      type:'Point',

      coordinates:[
        Number(lng),
        Number(lat)
      ]

    },

    properties:{

      id:d.id,

      nama:d.nama,

      kategori:'Kebakaran',

      jenis:
        d.jenis
        ||
        'Pos Pemadam Kebakaran',

      alamat:
        d.alamat
        ||
        '',

      kecamatan:
        d.kecamatan
        ||
        '',

      telepon:
        d.telepon
        ||
        '',

      sumber_instansi:
        'Dinas Pemadam Kebakaran Kota Semarang / OSM',

      catatan_verifikasi:
        'Pos sektor resmi; lokasi dipetakan dari koordinat/OSM'

    }

  };

}


function sleep(ms){

  return new Promise(
    resolve=>
      setTimeout(
        resolve,
        ms
      )
  );

}


// =====================================================
// DAMKAR GEOCODING
// =====================================================

async function geocodeDamkar(d){

  const cacheKey=
    'sigap_geocode_'+d.id;


  try{

    const cached=
      JSON.parse(

        localStorage.getItem(
          cacheKey
        )

        ||

        'null'

      );


    if(
      cached?.lat &&
      cached?.lng
    ){

      return cached;

    }

  }

  catch(error){}


  const query=

    d.geocode_query

    ||

    `${d.nama}, ${d.alamat}, Kota Semarang, Indonesia`;


  const url=

    'https://nominatim.openstreetmap.org/search'

    +

    '?format=jsonv2'

    +

    '&limit=1'

    +

    '&q='

    +

    encodeURIComponent(
      query
    );


  const response=
    await fetch(

      url,

      {

        headers:{

          'Accept-Language':'id'

        }

      }

    );


  if(!response.ok){

    throw new Error();

  }


  const data=
    await response.json();


  if(!data.length){

    throw new Error();

  }


  const output={

    lat:Number(
      data[0].lat
    ),

    lng:Number(
      data[0].lon
    )

  };


  try{

    localStorage.setItem(

      cacheKey,

      JSON.stringify(
        output
      )

    );

  }

  catch(error){}


  return output;

}


// =====================================================
// LOAD MAIN FACILITIES — GITHUB ROOT
// =====================================================

async function loadMainFacilities(){

  try{

    const url=
      assetURL(
        'fasilitas_semarang.geojson'
      );


    console.log(
      'Memuat fasilitas:',
      url
    );


    const response=
      await fetch(

        url,

        {
          cache:'no-store'
        }

      );


    if(!response.ok){

      throw new Error(
        'HTTP '+response.status
      );

    }


    const data=
      await response.json();


    if(
      !Array.isArray(
        data.features
      )
    ){

      throw new Error(
        'Format GeoJSON tidak valid'
      );

    }


    features=
      data.features;


    console.log(
      'Fasilitas berhasil:',
      features.length
    );


    renderMarkers();


    return true;

  }


  catch(error){

    console.error(
      'Fasilitas gagal:',
      error
    );


    if(list){

      list.innerHTML=

        '<p>Data fasilitas belum dapat dimuat.</p>';

    }


    return false;

  }

}


// =====================================================
// LOAD DAMKAR — GITHUB ROOT
// =====================================================

async function loadDamkar(){

  const note=
    document.getElementById(
      'damkarNotice'
    );


  try{

    const url=
      assetURL(
        'damkar_semarang.json'
      );


    console.log(
      'Memuat Damkar:',
      url
    );


    const response=
      await fetch(

        url,

        {
          cache:'no-store'
        }

      );


    if(!response.ok){

      throw new Error(
        'HTTP '+response.status
      );

    }


    const data=
      await response.json();


    if(!Array.isArray(data)){

      throw new Error(
        'Format Damkar tidak valid'
      );

    }


    let ok=0;

    let failed=0;


    for(
      const d of data
    ){

      let lat=d.lat;

      let lng=d.lng;


      if(
        lat==null ||
        lng==null
      ){

        try{

          const g=
            await geocodeDamkar(d);


          lat=g.lat;

          lng=g.lng;


          await sleep(
            1100
          );

        }


        catch(error){

          failed++;

          continue;

        }

      }


      const exists=
        features.some(
          feature=>
            feature.properties?.id
            ===
            d.id
        );


      if(!exists){

        features.push(

          toFeature(
            d,
            lat,
            lng
          )

        );

      }


      ok++;

    }


    renderMarkers();


    if(note){

      note.textContent=

        `🔥 ${ok} pos Damkar aktif di peta`

        +

        (
          failed

          ? `; ${failed} titik belum memiliki koordinat`

          : ''
        )

        +

        '.';


      note.classList.add(
        'success'
      );

    }


    return true;

  }


  catch(error){

    console.error(
      'Damkar gagal:',
      error
    );


    if(note){

      note.textContent=
        '🔥 Data Damkar belum dapat dimuat; kategori lain tetap dapat digunakan.';

    }


    return false;

  }

}


// =====================================================
// INITIALIZE DATA
// =====================================================

async function initializeSIGAP(){

  console.log(
    'SIGAP mulai...'
  );


  // fasilitas utama dahulu
  await loadMainFacilities();


  // batas administrasi independen
  loadBoundary();


  // Damkar independen
  await loadDamkar();


  renderMarkers();


  console.log(
    'SIGAP siap. Total:',
    features.length
  );

}


initializeSIGAP();


// =====================================================
// CITY COVERAGE
// =====================================================

let cityCoverageLayers=[];


window.clearCityCoverage=function(){

  cityCoverageLayers
  .forEach(layer=>{

    try{

      map.removeLayer(
        layer
      );

    }

    catch(error){}

  });


  cityCoverageLayers=[];


  const status=
    document.getElementById(
      'coverageStatus'
    );


  if(status){

    status.textContent=
      'Analisis cakupan dihapus.';

  }


  document
  .getElementById('coverageStats')
  ?.classList.add(
    'hidden'
  );

};


// =====================================================
// ANALYZE CITY COVERAGE
// =====================================================

window.analyzeCityCoverage=
async function(){

  if(
    activeCat==='Semua'
  ){

    alert(
      'Pilih satu kategori terlebih dahulu: Medis, Keamanan, Kebakaran, atau Bencana.'
    );

    return;

  }


  const candidates=
    features.filter(

      f=>
        f.properties.kategori
        ===
        activeCat

    );


  if(!candidates.length){

    alert(
      'Tidak ada fasilitas pada kategori ini.'
    );

    return;

  }


  clearCityCoverage();


  const status=
    document.getElementById(
      'coverageStatus'
    );


  status.textContent=

    `Menghitung cakupan ${activeCat}: 0/${candidates.length} fasilitas...`;


  let ok=0;

  let failed=0;

  const bounds=[];


  for(
    let i=0;
    i<candidates.length;
    i++
  ){

    const f=
      candidates[i];


    const [lon,lat]=
      f.geometry.coordinates;


    try{

      const query={

        locations:[
          {
            lat,
            lon
          }
        ],

        costing:
          transportMode==='motorcycle'
          ? 'motorcycle'
          : 'auto',

        contours:[

          {time:5},

          {time:10},

          {time:15}

        ],

        polygons:true

      };


      const url=

        'https://valhalla1.openstreetmap.de/isochrone?json='

        +

        encodeURIComponent(
          JSON.stringify(query)
        );


      const response=
        await fetch(url);


      if(!response.ok){

        throw new Error(
          'HTTP '+response.status
        );

      }


      const geojson=
        await response.json();


      if(
        !geojson.features?.length
      ){

        throw new Error(
          'empty isochrone'
        );

      }


      const layer=
        L.geoJSON(

          geojson,

          {

            style:feature=>{

              const contour=
                Number(
                  feature.properties?.contour
                );


              return{

                color:
                  contour<=5
                  ? '#4F7D62'
                  : contour<=10
                  ? '#D9822B'
                  : '#C83E3E',

                fillColor:
                  contour<=5
                  ? '#4F7D62'
                  : contour<=10
                  ? '#D9822B'
                  : '#C83E3E',

                weight:1.3,

                fillOpacity:.10,

                opacity:.55

              };

            }

          }

        )
        .addTo(map);


      cityCoverageLayers.push(
        layer
      );


      bounds.push(
        layer.getBounds()
      );


      ok++;

    }


    catch(error){

      failed++;

    }


    status.textContent=

      `Menghitung cakupan ${activeCat}: ${i+1}/${candidates.length} fasilitas...`;


    await new Promise(
      resolve=>
        setTimeout(
          resolve,
          180
        )
    );

  }


  if(bounds.length){

    let boundsAll=
      bounds[0];


    for(
      let i=1;
      i<bounds.length;
      i++
    ){

      boundsAll.extend(
        bounds[i]
      );

    }


    map.fitBounds(

      boundsAll,

      {
        padding:[25,25]
      }

    );

  }


  const covFacilities=
    document.getElementById(
      'covFacilities'
    );


  const cov5=
    document.getElementById(
      'cov5'
    );


  const cov10=
    document.getElementById(
      'cov10'
    );


  const cov15=
    document.getElementById(
      'cov15'
    );


  if(covFacilities){

    covFacilities.textContent=
      ok;

  }


  if(cov5){

    cov5.textContent=
      '≤5 mnt';

  }


  if(cov10){

    cov10.textContent=
      '≤10 mnt';

  }


  if(cov15){

    cov15.textContent=
      '≤15 mnt';

  }


  document
  .getElementById('coverageStats')
  ?.classList.remove(
    'hidden'
  );


  status.textContent=

    failed

    ? `Selesai: ${ok} fasilitas berhasil dianalisis, ${failed} gagal dari layanan routing publik.`

    : `Selesai: ${ok} fasilitas ${activeCat} dianalisis. Area di luar zona merah berada di luar cakupan 15 menit dari fasilitas yang berhasil dihitung.`;

};


// =====================================================
// SPLASH + ONBOARDING
// =====================================================

(function(){

  const flow=
    document.getElementById(
      'welcomeFlow'
    );


  const splash=
    document.getElementById(
      'splashScreen'
    );


  const onboard=
    document.getElementById(
      'onboardingScreen'
    );


  const enter=
    document.getElementById(
      'enterOnboarding'
    );


  const skip=
    document.getElementById(
      'skipOnboarding'
    );


  const next=
    document.getElementById(
      'nextOnboarding'
    );


  const dots=[
    ...document.querySelectorAll(
      '#onboardDots button'
    )
  ];


  const slides=[
    ...document.querySelectorAll(
      '.onboard-slide'
    )
  ];


  let idx=0;


  function showSlide(i){

    idx=i;


    slides.forEach(
      (slide,n)=>
        slide.classList.toggle(
          'active',
          n===i
        )
    );


    dots.forEach(
      (dot,n)=>
        dot.classList.toggle(
          'active',
          n===i
        )
    );


    if(next){

      next.innerHTML=

        i===slides.length-1

        ? 'Masuk SIGAP <span>→</span>'

        : 'Lanjut <span>→</span>';

    }

  }


  function openOnboarding(){

    flow?.classList.remove(
      'hidden'
    );


    splash?.classList.add(
      'hidden'
    );


    onboard?.classList.remove(
      'hidden'
    );


    showSlide(0);

  }


  function closeFlow(){

    flow?.classList.add(
      'hidden'
    );


    setTimeout(
      ()=>map.invalidateSize(),
      100
    );

  }


  enter?.addEventListener(
    'click',
    openOnboarding
  );


  skip?.addEventListener(
    'click',
    closeFlow
  );


  next?.addEventListener(
    'click',
    ()=>{

      if(
        idx<slides.length-1
      ){

        showSlide(
          idx+1
        );

      }

      else{

        closeFlow();

      }

    }
  );


  dots.forEach(
    (dot,i)=>
      dot.addEventListener(
        'click',
        ()=>showSlide(i)
      )
  );


  localStorage.removeItem(
    'sigap_onboarding_v8'
  );


  flow?.classList.remove(
    'hidden'
  );


  splash?.classList.remove(
    'hidden'
  );


  onboard?.classList.add(
    'hidden'
  );


  window.reopenGuide=
    ()=>openOnboarding();

})();


// =====================================================
// SEARCH
// =====================================================

const searchEl=
  document.getElementById(
    'facilitySearch'
  );


searchEl?.addEventListener(
  'input',
  event=>{

    searchQuery=
      event.target.value
      .trim()
      .toLowerCase();


    renderMarkers();

  }
);


document
.getElementById('clearSearch')
?.addEventListener(
  'click',
  ()=>{

    searchQuery='';

    searchEl.value='';

    renderMarkers();

    searchEl.focus();

  }
);


// =====================================================
// BASEMAP
// =====================================================

const baseBtn=
  document.getElementById(
    'basemapBtn'
  );


const baseMenu=
  document.getElementById(
    'basemapMenu'
  );


baseBtn?.addEventListener(
  'click',
  ()=>baseMenu?.classList.toggle(
    'hidden'
  )
);


document
.querySelectorAll('[data-base]')
.forEach(button=>

  button.addEventListener(
    'click',
    ()=>{

      const key=
        button.dataset.base;


      if(activeBase){

        map.removeLayer(
          activeBase
        );

      }


      activeBase=
        baseLayers[key]
        .addTo(map);


      activeBase.bringToBack();


      document
      .querySelectorAll('[data-base]')
      .forEach(item=>
        item.classList.remove(
          'active'
        )
      );


      button.classList.add(
        'active'
      );


      const span=
        baseBtn?.querySelector(
          'span'
        );


      if(span){

        span.textContent=

          key==='light'

          ? 'OpenStreetMap'

          : 'Peta Humanitarian';

      }


      baseMenu?.classList.add(
        'hidden'
      );

    }

  )

);


// =====================================================
// HEADER NAVIGATION
// =====================================================

function activateNav(btn){

  document
  .querySelectorAll('.nav-btn')
  .forEach(item=>
    item.classList.remove(
      'active'
    )
  );


  btn.classList.add(
    'active'
  );

}


document
.querySelectorAll('.nav-btn')
.forEach(btn=>

  btn.addEventListener(
    'click',
    ()=>{

      activateNav(btn);


      const target=
        btn.dataset.nav;


      if(target==='guide'){

        window.reopenGuide();

        return;

      }


      if(target==='about'){

        document
        .getElementById('aboutModal')
        ?.classList.remove(
          'hidden'
        );

        return;

      }


      if(target==='map'){

        map.setView(
          [-7.005,110.425],
          12
        );


        map.invalidateSize();

        return;

      }


      if(target==='analysis'){

        document
        .querySelector(
          '.city-analysis'
        )
        ?.scrollIntoView({

          behavior:'smooth',

          block:'center'

        });


        return;

      }


      if(target==='home'){

        document
        .querySelector('.panel')
        ?.scrollTo({

          top:0,

          behavior:'smooth'

        });


        map.setView(
          [-7.005,110.425],
          12
        );

      }

    }

  )

);


document
.querySelectorAll('[data-close]')
.forEach(button=>

  button.addEventListener(
    'click',
    ()=>{

      document
      .getElementById(
        button.dataset.close
      )
      ?.classList.add(
        'hidden'
      );

    }

  )

);


document
.querySelectorAll('.simple-modal')
.forEach(modal=>

  modal.addEventListener(
    'click',
    event=>{

      if(
        event.target===modal
      ){

        modal.classList.add(
          'hidden'
        );

      }

    }

  )

);


// =====================================================
// CATEGORY CHANGE → CLEAR COVERAGE
// =====================================================

document
.querySelectorAll('.filter')
.forEach(btn=>

  btn.addEventListener(
    'click',
    ()=>{

      if(
        typeof clearCityCoverage
        ===
        'function'
      ){

        clearCityCoverage();

      }


      const ms=
        document.getElementById(
          'mapStatusText'
        );


      if(ms){

        ms.textContent=
          `Kategori ${btn.dataset.cat}`;

      }

    }

  )

);


// =====================================================
// ACCIDENT SIMULATION
// =====================================================

let accidentMarker=null;

let accidentPickMode=false;

let nearestMedicalFeature=null;

let nearestPoliceFeature=null;

let previousUserLatLng=null;

let dispatchLayer=null;

let dispatchLabel=null;


let dispatchRoutes={

  medical:null,

  police:null,

  evacuation:null

};


// =====================================================
// VICTIM ICON
// =====================================================

function victimIcon(){

  return L.divIcon({

    className:'',

    html:`

      <div class="victim-marker-wrap">

        <span
          class="victim-marker-ring"
        ></span>

        <span
          class="victim-marker-core"
        >
          !
        </span>

      </div>

    `,

    iconSize:[46,46],

    iconAnchor:[23,23]

  });

}


// =====================================================
// NEAREST BY CATEGORY
// =====================================================

function nearestByCategory(
  lat,
  lng,
  category
){

  const candidates=
    features.filter(

      f=>
        f.properties?.kategori
        ===
        category

    );


  if(!candidates.length){

    return null;

  }


  return candidates

  .map(f=>{

    const [flng,flat]=
      f.geometry.coordinates;


    return{

      f,

      d:hav(

        {lat,lng},

        {
          lat:flat,
          lng:flng
        }

      )

    };

  })

  .sort(
    (a,b)=>a.d-b.d
  )[0];

}


// =====================================================
// DISPATCH ROUTE
// =====================================================

async function fetchDispatchRoute(
  start,
  end
){

  const url=

    `https://router.project-osrm.org/route/v1/driving/`

    +

    `${start.lng},${start.lat};`

    +

    `${end.lng},${end.lat}`

    +

    '?overview=full&geometries=geojson';


  const response=
    await fetch(url);


  if(!response.ok){

    throw new Error(
      'HTTP '+response.status
    );

  }


  const data=
    await response.json();


  if(!data.routes?.length){

    throw new Error(
      'Rute tidak tersedia'
    );

  }


  const route=
    data.routes[0];


  return{

    geometry:
      route.geometry,

    distance:
      route.distance,

    duration:
      route.duration

  };

}


// =====================================================
// CLEAR DISPATCH MAP
// =====================================================

function clearDispatchMapRoute(){

  if(dispatchLayer){

    try{

      map.removeLayer(
        dispatchLayer
      );

    }catch(error){}


    dispatchLayer=null;

  }


  if(dispatchLabel){

    try{

      map.removeLayer(
        dispatchLabel
      );

    }catch(error){}


    dispatchLabel=null;

  }

}


// =====================================================
// SHOW DISPATCH ROUTE
// =====================================================

function showDispatchRoute(
  result,
  color,
  label
){

  if(!result){

    return;

  }


  clearDispatchMapRoute();


  dispatchLayer=
    L.geoJSON(

      result.geometry,

      {

        style:{

          color,

          weight:6,

          opacity:.88

        }

      }

    )
    .addTo(map);


  try{

    map.fitBounds(

      dispatchLayer.getBounds(),

      {
        padding:[45,45]
      }

    );

  }

  catch(error){}


  const coords=
    result.geometry?.coordinates
    ||
    [];


  if(coords.length){

    const mid=
      coords[
        Math.floor(
          coords.length/2
        )
      ];


    dispatchLabel=
      L.marker(

        [
          mid[1],
          mid[0]
        ],

        {

          icon:L.divIcon({

            className:
              'dispatch-route-label',

            html:label,

            iconSize:null

          })

        }

      )
      .addTo(map);

  }

}


// =====================================================
// RESET DISPATCH
// =====================================================

function resetDispatchPanel(){

  dispatchRoutes={

    medical:null,

    police:null,

    evacuation:null

  };


  clearDispatchMapRoute();


  document
  .getElementById('dispatchLoading')
  ?.classList.add(
    'hidden'
  );


  document
  .getElementById('dispatchResults')
  ?.classList.add(
    'hidden'
  );


  const btn=
    document.getElementById(
      'calculateDispatchBtn'
    );


  if(btn){

    btn.disabled=false;


    btn.innerHTML=`

      <span class="dispatch-btn-icon">
        ▶
      </span>

      <span>
        Hitung Simulasi Respons
      </span>

    `;

  }

}


// =====================================================
// CALCULATE DISPATCH
// =====================================================

async function calculateDispatchSimulation(){

  if(

    !userLatLng

    ||

    !nearestMedicalFeature

    ||

    !nearestPoliceFeature

  ){

    alert(
      'Tentukan lokasi korban terlebih dahulu.'
    );

    return;

  }


  const btn=
    document.getElementById(
      'calculateDispatchBtn'
    );


  const loading=
    document.getElementById(
      'dispatchLoading'
    );


  const results=
    document.getElementById(
      'dispatchResults'
    );


  const status=
    document.getElementById(
      'dispatchStatus'
    );


  btn.disabled=true;


  btn.innerHTML=`

    <span class="dispatch-btn-icon">
      …
    </span>

    <span>
      Menghitung...
    </span>

  `;


  loading?.classList.remove(
    'hidden'
  );


  results?.classList.add(
    'hidden'
  );


  const victim={

    lat:userLatLng.lat,

    lng:userLatLng.lng

  };


  const [
    medLng,
    medLat
  ]=
    nearestMedicalFeature
    .f
    .geometry
    .coordinates;


  const [
    polLng,
    polLat
  ]=
    nearestPoliceFeature
    .f
    .geometry
    .coordinates;


  const medical={

    lat:medLat,

    lng:medLng

  };


  const police={

    lat:polLat,

    lng:polLng

  };


  try{

    const settled=
      await Promise.allSettled([

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

      ]);


    dispatchRoutes.medical=

      settled[0].status
      ===
      'fulfilled'

      ? settled[0].value

      : null;


    dispatchRoutes.police=

      settled[1].status
      ===
      'fulfilled'

      ? settled[1].value

      : null;


    dispatchRoutes.evacuation=

      settled[2].status
      ===
      'fulfilled'

      ? settled[2].value

      : null;


    const fill=(
      route,
      timeId,
      distId
    )=>{

      const time=
        document.getElementById(
          timeId
        );


      const distance=
        document.getElementById(
          distId
        );


      if(time){

        time.textContent=

          route

          ? Math.max(
              1,
              Math.round(
                route.duration/60
              )
            )
            +' mnt'

          : 'Gagal';

      }


      if(distance){

        distance.textContent=

          route

          ? (
              route.distance/1000
            ).toFixed(1)
            +' km jaringan jalan'

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


    results?.classList.remove(
      'hidden'
    );


    const ok=[

      dispatchRoutes.medical,

      dispatchRoutes.police,

      dispatchRoutes.evacuation

    ]
    .filter(Boolean)
    .length;


    if(status){

      status.textContent=

        ok===3

        ? 'Selesai. Klik salah satu hasil untuk menampilkan rutenya.'

        : `Selesai sebagian: ${ok}/3 rute berhasil. Coba hitung ulang jika server publik sedang sibuk.`;

    }


    if(
      dispatchRoutes.medical
    ){

      showDispatchRoute(

        dispatchRoutes.medical,

        '#bf2d2d',

        'Medis → Korban'

      );

    }

  }


  catch(error){

    console.error(
      'Dispatch error:',
      error
    );


    results?.classList.remove(
      'hidden'
    );


    if(status){

      status.textContent=
        'Server routing belum merespons. Titik korban tetap aktif; silakan coba Hitung Ulang.';

    }

  }


  finally{

    loading?.classList.add(
      'hidden'
    );


    btn.disabled=false;


    btn.innerHTML=`

      <span class="dispatch-btn-icon">
        ↻
      </span>

      <span>
        Hitung Ulang Respons
      </span>

    `;

  }

}


// =====================================================
// SET ACCIDENT POINT
// =====================================================

function setAccidentPoint(
  lat,
  lng
){

  resetDispatchPanel();


  accidentPickMode=false;


  document.body.classList.remove(
    'map-pick-cursor'
  );


  previousUserLatLng=
    previousUserLatLng
    ||
    userLatLng;


  userLatLng={
    lat,
    lng
  };


  if(userMarker){

    map.removeLayer(
      userMarker
    );


    userMarker=null;

  }


  if(accidentMarker){

    map.removeLayer(
      accidentMarker
    );

  }


  accidentMarker=
    L.marker(

      [lat,lng],

      {

        icon:victimIcon(),

        zIndexOffset:1200

      }

    )
    .addTo(map)
    .bindPopup(`

      <b>
        🚨 Titik Korban Kecelakaan
      </b>

      <br>

      Lokasi simulasi insiden

      <br>

      <small>
        Menjadi titik awal perhitungan fasilitas terdekat dan routing.
      </small>

    `)
    .openPopup();


  map.setView(
    [lat,lng],
    15
  );


  renderNearest();


  nearestMedicalFeature=
    nearestByCategory(
      lat,
      lng,
      'Medis'
    );


  nearestPoliceFeature=
    nearestByCategory(
      lat,
      lng,
      'Keamanan'
    );


  const coords=
    document.getElementById(
      'victimCoords'
    );


  if(coords){

    coords.textContent=
      `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  }


  if(nearestMedicalFeature){

    document
    .getElementById(
      'nearestMedicalName'
    )
    .textContent=
      nearestMedicalFeature
      .f
      .properties
      .nama;


    document
    .getElementById(
      'nearestMedicalDistance'
    )
    .textContent=

      `± ${nearestMedicalFeature.d.toFixed(1)} km garis lurus`;

  }


  if(nearestPoliceFeature){

    document
    .getElementById(
      'nearestPoliceName'
    )
    .textContent=
      nearestPoliceFeature
      .f
      .properties
      .nama;


    document
    .getElementById(
      'nearestPoliceDistance'
    )
    .textContent=

      `± ${nearestPoliceFeature.d.toFixed(1)} km garis lurus`;

  }


  document
  .getElementById('incidentPanel')
  ?.classList.remove(
    'hidden'
  );


  document
  .getElementById('incidentModeBadge')
  ?.classList.remove(
    'hidden'
  );


  const badge=
    document.getElementById(
      'incidentBadgeText'
    );


  if(badge){

    badge.textContent=
      'Titik korban aktif · klik Rute untuk respons';

  }


  document
  .getElementById('accidentModal')
  ?.classList.add(
    'hidden'
  );

}


// =====================================================
// END ACCIDENT
// =====================================================

function endAccidentSimulation(){

  if(liveNavActive){

    stopLiveNavigation();

  }


  resetDispatchPanel();


  if(accidentMarker){

    map.removeLayer(
      accidentMarker
    );


    accidentMarker=null;

  }


  accidentPickMode=false;


  document.body.classList.remove(
    'map-pick-cursor'
  );


  document
  .getElementById('incidentPanel')
  ?.classList.add(
    'hidden'
  );


  document
  .getElementById('incidentModeBadge')
  ?.classList.add(
    'hidden'
  );


  if(routeLayer){

    map.removeLayer(
      routeLayer
    );


    routeLayer=null;

  }


  if(isoLayer){

    map.removeLayer(
      isoLayer
    );


    isoLayer=null;

  }


  document
  .getElementById('routeCard')
  ?.classList.add(
    'hidden'
  );


  selected=null;

  nearestMedicalFeature=null;

  nearestPoliceFeature=null;


  if(previousUserLatLng){

    setUser(

      previousUserLatLng.lat,

      previousUserLatLng.lng,

      'Lokasi Anda'

    );

  }


  else{

    userLatLng=null;

    renderNearest();

  }


  previousUserLatLng=null;

}


// =====================================================
// INCIDENT BUTTONS
// =====================================================

document
.getElementById('closeIncidentPanel')
?.addEventListener(
  'click',
  endAccidentSimulation
);


document
.getElementById('endAccidentSimulation')
?.addEventListener(
  'click',
  endAccidentSimulation
);


document
.getElementById('accidentBtn')
?.addEventListener(
  'click',
  ()=>{

    document
    .getElementById('accidentModal')
    ?.classList.remove(
      'hidden'
    );

  }
);


document
.getElementById('closeAccidentModal')
?.addEventListener(
  'click',
  ()=>{

    document
    .getElementById('accidentModal')
    ?.classList.add(
      'hidden'
    );

  }
);


// =====================================================
// USE CURRENT LOCATION AS VICTIM
// =====================================================

document
.getElementById(
  'useVictimCurrentLocation'
)
?.addEventListener(
  'click',
  ()=>{

    if(
      navigator.geolocation
    ){

      navigator.geolocation
      .getCurrentPosition(

        position=>{

          setAccidentPoint(

            position.coords.latitude,

            position.coords.longitude

          );

        },


        ()=>{

          alert(
            'Lokasi browser tidak tersedia. Silakan pilih titik korban langsung pada peta.'
          );


          document
          .getElementById(
            'accidentModal'
          )
          ?.classList.add(
            'hidden'
          );


          accidentPickMode=true;


          document.body
          .classList.add(
            'map-pick-cursor'
          );


          document
          .getElementById(
            'incidentModeBadge'
          )
          ?.classList.remove(
            'hidden'
          );


          const badge=
            document.getElementById(
              'incidentBadgeText'
            );


          if(badge){

            badge.textContent=
              'Klik peta untuk menentukan lokasi korban';

          }

        },


        {

          enableHighAccuracy:true,

          timeout:8000

        }

      );

    }

  }
);


// =====================================================
// PICK VICTIM ON MAP
// =====================================================

document
.getElementById(
  'pickVictimOnMap'
)
?.addEventListener(
  'click',
  ()=>{

    document
    .getElementById(
      'accidentModal'
    )
    ?.classList.add(
      'hidden'
    );


    accidentPickMode=true;


    document.body
    .classList.add(
      'map-pick-cursor'
    );


    document
    .getElementById(
      'incidentModeBadge'
    )
    ?.classList.remove(
      'hidden'
    );


    const badge=
      document.getElementById(
        'incidentBadgeText'
      );


    if(badge){

      badge.textContent=
        'Klik peta untuk menentukan lokasi korban';

    }

  }
);


map.on(
  'click',
  event=>{

    if(accidentPickMode){

      setAccidentPoint(

        event.latlng.lat,

        event.latlng.lng

      );

    }

  }
);


// =====================================================
// DISPATCH LISTENERS
// =====================================================

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
  ()=>{

    if(
      dispatchRoutes.medical
    ){

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
  ()=>{

    if(
      dispatchRoutes.police
    ){

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
  ()=>{

    if(
      dispatchRoutes.evacuation
    ){

      showDispatchRoute(

        dispatchRoutes.evacuation,

        '#4f7d62',

        'Korban → Medis'

      );

    }

  }
);


// =====================================================
// ORIGINAL INTRO AUDIO
// =====================================================

let sigapAudioCtx=null;

let sigapIntroLoop=null;

let sigapSoundOn=false;


function introTone(
  freq,
  when,
  dur=.34,
  vol=.035,
  type='sine'
){

  if(!sigapAudioCtx){

    return;

  }


  const osc=
    sigapAudioCtx
    .createOscillator();


  const gain=
    sigapAudioCtx
    .createGain();


  osc.type=
    type;


  osc.frequency
  .setValueAtTime(
    freq,
    when
  );


  gain.gain
  .setValueAtTime(
    .0001,
    when
  );


  gain.gain
  .exponentialRampToValueAtTime(

    vol,

    when+.035

  );


  gain.gain
  .exponentialRampToValueAtTime(

    .0001,

    when+dur

  );


  osc.connect(
    gain
  );


  gain.connect(
    sigapAudioCtx.destination
  );


  osc.start(
    when
  );


  osc.stop(
    when+dur+.03
  );

}


// =====================================================
// INTRO MOTIF
// =====================================================

function playIntroMotif(){

  if(
    !sigapSoundOn ||
    !sigapAudioCtx
  ){

    return;

  }


  const time=
    sigapAudioCtx.currentTime
    +.04;


  const notes=[

    392,

    493.88,

    587.33,

    493.88,

    440,

    523.25,

    659.25,

    587.33

  ];


  notes.forEach(
    (freq,index)=>

      introTone(

        freq,

        time+index*.27,

        .30,

        index%4===0
        ? .042
        : .028,

        'sine'

      )

  );


  [
    196,
    220,
    261.63,
    293.66
  ]
  .forEach(
    (freq,index)=>

      introTone(

        freq,

        time+index*.54,

        .48,

        .012,

        'triangle'

      )

  );

}


// =====================================================
// START INTRO SOUND
// =====================================================

async function ensureIntroSound(){

  if(!sigapAudioCtx){

    sigapAudioCtx=
      new (
        window.AudioContext
        ||
        window.webkitAudioContext
      )();

  }


  if(
    sigapAudioCtx.state
    ===
    'suspended'
  ){

    await sigapAudioCtx
    .resume();

  }


  sigapSoundOn=true;


  const btn=
    document.getElementById(
      'audioToggle'
    );


  if(btn){

    btn.textContent='🔊';

  }


  clearInterval(
    sigapIntroLoop
  );


  playIntroMotif();


  sigapIntroLoop=
    setInterval(

      playIntroMotif,

      2350

    );

}


// =====================================================
// STOP INTRO SOUND
// =====================================================

function stopIntroSound(){

  sigapSoundOn=false;


  clearInterval(
    sigapIntroLoop
  );


  sigapIntroLoop=null;


  const btn=
    document.getElementById(
      'audioToggle'
    );


  if(btn){

    btn.textContent='🔇';

  }

}


// =====================================================
// AUDIO EVENTS
// =====================================================

document
.getElementById('audioToggle')
?.addEventListener(
  'click',
  async()=>{

    if(sigapSoundOn){

      stopIntroSound();

    }

    else{

      await ensureIntroSound();

    }

  }
);


document
.getElementById('enterOnboarding')
?.addEventListener(
  'click',
  ensureIntroSound
);


document
.getElementById('skipOnboarding')
?.addEventListener(
  'click',
  stopIntroSound
);


document
.getElementById('nextOnboarding')
?.addEventListener(
  'click',
  ()=>{

    const slides=[
      ...document.querySelectorAll(
        '.onboard-slide'
      )
    ];


    const active=
      slides.findIndex(
        slide=>
          slide.classList.contains(
            'active'
          )
      );


    if(
      active===
      slides.length-1
    ){

      setTimeout(
        stopIntroSound,
        120
      );

    }

  }
);


// =====================================================
// SIGAP READY
// =====================================================

console.log(
  'SIGAP WebGIS v13.6.6 — GitHub Pages Ready'
);
