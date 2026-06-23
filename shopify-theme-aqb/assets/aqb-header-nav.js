(function () {
  var root = document.querySelector('[data-aqb-nav]');
  if (!root) return;

  var inner = root.querySelector('.aqb-store-nav__inner');
  if (!inner) return;

  var collapsibles = Array.prototype.slice.call(
    root.querySelectorAll('[data-nav-collapsible]')
  );

  if (!collapsibles.length) return;

  collapsibles.sort(function (a, b) {
    return Number(a.getAttribute('data-nav-priority') || 0) - Number(b.getAttribute('data-nav-priority') || 0);
  });

  var right = root.querySelector('.aqb-store-nav__right');
  var links = root.querySelector('.aqb-store-nav__links');
  var logo = root.querySelector('.aqb-store-nav__logo');
  var MIN_GAP = 8;

  function isCollapsed(el) {
    return el.classList.contains('is-nav-collapsed');
  }

  function isVisible(el) {
    if (!el || isCollapsed(el)) return false;
    return el.getBoundingClientRect().width > 0;
  }

  function barFits() {
    if (!right) return true;

    var rightLeft = right.getBoundingClientRect().left;
    var contentRight = inner.getBoundingClientRect().left;

    if (isVisible(logo)) {
      contentRight = Math.max(contentRight, logo.getBoundingClientRect().right);
    }

    if (links) {
      var items = links.querySelectorAll(':scope > li');
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (isCollapsed(item)) continue;
        var itemRect = item.getBoundingClientRect();
        if (itemRect.width > 0) {
          contentRight = Math.max(contentRight, itemRect.right);
        }
      }
    }

    return contentRight + MIN_GAP <= rightLeft + 0.5;
  }

  function resetCollapse() {
    collapsibles.forEach(function (el) {
      el.classList.remove('is-nav-collapsed');
    });
    root.classList.remove('is-overflow-nav');
  }

  function updateNavCollapse() {
    resetCollapse();

    var index = 0;
    var guard = 0;
    while (!barFits() && index < collapsibles.length && guard < collapsibles.length + 2) {
      collapsibles[index].classList.add('is-nav-collapsed');
      index += 1;
      guard += 1;
    }

    if (index > 0) {
      root.classList.add('is-overflow-nav');
    }
  }

  var resizeTimer = null;
  function scheduleUpdate() {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      updateNavCollapse();
      resizeTimer = null;
    }, 50);
  }

  updateNavCollapse();
  window.addEventListener('resize', scheduleUpdate);

  if (typeof ResizeObserver !== 'undefined') {
    var observer = new ResizeObserver(scheduleUpdate);
    observer.observe(inner);
    if (right) observer.observe(right);
    if (links) observer.observe(links);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleUpdate);
  }
})();
