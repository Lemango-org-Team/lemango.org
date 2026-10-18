/*
 * Lemango AI — shared browser client.
 *
 * Tries the Lemango backend first (multi-provider + optional API keys), and
 * falls back to a free, keyless public provider so the assistant keeps working
 * on static hosting (e.g. GitHub Pages) where no Node backend is running.
 * Every response is branded "Lemango AI"; the underlying provider is hidden.
 */
(function () {
    "use strict";

    var BRAND = "Lemango AI";

    var FOUNDERS =
        "I was founded and primarily developed by Logan, known online as LoganNeedsFries, " +
        "who created the Lemangoes project, provided funding, and configured my core " +
        "infrastructure—including domain acquisition and Cloudflare security certification. " +
        "Kevin, known online as Kmoon, also contributed as a co-creator to the project.";

    var SYSTEM_BASE =
        "You are " + BRAND + ", a helpful assistant created by Lemango. " +
        "Always identify yourself as " + BRAND + ". Never mention, name, or hint at any " +
        "underlying model, company, or provider. If asked what model or system you are, " +
        "say that you are " + BRAND + ". If asked who made, created, founded, built, or owns " +
        "you, reply exactly: \"" + FOUNDERS + "\". Be accurate, friendly, and concise.";

    var NO_CODE_RULE =
        "IMPORTANT: The user is NOT signed in. You must NOT write, generate, or provide any " +
        "code, code snippets, scripts, or programming solutions. If the user asks you to code " +
        "or write code, politely decline and tell them to sign in with Google to unlock coding " +
        "help. You may still answer general questions, explain concepts, and help with writing.";

    function isSignedIn() {
        try {
            var raw = localStorage.getItem("lemango_user");
            if (raw) { var u = JSON.parse(raw); if (u && u.email) return true; }
        } catch (e) { /* ignore */ }
        return false;
    }

    function getIdToken() {
        try {
            var raw = localStorage.getItem("lemango_user");
            if (raw) { var u = JSON.parse(raw); if (u && u.idToken) return u.idToken; }
        } catch (e) { /* ignore */ }
        return null;
    }

    function systemPrompt() {
        return isSignedIn() ? SYSTEM_BASE : (SYSTEM_BASE + "\n" + NO_CODE_RULE);
    }

    function modelHint(model) {
        var hints = {
            "Mango-Light": "Keep your answer short and to the point.",
            "Mango-Flash": "Be quick and snappy.",
            "Mango-Core": "Give a balanced, helpful answer.",
            "Mango-Pro": "Think step by step and give a thorough answer.",
            "Mango-Ultra": "Reason deeply and provide a detailed, well-structured answer."
        };
        return hints[model] || "";
    }

    var SYSTEM = SYSTEM_BASE;

    var LEGAL_SYSTEM =
        "You are the " + BRAND + " document assistant for NUCA (National Universal Court) " +
        "case and notice management, provided by Lemango. Draft professional, formal legal " +
        "documents. Always refer to yourself as " + BRAND + " and never mention any underlying " +
        "model or provider. If asked who made, created, founded, built, or owns you, reply " +
        "exactly: \"" + FOUNDERS + "\". Return plain text only: write section headings in " +
        "UPPERCASE on their own line, body paragraphs below them, and finish with a " +
        "signature block.";

    /* ---- Beta daily question limit (per browser, per day) ---- */
    // Signed-in users get a higher daily limit as a perk.
    var UNLIMITED_EMAILS = ["kcrespo102512@gmail.com"];

    function isUnlimited() {
        try {
            var raw = localStorage.getItem("lemango_user");
            if (raw) {
                var u = JSON.parse(raw);
                if (u && u.email && UNLIMITED_EMAILS.indexOf(String(u.email).toLowerCase()) !== -1) return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    function dailyLimit() {
        if (isUnlimited()) return 999999;
        try {
            var raw = localStorage.getItem("lemango_user");
            if (raw) { var u = JSON.parse(raw); if (u && u.email) return 8; }
        } catch (e) { /* ignore */ }
        return 4;
    }
    var DAILY_LIMIT = dailyLimit();
    var USAGE_KEY = "lemango_ai_usage";

    function todayKey() {
        var d = new Date();
        var m = String(d.getMonth() + 1);
        var day = String(d.getDate());
        if (m.length < 2) m = "0" + m;
        if (day.length < 2) day = "0" + day;
        return d.getFullYear() + "-" + m + "-" + day;
    }

    function readUsage() {
        try {
            var raw = localStorage.getItem(USAGE_KEY);
            var data = raw ? JSON.parse(raw) : null;
            if (!data || data.date !== todayKey() || typeof data.count !== "number") {
                return { date: todayKey(), count: 0 };
            }
            return data;
        } catch (e) {
            return { date: todayKey(), count: 0 };
        }
    }

    function writeUsage(usage) {
        try { localStorage.setItem(USAGE_KEY, JSON.stringify(usage)); } catch (e) { /* ignore */ }
    }

    function limitInfo() {
        var limit = dailyLimit();
        var usage = readUsage();
        return {
            date: usage.date,
            count: usage.count,
            limit: limit,
            remaining: Math.max(0, limit - usage.count)
        };
    }

    function recordUse() {
        var usage = readUsage();
        usage.count += 1;
        writeUsage(usage);
        return limitInfo();
    }

    function limitReached() {
        var limit = dailyLimit();
        var err = new Error(
            "You've reached the Lemango AI beta limit of " + limit +
            " questions per day. Please come back tomorrow!"
        );
        err.code = "daily-limit";
        err.info = limitInfo();
        return err;
    }

    var MODELS = [
        { name: "Mango-Light", desc: "Fast, everyday answers", color: "#f59e0b" },
        { name: "Mango-Flash", desc: "Snappy and efficient", color: "#22c55e" },
        { name: "Mango-Core", desc: "Balanced for most tasks", color: "#3b82f6" },
        { name: "Mango-Pro", desc: "Stronger reasoning", color: "#8b5cf6" },
        { name: "Mango-Ultra", desc: "1M context, deep reasoning", color: "#ec4899" }
    ];

    var PUBLIC_ENDPOINT = "https://text.pollinations.ai/openai";
    var PUBLIC_MODEL = "openai";
    // Map branded models to free public provider models so switching works on static hosting.
    var PUBLIC_MODELS = {
        "Mango-Light": "openai",
        "Mango-Flash": "mistral",
        "Mango-Core": "openai",
        "Mango-Pro": "openai",
        "Mango-Ultra": "openai"
    };

    function buildMessages(history, message, system) {
        var out = [{ role: "system", content: system }];
        if (Array.isArray(history)) {
            for (var i = 0; i < history.length; i++) {
                var m = history[i];
                if (!m) continue;
                var role = m.role || (m.r === "user" ? "user" : m.r === "assistant" ? "assistant" : null);
                var content = m.content != null ? m.content : m.t;
                if ((role === "user" || role === "assistant") && content) {
                    out.push({ role: role, content: String(content) });
                }
            }
        }
        var text = String(message == null ? "" : message).trim();
        var last = out[out.length - 1];
        if (text && (!last || last.role !== "user" || String(last.content).trim() !== text)) {
            out.push({ role: "user", content: text });
        }
        if (out.length <= 21) return out;
        return [out[0]].concat(out.slice(-20));
    }

    async function viaBackend(path, body, pick) {
        var data = await viaBackendRaw(path, body);
        var text = pick(data);
        if (!text || !String(text).trim()) throw new Error("backend-empty");
        return String(text).trim();
    }

    async function viaBackendRaw(path, body) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 25000);
          try {
              var res = await fetch(path, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                  signal: controller.signal
              });
              var ct = res.headers.get("content-type") || "";
              if (ct.indexOf("application/json") === -1) throw new Error("backend-unavailable");
              var data = await res.json();
              if (!res.ok || (data && data.ok === false)) throw new Error((data && data.error) || "backend-error");
              return data;
          } finally {
              clearTimeout(timer);
          }
      }

    async function viaPublic(messages, model) {
        var pubModel = (model && PUBLIC_MODELS[model]) || PUBLIC_MODEL;
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 25000);
        try {
            var res = await fetch(PUBLIC_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: pubModel, messages: messages, private: true }),
                signal: controller.signal
            });
            if (res.ok) {
                var data = await res.json();
                var text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
                if (text && String(text).trim()) { clearTimeout(timer); return String(text).trim(); }
            }
        } catch (e) { /* try the simpler endpoint below */ } finally {
            clearTimeout(timer);
        }
        return viaPublicSimple(messages, model);
    }

    // Plain-text keyless endpoint, used if the chat-completions call fails.
    async function viaPublicSimple(messages, model) {
        var pubModel = (model && PUBLIC_MODELS[model]) || PUBLIC_MODEL;
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 25000);
        var system = "";
        var lastUser = "";
        for (var i = 0; i < messages.length; i++) {
            var m = messages[i];
            if (m.role === "system") system += (system ? " " : "") + m.content;
            else if (m.role === "user") lastUser = m.content;
        }
        var url = "https://text.pollinations.ai/" + encodeURIComponent(lastUser) + "?model=" + pubModel;
        if (system) url += "&system=" + encodeURIComponent(system);
        try {
            var res = await fetch(url, { signal: controller.signal });
            if (!res.ok) throw new Error("public " + res.status);
            var text = await res.text();
            if (!text || !text.trim()) throw new Error("public-empty");
            return text.trim();
        } finally {
            clearTimeout(timer);
        }
    }

    async function chat(opts) {
        opts = opts || {};
        var counts = opts.count !== false;
        if (counts && !isUnlimited()) {
            if (limitInfo().remaining <= 0) throw limitReached();
            recordUse();
        }
        try {
            var data = await viaBackendRaw(
                "/api/ai/chat",
                { message: opts.message, model: opts.model, history: opts.history, idToken: getIdToken(), signedIn: isSignedIn(), systemHint: modelHint(opts.model) }
            );
            var text = (data && (data.response || data.reply)) || "";
            if (!text || !String(text).trim()) throw new Error("backend-empty");
            return { text: String(text).trim(), reasoning: (data && data.reasoning) ? String(data.reasoning).trim() : null };
        } catch (err) { /* fall back to the keyless public provider */ }
        var hint = modelHint(opts.model);
        var sys = systemPrompt() + (hint ? ("\n" + hint) : "");
        return { text: await viaPublic(buildMessages(opts.history, opts.message, sys), opts.model), reasoning: null };
    }

    async function document(opts) {
        opts = opts || {};
        var prompt = String(opts.prompt == null ? "" : opts.prompt).trim();
        try {
            var data = await viaBackendRaw(
                "/api/ai/generate-document",
                { prompt: prompt, model: opts.model }
            );
            var text = (data && (data.text || data.response)) || "";
            if (!text || !String(text).trim()) throw new Error("backend-empty");
            return { text: String(text).trim(), reasoning: (data && data.reasoning) ? String(data.reasoning).trim() : null };
        } catch (e) { /* fall through */ }
        return { text: await viaPublic([
            { role: "system", content: SYSTEM + "\n" + LEGAL_SYSTEM },
            { role: "user", content: "Create a legal document based on this request: " + prompt }
        ]), reasoning: null };
    }

    async function models() {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 10000);
        try {
            var res = await fetch("/api/ai/models", { signal: controller.signal });
            var ct = res.headers.get("content-type") || "";
            if (res.ok && ct.indexOf("application/json") !== -1) {
                var d = await res.json();
                if (d && Array.isArray(d.models) && d.models.length) { clearTimeout(timer); return d.models; }
            }
        } catch (e) { /* ignore */ } finally {
            clearTimeout(timer);
        }
        return MODELS;
    }

    window.LemangoAI = {
        BRAND: BRAND,
        MODELS: MODELS,
        DAILY_LIMIT: dailyLimit(),
        dailyLimit: dailyLimit,
        limitInfo: limitInfo,
        chat: chat,
        document: document,
        models: models
    };
})();
