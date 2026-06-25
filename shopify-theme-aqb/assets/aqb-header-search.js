(function () {
  var roots = document.querySelectorAll('[data-aqb-nav-search]');
  if (!roots.length) return;

  var debounceTimer = null;
  var activeFetch = null;

  function formatMoney(cents) {
    if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
      return window.Shopify.formatMoney(cents);
    }
    return '$' + (cents / 100).toFixed(2);
  }

  function buildResultsUrl(base, query) {
    var url = base || '/collections/all';
    var separator = url.indexOf('?') !== -1 ? '&' : '?';
    return url + separator + 'q=' + encodeURIComponent(query);
  }

  function renderResults(container, products, query, resultsUrl) {
    if (!container) return;

    if (!query) {
      container.hidden = true;
      container.innerHTML = '';
      return;
    }

    if (!products.length) {
      container.hidden = false;
      container.innerHTML =
        '<p class="aqb-nav-search__empty">No products found for “' +
        query.replace(/"/g, '&quot;') +
        '”.</p>';
      return;
    }

    var html = '<ul class="aqb-nav-search__results-list" role="listbox">';
    products.forEach(function (product) {
      var image =
        product.image ||
        (product.featured_image && product.featured_image.url) ||
        (product.featured_image && typeof product.featured_image === 'string' ? product.featured_image : '');
      var imageHtml = image
        ? '<img src="' + image + '" alt="" loading="lazy" width="44" height="44">'
        : '<span class="aqb-nav-search__result-placeholder" aria-hidden="true"></span>';
      var price = product.price != null ? formatMoney(product.price) : '';

      html +=
        '<li role="option"><a class="aqb-nav-search__result" href="' +
        product.url +
        '"><span class="aqb-nav-search__result-image">' +
        imageHtml +
        '</span><span class="aqb-nav-search__result-body"><span class="aqb-nav-search__result-title">' +
        (product.title || '') +
        '</span>' +
        (price ? '<span class="aqb-nav-search__result-price">' + price + '</span>' : '') +
        '</span></a></li>';
    });
    html +=
      '</ul><a class="aqb-nav-search__view-all" href="' +
      buildResultsUrl(resultsUrl, query) +
      '">View all results for “' +
      query.replace(/"/g, '&quot;') +
      '”</a>';

    container.hidden = false;
    container.innerHTML = html;
  }

  function fetchSuggestions(input, resultsEl) {
    var query = input.value.trim();
    var form = input.closest('[data-aqb-nav-search-form]');
    var resultsUrl = (form && form.getAttribute('data-results-url')) || '/collections/all';

    if (!query) {
      renderResults(resultsEl, [], '', resultsUrl);
      return;
    }

    if (activeFetch) activeFetch.abort();
    activeFetch = new AbortController();

    fetch(
      '/search/suggest.json?q=' +
        encodeURIComponent(query) +
        '&resources[type]=product&resources[limit]=6&resources[options][unavailable_products]=last',
      { signal: activeFetch.signal }
    )
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        var products =
          (data.resources && data.resources.results && data.resources.results.products) || [];
        renderResults(resultsEl, products, query, resultsUrl);
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        renderResults(resultsEl, [], query, resultsUrl);
      })
      .finally(function () {
        activeFetch = null;
      });
  }

  roots.forEach(function (root) {
    var openBtn = root.querySelector('[data-aqb-nav-search-open]');
    var closeBtn = root.querySelector('[data-aqb-nav-search-close]');
    var panel = root.querySelector('[data-aqb-nav-search-panel]');
    var form = root.querySelector('[data-aqb-nav-search-form]');
    var input = root.querySelector('[data-aqb-nav-search-input]');
    var resultsEl = root.querySelector('[data-aqb-nav-search-results]');

    if (!openBtn || !panel || !form || !input) return;

    function openSearch() {
      document.querySelectorAll('[data-aqb-nav-search].is-open').forEach(function (other) {
        if (other === root) return;
        other.classList.remove('is-open');
        var otherPanel = other.querySelector('[data-aqb-nav-search-panel]');
        var otherBtn = other.querySelector('[data-aqb-nav-search-open]');
        if (otherPanel) otherPanel.hidden = true;
        if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
      });

      root.classList.add('is-open');
      panel.hidden = false;
      openBtn.setAttribute('aria-expanded', 'true');
      window.setTimeout(function () {
        input.focus();
      }, 0);
    }

    function closeSearch() {
      root.classList.remove('is-open');
      panel.hidden = true;
      openBtn.setAttribute('aria-expanded', 'false');
      input.value = '';
      renderResults(resultsEl, [], '', form.getAttribute('data-results-url'));
    }

    openBtn.addEventListener('click', function () {
      if (root.classList.contains('is-open')) {
        closeSearch();
      } else {
        openSearch();
      }
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', closeSearch);
    }

    input.addEventListener('input', function () {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(function () {
        fetchSuggestions(input, resultsEl);
        debounceTimer = null;
      }, 220);
    });

    form.addEventListener('submit', function (e) {
      var query = input.value.trim();
      if (!query) {
        e.preventDefault();
        return;
      }
      form.action = buildResultsUrl(form.getAttribute('data-results-url'), query);
    });

    document.addEventListener('click', function (e) {
      if (!root.classList.contains('is-open')) return;
      if (!root.contains(e.target)) closeSearch();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('is-open')) {
        closeSearch();
        openBtn.focus();
      }
    });
  });
})();
