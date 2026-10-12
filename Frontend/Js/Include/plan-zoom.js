// Pinch / wheel / buttons zoom and drag-to-move for floor plans: any .zoom-view that holds a .zoom-inner.
// Delegated on the document, so it keeps working when Vue re-renders the plan (a new plan simply starts at 1x).
(function () {
  var MIN = 1, MAX = 4;
  var pts = {}, last = null;

  function st(inner) { return inner._z || (inner._z = { s: 1, x: 0, y: 0 }); }
  function clamp(view, inner) {
    var z = st(inner), w = view.clientWidth, h = view.clientHeight;
    z.s = Math.min(MAX, Math.max(MIN, z.s));
    z.x = Math.min(0, Math.max(w - w * z.s, z.x));
    z.y = Math.min(0, Math.max(h - h * z.s, z.y));
  }
  function apply(view, inner) {
    clamp(view, inner);
    var z = st(inner);
    inner.style.transform = z.s === 1 ? '' : 'translate(' + z.x + 'px,' + z.y + 'px) scale(' + z.s + ')';
    view.classList.toggle('is-zoomed', z.s > 1.01);
  }
  // Zoom to a new scale around a point (in view coordinates), so the spot under the fingers stays put.
  function zoomAt(view, inner, ns, cx, cy) {
    var z = st(inner), old = z.s;
    ns = Math.min(MAX, Math.max(MIN, ns));
    z.x = cx - (cx - z.x) * (ns / old);
    z.y = cy - (cy - z.y) * (ns / old);
    z.s = ns;
    apply(view, inner);
  }
  function parts(el) {
    var view = el && el.closest ? el.closest('.zoom-view') : null;
    var inner = view ? view.querySelector('.zoom-inner') : null;
    return view && inner ? { view: view, inner: inner } : null;
  }
  function rel(view, e) { var r = view.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function dist() { var k = Object.keys(pts); return Math.hypot(pts[k[0]].x - pts[k[1]].x, pts[k[0]].y - pts[k[1]].y); }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-z]');
    if (!b) return;
    var p = parts(b); if (!p) return;
    var z = st(p.inner), cx = p.view.clientWidth / 2, cy = p.view.clientHeight / 2, a = b.getAttribute('data-z');
    if (a === 'in') zoomAt(p.view, p.inner, z.s * 1.5, cx, cy);
    else if (a === 'out') zoomAt(p.view, p.inner, z.s / 1.5, cx, cy);
    else { z.s = 1; z.x = 0; z.y = 0; apply(p.view, p.inner); }
  });
  document.addEventListener('wheel', function (e) {
    var p = parts(e.target); if (!p || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    var c = rel(p.view, e);
    zoomAt(p.view, p.inner, st(p.inner).s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), c.x, c.y);
  }, { passive: false });
  document.addEventListener('dblclick', function (e) {
    var p = parts(e.target); if (!p || (e.target.closest && e.target.closest('.zoom-ctl'))) return;
    var c = rel(p.view, e), z = st(p.inner);
    if (z.s > 1.01) { z.s = 1; z.x = 0; z.y = 0; apply(p.view, p.inner); } else zoomAt(p.view, p.inner, 2.5, c.x, c.y);
  });
  document.addEventListener('pointerdown', function (e) {
    var p = parts(e.target); if (!p || (e.target.closest && e.target.closest('.zoom-ctl'))) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY, view: p.view, inner: p.inner };
    last = Object.keys(pts).length === 2 ? dist() : null;
  });
  document.addEventListener('pointermove', function (e) {
    var q = pts[e.pointerId]; if (!q) return;
    var z = st(q.inner), n = Object.keys(pts).length;
    if (n === 2) {
      pts[e.pointerId].x = e.clientX; pts[e.pointerId].y = e.clientY;
      var d = dist(), k = Object.keys(pts), a = pts[k[0]], b = pts[k[1]], r = q.view.getBoundingClientRect();
      if (last) zoomAt(q.view, q.inner, z.s * (d / last), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      last = d;
    } else if (n === 1 && z.s > 1.01) {
      z.x += e.clientX - q.x; z.y += e.clientY - q.y;
      q.x = e.clientX; q.y = e.clientY;
      apply(q.view, q.inner);
    }
  });
  function up(e) { delete pts[e.pointerId]; last = null; }
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
})();
