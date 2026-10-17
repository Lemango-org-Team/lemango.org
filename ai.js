"use strict";

const chatContainer = document.getElementById("chatContainer");
const messageInput  = document.getElementById("messageInput");
const sendBtn       = document.getElementById("sendBtn");
const regenBtn      = document.getElementById("regenBtn");
const scrollDownBtn = document.getElementById("scrollDownBtn");
const sidebarToggle = document.getElementById("sidebarToggle");
const sidebarClose  = document.getElementById("sidebarClose");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const sidebar       = document.getElementById("sidebar");
const sessionList   = document.getElementById("sessionList");
const sidebarSearch = document.getElementById("sidebarSearch");
const newChatBtn    = document.getElementById("newChatBtn");
const modelTrigger  = document.getElementById("modelTrigger");
const modelDropdown = document.getElementById("modelDropdown");
const modelLabel    = document.getElementById("modelLabel");
const rightPanel    = document.getElementById("rightPanel");
const toastEl       = document.getElementById("toast");

const SESSION_KEY = "lemango_sessions";
const ACTIVE_KEY  = "lemango_active_session";
const THEME_KEY   = "lemango_theme";

const botName = document.querySelector(".header-info h1")?.textContent.trim() || "Lemango AI";

let sessions = loadSessions();
let activeSessionId = localStorage.getItem(ACTIVE_KEY) || null;
let history = getOrCreateActiveSession();
let welcomeRemoved = false;
let sending = false;
let toastTimer = null;
let currentModel = localStorage.getItem("lemango_model") || "Mango-Light";
let models = [];

/* ============================================================
   Markdown
   ============================================================ */

function escapeHtml(s) {
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function inlineMd(raw) {
    const c=[]; let o=raw.replace(/`([^`]+)`/g,(m,v)=>{c.push(v);return "%%IC"+(c.length-1)+"%%"});
    o=escapeHtml(o); o=o.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>");
    o=o.replace(/\*([^*\n]+)\*/g,"<em>$1</em>");
    o=o.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    o=o.replace(/%%IC(\d+)%%/g,(m,i)=>"<code>"+escapeHtml(c[+i])+"</code>"); return o;
}

function mdToHtml(raw) {
    const B=[]; const t=raw.replace(/```(\w*)\r?\n?([\s\S]*?)```/g,(m,l,c)=>{B.push({lang:l||"",code:c.replace(/\n$/,"")});return "\n%%CB"+(B.length-1)+"%%\n"});
    let h="",lt=null,p=[];
    const fp=()=>{if(p.length){h+="<p>"+p.map(inlineMd).join("<br>")+"</p>";p=[]}};
    const cl=()=>{if(lt){h+=lt==="ul"?"</ul>":"</ol>";lt=null}};
    for(const L of t.split("\n")){
        const cb=L.trim().match(/^%%CB(\d+)%%$/);
        if(cb){fp();cl();const b=B[+cb[1]];h+='<div class="code-block"><div class="code-block-header"><span>'+escapeHtml(b.lang||"code")+'</span><button type="button" class="code-copy-btn" data-code="'+encodeURIComponent(b.code)+'">Copy</button></div><pre><code>'+escapeHtml(b.code)+'</code></pre></div>';continue}
        const hd=L.match(/^(#{1,4})\s+(.*)$/);
        if(hd){fp();cl();const lv=Math.min(hd[1].length+1,5);h+="<h"+lv+">"+inlineMd(hd[2])+"</h"+lv+">";continue}
        if(/^\s*(---+|\*\*\*+|___+)\s*$/.test(L)){fp();cl();h+="<hr>";continue}
        const bq=L.match(/^\s*>\s?(.*)$/);
        if(bq){fp();cl();h+="<blockquote>"+inlineMd(bq[1])+"</blockquote>";continue}
        const ul=L.match(/^\s*[-*•]\s+(.*)$/);
        if(ul&&!/^\s*[-*]\s*$/.test(L)){fp();if(lt!=="ul"){cl();h+="<ul>";lt="ul"}h+="<li>"+inlineMd(ul[1])+"</li>";continue}
        const ol=L.match(/^\s*\d+[.)]\s+(.*)$/);
        if(ol){fp();if(lt!=="ol"){cl();h+="<ol>";lt="ol"}h+="<li>"+inlineMd(ol[1])+"</li>";continue}
        if(!L.trim()){fp();cl();continue} p.push(L);
    }
    fp();cl(); return h;
}

/* ============================================================
   Sessions
   ============================================================ */

function loadSessions(){try{const r=localStorage.getItem(SESSION_KEY);const p=r?JSON.parse(r):[];return Array.isArray(p)?p.filter(s=>s&&typeof s.id==="string"):[]}catch{return[]}}
function saveSessions(){try{localStorage.setItem(SESSION_KEY,JSON.stringify(sessions))}catch{}}
function getOrCreateActiveSession(){if(activeSessionId){const f=sessions.find(s=>s.id===activeSessionId);if(f)return f.messages}const s=createSession();return s.messages}
function createSession(){const s={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),title:"New chat",created:Date.now(),messages:[]};sessions.unshift(s);activeSessionId=s.id;localStorage.setItem(ACTIVE_KEY,activeSessionId);saveSessions();return s}
function switchSession(id){const s=sessions.find(x=>x.id===id);if(!s)return;activeSessionId=id;history=s.messages;localStorage.setItem(ACTIVE_KEY,activeSessionId);welcomeRemoved=false;rebuildChat();closeSidebar();updateRegenVisibility();updateScrollPill()}
function rebuildChat(){chatContainer.innerHTML="";if(history.length){history.forEach(m=>renderMessage(m.t,m.r,false));scrollToBottom(false)}else{chatContainer.appendChild(buildWelcome())}updateRightPanel()}
function deleteSession(id){sessions=sessions.filter(s=>s.id!==id);saveSessions();if(activeSessionId===id){const s=sessions.length?sessions[0]:createSession();activeSessionId=s.id;history=s.messages;localStorage.setItem(ACTIVE_KEY,activeSessionId);welcomeRemoved=false;rebuildChat();updateRegenVisibility()}renderSessionList()}
function sessionTitle(s){if(!s.messages.length)return s.title;const f=s.messages.find(m=>m.r==="user");return f?f.t.slice(0,50):s.title}

/* ============================================================
   Sidebar
   ============================================================ */

function openSidebar(){sidebar.classList.add("open");sidebarOverlay.classList.add("open");renderSessionList()}
function closeSidebar(){sidebar.classList.remove("open");sidebarOverlay.classList.remove("open")}

function dateGroup(ts){
    const now=new Date(),d=new Date(ts),diff=Math.floor((now-d)/(1000*60*60*24));
    if(now.toDateString()===d.toDateString())return "Today";
    if(diff===1)return "Yesterday";
    if(diff<7)return "Previous 7 days";
    if(diff<30)return "Previous 30 days";
    return d.toLocaleDateString(undefined,{month:"long",year:"numeric"});
}

function renderSessionList(){
    const q=(sidebarSearch.value||"").toLowerCase();
    const filtered=q?sessions.filter(s=>sessionTitle(s).toLowerCase().includes(q)):sessions;
    if(!filtered.length){sessionList.innerHTML='<div class="sidebar-empty">'+(q?"No chats found":"No chats yet")+'</div>';return}
    let html="",lastGroup="";
    for(const s of filtered){
        const g=dateGroup(s.created);
        if(g!==lastGroup){html+='<div class="session-date-group">'+g+"</div>";lastGroup=g}
        const active=s.id===activeSessionId;
        html+='<div class="session-item'+(active?" active":'')+'" data-id="'+s.id+'">' +
            '<span class="session-item-title">'+escapeHtml(sessionTitle(s))+'</span>' +
            '<button class="session-delete" data-del="'+s.id+'" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>';
    }
    sessionList.innerHTML=html;
}

/* ============================================================
   Model Switcher
   ============================================================ */

function renderModelDropdown(){
    if(!models.length){
        modelDropdown.innerHTML='<button type="button" class="model-option active" data-model="Mango-Light"><span class="model-option-dot" style="background:var(--accent)"></span><div class="model-option-info"><div>Mango-Light</div><div class="model-option-desc">Default model</div></div><span class="model-option-check"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span></button>';
        return;
    }
    modelDropdown.innerHTML=models.map(m=>{
        const a=m.name===currentModel;
        return '<button type="button" class="model-option'+(a?" active":'"')+' data-model="'+escapeHtml(m.name)+'"><span class="model-option-dot" style="background:'+(m.color||"var(--accent)")+'"></span><div class="model-option-info"><div>'+escapeHtml(m.name)+'</div>'+(m.desc?'<div class="model-option-desc">'+escapeHtml(m.desc)+'</div>':"")+'</div><span class="model-option-check"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span></button>';
    }).join("");
}

function toggleModelDropdown(){const o=modelDropdown.classList.toggle("open");modelTrigger.classList.toggle("open",o);if(o)renderModelDropdown()}
function closeModelDropdown(){modelDropdown.classList.remove("open");modelTrigger.classList.remove("open")}

async function switchModel(name){
    if(name===currentModel){closeModelDropdown();return}
    currentModel=name; modelLabel.textContent=name;
    try{localStorage.setItem("lemango_model",name)}catch{}
    closeModelDropdown();
    try{const r=await fetch("/api/ai/switch_model",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:name})});showToast("Switched to "+name)}catch{showToast("Model set to "+name)}
}

async function fetchModels(){try{const list=await window.LemangoAI.models();if(Array.isArray(list)&&list.length){models=list;if(!models.find(m=>m.name===currentModel)){currentModel=models[0].name;modelLabel.textContent=currentModel}renderModelDropdown()}}catch{}}

/* ============================================================
   Toast
   ============================================================ */

function showToast(msg){toastEl.textContent=msg;toastEl.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove("show"),2200)}

/* ============================================================
   Messages
   ============================================================ */

function updateRightPanel(){if(rightPanel)rightPanel.classList.toggle("hidden",welcomeRemoved||history.length>0)}
function removeWelcome(){if(!welcomeRemoved){const w=chatContainer.querySelector(".welcome-message");if(w)w.remove();welcomeRemoved=true;updateRightPanel()}}

function getTimestamp(){const n=new Date();let h=n.getHours(),m=n.getMinutes();return(h%12||12)+":"+(m<10?"0":"")+m+(h>=12?"PM":"AM")}

function renderMessage(text,sender,save=true){
    removeWelcome();
    const msg=document.createElement("div"); msg.className="message "+sender;

    const inner=document.createElement("div"); inner.className="message-inner";

    if(sender==="bot"){
        const av=document.createElement("div"); av.className="message-avatar"; av.textContent="L";
        inner.appendChild(av);
    }

    const content=document.createElement("div"); content.className="message-content";

    const bubble=document.createElement("div"); bubble.className="message-bubble markdown-body";
    bubble.innerHTML=sender==="bot"?mdToHtml(text):""; if(sender!=="bot")bubble.textContent=text;

    content.appendChild(bubble);

    const ts=document.createElement("div"); ts.className="message-timestamp"; ts.textContent=getTimestamp();
    content.appendChild(ts);

    const actions=document.createElement("div"); actions.className="feedback-buttons always-show-copy";
    const copyBtn=document.createElement("button"); copyBtn.type="button"; copyBtn.className="feedback-btn"; copyBtn.textContent="Copy"; copyBtn.title="Copy";
    copyBtn.onclick=function(){copyText(text,this)}; actions.appendChild(copyBtn);

    if(sender==="bot"){
        const fb=document.createElement("div"); fb.className="feedback-buttons";
        const up=document.createElement("button"); up.type="button"; up.className="feedback-btn"; up.innerHTML="&#128077;"; up.title="Good";
        up.onclick=function(){rateResponse(true,fb)};
        const dn=document.createElement("button"); dn.type="button"; dn.className="feedback-btn"; dn.innerHTML="&#128078;"; dn.title="Bad";
        dn.onclick=function(){rateResponse(false,fb)};
        fb.appendChild(up); fb.appendChild(dn); content.appendChild(fb);
    }

    content.appendChild(actions);
    inner.appendChild(content);
    msg.appendChild(inner);
    chatContainer.appendChild(msg);

    if(save){history.push({r:sender,t:text});saveSessions();updateSessionTitle()}
    requestAnimationFrame(()=>{chatContainer.scrollTop=chatContainer.scrollHeight;updateScrollPill()});
    return msg;
}

function addMessage(text,sender){renderMessage(text,sender);updateRegenVisibility()}

function updateSessionTitle(){const s=sessions.find(x=>x.id===activeSessionId);if(s&&history.length){const f=history.find(m=>m.r==="user");if(f)s.title=f.t.slice(0,50);saveSessions()}}

async function copyText(text,btn){try{await navigator.clipboard.writeText(text);const o=btn.textContent;btn.textContent="Copied!";setTimeout(()=>btn.textContent=o,1500)}catch{}}

async function rateResponse(positive,fb){try{await fetch("/api/ai/rate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({positive})});fb.innerHTML=positive?'<span class="rated positive">Thanks!</span>':'<span class="rated negative">Noted!</span>'}catch{fb.innerHTML='<span class="rated">Failed</span>'}}

/* ============================================================
   Typing
   ============================================================ */

function showTyping(){
    removeWelcome();
    const msg=document.createElement("div"); msg.className="message bot"; msg.id="typing";
    const inner=document.createElement("div"); inner.className="message-inner";
    const av=document.createElement("div"); av.className="message-avatar"; av.textContent="L";
    const content=document.createElement("div"); content.className="message-content";
    const row=document.createElement("div"); row.style.display="flex"; row.style.alignItems="center";
    const ind=document.createElement("div"); ind.className="typing-indicator"; ind.innerHTML="<span></span><span></span><span></span>";
    const lb=document.createElement("span"); lb.className="typing-label"; lb.textContent=botName+" is typing...";
    row.appendChild(ind); row.appendChild(lb); content.appendChild(row);
    inner.appendChild(av); inner.appendChild(content); msg.appendChild(inner);
    chatContainer.appendChild(msg); chatContainer.scrollTop=chatContainer.scrollHeight;
}

function removeTyping(){const el=document.getElementById("typing");if(el)el.remove()}

/* ============================================================
   Send / Regenerate
   ============================================================ */

function updateSendState(){sendBtn.disabled=sending||!messageInput.value.trim()}

async function sendMessage(text,displayUser=true){
    if(!text.trim())return;
    sending=true;updateSendState();updateRegenVisibility();
    if(displayUser)addMessage(text,"user");
    messageInput.value="";autoResizeInput();showTyping();
    try{const historyPayload=history.map(m=>({role:m.r==="user"?"user":"assistant",content:m.t}));const reply=await window.LemangoAI.chat({message:text,model:currentModel,history:historyPayload,count:displayUser});removeTyping();addMessage(reply,"bot")}
    catch(err){removeTyping();if(err&&err.code==="daily-limit"){addMessage(err.message||"You've reached the Lemango AI beta limit of 4 questions per day. Please come back tomorrow!","bot")}else{addMessage("Connection error. Please try again.","bot")}}
    sending=false;updateSendState();updateRegenVisibility();messageInput.focus();
}

function updateRegenVisibility(){regenBtn.classList.toggle("hidden",sending||!history.length||history[history.length-1].r!=="bot")}

async function regenerateLast(){
    if(sending||!history.length||history[history.length-1].r!=="bot")return;
    let lastUser=null; for(let i=history.length-2;i>=0;i--){if(history[i].r==="user"){lastUser=history[i].t;break}}
    if(!lastUser)return;
    history.pop();saveSessions();
    const bots=chatContainer.querySelectorAll(".message.bot:not(#typing)");const last=bots[bots.length-1];if(last)last.remove();
    updateRegenVisibility();await sendMessage(lastUser,false);
}

/* ============================================================
   Export / Clear / Welcome
   ============================================================ */

function exportChat(){try{const s=sessions.find(x=>x.id===activeSessionId);const msgs=(s&&s.messages)||history||[];const out=msgs.map(m=>(m.r==="user"?"You":botName)+": "+m.t).join("\n\n")||"(empty chat)";const blob=new Blob([out],{type:"text/plain;charset=utf-8"});const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download="lemango_ai_chat.txt";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u)}catch{alert("Failed to export chat.")}}

const STARTER_PROMPTS=["Tell me a fun fact","What can you do?","Tell me a joke","Explain AI like I'm five"];

function buildWelcome(){
    welcomeRemoved=false;
    const w=document.createElement("div");w.className="welcome-message";
    w.innerHTML="<h2>What can I help with?</h2>"+
        '<p class="welcome-hint">Ask me anything, or try one of these:</p>';
    const chips=document.createElement("div");chips.className="starter-chips";chips.id="starterChips";
    STARTER_PROMPTS.forEach(p=>{const c=document.createElement("button");c.type="button";c.className="starter-chip";c.textContent=p;c.onclick=()=>sendMessage(p);chips.appendChild(c)});
    w.appendChild(chips);return w;
}

async function clearChat(){
    try{await fetch("/api/ai/clear",{method:"POST"})}catch{}
    history=[];const s=sessions.find(x=>x.id===activeSessionId);
    if(s){s.messages=[];s.title="New chat";saveSessions()}
    chatContainer.innerHTML="";chatContainer.appendChild(buildWelcome());
    updateRegenVisibility();updateScrollPill();renderSessionList();updateRightPanel();
}

/* ============================================================
   Scroll / Input / Theme
   ============================================================ */

function isNearBottom(){return chatContainer.scrollHeight-chatContainer.scrollTop-chatContainer.clientHeight<120}
function updateScrollPill(){scrollDownBtn.classList.toggle("visible",history.length>0&&!isNearBottom())}
function scrollToBottom(sm){chatContainer.scrollTo({top:chatContainer.scrollHeight,behavior:sm?"smooth":"auto"})}
function autoResizeInput(){messageInput.style.height="auto";messageInput.style.height=Math.min(messageInput.scrollHeight,160)+"px"}
function applyTheme(t){document.body.classList.toggle("dark",t==="dark");try{localStorage.setItem(THEME_KEY,t)}catch{}}
function toggleTheme(){applyTheme(document.body.classList.contains("dark")?"light":"dark")}

/* ============================================================
   Events
   ============================================================ */

const chatForm=document.getElementById("chatContainer").closest(".app").querySelector("form")||document.querySelector("form");
const inputWrapper=document.querySelector(".input-wrapper");

document.addEventListener("submit",e=>{if(e.target===chatForm||e.target.closest(".input-area")){e.preventDefault();sendMessage(messageInput.value)}});

inputWrapper.addEventListener("submit",e=>{e.preventDefault()});

messageInput.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage(messageInput.value)}});
messageInput.addEventListener("input",()=>{autoResizeInput();updateSendState()});
chatContainer.addEventListener("scroll",updateScrollPill);
chatContainer.addEventListener("click",e=>{const b=e.target.closest(".code-copy-btn");if(b)copyText(decodeURIComponent(b.dataset.code),b)});

sendBtn.addEventListener("click",()=>sendMessage(messageInput.value));

sidebarToggle.addEventListener("click",openSidebar);
sidebarClose.addEventListener("click",closeSidebar);
sidebarOverlay.addEventListener("click",closeSidebar);

newChatBtn.addEventListener("click",()=>{const s=createSession();history=s.messages;welcomeRemoved=false;rebuildChat();updateRegenVisibility();updateScrollPill();closeSidebar()});
sidebarSearch.addEventListener("input",()=>renderSessionList());
sessionList.addEventListener("click",e=>{const d=e.target.closest(".session-delete");if(d){e.stopPropagation();deleteSession(d.dataset.del);return}const i=e.target.closest(".session-item");if(i)switchSession(i.dataset.id)});

document.getElementById("themeToggle").addEventListener("click",toggleTheme);

modelTrigger.addEventListener("click",e=>{e.stopPropagation();toggleModelDropdown()});
modelDropdown.addEventListener("click",e=>{const o=e.target.closest(".model-option");if(o)switchModel(o.dataset.model)});
document.addEventListener("click",e=>{if(!modelDropdown.contains(e.target)&&!modelTrigger.contains(e.target))closeModelDropdown()});

/* ============================================================
   Init
   ============================================================ */

(function init(){
    let t=null;try{t=localStorage.getItem(THEME_KEY)}catch{}
    if(!t)t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
    applyTheme(t);
    rebuildChat();autoResizeInput();updateSendState();updateRegenVisibility();
    modelLabel.textContent=currentModel;fetchModels();
})();
