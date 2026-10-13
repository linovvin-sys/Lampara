// A short, one-time notice on the first screens a visitor sees: what the app uses on the phone, with a link to the full page.
// Plain <script>. Shown until the visitor taps "OK"; remembered on the phone (the notice simply shows again if storage is blocked).
(function () {
  'use strict';
  var KEY = 'lampara_privacy_ok';
  try { if (localStorage.getItem(KEY) === '1') return; } catch (e) { /* storage blocked: show it */ }

  function show() {
    var link = new URL('../../View/Student/privacy.php', document.currentScript ? document.currentScript.src : location.href).href;
    var bar = document.createElement('div');
    bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Privacy notice');
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147482000;background:#fff;color:#161850;border-top:3px solid #ffd100;padding:.8rem 1rem calc(.8rem + env(safe-area-inset-bottom,0px));box-shadow:0 -8px 24px rgba(0,0,0,.25);font:500 1rem/1.4 Outfit,system-ui,sans-serif;display:flex;gap:.8rem;align-items:center;flex-wrap:wrap';
    bar.innerHTML = '<span style="flex:1 1 15rem">Lampara uses your <b>location</b>, <b>camera</b> and <b>motion sensors</b> to guide you. Nothing about you is saved on the school\'s server unless you send a report. <a href="' + link + '" style="color:#161850;font-weight:700">How it works</a></span>'
      + '<button type="button" style="font:800 1.05rem Outfit,system-ui,sans-serif;background:#ffd100;color:#161850;border:0;border-radius:.8rem;padding:.7rem 1.4rem;cursor:pointer">OK</button>';
    bar.querySelector('button').onclick = function () { try { localStorage.setItem(KEY, '1'); } catch (e) { /* asked again next time */ } bar.remove(); };
    document.body.appendChild(bar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
