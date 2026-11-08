/**
 * Lemango Debug Server
 * 
 * A zero-config local server for testing and debugging the Lemango site.
 * 
 * Features:
 * - Serves all static files from the project root
 * - Auto-reloads the page when any file changes (injected WebSocket)
 * - Bypasses auth entirely — no sign-in needed, all users are "signed in"
 * - Unlocks all AI features — no daily limits, coding always allowed
 * - Proxies /api/* to the real backend (or mocks responses if backend is down)
 * - No rate limiting, no security restrictions — pure debug mode
 * 
 * Usage:  node Debug/server.js
 * Then open http://localhost:4000 in your browser.
 */

import http from "node:http";
import { readFileSync, watchFile, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = 4000;
const BACKEND_URL = "https://lemango-org.onrender.com";

// MIME types
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "text/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "text/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".map": "application/json",
  ".wasm": "application/wasm",
};

// WebSocket connections for auto-reload
const clients = new Set();

// Mock auth user (injected into pages)
const MOCK_USER = {
  googleId: "debug-user",
  email: "debug@lemango.local",
  name: "Debug User",
  given_name: "Debug",
  picture: "",
  avatar: "",
  idToken: "debug-mode-no-token-needed"
};

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

// Try to serve a file, return false if not found
function serveFile(req, res, filePath) {
  if (!existsSync(filePath)) return false;
  const stat = statSync(filePath);
  if (stat.isDirectory()) return false;
  
  try {
    const data = readFileSync(filePath);
    let contentType = getMime(filePath);
    
    // Inject debug helpers into HTML pages
    if (filePath.endsWith(".html")) {
      let html = data.toString("utf-8");
      html = injectDebugScript(html);
      return res.writeHead(200, { "Content-Type": contentType }).end(html), true;
    }
    
    // Inject mock auth into lemango-auth.js
    if (filePath.endsWith("lemango-auth.js")) {
      let js = data.toString("utf-8");
      js = patchAuthScript(js);
      return res.writeHead(200, { "Content-Type": contentType }).end(js), true;
    }
    
    // Patch lemango-ai.js to unlock all features
    if (filePath.endsWith("lemango-ai.js")) {
      let js = data.toString("utf-8");
      js = patchAIScript(js);
      return res.writeHead(200, { "Content-Type": contentType }).end(js), true;
    }
    
    // Patch api-base.js to use localhost for /api in debug mode
    if (filePath.endsWith("api-base.js")) {
      let js = data.toString("utf-8");
      // Keep the real backend URL — we proxy through this server
      js = js.replace(
        /const base = \(\(meta && meta\.content\) \|\| window\.LEMANGO_API_BASE \|\| ""\)\.trim\(\)\.replace\(\/\\\+\$\/, ""\);/,
        'const base = ""; // Debug: keep /api relative, this server proxies to backend'
      );
      return res.writeHead(200, { "Content-Type": contentType }).end(js), true;
    }
    
    res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-cache" });
    res.end(data);
    return true;
  } catch (e) {
    return false;
  }
}

// Inject auto-reload + debug script into HTML
function injectDebugScript(html) {
  const debugScript = `
<script>
// ===== LEMANGO DEBUG MODE =====
window.LEMANGO_DEBUG = true;
window.LEMANGO_AUTH_BYPASS = true;

// Auto-inject mock user so everything thinks we're signed in
try {
  if (!localStorage.getItem("lemango_user")) {
    localStorage.setItem("lemango_user", JSON.stringify({
      googleId: "debug-user",
      email: "debug@lemango.local",
      name: "Debug User",
      given_name: "Debug",
      picture: "",
      avatar: "",
      idToken: "debug-mode-no-token-needed"
    }));
  }
} catch (e) {}

// Override LemangoAuth to always report signed in
if (window.LemangoAuth) {
  window.LemangoAuth.user = window.LemangoAuth.user || JSON.parse(localStorage.getItem("lemango_user") || "null");
  window.LemangoAuth.isSignedIn = function() { return true; };
}

// Auto-reload WebSocket
(function() {
  var ws;
  function connect() {
    ws = new WebSocket("ws://" + location.host + "/__reload");
    ws.onmessage = function(e) {
      if (e.data === "reload") {
        console.log("%c[Debug] File changed — reloading...", "color:#ff9d3a;font-weight:bold");
        setTimeout(function() { location.reload(); }, 300);
      }
    };
    ws.onclose = function() { setTimeout(connect, 2000); };
    ws.onerror = function() { ws.close(); };
  }
  connect();
})();

console.log("%c Lemango Debug Mode ", "background: linear-gradient(135deg, #ff9d3a, #ff6b1a); color: #1a0e00; font-weight: bold; padding: 4px 8px; border-radius: 4px;", "Auth bypassed | All features unlocked | Auto-reload ON");
</script>`;
  
  // Insert right after <head> or at the start
  if (html.includes("<head>")) {
    return html.replace("<head>", "<head>" + debugScript);
  }
  return debugScript + html;
}

// Patch lemango-auth.js for debug mode
function patchAuthScript(js) {
  // Force user to be set from localStorage mock
  const debugPatch = `
// ===== DEBUG MODE PATCH =====
if (window.LEMANGO_AUTH_BYPASS) {
  try {
    var mockUser = JSON.parse(localStorage.getItem("lemango_user") || "null");
    if (mockUser) LemangoAuth.user = mockUser;
  } catch (e) {}
  LemangoAuth.isSignedIn = function() { return true; };
}
`;
  // Insert before the final IIFE close
  return js.replace("})();", debugPatch + "\n})();");
}

// Patch lemango-ai.js for debug mode
function patchAIScript(js) {
  const debugPatch = `
// ===== DEBUG MODE PATCH =====
if (window.LEMANGO_DEBUG) {
  isSignedIn = function() { return true; };
  isUnlimited = function() { return true; };
  hasAgents = function() { return true; };
  dailyLimit = function() { return 999999; };
  DAILY_LIMIT = 999999;
}
`;
  return js.replace("window.LemangoAI", debugPatch + "\nwindow.LemangoAI");
}

// Proxy /api/* to the real backend or mock it
async function proxyApi(req, res, pathname, body) {
  const targetUrl = BACKEND_URL + pathname;
  
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000); // 2 min for big requests
    
    const fetchRes = await fetch(targetUrl, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: req.method !== "GET" ? body : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    
    const contentType = fetchRes.headers.get("content-type") || "application/json";
    const text = await fetchRes.text();
    
    // If backend returned an error or is down, mock common endpoints
    if (!fetchRes.ok) {
      const mocked = mockApiEndpoint(pathname, body);
      if (mocked !== null) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(mocked));
        return;
      }
    }
    
    res.writeHead(fetchRes.status, { "Content-Type": contentType });
    res.end(text);
  } catch (e) {
    // Backend unreachable — try mock
    const mocked = mockApiEndpoint(pathname, body);
    if (mocked !== null) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(mocked));
      return;
    }
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Backend unreachable in debug mode: " + e.message }));
  }
}

// Mock API responses for when the real backend is down
function mockApiEndpoint(pathname, body) {
  // Auth: always return signed in
  if (pathname === "/api/auth/me") {
    return { ok: true, user: MOCK_USER };
  }
  
  // AI models
  if (pathname === "/api/ai/models") {
    return {
      ok: true,
      models: [
        { name: "Mango-Light", desc: "Fast, everyday answers", color: "#f59e0b" },
        { name: "Mango-Flash", desc: "Snappy and efficient", color: "#22c55e" },
        { name: "Mango-Core", desc: "Balanced for most tasks", color: "#3b82f6" },
        { name: "Mango-Pro", desc: "Stronger reasoning", color: "#8b5cf6" },
        { name: "Mango-Ultra", desc: "Deep reasoning", color: "#ec4899" },
      ]
    };
  }
  
  // AI status
  if (pathname === "/api/ai/status") {
    return { ok: true, configured: true, provider: "Lemango AI (Debug)" };
  }
  
  // AI chat — proxy to public provider if backend is down
  if (pathname === "/api/ai/chat") {
    return null; // Let the frontend handle via its own fallback
  }
  
  // Rate / log — always succeed
  if (pathname === "/api/ai/rate" || pathname === "/api/ai/log") {
    return { ok: true };
  }
  
  // Newsletter
  if (pathname === "/api/newsletter/subscribe") {
    return { ok: true, message: "Subscribed (debug mode)" };
  }
  
  return null; // No mock available
}

// File watching for auto-reload
const watchedDirs = ["", "ai", "auth", "workspace", "assets", "admin", "court", "fastpay", "faq", "terms", "privacy", "security", "status", "changelog", "business-ideas", "invite", "paid", "payment-complete", "payments"];

function watchFiles() {
  let reloadTimer = null;
  
  function triggerReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      for (const ws of clients) {
        try { ws.send("reload"); } catch (e) {}
      }
    }, 200); // Debounce rapid saves
  }
  
  const extensions = [".html", ".js", ".css", ".json", ".svg", ".png", ".jpg", ".webp"];
  
  function watchDir(dir) {
    const fullPath = path.join(ROOT, dir);
    if (!existsSync(fullPath)) return;
    try {
      const entries = readdirSync(fullPath);
      for (const entry of entries) {
        const filePath = path.join(fullPath, entry);
        try {
          const stat = statSync(filePath);
          if (stat.isDirectory()) continue; // Only top-level + known dirs
          const ext = path.extname(entry).toLowerCase();
          if (extensions.includes(ext)) {
            watchFile(filePath, { interval: 500 }, triggerReload);
          }
        } catch (e) {}
      }
    } catch (e) {}
  }
  
  // Watch root files
  const rootFiles = readdirSync(ROOT);
  for (const f of rootFiles) {
    const fp = path.join(ROOT, f);
    try {
      const stat = statSync(fp);
      if (stat.isFile()) {
        const ext = path.extname(f).toLowerCase();
        if (extensions.includes(ext)) {
          watchFile(fp, { interval: 500 }, triggerReload);
        }
      }
    } catch (e) {}
  }
  
  // Watch subdirectories
  for (const dir of watchedDirs) {
    if (dir) watchDir(dir);
  }
  
  console.log("  Auto-reload: watching for file changes...");
}

// WebSocket upgrade handler
function handleWebSocket(req, socket) {
  if (req.url === "/__reload") {
    // Simple WebSocket handshake
    const key = req.headers["sec-websocket-key"];
    if (!key) { socket.destroy(); return; }
    
    const accept = Buffer.from(
      key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
    ).toString("base64");
    
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      "Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
    );
    
    clients.add(socket);
    
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
    
    // Send ping every 30s to keep alive
    const pingInterval = setInterval(() => {
      try {
        // WebSocket ping frame (opcode 0x9)
        socket.write(Buffer.from([0x89, 0x00]));
      } catch (e) {
        clearInterval(pingInterval);
        clients.delete(socket);
      }
    }, 30000);
    
    socket.on("close", () => clearInterval(pingInterval));
  } else {
    socket.destroy();
  }
}

// Main server
const server = http.createServer(async (req, res) => {
  // CORS for debug
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  
  let pathname = req.url.split("?")[0];
  
  // API proxy
  if (pathname.startsWith("/api/")) {
    let body = "";
    if (req.method !== "GET") {
      for await (const chunk of req) body += chunk;
    }
    return proxyApi(req, res, pathname, body);
  }
  
  // Manifest
  if (pathname === "/manifest.json") {
    return serveFile(req, res, path.join(ROOT, "manifest.json")) || 
           res.writeHead(404).end("Not found");
  }
  
  // Clean URLs: /ai/ → ai/index.html, /ai → ai/index.html
  if (pathname !== "/" && !pathname.includes(".")) {
    // Try /path/index.html first
    const indexPath = path.join(ROOT, pathname, "index.html");
    if (serveFile(req, res, indexPath)) return;
    // Try /path.html
    const htmlPath = path.join(ROOT, pathname.slice(1) + ".html");
    if (serveFile(req, res, htmlPath)) return;
  }
  
  // Root
  if (pathname === "/") {
    return serveFile(req, res, path.join(ROOT, "index.html")) || 
           res.writeHead(404).end("Not found");
  }
  
  // Static file
  const filePath = path.join(ROOT, pathname);
  if (serveFile(req, res, filePath)) return;
  
  // Try with .html extension
  if (!path.extname(pathname)) {
    const htmlFile = path.join(ROOT, pathname + ".html");
    if (serveFile(req, res, htmlFile)) return;
  }
  
  // 404
  res.writeHead(404, { "Content-Type": "text/html" });
  res.end("<h1>404 — Not Found</h1><p>In debug mode. File: " + pathname + "</p><p><a href="/">← Go home</a></p>");
});

// WebSocket upgrade
server.on("upgrade", handleWebSocket);

// Start
watchFiles();
server.listen(PORT, () => {
  console.log("");
  console.log("  ==========================================");
  console.log("   Lemango Debug Server");
  console.log("  ==========================================");
  console.log("");
  console.log("  URL:          http://localhost:" + PORT);
  console.log("  Auth:         BYPASSED (always signed in)");
  console.log("  AI limits:    UNLOCKED (unlimited)");
  console.log("  Auto-reload:  ON (page refreshes on file save)");
  console.log("  API proxy:    " + BACKEND_URL);
  console.log("");
  console.log("  Press Ctrl+C to stop.");
  console.log("");
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n  Debug server stopped.");
  process.exit(0);
});
