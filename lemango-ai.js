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

    var SYSTEM =
        "You are " + BRAND + ", a helpful assistant created by Lemango. " +
        "Always identify yourself as " + BRAND + ". Never mention, name, or hint at any " +
        "underlying model, company, or provider. If asked what model or system you are, " +
        "say that you are " + BRAND + ". If asked who made, created, founded, built, or owns " +
        "you, reply exactly: \"" + FOUNDERS + "\". Be accurate, friendly, and concise.";

    var LEGAL_SYSTEM =
        "You are the " + BRAND + " document assistant for NUCA (National Universal Court) " +
        "case and notice management, provided by Lemango. Draft professional, formal legal " +
        "documents. Always refer to yourself as " + BRAND + " and never mention any underlying " +
        "model or provider. If asked who made, created, founded, built, or owns you, reply " +
        "exactly: \"" + FOUNDERS + "\". Return plain text only: write section headings in " +
        "UPPERCASE on their own line, body paragraphs below them, and finish with a " +
        "signature block.";

    /* ---- Beta daily question limit (per browser, per day) ---- */
    var DAILY_LIMIT = 4;
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
        var usage = readUsage();
        return {
            date: usage.date,
            count: usage.count,
            limit: DAILY_LIMIT,
            remaining: Math.max(0, DAILY_LIMIT - usage.count)
        };
    }

    function recordUse() {
        var usage = readUsage();
        usage.count += 1;
        writeUsage(usage);
        return limitInfo();
    }

    function limitReached() {
        var err = new Error(
            "You've reached the Lemango AI beta limit of " + DAILY_LIMIT +
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
        { name: "Mango-Pro", desc: "Stronger reasoning", color: "#8b5cf6" }
    ];

    var PUBLIC_ENDPOINT = "https://text.pollinations.ai/openai";
    var PUBLIC_MODEL = "openai";

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
        return out.slice(-21);
    }

    async function viaBackend(path, body, pick) {
        var res = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        var ct = res.headers.get("content-type") || "";
        if (ct.indexOf("application/json") === -1) throw new Error("backend-unavailable");
        var data = await res.json();
        if (!res.ok || (data && data.ok === false)) throw new Error((data && data.error) || "backend-error");
        var text = pick(data);
        if (!text || !String(text).trim()) throw new Error("backend-empty");
        return String(text).trim();
    }

    async function viaPublic(messages) {
        try {
            var res = await fetch(PUBLIC_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: PUBLIC_MODEL, messages: messages, private: true })
            });
            if (res.ok) {
                var data = await res.json();
                var text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
                if (text && String(text).trim()) return String(text).trim();
            }
        } catch (e) { /* try the simpler endpoint below */ }
        return viaPublicSimple(messages);
    }

    // Plain-text keyless endpoint, used if the chat-completions call fails.
    async function viaPublicSimple(messages) {
        var system = "";
        var lastUser = "";
        for (var i = 0; i < messages.length; i++) {
            var m = messages[i];
            if (m.role === "system") system += (system ? " " : "") + m.content;
            else if (m.role === "user") lastUser = m.content;
        }
        var url = "https://text.pollinations.ai/" + encodeURIComponent(lastUser) + "?model=" + PUBLIC_MODEL;
        if (system) url += "&system=" + encodeURIComponent(system);
        var res = await fetch(url);
        if (!res.ok) throw new Error("public " + res.status);
        var text = await res.text();
        if (!text || !text.trim()) throw new Error("public-empty");
        return text.trim();
    }

    async function chat(opts) {
        opts = opts || {};
        var counts = opts.count !== false;
        if (counts) {
            if (limitInfo().remaining <= 0) throw limitReached();
            recordUse();
        }
        try {
            return await viaBackend(
                "/api/ai/chat",
                { message: opts.message, model: opts.model, history: opts.history },
                function (d) { return d.response || d.reply; }
            );
        } catch (err) { /* fall back to the keyless public provider */ }
        return viaPublic(buildMessages(opts.history, opts.message, SYSTEM));
    }

    async function document(opts) {
        opts = opts || {};
        var prompt = String(opts.prompt == null ? "" : opts.prompt).trim();
        try {
            return await viaBackend(
                "/api/ai/generate-document",
                { prompt: prompt, model: opts.model },
                function (d) { return d.text || d.response; }
            );
        } catch (e) { /* fall through */ }
        return viaPublic([
            { role: "system", content: SYSTEM + "\n" + LEGAL_SYSTEM },
            { role: "user", content: "Create a legal document based on this request: " + prompt }
        ]);
    }

    async function models() {
        try {
            var res = await fetch("/api/ai/models");
            var ct = res.headers.get("content-type") || "";
            if (res.ok && ct.indexOf("application/json") !== -1) {
                var d = await res.json();
                if (d && Array.isArray(d.models) && d.models.length) return d.models;
            }
        } catch (e) { /* ignore */ }
        return MODELS;
    }

    window.LemangoAI = {
        BRAND: BRAND,
        MODELS: MODELS,
        DAILY_LIMIT: DAILY_LIMIT,
        limitInfo: limitInfo,
        chat: chat,
        document: document,
        models: models
    };
})();
