(function () {
  var grid = document.getElementById('desk-signs-catalogue-grid');
  var filterBar = document.getElementById('desk-signs-catalogue-filters');
  if (!grid || !filterBar) return;

  var countEl = document.getElementById('desk-signs-catalogue-count');
  var loadWrap = document.getElementById('desk-signs-catalogue-load-more');
  var loadBtn = document.getElementById('desk-signs-catalogue-load-btn');
  var sortSelect = document.getElementById('desk-signs-sort');
  var priceMinInput = document.getElementById('desk-signs-price-min');
  var priceMaxInput = document.getElementById('desk-signs-price-max');
  var adultCheckbox = document.getElementById('desk-signs-adult');
  var clearBtn = document.getElementById('desk-signs-filter-clear');
  var filterToggle = document.getElementById('desk-signs-filter-toggle');
  var filterPanel = document.getElementById('desk-signs-filter-panel');

  var pageSize = parseInt(grid.getAttribute('data-page-size'), 10) || 12;
  var catalogueBase = grid.getAttribute('data-catalogue-base') || '/pages/desk-signs-catalogue';
  var collectionHandle = grid.getAttribute('data-collection-handle') || '';
  var totalProducts = parseInt(grid.getAttribute('data-total-products'), 10) || 0;
  var addLabel = grid.getAttribute('data-add-label') || 'Add to cart';
  var cartAddUrl = grid.getAttribute('data-cart-add-url') || '/cart/add';

  var filterConfig = { professionCategories: [], noveltyCategories: [] };
  var configEl = document.getElementById('desk-signs-filter-config');
  if (configEl) {
    try {
      filterConfig = JSON.parse(configEl.textContent);
    } catch (e) {
      filterConfig = { professionCategories: [], noveltyCategories: [] };
    }
  }

  var selectedMaterials = [];
  var selectedTypes = [];
  var selectedSubcategories = { profession: [], novelty: [] };
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
    return Array.prototype.slice.call(grid.querySelectorAll('.aqb-ds-cat-card'));
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

  function classifyProduct(tags) {
    var tagsJoined = tagList(tags);
    var signType = 'profession';
    var categories = [];

    if (
      tagContains(tagsJoined, 'gift-pack') ||
      tagContains(tagsJoined, 'giftpack') ||
      tagContains(tagsJoined, 'gift pack') ||
      tagContains(tagsJoined, 'gift-packs')
    ) {
      signType = 'gifts';
    } else if (
      tagContains(tagsJoined, 'novelty') ||
      tagContains(tagsJoined, 'humor') ||
      tagContains(tagsJoined, 'humour')
    ) {
      signType = 'novelty';
      filterConfig.noveltyCategories.forEach(function (cat) {
        if (tagContains(tagsJoined, cat.tag)) categories.push(cat.id);
      });
    } else {
      filterConfig.professionCategories.forEach(function (cat) {
        if (tagContains(tagsJoined, cat.tag)) categories.push(cat.id);
      });
    }

    var material = 'acrylic';
    if (tagContains(tagsJoined, 'rosewood')) material = 'rosewood';
    else if (tagContains(tagsJoined, 'plastic') || tagContains(tagsJoined, 'insert')) {
      material = 'plastic';
    }

    return {
      material: material,
      type: signType,
      categories: categories,
      adult: isAdultTagged(tagsJoined) ? 1 : 0,
      bestseller: tagContains(tagsJoined, 'bestseller') ? 1 : 0,
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

  function materialLabel(material) {
    if (material === 'plastic') return 'Traditional';
    return material.charAt(0).toUpperCase() + material.slice(1);
  }

  function metaLabel(material, type) {
    var label = materialLabel(material);
    if (type === 'profession') return label + ' · Profession';
    if (type === 'novelty') return label + ' · Novelty';
    return label + ' · Gift Pack';
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
    var variant = product.variants && product.variants[0];
    var article = document.createElement('article');
    article.className = 'aqb-ds-cat-card is-filtered-out';
    article.setAttribute('data-material', info.material);
    article.setAttribute('data-type', info.type);
    article.setAttribute('data-categories', info.categories.join(' '));
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
      imageHtml = '<div class="aqb-ds-cat-card__placeholder">' + (product.title || '') + '</div>';
    }

    var badgeHtml = '';
    if (info.bestseller) {
      badgeHtml = '<span class="aqb-ds-cat-card__badge">Bestseller</span>';
    }

    var footerHtml = '';
    if (variant && variant.available) {
      footerHtml =
        '<form method="post" action="' +
        cartAddUrl +
        '"><input type="hidden" name="id" value="' +
        variant.id +
        '"><button type="submit" class="aqb-ds-cat-card__add">' +
        addLabel +
        '</button></form>';
    } else {
      footerHtml =
        '<a href="' +
        url +
        '" class="aqb-ds-cat-card__add">' +
        addLabel +
        '</a>';
    }

    article.innerHTML =
      '<a href="' +
      url +
      '" class="aqb-ds-cat-card__img" tabindex="-1" aria-hidden="true">' +
      imageHtml +
      badgeHtml +
      '</a><div class="aqb-ds-cat-card__body"><a href="' +
      url +
      '" class="aqb-ds-cat-card__title">' +
      (product.title || '') +
      '</a><div class="aqb-ds-cat-card__meta">' +
      metaLabel(info.material, info.type) +
      '</div><div class="aqb-ds-cat-card__footer"><span class="aqb-ds-cat-card__price">' +
      (variant ? formatMoney(variant.price) : '') +
      '</span>' +
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
          grid.appendChild(buildCardElement(product, startIndex + i));
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

  function readSubcategories() {
    var result = { profession: [], novelty: [] };
    filterBar.querySelectorAll('input[data-category]:checked').forEach(function (input) {
      var forType = input.getAttribute('data-for-type');
      var category = input.getAttribute('data-category');
      if (forType && category && result[forType]) {
        result[forType].push(category);
      }
    });
    return result;
  }

  function readStateFromUi() {
    selectedMaterials = readCheckboxGroup(document.getElementById('desk-signs-filter-material'), 'data-material');
    selectedTypes = readCheckboxGroup(document.getElementById('desk-signs-filter-type'), 'data-type');
    selectedSubcategories = readSubcategories();
    sortBy = sortSelect ? sortSelect.value : 'featured';
    priceMin = priceMinInput && priceMinInput.value !== '' ? parseFloat(priceMinInput.value) : null;
    priceMax = priceMaxInput && priceMaxInput.value !== '' ? parseFloat(priceMaxInput.value) : null;
    showAdult = !!(adultCheckbox && adultCheckbox.checked);
  }

  function syncSubfilterVisibility() {
    filterBar.querySelectorAll('.aqb-ds-cat-subfilter-group').forEach(function (group) {
      var forType = group.getAttribute('data-for-type');
      group.hidden = selectedTypes.indexOf(forType) === -1;
    });
  }

  function parseUrlState() {
    var params = new URLSearchParams(window.location.search);
    selectedMaterials = (params.get('material') || '')
      .split(',')
      .map(function (v) {
        return v.trim();
      })
      .filter(function (v) {
        return ['acrylic', 'rosewood', 'plastic'].indexOf(v) !== -1;
      });
    selectedTypes = (params.get('type') || '')
      .split(',')
      .map(function (v) {
        return v.trim();
      })
      .filter(function (v) {
        return ['profession', 'novelty'].indexOf(v) !== -1;
      });
    selectedSubcategories = { profession: [], novelty: [] };
    (params.get('sub') || '')
      .split(',')
      .map(function (v) {
        return v.trim();
      })
      .filter(Boolean)
      .forEach(function (value) {
        if (value.indexOf('prof:') === 0) {
          selectedSubcategories.profession.push(value.slice(5));
        } else if (value.indexOf('nov:') === 0) {
          selectedSubcategories.novelty.push(value.slice(4));
        }
      });
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
    filterBar.querySelectorAll('input[data-material]').forEach(function (input) {
      input.checked = selectedMaterials.indexOf(input.getAttribute('data-material')) !== -1;
    });
    filterBar.querySelectorAll('input[data-type]').forEach(function (input) {
      input.checked = selectedTypes.indexOf(input.getAttribute('data-type')) !== -1;
    });
    filterBar.querySelectorAll('input[data-category]').forEach(function (input) {
      var forType = input.getAttribute('data-for-type');
      var category = input.getAttribute('data-category');
      var selected = selectedSubcategories[forType] || [];
      input.checked = selected.indexOf(category) !== -1;
    });
    if (sortSelect) sortSelect.value = sortBy;
    if (priceMinInput) priceMinInput.value = priceMin != null && !isNaN(priceMin) ? String(priceMin) : '';
    if (priceMaxInput) priceMaxInput.value = priceMax != null && !isNaN(priceMax) ? String(priceMax) : '';
    if (adultCheckbox) adultCheckbox.checked = showAdult;
    syncSubfilterVisibility();
  }

  function updateUrl() {
    var params = new URLSearchParams();
    if (selectedMaterials.length) params.set('material', selectedMaterials.join(','));
    if (selectedTypes.length) params.set('type', selectedTypes.join(','));
    var subValues = [];
    selectedSubcategories.profession.forEach(function (id) {
      subValues.push('prof:' + id);
    });
    selectedSubcategories.novelty.forEach(function (id) {
      subValues.push('nov:' + id);
    });
    if (subValues.length) params.set('sub', subValues.join(','));
    if (sortBy !== 'featured') params.set('sort', sortBy);
    if (priceMin != null && !isNaN(priceMin)) params.set('min', String(priceMin));
    if (priceMax != null && !isNaN(priceMax)) params.set('max', String(priceMax));
    if (showAdult) params.set('adult', '1');

    var query = params.toString();
    var next = catalogueBase + (query ? '?' + query : '');
    window.history.replaceState({}, '', next);
  }

  function cardMatches(card) {
    var material = card.getAttribute('data-material') || '';
    var type = card.getAttribute('data-type') || '';
    var categories = (card.getAttribute('data-categories') || '').split(/\s+/).filter(Boolean);
    var priceCents = parseInt(card.getAttribute('data-price'), 10) || 0;
    var isAdult = card.getAttribute('data-adult') === '1';

    if (type === 'gifts') return false;
    if (!showAdult && isAdult) return false;

    if (selectedMaterials.length && selectedMaterials.indexOf(material) === -1) return false;

    if (selectedTypes.length && selectedTypes.indexOf(type) === -1) return false;

    if (selectedTypes.indexOf('profession') !== -1 && selectedSubcategories.profession.length) {
      if (type === 'profession') {
        var profMatch = selectedSubcategories.profession.some(function (cat) {
          return categories.indexOf(cat) !== -1;
        });
        if (!profMatch) return false;
      }
    }

    if (selectedTypes.indexOf('novelty') !== -1 && selectedSubcategories.novelty.length) {
      if (type === 'novelty') {
        var novMatch = selectedSubcategories.novelty.some(function (cat) {
          return categories.indexOf(cat) !== -1;
        });
        if (!novMatch) return false;
      }
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
      countEl.textContent = 'Showing ' + shown + ' of ' + filtered.length + ' signs';
      if (totalProducts > cards.length) {
        countEl.textContent += ' (' + cards.length + ' loaded)';
      }
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
    selectedMaterials = [];
    selectedTypes = [];
    selectedSubcategories = { profession: [], novelty: [] };
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

  if (priceMinInput) {
    priceMinInput.addEventListener('change', resetAndRender);
  }
  if (priceMaxInput) {
    priceMaxInput.addEventListener('change', resetAndRender);
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', resetAndRender);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', clearAllFilters);
  }

  if (filterToggle && filterPanel) {
    filterToggle.addEventListener('click', function () {
      var expanded = filterToggle.getAttribute('aria-expanded') === 'true';
      filterToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      filterPanel.classList.toggle('is-open', !expanded);
    });
  }

  if (loadBtn) {
    loadBtn.addEventListener('click', handleLoadMore);
  }

  function loadAllRemainingPages() {
    return loadNextCollectionPage().then(function (loaded) {
      if (loaded && !allCollectionLoaded) {
        return loadAllRemainingPages();
      }
      return loaded;
    });
  }

  parseUrlState();
  applyUrlStateToUi();
  renderGrid();

  if (collectionHandle && totalProducts > cards.length) {
    loadAllRemainingPages().then(function () {
      renderGrid();
    });
  }

  var scrollControls = document.getElementById('desk-signs-scroll-controls');
  var scrollTopBtn = document.getElementById('desk-signs-scroll-top');
  var scrollBottomBtn = document.getElementById('desk-signs-scroll-bottom');

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
})();
