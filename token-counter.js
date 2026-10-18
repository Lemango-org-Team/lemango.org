<!-- Token counter widget (compact) -->
<style>
  .tc-widget { position: fixed; bottom: 12px; right: 12px; z-index: 50; background: #2f343a; border: 1px solid rgba(255,255,255,.05); border-radius: 14px; padding: 6px 10px; box-shadow: 0 8px 20px rgba(0,0,0,.4); font-family: "JetBrains Mono", monospace; font-size: 11px; color: #e2e8f0; display: flex; align-items: center; gap: 8px; }
  .tc-widget .tc-num { font-weight: 700; color: #10b981; min-width: 32px; text-align: right; }
  .tc-widget .tc-cost { font-size: 9px; color: #94a3b8; }
  .tc-widget button { background: #1e2227; border: 1px solid rgba(255,255,255,.1); border-radius: 6px; color: #94a3b8; padding: 2px 6px; font-size: 9px; cursor: pointer; }
  .tc-widget button:hover { color: #fff; }
</style>
<div class="tc-widget" id="tcWidget" title="Session token count">
  <span style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">Tokens</span>
  <span class="tc-num" id="tcNum">0</span>
  <span class="tc-cost" id="tcCost">$0.0000</span>
  <button id="tcReset" title="Reset">↺</button>
</div>
<script>
(function () {
  let sessionTotal = 0;
  const numEl = document.getElementById("tcNum");
  const costEl = document.getElementById("tcCost");
  function update() {
    if (numEl) numEl.textContent = sessionTotal.toLocaleString();
    if (costEl) costEl.textContent = "$" + ((sessionTotal / 1000) * 0.002).toFixed(4);
  }
  window.addToken = function (count) {
    count = count || 1;
    sessionTotal += count;
    update();
  };
  window.resetSession = function () { sessionTotal = 0; update(); };
  const rb = document.getElementById("tcReset");
  if (rb) rb.addEventListener("click", () => window.resetSession());
  window.lemangoConnector = {
    attachToFetchStream: async function (responseStream) {
      const reader = responseStream.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const tokens = chunk.split(/\s+/).filter(Boolean).length || 1;
        window.addToken(tokens);
      }
    }
  };
})();
</script>
