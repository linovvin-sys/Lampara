// On-campus check for every visitor page. Plain <script>; needs campus-bounds.js loaded first.
// The page stays hidden until the visitor's location is inside the campus (CampusBounds.BOUNDS), give or take the GPS error.
// It guards the pages that need the visitor to be there (walking guide, camera guide, sign scan, reports), not the directory,
// the map or the floor plans, which anyone may use to plan a visit.
// Outside the campus, or with location switched off, a full-screen message replaces the page. A logged-in admin, or the
// switch in Backend/api/fence.php, skips the check. A good answer is remembered for 10 minutes of this visit so that moving
// between pages does not ask again.
(function () {
  'use strict';
  if (window.__lamparaFence) return;
  window.__lamparaFence = true;

  var API = new URL('../../../Backend/api/fence.php', location.href).href;
  var KEY = 'lampara_fence', REMEMBER_MS = 10 * 60 * 1000;
  var root = document.documentElement;

  var style = document.createElement('style');
  style.textContent =
    'html.lf-hold body{visibility:hidden}' +
    '.lf{position:fixed;inset:0;z-index:2147483647;visibility:visible;display:flex;align-items:center;justify-content:center;padding:1.4rem;background:linear-gradient(160deg,#161850,#2b2f8f);color:#fff;font-family:Outfit,system-ui,sans-serif;text-align:center}' +
    '.lf-card{max-width:26rem}' +
    '.lf h1{margin:.8rem 0 .5rem;font-size:1.9rem;line-height:1.15}' +
    '.lf p{margin:0 0 1rem;font-size:1.2rem;line-height:1.45;color:rgba(255,255,255,.9)}' +
    '.lf-ico{width:5rem;height:5rem;border-radius:1.3rem;background:#ffd100;color:#161850;display:grid;place-items:center;margin:0 auto}' +
    '.lf-btn{display:block;width:100%;box-sizing:border-box;font:800 1.2rem Outfit,system-ui,sans-serif;background:#ffd100;color:#161850;border:0;border-radius:1rem;padding:1rem;margin-top:.8rem;cursor:pointer}' +
    '.lf-spin{width:2.6rem;height:2.6rem;border:4px solid rgba(255,255,255,.3);border-top-color:#ffd100;border-radius:50%;margin:0 auto;animation:lfspin 1s linear infinite}' +
    '@keyframes lfspin{to{transform:rotate(360deg)}}';
  (document.head || root).appendChild(style);
  root.classList.add('lf-hold');

  var overlay = null;
  function show(html) {
    if (!overlay) { overlay = document.createElement('div'); overlay.className = 'lf'; overlay.setAttribute('role', 'alert'); root.appendChild(overlay); }
    overlay.innerHTML = '<div class="lf-card">' + html + '</div>';
  }
  function release() {
    root.classList.remove('lf-hold');
    if (overlay) { overlay.remove(); overlay = null; }
  }

  var PIN = '<div class="lf-ico"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/></svg></div>';

  function remembered() {
    try { var t = JSON.parse(sessionStorage.getItem(KEY)); return !!t && Date.now() - t.ts < REMEMBER_MS; } catch (e) { return false; }
  }
  function remember() { try { sessionStorage.setItem(KEY, JSON.stringify({ ts: Date.now() })); } catch (e) { /* asked again next page */ } }

  function checking() { show('<div class="lf-spin" aria-hidden="true"></div><h1>Checking where you are</h1><p>Lampara works for people who are on the school campus. Please allow your location if your phone asks.</p>'); }

  function blocked(km) {
    show(PIN + '<h1>You are not on the campus</h1><p>Lampara can only be used inside the school campus' + (km ? '. You are about ' + km + ' away' : '') + '. Please come to the campus and try again.</p><button type="button" class="lf-btn" id="lfRetry">Check again</button>');
    document.getElementById('lfRetry').onclick = check;
  }
  // denied = the visitor said no to location. Otherwise it simply could not be found (a desktop computer, a weak signal): then the
  // visitor can say they are on the campus. That is on trust, the same way a sign at a door is.
  function noLocation(denied) {
    show(PIN + '<h1>Please turn on your location</h1><p>' + (denied
      ? 'Your phone is not sharing its location with Lampara. Open your phone or browser settings, allow location for this site, then try again.'
      : 'We could not find where you are. Go outside or near a window, make sure location is on, and try again. On a computer, you can confirm below.') + '</p><button type="button" class="lf-btn" id="lfRetry">Try again</button>'
      + (denied ? '' : '<button type="button" class="lf-btn" id="lfHere" style="background:#fff">I am on the campus</button>'));
    document.getElementById('lfRetry').onclick = check;
    var here = document.getElementById('lfHere');
    if (here) here.onclick = function () { remember(); release(); };
  }

  function check() {
    checking();
    if (!navigator.geolocation) { noLocation(false); return; }
    navigator.geolocation.getCurrentPosition(function (p) {
      var lat = p.coords.latitude, lng = p.coords.longitude, acc = p.coords.accuracy || 0;
      var out = CampusBounds.outsideBy(lat, lng);
      // Inside buildings the fix is rough: allow for the error it admits to (between 25 m and 80 m).
      if (out <= Math.max(25, Math.min(acc, 80))) { remember(); release(); return; }
      blocked(out >= 1000 ? (out / 1000).toFixed(1) + ' km' : Math.round(out / 10) * 10 + ' m');
    }, function (err) { noLocation(err && err.code === 1); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  if (remembered()) { release(); return; }

  // The switch and the admin bypass live on the server; if it cannot be reached (offline) the check still runs.
  var done = false;
  function go(info) {
    if (done) return; done = true;
    if (info && (info.enabled === false || info.bypass)) { release(); return; }
    check();
  }
  var timer = setTimeout(function () { go(null); }, 3000);
  fetch(API, { cache: 'no-store', credentials: 'same-origin' }).then(function (r) { return r.json(); })
    .then(function (info) { clearTimeout(timer); go(info); })
    .catch(function () { clearTimeout(timer); go(null); });
})();
