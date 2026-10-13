// The "Satellite" view of the campus map: the campus from above and nothing else (no pins, no paths), the same imagery as the
// admin Campus Paths map. It cannot be moved or zoomed out past the campus (Js/Include/campus-bounds.js).
// It sits on top of the 2D and 3D views without changing them: opening it covers them, and tapping 2D or 3D uncovers them again.
(function () {
  'use strict';
  var app = document.getElementById('mapApp');
  var tabStreet = document.getElementById('tab-street');
  var view = document.getElementById('streetView');
  if (!app || !tabStreet || !view || typeof L === 'undefined' || typeof CampusBounds === 'undefined') return;

  var tab2d = document.getElementById('tab-2d'), tab3d = document.getElementById('tab-3d');
  var mapEl = document.getElementById('streetMap');
  var map = null, built = false;
  var captionEl = document.getElementById('caption'), savedCaption = '';

  function build() {
    if (built) return;
    built = true;
    map = L.map(mapEl, CampusBounds.mapOptions({ zoomControl: true, attributionControl: true, zoomSnap: 0.25 })).setView(CampusBounds.CENTER, 18);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      CampusBounds.tileOptions({ attribution: 'Tiles &copy; Esri' })).addTo(map);
    map.fitBounds(CampusBounds.BOUNDS);
  }

  function open() {
    app.classList.add('street-on');
    view.hidden = false;
    if (captionEl) { if (!savedCaption) savedCaption = captionEl.textContent; captionEl.textContent = 'The campus from above'; }
    [tab2d, tab3d].forEach(function (t) { t.setAttribute('aria-selected', 'false'); });
    tabStreet.setAttribute('aria-selected', 'true');
    build();
    setTimeout(function () { if (map) { map.invalidateSize(); map.fitBounds(CampusBounds.BOUNDS); } }, 50);
  }
  function close(toTab) {
    if (view.hidden) return;
    app.classList.remove('street-on');
    view.hidden = true;
    if (captionEl && savedCaption) { captionEl.textContent = savedCaption; savedCaption = ''; }
    tabStreet.setAttribute('aria-selected', 'false');
    if (toTab && !toTab.disabled) toTab.setAttribute('aria-selected', 'true');
  }

  tabStreet.addEventListener('click', open);
  tab2d.addEventListener('click', function () { close(tab2d); });
  tab3d.addEventListener('click', function () { close(tab3d); });

  // No 2D or 3D map uploaded yet: the satellite view is the useful default instead of an empty page.
  setTimeout(function () { if (tab2d.disabled && tab3d.disabled && view.hidden) open(); }, 1500);
})();
