const DEFAULT_APPS=[
{name:"YouTube",url:"https://www.youtube.com",icon:"▶️",logo:"https://cdn.simpleicons.org/youtube/ff0000"},
{name:"Discord",url:"https://discord.com/app",icon:"💬",logo:"https://cdn.simpleicons.org/discord/5865f2"},
{name:"Roblox",url:"https://www.roblox.com",icon:"🎮",logo:"https://cdn.simpleicons.org/roblox/ffffff"},
{name:"GitHub",url:"https://github.com",icon:"🐙",logo:"https://cdn.simpleicons.org/github/ffffff"},
{name:"Google Drive",url:"https://drive.google.com",icon:"📁",logo:"https://cdn.simpleicons.org/googledrive/4285f4"},
{name:"Gmail",url:"https://mail.google.com",icon:"✉️",logo:"https://cdn.simpleicons.org/gmail/ea4335"},
{name:"ChatGPT",url:"https://chatgpt.com",icon:"✦",logo:"https://cdn.simpleicons.org/openai/ffffff"},
{name:"Reddit",url:"https://www.reddit.com",icon:"👽",logo:"https://cdn.simpleicons.org/reddit/ff4500"}];

const state={
 apps:JSON.parse(localStorage.getItem("k_apps")||"null")||DEFAULT_APPS,
 notes:localStorage.getItem("k_notes")||"",
 seasonMode:localStorage.getItem("k_season")||"auto",
 searchEngine:localStorage.getItem("k_search")||"google",
 weatherCity:localStorage.getItem("k_weather")||"",
 backgroundMode:localStorage.getItem("k_bgmode")||"dark",
 backgroundUrl:localStorage.getItem("k_bgurl")||"",
 googleClientId:localStorage.getItem("k_google_client")||"",
 dropboxAppKey:localStorage.getItem("k_dropbox_key")||"",
 profile:JSON.parse(localStorage.getItem("k_profile")||"null"),
 playlist:JSON.parse(localStorage.getItem("k_playlist")||"[]"),
 backgroundFile:null,
 currentSong:null
};

const $=id=>document.getElementById(id);

function save(){
  localStorage.setItem("k_apps",JSON.stringify(state.apps));
  localStorage.setItem("k_notes",state.notes);
  localStorage.setItem("k_season",state.seasonMode);
  localStorage.setItem("k_search",state.searchEngine);
  localStorage.setItem("k_weather",state.weatherCity);
  localStorage.setItem("k_bgmode",state.backgroundMode);
  localStorage.setItem("k_bgurl",state.backgroundUrl);
  localStorage.setItem("k_google_client",state.googleClientId);
  localStorage.setItem("k_dropbox_key",state.dropboxAppKey);
  localStorage.setItem("k_profile",JSON.stringify(state.profile));
  localStorage.setItem("k_playlist",JSON.stringify(state.playlist));
}

function season(d=new Date()){
  let y=d.getFullYear(),a=new Date(y,2,20),b=new Date(y,5,20),c=new Date(y,8,22),e=new Date(y,11,21);
  if(d>=a&&d<b)return"spring";
  if(d>=b&&d<c)return"summer";
  if(d>=c&&d<e)return"autumn";
  return"winter";
}

function applyTheme(){
  document.body.dataset.season=state.seasonMode==="auto"?season():state.seasonMode;
  document.body.classList.toggle("light",state.backgroundMode==="light");
  $("seasonLabel").textContent=(state.seasonMode==="auto"?season() : state.seasonMode)+" mode";
  $("footerSeason").textContent=state.seasonMode==="auto"?"Auto seasonal theme":"Manual "+state.seasonMode+" theme";
  applyCustomBackground();
}

function applyCustomBackground(){
  let img=$("backgroundImage"),vid=$("backgroundVideo");
  img.style.display="none";
  vid.style.display="none";
  
  if(state.backgroundMode==="custom"){
    if(state.backgroundFile){
      // Blob is already set from IndexedDB load
      if(state.backgroundFile.type.startsWith("video/")){
        vid.src=URL.createObjectURL(state.backgroundFile);
        vid.style.display="block";
        vid.play().catch(()=>{});
      }else{
        img.src=URL.createObjectURL(state.backgroundFile);
        img.style.display="block";
      }
    }else if(state.backgroundUrl){
      if(/\.(mp4|webm|ogg)(\?|$)/i.test(state.backgroundUrl)){
        vid.src=state.backgroundUrl;
        vid.style.display="block";
        vid.play().catch(()=>{});
      }else{
        img.src=state.backgroundUrl;
        img.style.display="block";
      }
    }
  }
}

function clock(){
  let d=new Date();
  $("clock").textContent=d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  $("date").textContent=d.toLocaleDateString([],{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  let h=d.getHours();
  $("greeting").textContent=h<12?"Good morning":h<18?"Good afternoon":"Good evening";
  if(state.seasonMode==="auto")applyTheme();
}

function esc(x){return String(x).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}

function renderApps(){
  let g=$("appsGrid");
  g.innerHTML="";
  state.apps.forEach((a,i)=>{
    let el=document.createElement("div");
    el.className="app";
    el.draggable=true;
    el.dataset.i=i;
    el.innerHTML=`<button class="remove-app">×</button>${a.logo?`<img class="app-logo" src="${esc(a.logo)}" onerror="this.outerHTML='<div class=app-icon>${esc(a.icon||"🌐")}</div>'"`:`<div class="app-icon">${esc(a.icon||"🌐")}</div>`}<div class="app-name">${esc(a.name)}</div>`;
    el.onclick=e=>{if(!e.target.closest(".remove-app"))location.href=a.url};
    el.querySelector(".remove-app").onclick=e=>{e.stopPropagation();state.apps.splice(i,1);save();renderApps()};
    el.addEventListener("dragstart",()=>el.classList.add("dragging"));
    el.addEventListener("dragend",()=>{el.classList.remove("dragging");syncOrder()});
    el.addEventListener("dragover",e=>{e.preventDefault();let d=g.querySelector(".dragging");if(d&&d!==el){Number(d.dataset.i)<Number(el.dataset.i)?el.after(d):el.before(d)}});
    g.appendChild(el);
  });
}

function syncOrder(){
  let order=[...$("appsGrid").children].map(x=>+x.dataset.i),old=[...state.apps];
  state.apps=order.map(i=>old[i]);
  save();
  renderApps();
}

function search(e){
  e.preventDefault();
  let q=$("searchInput").value.trim();
  if(!q)return;
  let enc=encodeURIComponent(q),u=/^https?:\/\//i.test(q)?q:/^[\w-]+\.[\w.-]+/.test(q)&&!q.includes(" ")?"https://"+q:state.searchEngine==="bing"?`https://www.bing.com/search?q=${enc}`:state.searchEngine==="duckduckgo"?`https://duckduckgo.com/?q=${enc}`:`https://www.google.com/search?q=${enc}`;
  location.href=u;
}

function nav(panel){
  document.querySelectorAll(".panel-view").forEach(x=>x.classList.add("hidden"));
  $(panel+"Panel").classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x.data-panel===panel));
  if(panel==="music")renderPlaylist();
  if(panel==="settings")loadSettings();
  if(panel==="backgrounds")loadBackgroundSettings();
}

function loadSettings(){
  $("googleClientId").value=state.googleClientId;
  $("dropboxAppKey").value=state.dropboxAppKey;
  $("searchEngine").value=state.searchEngine;
  $("weatherCity").value=state.weatherCity;
}

function loadBackgroundSettings(){
  $("seasonSelect").value=state.seasonMode;
}

function profileRender(){
  if(state.profile){
    $("profileName").textContent=state.profile.name||"Google User";
    $("profileEmail").textContent=state.profile.email||"";
    $("profileAvatar").innerHTML=state.profile.picture?`<img src="${esc(state.profile.picture)}">`:"G";
  }else{
    $("profileName").textContent="Guest";
    $("profileEmail").textContent="Connect Google";
    $("profileAvatar").textContent="K";
  }
}

function loadWeather(){
  if(!state.weatherCity){
    $("weatherText").textContent="Add your location in settings";
    return;
  }
  fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(state.weatherCity)}&count=1&language=en&format=json`)
    .then(r=>r.json())
    .then(g=>{
      if(!g.results?.length)throw 0;
      let p=g.results[0];
      return fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`)
        .then(r=>r.json())
        .then(w=>{
          let c=w.current.weather_code;
          $("weatherTemp").textContent=Math.round(w.current.temperature_2m)+"°F";
          $("weatherIcon").textContent=c===0?"☀️":c<4?"🌤️":c<70?"🌧️":"❄️";
          $("weatherText").textContent=c===0?"Clear sky":c<4?"Partly cloudy":c<70?"Rain":"Snow";
          $("weatherLocation").textContent=p.name+", "+p.country;
        });
    })
    .catch(()=>{$("weatherText").textContent="Weather unavailable"});
}

// IndexedDB functions
async function db(){
  return new Promise((res,rej)=>{
    let r=indexedDB.open("kmoon_media",1);
    r.onupgradeneeded=()=>r.result.createObjectStore("media",{keyPath:"id"});
    r.onsuccess=()=>res(r.result);
    r.onerror=()=>rej(r.error);
  });
}

async function putMedia(id,blob,name,type){
  let d=await db();
  return new Promise((res,rej)=>{
    let t=d.transaction("media","readwrite");
    t.objectStore("media").put({id,blob,name,type});
    t.oncomplete=res;
    t.onerror=()=>rej(t.error);
  });
}

async function getMedia(id){
  let d=await db();
  return new Promise((res,rej)=>{
    let r=d.transaction("media").objectStore("media").get(id);
    r.onsuccess=()=>res(r.result);
    r.onerror=()=>rej(r.error);
  });
}

async function deleteMedia(id){
  let d=await db();
  return new Promise((res,rej)=>{
    let t=d.transaction("media","readwrite");
    t.objectStore("media").delete(id);
    t.oncomplete=res;
    t.onerror=()=>rej(t.error);
  });
}

// Load background file from IndexedDB on startup
async function loadBackgroundFile(){
  try{
    let media=await getMedia("background");
    if(media&&media.blob){
      state.backgroundFile=media.blob;
      state.backgroundMode="custom";
      applyCustomBackground();
    }
  }catch(e){
    console.log("No background file in storage");
  }
}

async function setBackgroundFile(file){
  let id="background";
  await putMedia(id,file,file.name,file.type);
  state.backgroundMode="custom";
  state.backgroundUrl="";
  state.backgroundFile=file;
  save();
  applyTheme();
}

async function addMusic(file){
  let id=crypto.randomUUID();
  await putMedia(id,file,file.name,file.type);
  state.playlist.push({id,name:file.name,type:"file"});
  save();
  renderPlaylist();
}

function renderPlaylist(){
  let box=$("playlistItems");
  $("playlistCount").textContent=state.playlist.length+" song"+(state.playlist.length===1?"":"s");
  box.innerHTML=state.playlist.length?"":"<div class=empty-state>No songs yet.</div>";
  state.playlist.forEach((s,i)=>{
    let d=document.createElement("div");
    d.className="playlist-item";
    d.innerHTML=`♫ ${esc(s.name)}<button>▶</button>`;
    d.querySelector("button").onclick=()=>playSong(i);
    box.appendChild(d);
  });
}

async function playSong(i){
  if(!state.playlist[i])return;
  let s=state.playlist[i];
  $("nowPlaying").textContent=s.name;
  $("nowPlayingSource").textContent=s.type==="url"?"URL":"Local file";
  let src=s.type==="url"?s.url:URL.createObjectURL((await getMedia(s.id)).blob);
  $("audioPlayer").src=src;
  state.currentSong=i;
  $("audioPlayer").play().catch(()=>{});
}

function nextSong(){
  if(!state.playlist.length)return;
  state.currentSong=((state.currentSong??-1)+1)%state.playlist.length;
  playSong(state.currentSong);
}

function prevSong(){
  if(!state.playlist.length)return;
  state.currentSong=((state.currentSong??0)-1+state.playlist.length)%state.playlist.length;
  playSong(state.currentSong);
}

// Google OAuth Handler
function initGoogleSignIn(){
  if(!state.googleClientId){
    alert("Add your Google OAuth Client ID in Settings first.\n\nGet it from: https://console.cloud.google.com/\n1. Create project\n2. Enable Google+ API\n3. Create OAuth 2.0 Web Client\n4. Add authorized redirect URI");
    return;
  }
  
  // Initialize Google Sign-In
  google.accounts.id.initialize({
    client_id:state.googleClientId,
    callback:handleGoogleSignIn
  });
  
  google.accounts.id.renderButton($("googleSignInButton"),{
    theme:"filled_blue",
    size:"large",
    text:"signin_with"
  });
}

function handleGoogleSignIn(response){
  if(response.credential){
    try{
      let payload=JSON.parse(atob(response.credential.split('.')[1]));
      state.profile={
        name:payload.name||payload.email,
        email:payload.email,
        picture:payload.picture
      };
      save();
      profileRender();
      alert("Signed in as "+state.profile.email);
    }catch(e){
      console.error("Error parsing JWT",e);
    }
  }
}

// Event listeners
document.querySelectorAll(".nav-item").forEach(x=>x.onclick=()=>nav(x.dataset.panel));

$("collapseSidebar").onclick=()=>{
  $("sidebar").classList.toggle("collapsed");
  $("collapseSidebar").textContent=$("sidebar").classList.contains("collapsed")?"›":"‹";
};

$("mobileMenu").onclick=()=>$("sidebar").classList.toggle("mobile-open");
$("settingsButton").onclick=()=>nav("settings");
$("themeButton").onclick=()=>nav("backgrounds");
$("searchForm").onsubmit=search;
$("addAppButton").onclick=()=>document.getElementById("appModal").classList.add("open");

document.querySelectorAll("[data-close]").forEach(x=>x.onclick=()=>$(x.dataset.close).classList.remove("open"));

$("saveApp").onclick=()=>{
  let n=$("appName").value.trim(),u=$("appUrl").value.trim();
  if(!n||!u)return alert("Enter a name and URL.");
  if(!/^https?:\/\//i.test(u))u="https://"+u;
  state.apps.push({name:n,url:u,icon:$("appIcon").value.trim()||"🌐",logo:$("appLogo").value.trim()});
  save();
  renderApps();
  $("appModal").classList.remove("open");
};

$("notes").value=state.notes;
$("notes").oninput=()=>{
  state.notes=$("notes").value;
  localStorage.setItem("k_notes",state.notes);
};

$("saveSettings").onclick=()=>{
  state.googleClientId=$("googleClientId").value.trim();
  state.dropboxAppKey=$("dropboxAppKey").value.trim();
  state.searchEngine=$("searchEngine").value;
  state.weatherCity=$("weatherCity").value.trim();
  save();
  loadWeather();
  alert("Settings saved.");
};

$("googleSignIn").onclick=initGoogleSignIn;

$("googleSignOut").onclick=()=>{
  state.profile=null;
  save();
  profileRender();
  alert("Signed out.");
};

$("dropboxConnectSettings").onclick=()=>{
  state.dropboxAppKey=$("dropboxAppKey").value.trim();
  save();
  alert("Dropbox App Key saved. Use the Connect button in My Files to begin OAuth.");
};

$("driveButton").onclick=()=>alert("Google Drive requires OAuth authorization and a Google Cloud project/client ID. Add it in Settings, then connect.");
$("dropboxButton").onclick=()=>alert("Dropbox requires an OAuth app key. Add it in Settings, then connect.");
$("refreshFiles").onclick=()=>alert("Connect a cloud provider to populate this list.");

$("backgroundFile").onchange=e=>{
  if(e.target.files[0])setBackgroundFile(e.target.files[0]);
};

$("backgroundVideoFile").onchange=e=>{
  if(e.target.files[0])setBackgroundFile(e.target.files[0]);
};

$("applyBackgroundUrl").onclick=()=>{
  let u=$("backgroundUrl").value.trim();
  if(!u)return;
  state.backgroundMode="custom";
  state.backgroundUrl=u;
  state.backgroundFile=null;
  save();
  applyTheme();
};

$("clearBackground").onclick=async()=>{
  state.backgroundMode="dark";
  state.backgroundUrl="";
  state.backgroundFile=null;
  await deleteMedia("background");
  save();
  applyTheme();
};

document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{
  state.backgroundMode=b.dataset.mode;
  state.backgroundFile=null;
  save();
  applyTheme();
});

$("seasonSelect").onchange=()=>{
  state.seasonMode=$("seasonSelect").value;
  save();
  applyTheme();
};

$("musicFile").onchange=async e=>{
  for(const f of e.target.files)await addMusic(f);
  e.target.value="";
};

$("addMusicUrl").onclick=()=>{
  let u=$("musicUrl").value.trim();
  if(!u)return;
  state.playlist.push({id:crypto.randomUUID(),name:u.split("/").pop()||"Online track",type:"url",url:u});
  save();
  $("musicUrl").value="";
  renderPlaylist();
};

$("playSong").onclick=()=>{
  if(state.currentSong==null)playSong(0);
  else $("audioPlayer").paused?$("audioPlayer").play():$("audioPlayer").pause();
};

$("nextSong").onclick=nextSong;
$("prevSong").onclick=prevSong;
$("audioPlayer").onended=nextSong;

$("clearPlaylist").onclick=()=>{
  state.playlist=[];
  save();
  renderPlaylist();
};

$("resetButton").onclick=()=>{
  if(confirm("Reset all Kmoon Start Page settings and local data?")){
    localStorage.clear();
    indexedDB.deleteDatabase("kmoon_media");
    location.reload();
  }
};

// Initialization sequence
async function initialize(){
  renderApps();
  profileRender();
  applyTheme();
  await loadBackgroundFile();
  clock();
  loadWeather();
  
  // Initialize Google Sign-In if script is loaded
  if(typeof google !== 'undefined'){
    initGoogleSignIn();
  }
  
  setInterval(clock,1000);
  setInterval(loadWeather,1800000);
}

// Start when DOM is ready
if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",initialize);
}else{
  initialize();
}
