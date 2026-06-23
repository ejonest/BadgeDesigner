(function () {
  var grid = document.getElementById('role-badges-product-grid');
  var filterBar = document.getElementById('role-badges-catalogue-filters');
  if (!grid || !filterBar) return;

  var countEl = document.getElementById('role-badges-product-count');
  var loadWrap = document.getElementById('role-badges-load-more-wrap');
  var loadBtn = document.getElementById('role-badges-load-more');
  var sortSelect = document.getElementById('role-badges-sort');
  var priceMinInput = document.getElementById('role-badges-price-min');
  var priceMaxInput = document.getElementById('role-badges-price-max');
  var adultCheckbox = document.getElementById('role-badges-adult');
  var clearBtn = document.getElementById('role-badges-filter-clear');
  var filterToggle = document.getElementById('role-badges-filter-toggle');
  var filterPanel = document.getElementById('role-badges-filter-panel');

  var pageSize = parseInt(grid.getAttribute('data-page-size'), 10) || 12;
  var catalogueBase = grid.getAttribute('data-catalogue-base') || '/pages/role-badges';
  var collectionHandle = grid.getAttribute('data-collection-handle') || '';
  var totalProducts = parseInt(grid.getAttribute('data-total-products'), 10) || 0;
  var addLabel = grid.getAttribute('data-add-label') || 'Add to cart';
  var packLabel = grid.getAttribute('data-pack-label') || '3-Pack';
  var priceSubtext = grid.getAttribute('data-price-subtext') || '';
  var cartAddUrl = grid.getAttribute('data-cart-add-url') || '/cart/add';

  var filterConfig = { roles: [], churchSubcategories: [] };
  var configEl = document.getElementById('role-badges-filter-config');
  if (configEl) {
    try {
      filterConfig = JSON.parse(configEl.textContent);
    } catch (e) {
      filterConfig = { roles: [], churchSubcategories: [] };
    }
  }

  var selectedRoles = [];
  var selectedChurchSubcategories = [];
  var sortBy = 'featured';
  var priceMin = null;
  var priceMax = null;
  var showAdult = false;
  var currentPage = 1;
  var collectionPage = 1;
  var collectionPageSize = 250;
  var loadingCollection = false;
  var allCollectionLoaded = false;

  function refreshCards() {
    return Array.prototype.slice.call(grid.querySelectorAll('.aqb-rb-product-card'));
  }

  var cards = refreshCards();

  function tagList(tags) {
    if (typeof tags === 'string') return tags.toLowerCase();
    return (tags || []).join(',').toLowerCase();
  }

  function tagContains(tagsJoined, tag) {
    if (!tag) return false;
    return tagsJoined.indexOf(tag.toLowerCase()) !== -1;
  }

  function isAdultTagged(tagsJoined) {
    return (
      tagContains(tagsJoined, '18+') ||
      tagContains(tagsJoined, '18plus') ||
      tagContains(tagsJoined, 'adult')
    );
  }

  function isDeskSign(tagsJoined) {
    return tagContains(tagsJoined, 'desk-sign') || tagContains(tagsJoined, 'desk sign');
  }

  function isRoleBadge(tagsJoined) {
    return tagContains(tagsJoined, 'role-badge');
  }

  function tagsMatchAny(tagsJoined, tagListToMatch) {
    return (tagListToMatch || []).some(function (tag) {
      return tagContains(tagsJoined, tag);
    });
  }

  function classifyProduct(tags) {
    var tagsJoined = tagList(tags);
    var categories = [];
    var subcategories = [];

    (filterConfig.roles || []).forEach(function (role) {
      if (tagContains(tagsJoined, role.tag)) categories.push(role.id);
    });

    (filterConfig.churchSubcategories || []).forEach(function (sub) {
      var subTags = (sub.tags || []).map(function (tag) {
        return String(tag).trim().toLowerCase();
      }).filter(Boolean);
      if (tagsMatchAny(tagsJoined, subTags)) {
        subcategories.push(sub.id);
      }
    });

    var roleLabel = '';
    (filterConfig.churchSubcategories || []).some(function (sub) {
      if (subcategories.indexOf(sub.id) !== -1 && categories.indexOf('church') !== -1) {
        roleLabel = sub.label;
        return true;
      }
      return false;
    });
    if (!roleLabel) {
      (filterConfig.roles || []).some(function (role) {
        if (categories.indexOf(role.id) !== -1) {
          roleLabel = role.label;
          return true;
        }
        return false;
      });
    }

    return {
      categories: categories,
      subcategories: subcategories,
      roleLabel: roleLabel,
      adult: isAdultTagged(tagsJoined) ? 1 : 0,
      bestseller: tagContains(tagsJoined, 'bestseller') ? 1 : 0,
      valid: isRoleBadge(tagsJoined) && !isDeskSign(tagsJoined),
    };
  }

  function formatMoney(price) {
    if (price == null || price === '') return '';
    if (typeof price === 'string') {
      var parsed = parseFloat(price);
      return isNaN(parsed) ? '' : '$' + parsed.toFixed(2);
    }
    return '$' + (price / 100).toFixed(2);
  }

  function productUrl(product) {
    if (product.url) return product.url;
    if (product.handle) return '/products/' + product.handle;
    return '#';
  }

  function productImageSrc(product) {
    if (product.featured_image) return product.featured_image;
    if (product.images && product.images.length && product.images[0].src) {
      return product.images[0].src;
    }
    if (product.image && product.image.src) return product.image.src;
    return '';
  }

  function variantPriceCents(product) {
    var variant = product.variants && product.variants[0];
    if (!variant || variant.price == null) return 0;
    if (typeof variant.price === 'string') {
      return Math.round(parseFloat(variant.price) * 100);
    }
    return parseInt(variant.price, 10) || 0;
  }

  function buildCardElement(product, index) {
    var tags = product.tags;
    if (typeof tags === 'string') {
      tags = tags.split(',').map(function (t) {
        return t.trim();
      }).filter(Boolean);
    } else if (!Array.isArray(tags)) {
      tags = [];
    }

    var info = classifyProduct(tags);
    if (!info.valid) return null;

    var variant = product.variants && product.variants[0];
    var article = document.createElement('article');
    article.className = 'aqb-rb-product-card is-filtered-out';
    article.setAttribute('data-categories', info.categories.join(' '));
    article.setAttribute('data-subcategories', info.subcategories.join(' '));
    article.setAttribute('data-product-id', String(product.id));
    article.setAttribute('data-product-index', String(index));
    article.setAttribute('data-title', product.title || '');
    article.setAttribute('data-price', String(variantPriceCents(product)));
    article.setAttribute('data-bestseller', String(info.bestseller));
    article.setAttribute('data-adult', String(info.adult));

    var url = productUrl(product);
    var imageSrc = productImageSrc(product);
    var imageHtml = '';
    if (imageSrc) {
      imageHtml =
        '<img src="' +
        imageSrc +
        '" alt="' +
        (product.title || '').replace(/"/g, '&quot;') +
        '" loading="lazy">';
    } else {
      imageHtml =
        '<div class="aqb-rb-card-badge-render white-badge"><span class="aqb-rb-card-badge-text">' +
        (product.title || '') +
        '</span></div>';
    }

    var newPill = tagContains(tagList(tags), 'new')
      ? '<span class="aqb-rb-card-new-pill">New</span>'
      : '';

    var footerHtml = '';
    if (variant && variant.available) {
      footerHtml =
        '<form method="post" action="' +
        cartAddUrl +
        '" class="aqb-rb-card-add-form"><input type="hidden" name="id" value="' +
        variant.id +
        '"><button type="submit" class="aqb-rb-card-add">' +
        addLabel +
        '</button></form>';
    } else {
      footerHtml = '<a href="' + url + '" class="aqb-rb-card-add">' + addLabel + '</a>';
    }

    var roleLabelHtml = info.roleLabel
      ? '<div class="aqb-rb-card-category-label">' + info.roleLabel + '</div>'
      : '';
    var priceSubHtml = priceSubtext
      ? '<span class="aqb-rb-card-price-sub">' + priceSubtext + '</span>'
      : '';

    article.innerHTML =
      '<a href="' +
      url +
      '" class="aqb-rb-card-image" tabindex="-1" aria-hidden="true">' +
      imageHtml +
      newPill +
      '<span class="aqb-rb-card-pack-pill">' +
      packLabel +
      '</span></a><div class="aqb-rb-card-body">' +
      roleLabelHtml +
      '<a href="' +
      url +
      '" class="aqb-rb-card-role">' +
      (product.title || '') +
      '</a><div class="aqb-rb-card-footer"><div>' +
      (variant ? '<span class="aqb-rb-card-price">' + formatMoney(variant.price) + '</span>' : '') +
      priceSubHtml +
      '</div>' +
      footerHtml +
      '</div></div>';

    return article;
  }

  function totalCollectionPages() {
    return Math.max(1, Math.ceil(totalProducts / collectionPageSize));
  }

  function existingProductIds() {
    var ids = {};
    refreshCards().forEach(function (card) {
      ids[card.getAttribute('data-product-id')] = true;
    });
    return ids;
  }

  function loadNextCollectionPage() {
    if (!collectionHandle || loadingCollection || allCollectionLoaded) {
      return Promise.resolve(false);
    }

    var nextPage = collectionPage + 1;
    if (nextPage > totalCollectionPages()) {
      allCollectionLoaded = true;
      return Promise.resolve(false);
    }

    loadingCollection = true;
    return fetch(
      '/collections/' +
        encodeURIComponent(collectionHandle) +
        '/products.json?limit=' +
        collectionPageSize +
        '&page=' +
        nextPage
    )
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        var products = data.products || [];
        if (!products.length) {
          allCollectionLoaded = true;
          return false;
        }

        var ids = existingProductIds();
        var startIndex = refreshCards().length;
        products.forEach(function (product, i) {
          if (ids[String(product.id)]) return;
          var card = buildCardElement(product, startIndex + i);
          if (card) grid.appendChild(card);
        });

        collectionPage = nextPage;
        if (collectionPage >= totalCollectionPages()) {
          allCollectionLoaded = true;
        }

        cards = refreshCards();
        return true;
      })
      .catch(function () {
        return false;
      })
      .finally(function () {
        loadingCollection = false;
      });
  }

  function readCheckboxGroup(container, attr) {
    if (!container) return [];
    return Array.prototype.slice
      .call(container.querySelectorAll('input[type="checkbox"]:checked'))
      .map(function (input) {
        return input.getAttribute(attr) || input.value;
      })
      .filter(Boolean);
  }

  function readChurchSubcategories() {
    return Array.prototype.slice
      .call(filterBar.querySelectorAll('input[data-subcategory][data-for-role="church"]:checked'))
      .map(function (input) {
        return input.getAttribute('data-subcategory');
      })
      .filter(Boolean);
  }

  function syncSubfilterVisibility() {
    var churchPanel = document.getElementById('role-badges-subfilter-church');
    if (!churchPanel) return;
    var churchSelected = selectedRoles.indexOf('church') !== -1;
    churchPanel.hidden = !churchSelected;
    if (!churchSelected) {
      churchPanel.querySelectorAll('input[data-subcategory]').forEach(function (input) {
        input.checked = false;
      });
      selectedChurchSubcategories = [];
    }
  }

  function readStateFromUi() {
    selectedRoles = readCheckboxGroup(document.getElementById('role-badges-filter-roles'), 'data-role');
    selectedChurchSubcategories = readChurchSubcategories();
    sortBy = sortSelect ? sortSelect.value : 'featured';
    priceMin = priceMinInput && priceMinInput.value !== '' ? parseFloat(priceMinInput.value) : null;
    priceMax = priceMaxInput && priceMaxInput.value !== '' ? parseFloat(priceMaxInput.value) : null;
    showAdult = !!(adultCheckbox && adultCheckbox.checked);
  }

  function parseUrlState() {
    var params = new URLSearchParams(window.location.search);
    selectedRoles = (params.get('role') || '')
      .split(',')
      .map(function (v) {
        return v.trim();
      })
      .filter(Boolean);
    selectedChurchSubcategories = (params.get('sub') || '')
      .split(',')
      .map(function (v) {
        return v.trim();
      })
      .filter(Boolean)
      .map(function (value) {
        return value.indexOf('church:') === 0 ? value.slice(7) : '';
      })
      .filter(Boolean);
    sortBy = params.get('sort') || 'featured';
    if (
      ['featured', 'price-asc', 'price-desc', 'bestseller', 'alpha-asc', 'alpha-desc'].indexOf(sortBy) === -1
    ) {
      sortBy = 'featured';
    }
    priceMin = params.get('min') ? parseFloat(params.get('min')) : null;
    priceMax = params.get('max') ? parseFloat(params.get('max')) : null;
    showAdult = params.get('adult') === '1';
  }

  function applyUrlStateToUi() {
    filterBar.querySelectorAll('input[data-role]').forEach(function (input) {
      input.checked = selectedRoles.indexOf(input.getAttribute('data-role')) !== -1;
    });
    filterBar.querySelectorAll('input[data-subcategory][data-for-role="church"]').forEach(function (input) {
      input.checked = selectedChurchSubcategories.indexOf(input.getAttribute('data-subcategory')) !== -1;
    });
    syncSubfilterVisibility();
    if (sortSelect) sortSelect.value = sortBy;
    if (priceMinInput) priceMinInput.value = priceMin != null && !isNaN(priceMin) ? String(priceMin) : '';
    if (priceMaxInput) priceMaxInput.value = priceMax != null && !isNaN(priceMax) ? String(priceMax) : '';
    if (adultCheckbox) adultCheckbox.checked = showAdult;
  }

  function updateUrl() {
    var params = new URLSearchParams();
    if (selectedRoles.length) params.set('role', selectedRoles.join(','));
    if (selectedChurchSubcategories.length) {
      params.set(
        'sub',
        selectedChurchSubcategories.map(function (id) {
          return 'church:' + id;
        }).join(',')
      );
    }
    if (sortBy !== 'featured') params.set('sort', sortBy);
    if (priceMin != null && !isNaN(priceMin)) params.set('min', String(priceMin));
    if (priceMax != null && !isNaN(priceMax)) params.set('max', String(priceMax));
    if (showAdult) params.set('adult', '1');

    var query = params.toString();
    var next = catalogueBase + (query ? '?' + query : '');
    window.history.replaceState({}, '', next);
  }

  function cardMatches(card) {
    var categories = (card.getAttribute('data-categories') || '').split(/\s+/).filter(Boolean);
    var subcategories = (card.getAttribute('data-subcategories') || '').split(/\s+/).filter(Boolean);
    var priceCents = parseInt(card.getAttribute('data-price'), 10) || 0;
    var isAdult = card.getAttribute('data-adult') === '1';

    if (!showAdult && isAdult) return false;

    if (selectedRoles.length) {
      var roleMatch = selectedRoles.some(function (role) {
        return categories.indexOf(role) !== -1;
      });
      if (!roleMatch) return false;
    }

    if (selectedRoles.indexOf('church') !== -1 && selectedChurchSubcategories.length) {
      if (categories.indexOf('church') === -1) return false;
      var churchSubMatch = selectedChurchSubcategories.some(function (sub) {
        return subcategories.indexOf(sub) !== -1;
      });
      if (!churchSubMatch) return false;
    }

    if (priceMin != null && !isNaN(priceMin) && priceCents < Math.round(priceMin * 100)) return false;
    if (priceMax != null && !isNaN(priceMax) && priceCents > Math.round(priceMax * 100)) return false;

    return true;
  }

  function compareCards(a, b) {
    var indexA = parseInt(a.getAttribute('data-product-index'), 10) || 0;
    var indexB = parseInt(b.getAttribute('data-product-index'), 10) || 0;
    var priceA = parseInt(a.getAttribute('data-price'), 10) || 0;
    var priceB = parseInt(b.getAttribute('data-price'), 10) || 0;
    var titleA = (a.getAttribute('data-title') || '').toLowerCase();
    var titleB = (b.getAttribute('data-title') || '').toLowerCase();
    var bestA = a.getAttribute('data-bestseller') === '1' ? 1 : 0;
    var bestB = b.getAttribute('data-bestseller') === '1' ? 1 : 0;

    if (sortBy === 'price-asc') return priceA - priceB || indexA - indexB;
    if (sortBy === 'price-desc') return priceB - priceA || indexA - indexB;
    if (sortBy === 'alpha-asc') return titleA.localeCompare(titleB) || indexA - indexB;
    if (sortBy === 'alpha-desc') return titleB.localeCompare(titleA) || indexA - indexB;
    if (sortBy === 'bestseller') {
      if (bestA !== bestB) return bestB - bestA;
      return indexA - indexB;
    }
    return indexA - indexB;
  }

  function filteredCards() {
    return refreshCards().filter(cardMatches).sort(compareCards);
  }

  function reorderGrid(filtered) {
    filtered.forEach(function (card) {
      grid.appendChild(card);
    });
  }

  function renderGrid() {
    cards = refreshCards();
    var filtered = filteredCards();
    reorderGrid(filtered);
    var visibleCount = pageSize * currentPage;

    cards.forEach(function (card) {
      card.classList.add('is-filtered-out');
    });

    filtered.slice(0, visibleCount).forEach(function (card) {
      card.classList.remove('is-filtered-out');
    });

    var shown = Math.min(visibleCount, filtered.length);
    if (countEl) {
      countEl.textContent = 'Showing ' + shown + ' of ' + filtered.length + ' badges';
    }

    if (loadWrap) {
      var canShowMoreFiltered = shown < filtered.length;
      var canLoadMoreCollection = !allCollectionLoaded && collectionHandle;
      loadWrap.hidden = !canShowMoreFiltered && !canLoadMoreCollection;
    }
  }

  function resetAndRender() {
    currentPage = 1;
    readStateFromUi();
    syncSubfilterVisibility();
    updateUrl();
    renderGrid();
  }

  function clearAllFilters() {
    selectedRoles = [];
    selectedChurchSubcategories = [];
    sortBy = 'featured';
    priceMin = null;
    priceMax = null;
    showAdult = false;
    applyUrlStateToUi();
    currentPage = 1;
    updateUrl();
    renderGrid();
  }

  function handleLoadMore() {
    var filtered = filteredCards();
    var visibleCount = pageSize * currentPage;

    if (visibleCount < filtered.length) {
      currentPage += 1;
      renderGrid();
      return;
    }

    loadNextCollectionPage().then(function (loaded) {
      if (loaded) {
        currentPage += 1;
      }
      renderGrid();
    });
  }

  filterBar.addEventListener('change', function (e) {
    if (e.target.matches('input[type="checkbox"], select')) {
      resetAndRender();
    }
  });

  if (priceMinInput) priceMinInput.addEventListener('change', resetAndRender);
  if (priceMaxInput) priceMaxInput.addEventListener('change', resetAndRender);
  if (sortSelect) sortSelect.addEventListener('change', resetAndRender);
  if (clearBtn) clearBtn.addEventListener('click', clearAllFilters);

  if (filterToggle && filterPanel) {
    filterToggle.addEventListener('click', function () {
      var expanded = filterToggle.getAttribute('aria-expanded') === 'true';
      filterToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      filterPanel.classList.toggle('is-open', !expanded);
    });
  }

  if (loadBtn) loadBtn.addEventListener('click', handleLoadMore);

  function loadAllRemainingPages() {
    return loadNextCollectionPage().then(function (loaded) {
      if (loaded && !allCollectionLoaded) {
        return loadAllRemainingPages();
      }
      return loaded;
    });
  }

  var scrollControls = document.getElementById('role-badges-scroll-controls');
  var scrollTopBtn = document.getElementById('role-badges-scroll-top');
  var scrollBottomBtn = document.getElementById('role-badges-scroll-bottom');

  function updateScrollButtons() {
    if (!scrollControls) return;
    var scrollY = window.scrollY || document.documentElement.scrollTop;
    var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    scrollControls.classList.toggle('is-at-top', scrollY < 80);
    scrollControls.classList.toggle('is-at-bottom', scrollY >= maxScroll - 80);
  }

  if (scrollTopBtn) {
    scrollTopBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  if (scrollBottomBtn) {
    scrollBottomBtn.addEventListener('click', function () {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    });
  }
  if (scrollControls) {
    window.addEventListener('scroll', updateScrollButtons, { passive: true });
    updateScrollButtons();
  }

  parseUrlState();
  applyUrlStateToUi();
  renderGrid();

  if (collectionHandle && totalProducts > cards.length) {
    loadAllRemainingPages().then(function () {
      renderGrid();
    });
  }
})();
