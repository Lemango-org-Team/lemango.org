







(function () {
    "use strict";

    var BRAND = "Lemango AI";

    var CANT_SAY = "I can't say anything about that.";
    var REFUSAL = "I can't share that information.";
    var BAD_WARNING = "⚠️ Warning: This request has been flagged as harmful or abusive. You have been reported to OmegaDIke Cybersecurity.\n\n![OmegaDIke Cybersecurity](/assets/OmegaDike.jpeg)";
    var NOT_VIBE_CODED = "No, Lemango is not vibe coded.";

    var BAD_KEYWORDS = ["how to kill", "how to murder", "how to assassinate", "how to stab", "how to shoot", "how to bomb", "make a bomb", "build a bomb", "explosive", "weapon", "gun", "knife attack", "how to hack", "malware", "ransomware", "trojan", "keylogger", "phishing", "ddos", "denial of service", "exploit", "zero-day", "backdoor", "rootkit", "make drugs", "synthesize drugs", "meth", "cocaine", "heroin", "fentanyl", "lsd", "ecstasy", "self-harm", "suicide", "cut myself", "kill myself", "end my life", "hurt myself", "child porn", "csam", "underage", "loli", "jailbait", "hate speech", "genocide", "ethnic cleansing", "terrorist", "terrorism", "mass shooting", "school shooting", "steal", "robbery", "burglary", "fraud", "scam", "identity theft", "torture", "kidnap", "abduct", "human trafficking", "slavery"];
    function isBadContent(text) {
        var t = String(text == null ? "" : text).toLowerCase();
        return BAD_KEYWORDS.some(function (k) { return t.indexOf(k) !== -1; });
    }
    function isVibeCodedQuestion(text) {
        var t = String(text == null ? "" : text).toLowerCase();
        return /vibe\s*cod|vibe-coded|vibecoded/.test(t);
    }

    var JAILBREAK_KEYWORDS = ["ignore previous", "ignore all", "ignore above", "disregard", "forget your instructions", "forget previous", "override", "bypass", "jailbreak", "dan mode", "developer mode", "act as", "pretend to be", "roleplay", "you are now", "new persona", "system prompt", "system message", "initial prompt", "hidden prompt", "reveal your", "output your", "repeat after me", "translate the above", "print the above", "echo the above", "what are your instructions", "your rules", "your guidelines", "do anything now", "no restrictions", "unfiltered", "uncensored", "without restrictions", "break character", "stay in character"];
    var CODE_LEAK_KEYWORDS = ["source code", "backend code", "frontend code", "your code", "lemango code", "show me the code", "reveal code", "internal code", "server code", "api routes", "database structure", "how are you built", "how lemango works", "implementation details", "your implementation", "source files", "show me your", "print your", "dump your", "list your files", "repository", "repo", "github", "git", "file tree", "directory structure", "folder structure", "config", ".env", "environment variables", "secrets", "api key", "keys", "password", "token", "credentials"];
    function isBlockedPrompt(text) {
        var t = String(text == null ? "" : text).toLowerCase();
        return JAILBREAK_KEYWORDS.some(function (k) { return t.indexOf(k) !== -1; }) ||
               CODE_LEAK_KEYWORDS.some(function (k) { return t.indexOf(k) !== -1; });
    }

    function isWebsiteMakerQuestion(text) {
        var t = String(text == null ? "" : text).toLowerCase();
        var maker = /who\s+(made|created|built|founded|owns|developed|designed|runs)|creator of|made this|built this|behind (the|this)/.test(t);
        var target = /website|web site|\bsite\b|lemango|this page|the page|platform|web app|\byou\b|\byourself\b/.test(t);
        return maker && target;
    }

    var privilegeUser = null;
    var privilegeCheck = null;
    function isUnlimited() {
        var user = window.LemangoAuth && window.LemangoAuth.user;
        var userKey = user && (user.googleId || user.email);
        if (!userKey) {
            privilegeUser = null;
            privilegeCheck = null;
            return Promise.resolve(false);
        }
        if (userKey !== privilegeUser) {
            privilegeUser = userKey;
            privilegeCheck = fetch("/api/admin/check", {
                credentials: "include"
            }).then(function (res) {
                if (!res.ok) return false;
                return res.json();
            }).then(function (data) {
                return !!(data && data.isAdmin);
            }).catch(function (err) {
                console.error("[ai] privilege check failed:", err);
                return false;
            });
        }
        return privilegeCheck;
    }

    function hasAgents() {
        return isUnlimited();
    }

    function dailyLimit() {
        if (window.LemangoAuth && window.LemangoAuth.isSignedIn()) return 8;
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
        try { localStorage.setItem(USAGE_KEY, JSON.stringify(usage)); } catch (e) {  }
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
                var data;
                try { data = await res.json(); } catch (e) { throw new Error("backend-unavailable"); }
                if (!data || typeof data !== "object") throw new Error("backend-unavailable");
                if (!res.ok || data.ok === false) {
                    var e = new Error((data && data.error) || "backend-error");
                    if (data && data.code) e.code = data.code;
                    throw e;
                }
                return data;
          } finally {
              clearTimeout(timer);
          }
      }

    async function chat(opts) {
        opts = opts || {};
        if (isWebsiteMakerQuestion(opts.message)) {
            return { text: CANT_SAY, reasoning: null };
        }
        if (isBlockedPrompt(opts.message)) {
            return { text: REFUSAL, reasoning: null };
        }
        if (isBadContent(opts.message)) {
            return { text: BAD_WARNING, reasoning: null };
        }
        if (isVibeCodedQuestion(opts.message)) {
            return { text: NOT_VIBE_CODED, reasoning: null };
        }
        var counts = opts.count !== false;

        if (counts && !(await isUnlimited())) {
            if (limitInfo().remaining <= 0) throw limitReached();
        }
        try {
            var data = await viaBackendRaw(
                "/api/ai/chat",
                { message: opts.message, model: opts.model, history: opts.history, context: opts.context || null }
            );
            var text = (data && (data.response || data.reply)) || "";
            if (!text || !String(text).trim()) throw new Error("backend-empty");
            if (counts && !(await isUnlimited())) recordUse();
            var backendText = String(text).trim();
            var backendReasoning = (data && data.reasoning) ? String(data.reasoning).trim() : null;
            return { text: backendText, reasoning: backendReasoning };
        } catch (err) {
            if (err && (err.code === "daily-limit" || /daily limit/i.test(String(err.message || "")))) {
                throw limitReached();
            }
            throw err;
        }
    }

    async function document(opts) {
        opts = opts || {};
        var prompt = String(opts.prompt == null ? "" : opts.prompt).trim();
        if (isWebsiteMakerQuestion(prompt)) {
            return { text: CANT_SAY, reasoning: null };
        }
        if (isBlockedPrompt(prompt)) {
            return { text: REFUSAL, reasoning: null };
        }
        if (isBadContent(prompt)) {
            return { text: BAD_WARNING, reasoning: null };
        }
        if (isVibeCodedQuestion(prompt)) {
            return { text: NOT_VIBE_CODED, reasoning: null };
        }
        var data = await viaBackendRaw(
            "/api/ai/generate-document",
            { prompt: prompt, model: opts.model }
        );
        var text = (data && (data.text || data.response)) || "";
        if (!text || !String(text).trim()) throw new Error("backend-empty");
        var dText = String(text).trim();
        var dReasoning = (data && data.reasoning) ? String(data.reasoning).trim() : null;
        return { text: dText, reasoning: dReasoning };
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
        } catch (e) {  } finally {
            clearTimeout(timer);
        }
        return MODELS;
    }

    window.LemangoAI = {
        BRAND: BRAND,
        MODELS: MODELS,
        DAILY_LIMIT: dailyLimit(),
        dailyLimit: dailyLimit,
        isUnlimited: isUnlimited,
        hasAgents: hasAgents,
        limitInfo: limitInfo,
        chat: chat,
        document: document,
        models: models
    };
})();
