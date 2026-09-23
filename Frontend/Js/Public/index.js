(function () {
  var views = document.querySelectorAll('.view');
  var links = document.querySelectorAll('.nav-link, .nav-link-home');

  function resolveView() {
    var hash = (location.hash || '').replace('#', '');
    return hash === 'about' ? 'about' : 'home';
  }

  function render(name, updateHash) {
    views.forEach(function (v) {
      v.classList.toggle('is-active', v.dataset.view === name);
    });
    links.forEach(function (l) {
      l.classList.toggle('is-active', l.dataset.target === name);
    });
    if (updateHash && location.hash !== '#' + name) {
      history.pushState(null, '', '#' + name);
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  links.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      render(link.dataset.target, true);
    });
  });

  window.addEventListener('popstate', function () {
    render(resolveView(), false);
  });

  render(resolveView(), false);
})();
