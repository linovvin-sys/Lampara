/* A floating "Enrollment" button that stays on screen while you scroll, so the Enrollment guide is one tap away from the landing page,
   Manual Search and the sign scanner. Plain <script>; add it to a page and it appears (it hides itself on the guide's own pages). */
(function () {
  'use strict';
  var here = location.pathname.split('/').pop();
  if (/^(enrollment|journey|guide-ar|guide|where)\.php$/.test(here)) return;
  var href = new URL('../../View/Student/enrollment.php', document.currentScript ? document.currentScript.src : location.href).href;
  var st = document.createElement('style');
  st.textContent = '.enroll-fab{position:fixed;right:max(.9rem,env(safe-area-inset-right));bottom:max(.9rem,env(safe-area-inset-bottom));z-index:900;display:inline-flex;align-items:center;gap:.5rem;min-height:3.2rem;padding:.55rem 1.1rem .7rem;background:var(--t-accent,#ffd100);color:var(--t-ink2,#161850);font:700 1.05rem/1.1 Outfit,system-ui,sans-serif;text-decoration:none;box-shadow:inset 0 -5px 0 var(--t-accent-dark,#d4ab00),0 8px 20px -6px rgba(0,0,0,.55);clip-path:polygon(0 6px,3px 6px,3px 3px,6px 3px,6px 0,calc(100% - 6px) 0,calc(100% - 6px) 3px,calc(100% - 3px) 3px,calc(100% - 3px) 6px,100% 6px,100% calc(100% - 6px),calc(100% - 3px) calc(100% - 6px),calc(100% - 3px) calc(100% - 3px),calc(100% - 6px) calc(100% - 3px),calc(100% - 6px) 100%,6px 100%,6px calc(100% - 3px),3px calc(100% - 3px),3px calc(100% - 6px),0 calc(100% - 6px))}.enroll-fab:active{transform:translateY(2px)}.enroll-fab:focus-visible{outline:3px solid #fff;outline-offset:2px}@media (prefers-reduced-motion:no-preference){.enroll-fab{animation:enroll-fab-in .4s ease-out both}}@keyframes enroll-fab-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}';
  document.head.appendChild(st);
  var a = document.createElement('a');
  a.className = 'enroll-fab'; a.href = href; a.setAttribute('aria-label', 'Enrollment guide');
  a.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9"/></svg><span>Enrollment</span>';
  document.body.appendChild(a);
})();
