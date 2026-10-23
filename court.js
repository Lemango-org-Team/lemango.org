const App = (() => {
  let activeView = "home";
  const logoUrl = "assets/nuca-logo.png";

  const els = {
    main: () => document.getElementById("main-content"),
    modal: () => document.getElementById("modal"),
    modalContent: () => document.getElementById("modal-content"),
    headerInfo: () => document.getElementById("header-info-box"),
    mobileMenu: () => document.getElementById("mobile-menu"),
    mobileOpen: () => document.getElementById("mobile-menu-open"),
    mobileClose: () => document.getElementById("mobile-menu-close"),
    search: () => document.getElementById("global-search"),
    searchResults: () => document.getElementById("search-results"),
  };

  function escapeHtml(str) {
    return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  function openModal(html) { els.modalContent().innerHTML = html; els.modal().classList.remove("hidden"); }
  function closeModal() { els.modal().classList.add("hidden"); }
  function toggleHeaderInfo() { els.headerInfo().classList.toggle("hidden"); }

  function toggleMobileMenu(show) {
    const menu = els.mobileMenu(), openBtn = els.mobileOpen(), closeBtn = els.mobileClose();
    menu.style.transform = show ? "translateX(0)" : "translateX(100%)";
    menu.setAttribute("aria-hidden", show ? "false" : "true");
    openBtn?.setAttribute("aria-expanded", show ? "true" : "false");
    if (show) closeBtn?.focus(); else openBtn?.focus();
  }

  function login() {
    document.getElementById("login-screen").style.display = "none";
  }

  const pages = [
    { name: "Manage Cases", view: "cases" },
    { name: "Document Builder", view: "documents" },
    { name: "Court Notices", view: "notices" },
    { name: "File Action", view: "filing" },
    { name: "Search Records", view: "search" },
    { name: "Contact NUCA", view: "contact" },
  ];

  function fuzzySearch(q) {
    const query = String(q || "").trim().toLowerCase();
    if (!query) return [];
    return pages.filter(p => p.name.toLowerCase().includes(query));
  }

  function renderSearchResults(query) {
    const host = els.searchResults();
    if (!host) return;
    const q = query.trim();
    if (!q) { host.classList.add("hidden"); host.innerHTML = ""; return; }
    const results = fuzzySearch(q).slice(0, 6);
    if (!results.length) { host.classList.remove("hidden"); host.innerHTML = `<div class="px-4 py-3 text-xs text-gray-500">No results found.</div>`; return; }
    host.classList.remove("hidden");
    host.innerHTML = results.map(r => `<button class="search-result w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors" data-view="${r.view}"><div class="text-[10px] uppercase tracking-widest font-black text-blue-700">Page</div><div class="font-bold text-sm text-gray-800">${escapeHtml(r.name)}</div></button>`).join("");
    host.querySelectorAll(".search-result").forEach(btn => btn.addEventListener("click", () => { navigate(btn.dataset.view); host.classList.add("hidden"); }));
  }

  function initGlobalSearch() {
    const input = els.search(), host = els.searchResults();
    if (!input || !host) return;
    input.addEventListener("input", () => renderSearchResults(input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { host.classList.add("hidden"); input.blur(); }
      if (e.key === "Enter") { const first = host.querySelector(".search-result"); if (first) { e.preventDefault(); navigate(first.dataset.view); host.classList.add("hidden"); } }
    });
    document.addEventListener("click", (e) => { if (!(e.target === input || host.contains(e.target) || e.target.closest("#search-shell"))) host.classList.add("hidden"); });
  }

  function getAdminAnnouncements() {
    try { const r = localStorage.getItem('lemangoes.admin.gov.announcements'); return r ? JSON.parse(r) : []; } catch { return []; }
  }

  let casesCache = [];

  async function apiRequest(path, options) {
    const res = await fetch('/api/court' + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  function getCases() { return casesCache; }

  async function loadCases() {
    const data = await apiRequest('/cases');
    casesCache = Array.isArray(data.cases) ? data.cases : [];
    return casesCache;
  }

  async function saveCase(caseData) {
    const data = await apiRequest('/cases', {
      method: 'POST',
      body: JSON.stringify({
        title: caseData.title,
        type: caseData.type,
        plaintiff: caseData.plaintiff,
        defendant: caseData.defendant,
        courtDate: caseData.courtDate,
        courtTime: caseData.courtTime,
        courtroom: caseData.courtroom,
        judge: caseData.judge,
        description: caseData.description,
        status: 'pending'
      }),
    });
    return data.case;
  }

  async function updateCaseStatus(caseId, newStatus) {
    try {
      await apiRequest('/cases/' + encodeURIComponent(caseId), {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
    } catch {}
    await navigate('cases');
  }

  async function deleteCase(caseId) {
    if (!confirm('Are you sure you want to delete this case?')) return;
    try {
      await apiRequest('/cases/' + encodeURIComponent(caseId), { method: 'DELETE' });
    } catch {}
    await navigate('cases');
  }

  let jitsiApi = null;

  function startVideoCourt(caseId, caseTitle) {
    // Show video container and hide other elements
    document.getElementById('cases-list').classList.add('hidden');
    document.getElementById('create-case-form').classList.add('hidden');
    document.getElementById('video-court-container').classList.remove('hidden');
    
    const roomId = `nuca-court-${caseId}`;
    const domain = 'meet.jit.si';
    
    const options = {
      roomName: roomId,
      width: '100%',
      height: '100%',
      parentNode: document.querySelector('#jitsi-container'),
      userInfo: {
        displayName: 'Court Participant'
      },
      configOverwrite: {
        startWithAudioMuted: true,
        startWithVideoMuted: true,
        prejoinPageEnabled: false,
        enableWelcomePage: false,
      },
      interfaceConfigOverwrite: {
        DEFAULT_BACKGROUND: '#1e293b',
        DEFAULT_LOCAL_DISPLAY_NAME: 'You',
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        DEFAULT_LOGO_URL: 'assets/nuca-logo.png',
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
          'fodeviceselection', 'hangup', 'profile', 'chat', 'recording',
          'livestreaming', 'etherpad', 'sharedvideo', 'settings', 'raisehand',
          'videoquality', 'filmstrip', 'invite', 'feedback', 'stats', 'shortcuts',
          'tileview', 'videobackgroundblur', 'download', 'help', 'mute-everyone', 'security'
        ]
      }
    };
    
    jitsiApi = new JitsiMeetExternalAPI(domain, options);
    
    jitsiApi.addEventListeners({
      readyToClose: () => {
        endVideoCourt();
      },
      participantLeft: (event) => {
        console.log('Participant left:', event);
      },
      participantJoined: (event) => {
        console.log('Participant joined:', event);
      },
      videoConferenceJoined: () => {
        console.log('Video conference joined');
        // Create court session record
        createCourtSession(caseId, roomId);
      },
      videoConferenceLeft: () => {
        console.log('Video conference left');
        endVideoCourt();
      }
    });
  }

  function createCourtSession(caseId, roomId) {
    apiRequest('/sessions', {
      method: 'POST',
      body: JSON.stringify({ caseId, roomId })
    }).catch(() => {});
  }

  function endVideoCourt() {
    if (jitsiApi) {
      jitsiApi.dispose();
      jitsiApi = null;
    }
    navigate('cases');
  }

  // ── HOME ──────────────────────────────────────────────────────────────────
  function getHomeHtml() {
    const adminItems = getAdminAnnouncements();
    const builtInNews = [
      { title: "New electronic notice delivery system now operational", date: "Jul 10, 2026", type: "System", content: "All court notices can now be delivered electronically to registered parties." },
      { title: "NUCA filing deadline extension for Q3 2026", date: "Jul 5, 2026", type: "Notice", content: "Filing deadline extended by 14 days due to system maintenance." },
      { title: "Updated lawful action procedures effective immediately", date: "Jun 28, 2026", type: "Policy", content: "New procedures streamline the submission and processing of lawful actions." },
      { title: "Court notice portal maintenance scheduled", date: "Jun 20, 2026", type: "Maintenance", content: "Scheduled downtime: July 15, 2026, 2:00 AM - 4:00 AM EST." },
    ];
    const adminNews = adminItems.slice(0, 2).map(i => ({ title: i.title, date: new Date(i.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}), type: i.type, content: i.content }));
    const allNews = [...adminNews, ...builtInNews].slice(0, 5);
    const newsRows = allNews.map(item => `
      <div class="p-4 flex gap-4 items-start hover:bg-gray-50 transition-colors">
        <span class="shrink-0 mt-0.5 inline-block bg-blue-50 text-blue-800 text-[9px] font-black uppercase tracking-widest px-2 py-1 whitespace-nowrap">${escapeHtml(item.type)}</span>
        <div class="flex-1 min-w-0">
          <div class="font-bold text-sm text-gray-900 leading-snug">${escapeHtml(item.title)}</div>
          <div class="text-xs text-gray-500 mt-0.5">${escapeHtml(item.content)}</div>
        </div>
        <div class="text-[10px] text-gray-400 font-bold shrink-0 whitespace-nowrap">${escapeHtml(item.date)}</div>
      </div>`).join('');

    return `
    <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);" class="text-white border-b-4 border-yellow-600 animate-slide">
      <div class="max-w-7xl mx-auto px-4 py-14 md:py-16 flex flex-col md:flex-row md:items-center gap-10">
        <div class="flex-1">
          <div class="flex items-center gap-3 mb-4">
            <img src="${logoUrl}" class="w-10 h-10 object-contain" alt="NUCA Logo" onerror="this.style.display='none'">
            <span class="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-500">National Universal Court (for) All</span>
          </div>
          <h2 class="text-3xl md:text-4xl font-black leading-tight mb-3">NUCA<br><span class="text-yellow-500">Notice Management System</span></h2>
          <p class="text-gray-300 text-sm leading-relaxed max-w-xl mb-7">Centralized court and lawful action notice management for the Lemangoes Government. Ensuring transparent legal proceedings and accessible justice for all citizens.</p>
          <div class="flex flex-wrap gap-3">
            <button onclick="App.navigate('filing')" style="background:#ca8a04;color:#111827;" class="px-6 py-2.5 font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all">File an Action</button>
            <button onclick="App.navigate('notices')" class="bg-gray-700 border border-gray-600 px-6 py-2.5 font-black text-xs uppercase tracking-widest hover:bg-gray-600 transition-all">View Notices</button>
            <button onclick="App.navigate('search')" class="bg-gray-700 border border-gray-600 px-6 py-2.5 font-black text-xs uppercase tracking-widest hover:bg-gray-600 transition-all">Search Records</button>
          </div>
        </div>
        <div class="hidden md:grid grid-cols-2 gap-3 shrink-0 w-64">
          <div style="background:rgba(30,41,59,0.8);border:1px solid rgba(71,85,105,0.5);" class="p-4 text-center"><div class="text-2xl font-black text-yellow-500">24/7</div><div class="text-[9px] uppercase tracking-widest text-gray-400 mt-1">Notice Delivery</div></div>
          <div style="background:rgba(30,41,59,0.8);border:1px solid rgba(71,85,105,0.5);" class="p-4 text-center"><div class="text-2xl font-black text-yellow-500">Digital</div><div class="text-[9px] uppercase tracking-widest text-gray-400 mt-1">Filing System</div></div>
          <div style="background:rgba(30,41,59,0.8);border:1px solid rgba(71,85,105,0.5);" class="p-4 text-center"><div class="text-2xl font-black text-yellow-500">Secure</div><div class="text-[9px] uppercase tracking-widest text-gray-400 mt-1">Document Storage</div></div>
          <div style="background:rgba(30,41,59,0.8);border:1px solid rgba(71,85,105,0.5);" class="p-4 text-center"><div class="text-2xl font-black text-green-500">Active</div><div class="text-[9px] uppercase tracking-widest text-gray-400 mt-1">Tracking</div></div>
        </div>
      </div>
    </div>

    <div class="bg-gray-900">
      <div class="max-w-7xl mx-auto px-4 py-10">
        <div class="grid lg:grid-cols-3 gap-8">
          <div class="lg:col-span-2 space-y-8">
            <section>
              <h3 class="text-xs font-black uppercase tracking-[0.25em] text-gray-200 border-b-2 border-gray-700 pb-2 mb-4" style="border-color:#475569;color:#e5e7eb;">Top Services</h3>
              <div class="grid sm:grid-cols-3 gap-4">
                <button onclick="App.navigate('notices')" class="bg-gray-800 border border-gray-700 p-5 text-left group hover:border-yellow-600 transition-colors gov-shadow">
                  <div class="text-2xl mb-3">📋</div>
                  <div class="font-black text-sm mb-1" style="color:#e5e7eb;">Court Notices</div>
                  <div class="text-xs text-gray-400 mb-3">View and manage court notices and legal documents</div>
                  <div class="text-yellow-500 text-xs font-black group-hover:pl-1 transition-all">View →</div>
                </button>
                <button onclick="App.navigate('filing')" class="bg-gray-800 border border-gray-700 p-5 text-left group hover:border-yellow-600 transition-colors gov-shadow">
                  <div class="text-2xl mb-3">📝</div>
                  <div class="font-black text-sm mb-1" style="color:#e5e7eb;">File Action</div>
                  <div class="text-xs text-gray-400 mb-3">Submit lawful actions and court filings online</div>
                  <div class="text-yellow-500 text-xs font-black group-hover:pl-1 transition-all">File →</div>
                </button>
                <button onclick="App.navigate('search')" class="bg-gray-800 border border-gray-700 p-5 text-left group hover:border-yellow-600 transition-colors gov-shadow">
                  <div class="text-2xl mb-3">🔍</div>
                  <div class="font-black text-sm mb-1" style="color:#e5e7eb;">Search Records</div>
                  <div class="text-xs text-gray-400 mb-3">Search case records and notice history</div>
                  <div class="text-yellow-500 text-xs font-black group-hover:pl-1 transition-all">Search →</div>
                </button>
              </div>
            </section>
            <section>
              <div class="flex justify-between items-center border-b-2 pb-2 mb-0" style="border-color:#475569;">
                <h3 class="text-xs font-black uppercase tracking-[0.25em]" style="color:#e5e7eb;">System Notices</h3>
                <button onclick="App.navigate('notices')" class="text-[10px] font-black uppercase tracking-widest text-yellow-500 hover:underline">All Notices →</button>
              </div>
              <div class="divide-y divide-gray-700 bg-gray-800 border border-t-0 border-gray-700 gov-shadow">${newsRows}</div>
            </section>
            <section style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);" class="text-white p-8 border-l-4 border-yellow-600">
              <div class="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-500 mb-2">Featured Service</div>
              <h3 class="text-xl font-black mb-2">Electronic Notice Delivery</h3>
              <p class="text-gray-300 text-sm leading-relaxed mb-5 max-w-xl">Receive court notices and lawful action documents instantly through our secure electronic delivery system. Reduce paper waste and ensure timely receipt of all legal communications.</p>
              <div class="flex flex-wrap gap-3 text-xs font-black uppercase tracking-widest">
                <button onclick="App.navigate('notices')" style="background:#ca8a04;color:#111827;" class="px-6 py-2.5 hover:opacity-90 transition">View Notices</button>
                <button onclick="App.navigate('contact')" class="border border-gray-600 text-white px-6 py-2.5 hover:bg-gray-700 transition">Learn More</button>
              </div>
            </section>
          </div>
          <aside class="space-y-5">
            <div class="bg-gray-800 border border-gray-700 gov-shadow">
              <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);" class="px-5 py-3"><h4 class="text-[10px] font-black uppercase tracking-[0.25em] text-white">Quick Links</h4></div>
              <ul class="divide-y divide-gray-700">
                ${[["Court Notices","notices"],["File an Action","filing"],["Search Records","search"],["Contact NUCA","contact"],["System Status","contact"]].map(([l,v]) => `<li><button onclick="App.navigate('${v}')" class="w-full text-left px-5 py-3 text-sm font-bold text-yellow-500 hover:bg-gray-700 hover:text-yellow-400 transition-colors flex justify-between items-center group"><span>${l}</span><span class="text-gray-500 group-hover:text-gray-300">›</span></button></li>`).join('')}
              </ul>
            </div>
            <div class="bg-gray-800 border border-gray-700 p-5 gov-shadow">
              <h4 class="text-[10px] font-black uppercase tracking-[0.25em] mb-4 border-b border-gray-700 pb-2" style="color:#e5e7eb;">Contact NUCA</h4>
              <div class="space-y-3 text-sm">
                <div><div class="font-black text-xs uppercase tracking-widest text-gray-500 mb-0.5">Phone</div><div class="text-gray-300">1-800-555-NUCA</div></div>
                <div><div class="font-black text-xs uppercase tracking-widest text-gray-500 mb-0.5">Email</div><div class="text-gray-300">notices@nuca.gov.lm</div></div>
                <div><div class="font-black text-xs uppercase tracking-widest text-gray-500 mb-0.5">Hours</div><div class="text-gray-300">Mon–Fri, 8:00 AM – 5:00 PM</div></div>
              </div>
              <button onclick="App.navigate('contact')" class="mt-4 w-full text-white py-2.5 text-xs font-black uppercase tracking-widest hover:opacity-90 transition-all" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1px solid #475569;">Contact NUCA</button>
            </div>
            <div class="bg-gray-800 border border-gray-700 p-5 gov-shadow">
              <h4 class="text-[10px] font-black uppercase tracking-[0.25em] mb-4 border-b border-gray-700 pb-2" style="color:#e5e7eb;">System Status</h4>
              <div class="space-y-2.5">
                ${[["Notice Delivery System"],["Filing Portal"],["Record Search"],["Document Archive"]].map(([s]) => `<div class="flex justify-between items-center text-xs"><span class="font-bold text-gray-300">${s}</span><span class="flex items-center gap-1.5 font-black text-green-500"><span class="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>Online</span></div>`).join('')}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>`;
  }

  // ── NOTICES ────────────────────────────────────────────────────────────────
  function getNoticesHtml() {
    return `
    <div class="bg-gray-900 min-h-screen animate-slide">
      <div class="bg-gray-800 border-b border-gray-700">
        <div class="max-w-7xl mx-auto px-4 py-3 text-xs text-gray-400 font-bold">
          <button onclick="App.navigate('home')" class="hover:text-yellow-500 transition-colors">Home</button>
          <span class="mx-2 text-gray-600">›</span><span style="color:#e5e7eb;">Court Notices</span>
        </div>
      </div>
      <div class="max-w-7xl mx-auto px-4 py-10">
        <h2 class="text-3xl font-black uppercase tracking-tighter mb-2" style="color:#e5e7eb;">Court Notices</h2>
        <p class="text-gray-400 text-sm mb-8">View and manage court notices, summonses, and lawful action documents.</p>
        <div class="bg-gray-800 border border-gray-700 p-6 gov-shadow mb-6">
          <div class="flex flex-wrap gap-4 items-center justify-between mb-6">
            <div class="flex gap-2">
              <button class="px-4 py-2 text-xs font-black uppercase tracking-widest bg-yellow-600 text-gray-900">All Notices</button>
              <button class="px-4 py-2 text-xs font-black uppercase tracking-widest bg-gray-700 text-gray-300 hover:bg-gray-600">Summonses</button>
              <button class="px-4 py-2 text-xs font-black uppercase tracking-widest bg-gray-700 text-gray-300 hover:bg-gray-600">Orders</button>
              <button class="px-4 py-2 text-xs font-black uppercase tracking-widest bg-gray-700 text-gray-300 hover:bg-gray-600">Subpoenas</button>
            </div>
            <div class="flex items-center gap-2">
              <input type="text" placeholder="Search notices..." class="bg-gray-700 border border-gray-600 px-3 py-2 text-xs w-48 outline-none focus:border-yellow-500 text-gray-100">
              <button class="px-4 py-2 text-xs font-black uppercase tracking-widest text-white" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1px solid #475569;">Search</button>
            </div>
          </div>
          <div class="divide-y divide-gray-700">
            <div class="p-4 flex gap-4 items-start hover:bg-gray-700 transition-colors">
              <span class="shrink-0 mt-0.5 inline-block bg-red-900 text-red-200 text-[9px] font-black uppercase tracking-widest px-2 py-1 whitespace-nowrap">Summons</span>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm text-gray-100 leading-snug">Case #NUCA-2026-0847 - Civil Division</div>
                <div class="text-xs text-gray-400 mt-0.5">You are hereby summoned to appear before the High Court on July 22, 2026 at 9:30 AM.</div>
              </div>
              <div class="text-[10px] text-gray-500 font-bold shrink-0 whitespace-nowrap">Jul 12, 2026</div>
            </div>
            <div class="p-4 flex gap-4 items-start hover:bg-gray-700 transition-colors">
              <span class="shrink-0 mt-0.5 inline-block bg-blue-900 text-blue-200 text-[9px] font-black uppercase tracking-widest px-2 py-1 whitespace-nowrap">Order</span>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm text-gray-100 leading-snug">Case #NUCA-2026-0732 - Property Dispute</div>
                <div class="text-xs text-gray-400 mt-0.5">Court order issued regarding temporary injunction. Effective immediately.</div>
              </div>
              <div class="text-[10px] text-gray-500 font-bold shrink-0 whitespace-nowrap">Jul 10, 2026</div>
            </div>
            <div class="p-4 flex gap-4 items-start hover:bg-gray-700 transition-colors">
              <span class="shrink-0 mt-0.5 inline-block bg-yellow-900 text-yellow-200 text-[9px] font-black uppercase tracking-widest px-2 py-1 whitespace-nowrap">Subpoena</span>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm text-gray-100 leading-snug">Case #NUCA-2026-0691 - Criminal Proceedings</div>
                <div class="text-xs text-gray-400 mt-0.5">Subpoena for document production. Deadline: July 25, 2026.</div>
              </div>
              <div class="text-[10px] text-gray-500 font-bold shrink-0 whitespace-nowrap">Jul 8, 2026</div>
            </div>
            <div class="p-4 flex gap-4 items-start hover:bg-gray-700 transition-colors">
              <span class="shrink-0 mt-0.5 inline-block bg-green-900 text-green-200 text-[9px] font-black uppercase tracking-widest px-2 py-1 whitespace-nowrap">Notice</span>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm text-gray-100 leading-snug">Case #NUCA-2026-0654 - Hearing Scheduled</div>
                <div class="text-xs text-gray-400 mt-0.5">Preliminary hearing scheduled for August 5, 2026 at 10:00 AM in Courtroom 4B.</div>
              </div>
              <div class="text-[10px] text-gray-500 font-bold shrink-0 whitespace-nowrap">Jul 5, 2026</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }

  // ── FILING ─────────────────────────────────────────────────────────────────
  function getFilingHtml() {
    return `
    <div class="bg-gray-900 min-h-screen animate-slide">
      <div class="bg-gray-800 border-b border-gray-700">
        <div class="max-w-7xl mx-auto px-4 py-3 text-xs text-gray-400 font-bold">
          <button onclick="App.navigate('home')" class="hover:text-yellow-500 transition-colors">Home</button>
          <span class="mx-2 text-gray-600">›</span><span style="color:#e5e7eb;">File Action</span>
        </div>
      </div>
      <div class="max-w-7xl mx-auto px-4 py-10">
        <h2 class="text-3xl font-black uppercase tracking-tighter mb-2" style="color:#e5e7eb;">File a Lawful Action</h2>
        <p class="text-gray-400 text-sm mb-8">Submit court filings, lawful actions, and legal documents through the NUCA portal.</p>
        <div class="grid md:grid-cols-2 gap-8 mb-8">
          <div class="bg-gray-800 border border-gray-700 p-6 gov-shadow space-y-4">
            <h3 class="font-black" style="color:#e5e7eb;">Filing Requirements</h3>
            <ul class="text-sm text-gray-300 space-y-2">
              <li class="flex gap-2"><span class="font-black text-green-500">✓</span>Valid NUCA registration or citizen ID</li>
              <li class="flex gap-2"><span class="font-black text-green-500">✓</span>Complete filing form with accurate information</li>
              <li class="flex gap-2"><span class="font-black text-green-500">✓</span>Supporting documents in PDF format</li>
              <li class="flex gap-2"><span class="font-black text-green-500">✓</span>Filing fee payment or fee waiver request</li>
              <li class="flex gap-2"><span class="font-black text-green-500">✓</span>Electronic signature verification</li>
            </ul>
          </div>
          <div class="bg-gray-800 border border-gray-700 p-6 gov-shadow space-y-4">
            <h3 class="font-black" style="color:#e5e7eb;">Filing Process</h3>
            <ol class="text-sm text-gray-300 space-y-2 list-decimal list-inside">
              <li>Select the appropriate filing type</li>
              <li>Complete the online filing form</li>
              <li>Upload required supporting documents</li>
              <li>Review and submit with electronic signature</li>
              <li>Receive confirmation and case number</li>
            </ol>
            <button onclick="App.navigate('contact')" class="mt-2 text-white px-6 py-2.5 text-xs font-black uppercase tracking-widest hover:opacity-90 transition" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1px solid #475569;">Contact Support</button>
          </div>
        </div>
        <div class="bg-gray-800 border border-gray-700 p-6 gov-shadow mb-6">
          <h3 class="text-xs font-black uppercase tracking-widest border-b-2 pb-2 mb-4" style="color:#e5e7eb;border-color:#475569;">Available Filing Types</h3>
          <div class="grid md:grid-cols-3 gap-4">
            <div class="card-lift border border-gray-700 p-4 hover:border-yellow-600 transition-colors bg-gray-700">
              <div class="font-black text-sm mb-1" style="color:#e5e7eb;">Civil Complaint</div>
              <p class="text-xs text-gray-400">File civil lawsuits, contract disputes, and property claims.</p>
            </div>
            <div class="card-lift border border-gray-700 p-4 hover:border-yellow-600 transition-colors bg-gray-700">
              <div class="font-black text-sm mb-1" style="color:#e5e7eb;">Criminal Complaint</div>
              <p class="text-xs text-gray-400">Submit criminal complaints and report offences to authorities.</p>
            </div>
            <div class="card-lift border border-gray-700 p-4 hover:border-yellow-600 transition-colors bg-gray-700">
              <div class="font-black text-sm mb-1" style="color:#e5e7eb;">Family Law Petition</div>
              <p class="text-xs text-gray-400">File for divorce, custody, support, and domestic matters.</p>
            </div>
            <div class="card-lift border border-gray-700 p-4 hover:border-yellow-600 transition-colors bg-gray-700">
              <div class="font-black text-sm mb-1" style="color:#e5e7eb;">Administrative Appeal</div>
              <p class="text-xs text-gray-400">Appeal government decisions and administrative rulings.</p>
            </div>
            <div class="card-lift border border-gray-700 p-4 hover:border-yellow-600 transition-colors bg-gray-700">
              <div class="font-black text-sm mb-1" style="color:#e5e7eb;">Small Claims</div>
              <p class="text-xs text-gray-400">File claims under $5,000 through expedited process.</p>
            </div>
            <div class="card-lift border border-gray-700 p-4 hover:border-yellow-600 transition-colors bg-gray-700">
              <div class="font-black text-sm mb-1" style="color:#e5e7eb;">Emergency Motion</div>
              <p class="text-xs text-gray-400">Request emergency orders and urgent relief measures.</p>
            </div>
          </div>
        </div>
        <div class="text-center">
          <button class="px-8 py-3 text-sm font-black uppercase tracking-widest text-white hover:opacity-90 transition-all" style="background:#ca8a04;color:#111827;">Begin New Filing</button>
        </div>
      </div>
    </div>`;
  }

  // ── SEARCH ────────────────────────────────────────────────────────────────
  function getSearchHtml() {
    return `
    <div class="bg-gray-900 min-h-screen animate-slide">
      <div class="bg-gray-800 border-b border-gray-700">
        <div class="max-w-7xl mx-auto px-4 py-3 text-xs text-gray-400 font-bold">
          <button onclick="App.navigate('home')" class="hover:text-yellow-500 transition-colors">Home</button>
          <span class="mx-2 text-gray-600">›</span><span style="color:#e5e7eb;">Search Records</span>
        </div>
      </div>
      <div class="max-w-7xl mx-auto px-4 py-10">
        <h2 class="text-3xl font-black uppercase tracking-tighter mb-2" style="color:#e5e7eb;">Search Case Records</h2>
        <p class="text-gray-400 text-sm mb-8">Search court records, case history, and notice documents.</p>
        <div class="bg-gray-800 border border-gray-700 p-6 gov-shadow mb-6">
          <div class="grid md:grid-cols-4 gap-4 mb-6">
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Case Number</label>
              <input type="text" placeholder="NUCA-2026-XXXX" class="w-full bg-gray-700 border border-gray-600 px-3 py-2 text-sm outline-none focus:border-yellow-500 text-gray-100">
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Party Name</label>
              <input type="text" placeholder="Search by name..." class="w-full bg-gray-700 border border-gray-600 px-3 py-2 text-sm outline-none focus:border-yellow-500 text-gray-100">
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Case Type</label>
              <select class="w-full bg-gray-700 border border-gray-600 px-3 py-2 text-sm outline-none focus:border-yellow-500 text-gray-100">
                <option>All Types</option>
                <option>Civil</option>
                <option>Criminal</option>
                <option>Family</option>
                <option>Administrative</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Date Range</label>
              <input type="date" class="w-full bg-gray-700 border border-gray-600 px-3 py-2 text-sm outline-none focus:border-yellow-500 text-gray-100">
            </div>
          </div>
          <button class="px-6 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:opacity-90 transition" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1px solid #475569;">Search Records</button>
        </div>
        <div class="bg-gray-800 border border-gray-700 p-6 gov-shadow">
          <h3 class="text-xs font-black uppercase tracking-widest border-b-2 pb-2 mb-4" style="color:#e5e7eb;border-color:#475569;">Recent Searches</h3>
          <div class="text-sm text-gray-400 text-center py-8">No recent searches. Use the search form above to find case records.</div>
        </div>
      </div>
    </div>`;
  }

  // ── CASES ─────────────────────────────────────────────────────────────────
  function getCasesHtml() {
    const cases = getCases();
    const casesList = cases.length === 0 
      ? `<div class="text-center py-12 text-gray-400">
          <div class="text-4xl mb-4">📁</div>
          <p class="text-sm">No cases filed yet. Create your first case to get started.</p>
        </div>`
      : cases.map(c => `
        <div class="bg-gray-800 border border-gray-700 p-5 mb-4 gov-shadow">
          <div class="flex justify-between items-start mb-3">
            <div>
              <div class="font-black text-sm text-yellow-500 mb-1">${escapeHtml(c.id)}</div>
              <div class="font-bold text-base text-gray-100">${escapeHtml(c.title)}</div>
            </div>
            <span class="px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded ${c.status === 'pending' ? 'bg-yellow-900 text-yellow-200' : c.status === 'active' ? 'bg-green-900 text-green-200' : 'bg-gray-700 text-gray-300'}">${escapeHtml(String(c.status || 'pending').replace(/^./, m => m.toUpperCase()))}</span>
          </div>
          <div class="grid grid-cols-2 gap-4 text-xs mb-3">
            <div><span class="text-gray-500 font-black uppercase tracking-widest">Type:</span> <span class="text-gray-300">${escapeHtml(c.type)}</span></div>
            <div><span class="text-gray-500 font-black uppercase tracking-widest">Court Date:</span> <span class="text-gray-300">${escapeHtml(c.courtDate || 'Not scheduled')}</span></div>
            <div><span class="text-gray-500 font-black uppercase tracking-widest">Plaintiff:</span> <span class="text-gray-300">${escapeHtml(c.plaintiff)}</span></div>
            <div><span class="text-gray-500 font-black uppercase tracking-widest">Defendant:</span> <span class="text-gray-300">${escapeHtml(c.defendant)}</span></div>
          </div>
          <div class="text-xs text-gray-400 mb-4">${escapeHtml(c.description)}</div>
          <div class="flex gap-2">
            ${c.status === 'active' ? `<button onclick="App.startVideoCourt('${c.id}', '${escapeHtml(c.title).replace(/'/g, "\\'")}');" class="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-500 transition">🎥 Start Court</button>` : ''}
            ${c.status === 'pending' ? `<button onclick="App.updateCaseStatus('${c.id}', 'active')" class="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-green-600 text-gray-900 hover:bg-green-500 transition">Activate</button>` : ''}
            ${c.status === 'active' ? `<button onclick="App.updateCaseStatus('${c.id}', 'closed')" class="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-gray-600 text-white hover:bg-gray-500 transition">Close</button>` : ''}
            <button onclick="App.deleteCase('${c.id}')" class="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-red-900 text-red-200 hover:bg-red-800 transition">Delete</button>
          </div>
        </div>
      `).join('');

    return `
    <div class="bg-gray-900 min-h-screen animate-slide">
      <div class="bg-gray-800 border-b border-gray-700">
        <div class="max-w-7xl mx-auto px-4 py-3 text-xs text-gray-400 font-bold">
          <button onclick="App.navigate('home')" class="hover:text-yellow-500 transition-colors">Home</button>
          <span class="mx-2 text-gray-600">›</span><span style="color:#e5e7eb;">Manage Cases</span>
        </div>
      </div>
      <div class="max-w-7xl mx-auto px-4 py-10">
        <div class="flex justify-between items-center mb-8">
          <div>
            <h2 class="text-3xl font-black uppercase tracking-tighter mb-2" style="color:#e5e7eb;">Case Management</h2>
            <p class="text-gray-400 text-sm">Create and manage court cases with scheduled dates.</p>
          </div>
          <button onclick="App.showCreateCaseForm()" class="px-6 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:opacity-90 transition-all" style="background:#ca8a04;color:#111827;">+ New Case</button>
        </div>
        
        <div id="cases-list">${casesList}</div>
        
        <div id="video-court-container" class="hidden bg-gray-800 border border-gray-700 p-6 gov-shadow mb-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-black" style="color:#e5e7eb;">🎥 Virtual Courtroom</h3>
            <button onclick="App.endVideoCourt()" class="px-4 py-2 text-xs font-black uppercase tracking-widest bg-red-600 text-white hover:bg-red-500 transition">End Session</button>
          </div>
          <div id="jitsi-container" style="height: 500px; border-radius: 8px; overflow: hidden;"></div>
        </div>
        
        <div id="create-case-form" class="hidden bg-gray-800 border border-gray-700 p-6 gov-shadow mb-6">
          <h3 class="text-lg font-black mb-4" style="color:#e5e7eb;">Create New Case</h3>
          <div class="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Case Title</label>
              <input type="text" id="case-title" placeholder="Enter case title" class="w-full bg-gray-700 border border-gray-600 px-3 py-2 text-sm outline-none focus:border-yellow-500 text-gray-100">
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Case Type</label>
              <select id="case-type" class="w-full bg-gray-700 border border-gray-600 px-3 py-2 text-sm outline-none focus:border-yellow-500 text-gray-100">
                <option>Civil</option>
                <option>Criminal</option>
                <option>Family</option>
                <option>Administrative</option>
                <option>Small Claims</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Plaintiff Name</label>
              <input type="text" id="case-plaintiff" placeholder="Plaintiff name" class="w-full bg-gray-700 border border-gray-600 px-3 py-2 text-sm outline-none focus:border-yellow-500 text-gray-100">
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Defendant Name</label>
              <input type="text" id="case-defendant" placeholder="Defendant name" class="w-full bg-gray-700 border border-gray-600 px-3 py-2 text-sm outline-none focus:border-yellow-500 text-gray-100">
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Court Date</label>
              <input type="date" id="case-court-date" class="w-full bg-gray-700 border border-gray-600 px-3 py-2 text-sm outline-none focus:border-yellow-500 text-gray-100">
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Court Time</label>
              <input type="time" id="case-court-time" class="w-full bg-gray-700 border border-gray-600 px-3 py-2 text-sm outline-none focus:border-yellow-500 text-gray-100">
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Courtroom</label>
              <input type="text" id="case-courtroom" placeholder="e.g., Courtroom 4B" class="w-full bg-gray-700 border border-gray-600 px-3 py-2 text-sm outline-none focus:border-yellow-500 text-gray-100">
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Assigned Judge</label>
              <input type="text" id="case-judge" placeholder="Judge name" class="w-full bg-gray-700 border border-gray-600 px-3 py-2 text-sm outline-none focus:border-yellow-500 text-gray-100">
            </div>
          </div>
          <div class="mb-4">
            <label class="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Case Description</label>
            <textarea id="case-description" rows="3" placeholder="Describe the case details..." class="w-full bg-gray-700 border border-gray-600 px-3 py-2 text-sm outline-none focus:border-yellow-500 text-gray-100"></textarea>
          </div>
          <div class="flex gap-3">
            <button onclick="App.createCase()" class="px-6 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:opacity-90 transition" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1px solid #475569;">Create Case</button>
            <button onclick="App.hideCreateCaseForm()" class="px-6 py-2.5 text-xs font-black uppercase tracking-widest text-gray-300 hover:text-white transition">Cancel</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  function showCreateCaseForm() {
    document.getElementById('create-case-form').classList.remove('hidden');
    document.getElementById('cases-list').classList.add('hidden');
  }

  function hideCreateCaseForm() {
    document.getElementById('create-case-form').classList.add('hidden');
    document.getElementById('cases-list').classList.remove('hidden');
  }

  async function createCase() {
    const title = document.getElementById('case-title').value.trim();
    const type = document.getElementById('case-type').value;
    const plaintiff = document.getElementById('case-plaintiff').value.trim();
    const defendant = document.getElementById('case-defendant').value.trim();
    const courtDate = document.getElementById('case-court-date').value;
    const courtTime = document.getElementById('case-court-time').value;
    const courtroom = document.getElementById('case-courtroom').value.trim();
    const judge = document.getElementById('case-judge').value.trim();
    const description = document.getElementById('case-description').value.trim();

    if (!title || !plaintiff || !defendant) {
      alert('Please fill in the required fields (Title, Plaintiff, Defendant)');
      return;
    }

    const caseData = {
      title,
      type,
      plaintiff,
      defendant,
      courtDate: courtDate ? new Date(courtDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
      courtTime,
      courtroom,
      judge,
      description
    };

    await saveCase(caseData);
    hideCreateCaseForm();
    await navigate('cases');
  }


  // ── DOCUMENTS ───────────────────────────────────────────────────────────────
  function getDocumentsHtml() {
    const templates = [
      { id: 'cease-desist', name: 'Cease & Desist', icon: '⚠️', description: 'Formal demand to stop illegal activity' },
      { id: 'lawsuit', name: 'Lawsuit Complaint', icon: '⚖️', description: 'Formal legal complaint filing' },
      { id: 'subpoena', name: 'Subpoena', icon: '📜', description: 'Court order for testimony or documents' },
      { id: 'motion', name: 'Legal Motion', icon: '📝', description: 'Request for court order' },
      { id: 'contract', name: 'Legal Contract', icon: '📋', description: 'Binding legal agreement' },
      { id: 'notice', name: 'Legal Notice', icon: '📬', description: 'Formal legal notification' }
    ];

    return `
    <div class="bg-gray-900 min-h-screen animate-slide">
      <div class="bg-gray-800 border-b border-gray-700">
        <div class="max-w-7xl mx-auto px-4 py-3 text-xs text-gray-400 font-bold">
          <button onclick="App.navigate('home')" class="hover:text-yellow-500 transition-colors">Home</button>
          <span class="mx-2 text-gray-600">›</span><span style="color:#e5e7eb;">Document Builder</span>
        </div>
      </div>
      <div class="max-w-7xl mx-auto px-4 py-10">
        <div class="flex justify-between items-center mb-8">
          <div>
            <h2 class="text-3xl font-black uppercase tracking-tighter mb-2" style="color:#e5e7eb;">Document Builder</h2>
            <p class="text-gray-400 text-sm">Create legal documents with drag-and-drop blocks or AI assistance.</p>
          </div>
          <button onclick="App.createNewDocument()" class="px-6 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:opacity-90 transition-all" style="background:#ca8a04;color:#111827;">+ New Document</button>
        </div>

        <div id="document-home">
          <div class="grid md:grid-cols-3 gap-4 mb-8">
            ${templates.map(t => `
              <div onclick="App.loadTemplate('${t.id}')" class="bg-gray-800 border border-gray-700 p-5 cursor-pointer hover:border-yellow-600 transition-colors gov-shadow">
                <div class="text-3xl mb-3">${t.icon}</div>
                <div class="font-black text-sm mb-1" style="color:#e5e7eb;">${t.name}</div>
                <div class="text-xs text-gray-400">${t.description}</div>
              </div>
            `).join('')}
          </div>

          <div class="bg-gray-800 border border-gray-700 p-6 gov-shadow">
            <h3 class="text-lg font-black mb-4" style="color:#e5e7eb;">🤖 AI Document Generation</h3>
            <p class="text-sm text-gray-400 mb-4">Describe what you want in your document and AI will generate it for you.</p>
            <textarea id="ai-prompt" rows="4" placeholder="Describe your document needs... e.g., 'Create a cease and desist letter for copyright infringement regarding my website content'" class="w-full bg-gray-700 border border-gray-600 px-3 py-2 text-sm outline-none focus:border-yellow-500 text-gray-100 mb-4"></textarea>
            <button onclick="App.generateAIDocument()" class="px-6 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:opacity-90 transition" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1px solid #475569;">Generate with AI</button>
          </div>
        </div>

        <div id="document-editor" class="hidden">
          <div class="flex gap-4 mb-6">
            <div class="flex-1">
              <input type="text" id="document-title" placeholder="Document Title" class="w-full bg-gray-700 border border-gray-600 px-3 py-2 text-sm outline-none focus:border-yellow-500 text-gray-100 font-bold">
            </div>
            <div class="flex gap-2">
              <button onclick="App.addTextBlock()" class="px-4 py-2 text-xs font-black uppercase tracking-widest bg-gray-700 text-gray-300 hover:bg-gray-600 transition">+ Text</button>
              <button onclick="App.addHeaderBlock()" class="px-4 py-2 text-xs font-black uppercase tracking-widest bg-gray-700 text-gray-300 hover:bg-gray-600 transition">+ Header</button>
              <button onclick="App.addImageBlock()" class="px-4 py-2 text-xs font-black uppercase tracking-widest bg-gray-700 text-gray-300 hover:bg-gray-600 transition">+ Image</button>
              <button onclick="App.addSignatureBlock()" class="px-4 py-2 text-xs font-black uppercase tracking-widest bg-gray-700 text-gray-300 hover:bg-gray-600 transition">+ Signature</button>
              <button onclick="App.previewDocument()" class="px-4 py-2 text-xs font-black uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-500 transition">Preview</button>
              <button onclick="App.exportDocument()" class="px-4 py-2 text-xs font-black uppercase tracking-widest bg-green-600 text-gray-900 hover:bg-green-500 transition">Export</button>
              <button onclick="App.closeDocument()" class="px-4 py-2 text-xs font-black uppercase tracking-widest bg-red-600 text-white hover:bg-red-500 transition">Close</button>
            </div>
          </div>

          <div id="document-canvas" class="bg-white min-h-[600px] p-8 text-gray-900 gov-shadow" style="border: 2px solid #475569;">
            <div id="document-blocks" class="space-y-4"></div>
          </div>
        </div>

        <div id="document-preview" class="hidden">
          <div class="flex justify-between items-center mb-6">
            <h3 class="text-lg font-black" style="color:#e5e7eb;">Document Preview</h3>
            <div class="flex gap-2">
              <button onclick="App.backToEditor()" class="px-4 py-2 text-xs font-black uppercase tracking-widest bg-gray-700 text-gray-300 hover:bg-gray-600 transition">Back to Editor</button>
              <button onclick="App.exportDocument()" class="px-4 py-2 text-xs font-black uppercase tracking-widest bg-green-600 text-gray-900 hover:bg-green-500 transition">Export</button>
            </div>
          </div>
          <div id="preview-content" class="bg-white p-8 text-gray-900 gov-shadow" style="border: 2px solid #475569;"></div>
        </div>

        <input type="file" id="image-upload" accept="image/*" class="hidden" onchange="App.handleImageUpload(event)">
      </div>
    </div>`;
  }

  let documentBlocks = [];
  let currentDocumentId = null;

  function createNewDocument() {
    documentBlocks = [];
    currentDocumentId = 'DOC-' + Date.now().toString().slice(-8);
    document.getElementById('document-title').value = '';
    document.getElementById('document-blocks').innerHTML = '';
    document.getElementById('document-home').classList.add('hidden');
    document.getElementById('document-editor').classList.remove('hidden');
  }

  function loadTemplate(templateId) {
    createNewDocument();
    const templates = {
      'cease-desist': {
        title: 'Cease and Desist Letter',
        blocks: [
          { type: 'header', content: 'CEASE AND DESIST LETTER' },
          { type: 'text', content: 'Date: [Enter Date]\n\nTo: [Recipient Name]\n[Recipient Address]\n\nFrom: [Your Name]\n[Your Address]\n\nRe: CEASE AND DESIST NOTICE' },
          { type: 'text', content: 'Dear [Recipient Name],\n\nThis letter serves as formal notice that you are engaging in unlawful activities that are causing harm to [Your Name/Company]. You are hereby demanded to immediately cease and desist from such activities.\n\nFailure to comply with this demand may result in legal action being taken against you.' },
          { type: 'text', content: 'Sincerely,\n\n[Your Name]\n[Your Title]' }
        ]
      },
      'lawsuit': {
        title: 'Lawsuit Complaint',
        blocks: [
          { type: 'header', content: 'COMPLAINT FOR DAMAGES' },
          { type: 'text', content: 'IN THE COURT OF [Court Name]\n[Case Number]\n\n[Plaintiff Name],\nPlaintiff,\nv.\n\n[Defendant Name],\nDefendant.' },
          { type: 'text', content: 'COMPLAINT FOR DAMAGES\n\nCOMES NOW the Plaintiff, [Your Name], by and through undersigned counsel, and files this Complaint against Defendant, [Defendant Name], and in support thereof states as follows:' },
          { type: 'text', content: 'COUNT I: [Cause of Action]\n\n1. [Allegation 1]\n2. [Allegation 2]\n3. [Allegation 3]\n\nWHEREFORE, Plaintiff respectfully requests judgment against Defendant in the amount of [Amount] plus costs and such other relief as the Court deems just and proper.' }
        ]
      },
      'subpoena': {
        title: 'Subpoena',
        blocks: [
          { type: 'header', content: 'SUBPOENA' },
          { type: 'text', content: 'TO: [Witness Name]\n[Address]\n\nYOU ARE COMMANDED to appear in the Court of [Court Name] located at [Court Address] on [Date] at [Time] to testify in the case of [Case Name].\n\nFAILURE TO APPEAR may result in contempt of court proceedings.' }
        ]
      },
      'motion': {
        title: 'Legal Motion',
        blocks: [
          { type: 'header', content: 'MOTION FOR [Motion Type]' },
          { type: 'text', content: 'NOW COMES [Your Name], by and through undersigned counsel, and moves this Honorable Court for [Requested Relief]. In support of this Motion, [Your Name] states as follows:' }
        ]
      },
      'contract': {
        title: 'Legal Contract',
        blocks: [
          { type: 'header', content: 'LEGAL CONTRACT' },
          { type: 'text', content: 'This Agreement is entered into on [Date] by and between:\n\n[Party A Name] ("Party A")\n[Party B Name] ("Party B")\n\nWHEREAS, the parties desire to enter into this Agreement for the purpose of [Purpose]...' }
        ]
      },
      'notice': {
        title: 'Legal Notice',
        blocks: [
          { type: 'header', content: 'LEGAL NOTICE' },
          { type: 'text', content: 'NOTICE IS HEREBY GIVEN that [Notice Content]. This notice is effective as of [Date].\n\nPlease direct any inquiries to [Contact Information].' }
        ]
      }
    };

    const template = templates[templateId];
    if (template) {
      document.getElementById('document-title').value = template.title;
      documentBlocks = template.blocks;
      renderDocumentBlocks();
    }
  }

  function renderDocumentBlocks() {
    const container = document.getElementById('document-blocks');
    container.innerHTML = documentBlocks.map((block, index) => {
      if (block.type === 'header') {
        return `<div class="border border-gray-300 p-4 relative group" data-index="${index}">
          <input type="text" value="${escapeHtml(block.content)}" onchange="App.updateBlock(${index}, 'content', this.value)" class="w-full text-xl font-black uppercase outline-none">
          <button onclick="App.deleteBlock(${index})" class="absolute top-2 right-2 text-red-600 hover:text-red-800 opacity-0 group-hover:opacity-100 transition">✕</button>
        </div>`;
      } else if (block.type === 'text') {
        return `<div class="border border-gray-300 p-4 relative group" data-index="${index}">
          <textarea rows="4" onchange="App.updateBlock(${index}, 'content', this.value)" class="w-full outline-none resize-none">${escapeHtml(block.content)}</textarea>
          <button onclick="App.deleteBlock(${index})" class="absolute top-2 right-2 text-red-600 hover:text-red-800 opacity-0 group-hover:opacity-100 transition">✕</button>
        </div>`;
      } else if (block.type === 'image') {
        return `<div class="border border-gray-300 p-4 relative group" data-index="${index}">
          <img src="${block.content}" class="max-w-full h-auto mb-2" alt="Document image">
          <button onclick="App.deleteBlock(${index})" class="absolute top-2 right-2 text-red-600 hover:text-red-800 opacity-0 group-hover:opacity-100 transition">✕</button>
        </div>`;
      } else if (block.type === 'signature') {
        return `<div class="border border-gray-300 p-4 relative group" data-index="${index}">
          <div class="border-b-2 border-gray-400 pb-2 mb-2">
            <input type="text" placeholder="Signature" class="w-full outline-none font-handwriting" style="font-family: cursive;">
          </div>
          <input type="text" placeholder="Printed Name" class="w-full outline-none text-sm">
          <button onclick="App.deleteBlock(${index})" class="absolute top-2 right-2 text-red-600 hover:text-red-800 opacity-0 group-hover:opacity-100 transition">✕</button>
        </div>`;
      }
    }).join('');
  }

  function addTextBlock() {
    documentBlocks.push({ type: 'text', content: '' });
    renderDocumentBlocks();
  }

  function addHeaderBlock() {
    documentBlocks.push({ type: 'header', content: 'NEW SECTION' });
    renderDocumentBlocks();
  }

  function addImageBlock() {
    document.getElementById('image-upload').click();
  }

  function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        // Add logo watermark to image
        const img = new Image();
        img.onload = function() {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          
          // Add NUCA logo watermark
          ctx.font = 'bold 24px Arial';
          ctx.fillStyle = 'rgba(202, 138, 4, 0.7)';
          ctx.fillText('NUCA - Lemangoes Gov', 20, canvas.height - 20);
          ctx.font = '14px Arial';
          ctx.fillText('Verified Document', 20, canvas.height - 40);
          
          const watermarkedDataUrl = canvas.toDataURL('image/png');
          documentBlocks.push({ type: 'image', content: watermarkedDataUrl });
          renderDocumentBlocks();
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
    event.target.value = '';
  }

  function addSignatureBlock() {
    documentBlocks.push({ type: 'signature', content: '' });
    renderDocumentBlocks();
  }

  function updateBlock(index, field, value) {
    documentBlocks[index][field] = value;
  }

  function deleteBlock(index) {
    documentBlocks.splice(index, 1);
    renderDocumentBlocks();
  }

  function previewDocument() {
    const previewContent = document.getElementById('preview-content');
    const title = document.getElementById('document-title').value;
    
    let html = `<h1 class="text-2xl font-black mb-6 uppercase" style="color:#112e51;">${escapeHtml(title)}</h1>`;
    html += documentBlocks.map(block => {
      if (block.type === 'header') {
        return `<h2 class="text-xl font-black mt-6 mb-4 uppercase" style="color:#005ea2;">${escapeHtml(block.content)}</h2>`;
      } else if (block.type === 'text') {
        return `<p class="mb-4 leading-relaxed">${escapeHtml(block.content).replace(/\n/g, '<br>')}</p>`;
      } else if (block.type === 'image') {
        return `<img src="${block.content}" class="max-w-full h-auto my-4 border border-gray-300" alt="Document image">`;
      } else if (block.type === 'signature') {
        return `<div class="mt-8 pt-4 border-t-2 border-gray-400">
          <div class="border-b-2 border-gray-400 pb-2 mb-2" style="font-family: cursive;">Signature</div>
          <div class="text-sm">Printed Name</div>
        </div>`;
      }
    }).join('');
    
    previewContent.innerHTML = html;
    document.getElementById('document-editor').classList.add('hidden');
    document.getElementById('document-preview').classList.remove('hidden');
  }

  function backToEditor() {
    document.getElementById('document-preview').classList.add('hidden');
    document.getElementById('document-editor').classList.remove('hidden');
  }

  function closeDocument() {
    document.getElementById('document-editor').classList.add('hidden');
    document.getElementById('document-preview').classList.add('hidden');
    document.getElementById('document-home').classList.remove('hidden');
  }

  function exportDocument() {
    const title = document.getElementById('document-title').value;
    
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      
      // Add NUCA header
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(17, 46, 81);
      doc.text('NUCA', 72, 72);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(102, 102, 102);
      doc.text('National Universal Court (for) All - Lemangoes Government', 72, 100);
      
      // Add document title
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(title.toUpperCase(), 72, 120);
      
      // Add verification watermark
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(202, 138, 4);
      doc.text('VERIFIED DOCUMENT - NUCA LEMANGOES GOVERNMENT', 72, 130);
      
      let yPosition = 145;
      
      // Process blocks
      documentBlocks.forEach(block => {
        if (block.type === 'header') {
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 94, 162);
          doc.text(block.content.toUpperCase(), 72, yPosition);
          yPosition += 15;
        } else if (block.type === 'text') {
          doc.setFontSize(11);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(0, 0, 0);
          const lines = doc.splitTextToSize(block.content, 456);
          doc.text(lines, 72, yPosition);
          yPosition += (lines.length * 7) + 10;
        } else if (block.type === 'signature') {
          yPosition += 10;
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(0, 0, 0);
          doc.text('____________________', 72, yPosition);
          doc.text('Signature', 72, yPosition + 7);
          yPosition += 20;
          doc.text('Printed Name: ______________', 72, yPosition);
          yPosition += 20;
        }
      });
      
      // Add footer
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(153, 153, 153);
      doc.text('This document is officially verified by NUCA - Lemangoes Government', 105, 280, { align: 'center' });
      
      doc.save(title.replace(/[^a-z0-9]/gi, '_') + '.pdf');
    } catch (error) {
      console.error('PDF Export Error:', error);
      alert('Failed to export PDF. Please try again.');
    }
  }

  async function generateAIDocument() {
    const prompt = document.getElementById('ai-prompt').value;
    if (!prompt.trim()) {
      alert('Please describe what you want in your document');
      return;
    }
    
    try {
      // Uses the shared Lemango AI client: backend first, then a free keyless
      // public provider so generation also works on static hosting.
       const _doc = (await window.LemangoAI.document({ prompt: prompt, model: 'Mango-Core' })) || {};
       const generatedContent = (_doc && _doc.text) ? _doc.text : (_doc || '');
      if (!generatedContent.trim()) {
        throw new Error('Empty AI response');
      }

      createNewDocument();
      document.getElementById('document-title').value = 'AI Generated Document';
      
      // Parse AI generated content into blocks
      const lines = generatedContent.split('\n');
      documentBlocks = [];
      
      let currentText = '';
      lines.forEach(line => {
        if (line.toUpperCase() === line && line.length > 0 && line.length < 100) {
          if (currentText.trim()) {
            documentBlocks.push({ type: 'text', content: currentText.trim() });
            currentText = '';
          }
          documentBlocks.push({ type: 'header', content: line });
        } else {
          currentText += line + '\n';
        }
      });
      
      if (currentText.trim()) {
        documentBlocks.push({ type: 'text', content: currentText.trim() });
      }
      
      // Add signature block
      documentBlocks.push({ type: 'signature', content: '' });
      
      renderDocumentBlocks();
    } catch (error) {
      console.error('AI Generation Error:', error);
      alert('Lemango AI could not generate the document right now. Please try again in a moment.');
    }
  }

  // ── CONTACT ───────────────────────────────────────────────────────────────
  function getContactHtml() {
    return `
    <div class="bg-gray-900 min-h-screen animate-slide">
      <div class="bg-gray-800 border-b border-gray-700">
        <div class="max-w-7xl mx-auto px-4 py-3 text-xs text-gray-400 font-bold">
          <button onclick="App.navigate('home')" class="hover:text-yellow-500 transition-colors">Home</button>
          <span class="mx-2 text-gray-600">›</span><span style="color:#e5e7eb;">Contact</span>
        </div>
      </div>
      <div class="max-w-7xl mx-auto px-4 py-10">
        <h2 class="text-3xl font-black uppercase tracking-tighter mb-2" style="color:#e5e7eb;">Contact NUCA</h2>
        <p class="text-gray-400 text-sm mb-8">Reach us for support, enquiries, and technical assistance.</p>
        <div class="grid md:grid-cols-2 gap-6">
          <div class="bg-gray-800 border border-gray-700 p-6 gov-shadow space-y-4 text-sm">
            <h3 class="font-black text-xs uppercase tracking-widest border-b border-gray-700 pb-2" style="color:#e5e7eb;">Contact Details</h3>
            <div><p class="font-black text-xs uppercase tracking-widest text-gray-500 mb-0.5">Phone</p><p class="font-bold text-gray-200">1-800-555-NUCA</p></div>
            <div><p class="font-black text-xs uppercase tracking-widest text-gray-500 mb-0.5">Email</p><p class="font-bold text-gray-200">notices@nuca.gov.lm</p></div>
            <div><p class="font-black text-xs uppercase tracking-widest text-gray-500 mb-0.5">Address</p><p class="font-bold text-gray-200">NUCA Headquarters, 1 Court Plaza, New Lema City</p></div>
            <div><p class="font-black text-xs uppercase tracking-widest text-gray-500 mb-0.5">Hours</p><p class="font-bold text-gray-200">Mon–Fri, 8:00 AM – 5:00 PM</p></div>
          </div>
          <div class="text-white p-6" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1px solid #475569;">
            <h3 class="font-black text-yellow-500 text-sm uppercase tracking-widest mb-4">🚨 Emergency Support</h3>
            <p class="text-gray-300 text-sm mb-4">For urgent notice delivery issues or system emergencies outside office hours.</p>
            <p class="text-3xl font-black text-yellow-500">1-800-555-0911</p>
            <p class="text-xs text-gray-400 mt-2">Available 24/7 for urgent matters only</p>
          </div>
        </div>
      </div>
    </div>`;
  }

  // ── NAVIGATE ──────────────────────────────────────────────────────────────
  async function navigate(view) {
    activeView = view;
    toggleMobileMenu(false);
    const main = els.main();
    if (!main) return;
    if (view === 'cases') {
      try { await loadCases(); } catch { casesCache = []; }
    }
    const map = { home: getHomeHtml, cases: getCasesHtml, documents: getDocumentsHtml, notices: getNoticesHtml, filing: getFilingHtml, search: getSearchHtml, contact: getContactHtml };
    main.innerHTML = (map[view] || getHomeHtml)();
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("nav-active", b.dataset.view === view));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function init() {
    document.getElementById("login-screen").style.display = "none";
    navigate("home");
    initGlobalSearch();
    document.getElementById("password")?.addEventListener("keydown", e => { if (e.key === "Enter") login(); });
  }

  document.addEventListener("DOMContentLoaded", init);

  return { navigate, login, openModal, closeModal, toggleHeaderInfo, toggleMobileMenu, showCreateCaseForm, hideCreateCaseForm, createCase, deleteCase, updateCaseStatus, getCases, startVideoCourt, endVideoCourt, createNewDocument, loadTemplate, addTextBlock, addHeaderBlock, addImageBlock, addSignatureBlock, updateBlock, deleteBlock, previewDocument, backToEditor, closeDocument, exportDocument, generateAIDocument, handleImageUpload };
})();
