// Injected first on every page during the recording, with {k} = time scale (e.g. 0.4).
// Slows every JS clock of the page to k x real time: performance.now, Date, requestAnimationFrame timestamps,
// setTimeout/setInterval delays, smooth scrolling, and every CSS/WAAPI animation (playbackRate = k). Not CDP's
// Animation.setPlaybackRate: that also slows rAF timestamps, which then disagree with performance.now.
// The screencast captures ~1/k more frames per second of page time, and render.mjs speeds the take back up:
// canvas physics, confetti and motion animations come out at 60 fps.
({ k }) => {
  if (!(k > 0 && k < 1)) return;
  const realPerf = performance.now.bind(performance);
  const RealDate = Date;
  const realDateNow = RealDate.now;
  const p0 = realPerf(), d0 = realDateNow();
  const perfNow = () => p0 + (realPerf() - p0) * k;
  performance.now = perfNow;

  const dateNow = () => Math.round(d0 + (realDateNow() - d0) * k);
  function ShimDate(...a) {
    if (!new.target) return new RealDate(dateNow()).toString();
    return a.length ? new RealDate(...a) : new RealDate(dateNow());
  }
  ShimDate.prototype = RealDate.prototype;
  ShimDate.now = dateNow;
  ShimDate.parse = RealDate.parse;
  ShimDate.UTC = RealDate.UTC;
  window.Date = ShimDate;

  const realRAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => realRAF((ts) => cb(p0 + (ts - p0) * k));

  // CSS transitions/animations and WAAPI (motion uses it): slow each one as soon as it exists.
  const realAnimate = Element.prototype.animate;
  Element.prototype.animate = function (...a) {
    const anim = realAnimate.apply(this, a);
    try { anim.playbackRate = k; } catch {}
    return anim;
  };
  const slowAll = () => {
    try { for (const a of document.getAnimations()) if (a.playbackRate !== k) a.playbackRate = k; } catch {}
    realRAF(slowAll);
  };
  realRAF(slowAll);

  const realST = window.setTimeout.bind(window), realSI = window.setInterval.bind(window);
  window.setTimeout = (fn, ms = 0, ...a) => realST(fn, (Number(ms) || 0) / k, ...a);
  window.setInterval = (fn, ms = 0, ...a) => realSI(fn, (Number(ms) || 0) / k, ...a);

  // Native smooth scrolling runs on real time: replace it with an eased scroll on the slowed clock.
  function smoothTo(top) {
    const start = window.scrollY, t0 = perfNow(), dur = 480;
    const step = () => {
      const t = Math.min(1, (perfNow() - t0) / dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      window.scrollTo({ top: start + (top - start) * e, behavior: "instant" });
      if (t < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }
  const realSIV = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (opts) {
    if (opts && typeof opts === "object" && opts.behavior === "smooth") {
      const y = window.scrollY;
      realSIV.call(this, { ...opts, behavior: "instant" });
      const target = window.scrollY;
      window.scrollTo({ top: y, behavior: "instant" });
      return smoothTo(target);
    }
    return realSIV.call(this, opts);
  };
};
