// Injected before every page load during the recording. Registers a Wallet Standard wallet ("Demo Wallet") that the
// app's own "Select Wallet" modal detects, and draws an extension-style popup for connect and approve.
// It never signs anything: the app runs in demo mode (DEMO_FLAGS), which calls window.__bmasDemoSign to wait for the
// approval instead of sending a transaction. Account and approval state live in localStorage (rec:account, rec:approved),
// which the recorder sets between parts.
(() => {
  const ACCOUNTS = {
    creator: "BV2KTH6X17ueowpX2b58JDJC41WpLYPf8tfr2WTaiNRg",
    fan: "H4KB32QYTbgHWQathSgSwatGoxHCeeTo7V87X5JiYB9Q",
  };
  const NAME = "Demo Wallet";
  const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b7cff"/><stop offset="1" stop-color="#4f46e5"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><rect x="14" y="20" width="36" height="26" rx="6" fill="none" stroke="#fff" stroke-width="4"/><path d="M14 27h36" stroke="#fff" stroke-width="4"/><circle cx="41" cy="37" r="3" fill="#fff"/></svg>`;
  const ICON = "data:image/svg+xml;base64," + btoa(ICON_SVG);

  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  function b58decode(s) {
    let n = 0n;
    for (const c of s) n = n * 58n + BigInt(ALPHABET.indexOf(c));
    const out = new Uint8Array(32);
    for (let i = 31; i >= 0; i--) { out[i] = Number(n & 255n); n >>= 8n; }
    return out;
  }
  const short = (a) => `${a.slice(0, 4)}…${a.slice(-4)}`;
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  const which = () => (ls.get("rec:account") === "fan" ? "fan" : "creator");
  const accountFor = (key) => ({
    address: ACCOUNTS[key],
    publicKey: b58decode(ACCOUNTS[key]),
    chains: ["solana:mainnet", "solana:devnet"],
    features: ["solana:signTransaction"],
  });

  // ---------- popup ----------
  const CSS = `
  #recw{position:fixed;top:10px;right:14px;width:360px;z-index:2147483600;font:500 14px/1.35 Geist,ui-sans-serif,system-ui,-apple-system,sans-serif;
    color:#ece8f5;background:#16141d;border:1px solid rgba(255,255,255,.09);border-radius:18px;overflow:hidden;
    box-shadow:0 30px 80px rgba(0,0,0,.6),0 8px 24px rgba(0,0,0,.4);transform-origin:top right;animation:recw-in .22s cubic-bezier(.2,.9,.3,1.2)}
  #recw.out{animation:recw-out .16s ease-in forwards}
  @keyframes recw-in{from{opacity:0;transform:translateY(-8px) scale(.96)}to{opacity:1;transform:none}}
  @keyframes recw-out{to{opacity:0;transform:translateY(-6px) scale(.97)}}
  #recw .hd{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06)}
  #recw .hd img{width:28px;height:28px;border-radius:8px}
  #recw .hd b{font-weight:600}
  #recw .net{margin-left:auto;font-size:12px;color:#9d97b3;background:rgba(255,255,255,.06);padding:4px 9px;border-radius:999px}
  #recw .bd{padding:18px 16px 8px}
  #recw .site{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px 12px}
  #recw .site img{width:22px;height:22px;border-radius:6px}
  #recw .site span{color:#b9b3cc}
  #recw h3{margin:18px 0 6px;font-size:19px;font-weight:600;letter-spacing:-.01em}
  #recw p{margin:0 0 12px;color:#9d97b3;font-size:13px}
  #recw .rows{border:1px solid rgba(255,255,255,.07);border-radius:12px;margin:12px 0 6px}
  #recw .row{display:flex;justify-content:space-between;gap:12px;padding:11px 12px;font-size:13.5px}
  #recw .row+.row{border-top:1px solid rgba(255,255,255,.06)}
  #recw .row span{color:#9d97b3}
  #recw .acct{display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#9d97b3;padding:8px 2px 0}
  #recw .acct code{font:500 12.5px ui-monospace,Menlo,monospace;color:#d7d2e6}
  #recw .ft{display:flex;gap:10px;padding:14px 16px 16px}
  #recw button{flex:1;height:44px;border-radius:12px;border:0;font:600 14.5px Geist,ui-sans-serif,system-ui,sans-serif;cursor:pointer}
  #recw .sec{background:rgba(255,255,255,.07);color:#d7d2e6}
  #recw .pri{background:#6d5dfc;color:#fff}
  #recw .pri:hover{background:#7d6ffd}`;

  function popup({ title, text, rows, primary }) {
    return new Promise((resolve) => {
      let style = document.getElementById("recw-style");
      if (!style) {
        style = Object.assign(document.createElement("style"), { id: "recw-style", textContent: CSS });
        document.head.appendChild(style);
      }
      document.getElementById("recw")?.remove();
      const host = location.hostname === "localhost" ? "buymeashare.r4to.com" : location.hostname;
      const el = document.createElement("div");
      el.id = "recw";
      el.innerHTML = `
        <div class="hd"><img src="${ICON}"><b>${NAME}</b><span class="net">Mainnet</span></div>
        <div class="bd">
          <div class="site"><img src="/favicon.ico"><span>${host}</span></div>
          <h3>${title}</h3>${text ? `<p>${text}</p>` : ""}
          ${rows?.length ? `<div class="rows">${rows.map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join("")}</div>` : ""}
          <div class="acct"><span>Account</span><code>${short(ACCOUNTS[which()])}</code></div>
        </div>
        <div class="ft"><button class="sec" id="recw-cancel">Cancel</button><button class="pri" id="recw-primary">${primary}</button></div>`;
      document.body.appendChild(el);
      el.querySelector("#recw-primary").addEventListener("click", () => {
        el.classList.add("out");
        setTimeout(() => { el.remove(); resolve(); }, 170);
      });
    });
  }

  // ---------- Wallet Standard wallet ----------
  const listeners = { change: new Set() };
  let accounts = [];
  const emit = () => listeners.change.forEach((l) => l({ accounts }));
  const wallet = {
    version: "1.0.0",
    name: NAME,
    icon: ICON,
    chains: ["solana:mainnet", "solana:devnet"],
    get accounts() { return accounts; },
    features: {
      "standard:connect": {
        version: "1.0.0",
        async connect({ silent } = {}) {
          const key = which();
          if (!silent || ls.get("rec:approved") !== key) {
            if (silent) return { accounts };
            await popup({ title: "Connect to this site?", text: "It will see your address and ask you to approve transactions.", primary: "Connect" });
            ls.set("rec:approved", key);
          }
          accounts = [accountFor(key)];
          emit();
          return { accounts };
        },
      },
      "standard:disconnect": { version: "1.0.0", async disconnect() { accounts = []; ls.set("rec:approved", ""); emit(); } },
      "standard:events": {
        version: "1.0.0",
        on(event, listener) {
          listeners[event]?.add(listener);
          return () => listeners[event]?.delete(listener);
        },
      },
      "solana:signTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        async signTransaction() { throw new Error("Demo Wallet does not sign real transactions."); },
      },
    },
  };

  // Simulated approvals from the app's demo mode (lib/demo.ts).
  window.__bmasDemoSign = (req) => popup({ title: req.title, rows: req.rows, primary: "Approve" });

  const callback = ({ register }) => register(wallet);
  try { window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: callback })); } catch {}
  try { window.addEventListener("wallet-standard:app-ready", ({ detail }) => callback(detail)); } catch {}
})();
