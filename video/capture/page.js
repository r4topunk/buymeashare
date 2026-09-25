// Injected before every page load during the recording (Playwright addInitScript).
// - Hides the real cursor and scrollbars: render.mjs draws a smooth 60 fps cursor from the recorded path.
// - Paints a timecode strip in the 4px under the visible viewport (cropped out by render.mjs), so every captured
//   frame can be mapped back to the recorder's clock, whatever the screencast latency.
// - Reports the cursor shape under the pointer (arrow / hand / ibeam) through the __recKind binding.
// - Shows the production host instead of localhost in page text.
(() => {
  const HOST = "https://buymeashare.r4to.com";
  let strip = null, kind = "arrow", x = -1, y = -1;

  function install() {
    if (strip) return;
    const style = document.createElement("style");
    style.textContent = `
      *,*::before,*::after{cursor:none!important}
      html{scrollbar-width:none!important}
      ::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}
      nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none!important}`;
    document.head.appendChild(style);
    strip = document.createElement("div");
    strip.style.cssText = "position:fixed;left:0;right:0;bottom:0;height:4px;z-index:2147483647;pointer-events:none;background:rgb(0,0,0)";
    document.documentElement.appendChild(strip);
    // React hydration drops unknown children of <html>: put the strip back (same node, same colour).
    const ensure = () => { if (!strip.isConnected) document.documentElement.appendChild(strip); };
    new MutationObserver(ensure).observe(document.documentElement, { childList: true });
    setInterval(ensure, 50);
    rewrite(document.body);
    new MutationObserver((ms) => ms.forEach((m) => {
      if (m.type === "characterData") rewriteNode(m.target);
      m.addedNodes.forEach(rewrite);
    })).observe(document.body, { subtree: true, childList: true, characterData: true });
  }

  /** code 1..4095 -> three 16-level channels (code 0 = never painted). */
  window.__recTC = (code) => {
    if (!strip) return;
    const c = [(code >> 8) & 15, (code >> 4) & 15, code & 15].map((v) => v * 16 + 8);
    strip.style.background = `rgb(${c.join(",")})`;
  };

  function pick() {
    const t = document.elementFromPoint(x, y);
    if (!t) return "arrow";
    const inp = t.closest("input:not([type=checkbox]):not([type=radio]):not([type=button]),textarea");
    if (inp && !inp.disabled) return "ibeam";
    const hit = t.closest("a[href],button,[role=button],[role=switch],[role=radio],[role=tab],label[for],summary,select,.wallet-adapter-modal-list li");
    if (hit && !hit.disabled && !hit.closest("fieldset:disabled")) return "hand";
    return "arrow";
  }
  function report() {
    if (x < 0) return;
    const k = pick();
    if (k !== kind) { kind = k; window.__recKind?.(k); }
  }
  addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; report(); }, true);
  setInterval(report, 100); // hover targets change under a still pointer (re-renders, scroll)

  function rewriteNode(n) {
    if (n.nodeType === 3 && /http:\/\/localhost:\d+/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/http:\/\/localhost:\d+/g, HOST);
  }
  function rewrite(root) {
    if (!root) return;
    if (root.nodeType === 3) return rewriteNode(root);
    if (root.nodeType !== 1) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) rewriteNode(n);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();
