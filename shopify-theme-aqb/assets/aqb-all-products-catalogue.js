(function () {
  var grid = document.getElementById('all-products-product-grid');
  var filterBar = document.getElementById('all-products-catalogue-filters');
  if (!grid || !filterBar) return;

  var countEl = document.getElementById('all-products-product-count');
  var loadWrap = document.getElementById('all-products-load-more-wrap');
  var loadBtn = document.getElementById('all-products-load-more');
  var sortSelect = document.getElementById('all-products-sort');
  var priceMinInput = document.getElementById('all-products-price-min');
  var priceMaxInput = document.getElementById('all-products-price-max');
  var adultCheckbox = document.getElementById('all-products-adult');
  var clearBtn = document.getElementById('all-products-filter-clear');
  var filterToggle = document.getElementById('all-products-filter-toggle');
  var filterPanel = document.getElementById('all-products-filter-panel');

  var pageSize = parseInt(grid.getAttribute('data-page-size'), 10) || 12;
  var catalogueBase = grid.getAttribute('data-catalogue-base') || '/collections/all';
  var collectionHandle = grid.getAttribute('data-collection-handle') || '';
  var totalProducts = parseInt(grid.getAttribute('data-total-products'), 10) || 0;
  var addLabel = grid.getAttribute('data-add-label') || 'Add to cart';
  var cartAddUrl = grid.getAttribute('data-cart-add-url') || '/cart/add';

  var filterConfig = {
    productTypes: [],
    roles: [],
    churchSubcategories: [],
    professionCategories: [],
    noveltyCategories: [],
  };
  var configEl = document.getElementById('all-products-filter-config');
  if (configEl) {
    try {
      filterConfig = JSON.parse(configEl.textContent);
    } catch (e) {
      filterConfig = {
        productTypes: [],
        roles: [],
        churchSubcategories: [],
        professionCategories: [],
        noveltyCategories: [],
      };
    }
  }

  var selectedTypes = [];
  var selectedRoles = [];
  var selectedChurchSubs = [];
  var selectedMaterials = [];
  var selectedSignTypes = [];
  var selectedDeskCategories = { profession: [], novelty: [] };
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
    return Array.prototype.slice.call(grid.querySelectorAll('.aqb-ap-card'));
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

  function tagsMatchAny(tagsJoined, tagListToMatch) {
    return (tagListToMatch || []).some(function (tag) {
      return tagContains(tagsJoined, tag);
    });
  }

  function isAdultTagged(tagsJoined) {
    return (
      tagContains(tagsJoined, '18+') ||
      tagContains(tagsJoined, '18plus') ||
      tagContains(tagsJoined, 'adult')
    );
  }

  function classifyProductType(tags, handle) {
    var tagsJoined = tagList(tags);
    if (tagContains(tagsJoined, 'desk-sign') || tagContains(tagsJoined, 'desk sign')) {
      return 'desk-plates';
    }
    if (tagContains(tagsJoined, 'role-badge')) {
      return 'role-badges';
    }
    if (
      tagContains(tagsJoined, 'name-tag-blank') ||
      tagContains(tagsJoined, 'blank-name-tag') ||
      tagContains(tagsJoined, 'type_blank')
    ) {
      return 'name-tag-blanks';
    }
    if (handle && handle.indexOf('custom') !== -1) {
      return 'custom-badges';
    }
    return 'other';
  }

  function classifyRoleBadge(tags) {
    var tagsJoined = tagList(tags);
    var roles = [];
    var churchSubs = [];

    (filterConfig.roles || []).forEach(function (role) {
      if (tagContains(tagsJoined, role.tag)) roles.push(role.id);
    });

    (filterConfig.churchSubcategories || []).forEach(function (sub) {
      var subTags = (sub.tags || []).map(function (tag) {
        return String(tag).trim().toLowerCase();
      }).filter(Boolean);
      if (tagsMatchAny(tagsJoined, subTags)) {
        churchSubs.push(sub.id);
      }
    });

    return { roles: roles, churchSubs: churchSubs };
  }

  function classifyDeskPlate(tags) {
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
      (filterConfig.noveltyCategories || []).forEach(function (cat) {
        if (tagContains(tagsJoined, cat.tag)) categories.push(cat.id);
      });
    } else {
      (filterConfig.professionCategories || []).forEach(function (cat) {
        if (tagContains(tagsJoined, cat.tag)) categories.push(cat.id);
      });
    }

    var material = 'acrylic';
    if (tagContains(tagsJoined, 'rosewood')) material = 'rosewood';
    else if (tagContains(tagsJoined, 'plastic') || tagContains(tagsJoined, 'insert')) {
      material = 'plastic';
    }

    return { material: material, signType: signType, categories: categories };
  }

  function materialLabel(material) {
    if (material === 'plastic') return 'Traditional';
    return material.charAt(0).toUpperCase() + material.slice(1);
  }

  function cardMetaLabel(productType, roleInfo, deskInfo) {
    if (productType === 'desk-plates' && deskInfo) {
      var label = materialLabel(deskInfo.material);
      if (deskInfo.signType === 'profession') return label + ' · Profession';
      if (deskInfo.signType === 'novelty') return label + ' · Novelty';
      return label + ' · Gift Pack';
    }
    if (productType === 'role-badges' && roleInfo) {
      var subLabel = '';
      (filterConfig.churchSubcategories || []).some(function (sub) {
        if (roleInfo.churchSubs.indexOf(sub.id) !== -1 && roleInfo.roles.indexOf('church') !== -1) {
          subLabel = sub.label;
          return true;
        }
        return false;
      });
      if (subLabel) return subLabel;
      var roleLabel = '';
      (filterConfig.roles || []).some(function (role) {
        if (roleInfo.roles.indexOf(role.id) !== -1) {
          roleLabel = role.label;
          return true;
        }
        return false;
      });
      return roleLabel || 'Role Badges';
    }
    var typeMatch = (filterConfig.productTypes || []).find(function (t) {
      return t.id === productType;
    });
    return (typeMatch && typeMatch.label) || 'Product';
  }

  function formatMoney(cents) {
    if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
      return window.Shopify.formatMoney(cents);
    }
    return '$' + (cents / 100).toFixed(2);
  }

  function buildCardElement(product, index) {
    var tags = product.tags || [];
    if (typeof tags === 'string') {
      tags = tags.split(',').map(function (t) {
        return t.trim();
      }).filter(Boolean);
    }
    var handle = product.handle || '';
    var productType = classifyProductType(tags, handle);
    var roleInfo = productType === 'role-badges' ? classifyRoleBadge(tags) : { roles: [], churchSubs: [] };
    var deskInfo =
      productType === 'desk-plates'
        ? classifyDeskPlate(tags)
        : { material: 'acrylic', signType: 'profession', categories: [] };
    var variant = (product.variants && product.variants[0]) || null;
    var tagsJoined = tagList(tags);
    var isAdult = isAdultTagged(tagsJoined) ? '1' : '0';
    var isBestseller = tagContains(tagsJoined, 'bestseller') ? '1' : '0';
    var url = '/products/' + handle;
    var imageSrc =
      product.featured_image ||
      (product.images && product.images[0] && (product.images[0].src || product.images[0])) ||
      '';

    var article = document.createElement('article');
    article.className = 'aqb-ap-card is-filtered-out';
    article.setAttribute('data-product-type', productType);
    article.setAttribute('data-roles', roleInfo.roles.join(' '));
    article.setAttribute('data-church-subs', roleInfo.churchSubs.join(' '));
    article.setAttribute('data-desk-material', deskInfo.material);
    article.setAttribute('data-desk-sign-type', deskInfo.signType);
    article.setAttribute('data-desk-categories', deskInfo.categories.join(' '));
    article.setAttribute('data-product-id', String(product.id));
    article.setAttribute('data-product-index', String(index));
    article.setAttribute('data-title', product.title || '');
    article.setAttribute('data-price', variant ? String(variant.price) : '0');
    article.setAttribute('data-bestseller', isBestseller);
    article.setAttribute('data-adult', isAdult);

    var imageHtml = imageSrc
      ? '<img src="' + imageSrc + '" alt="' + (product.title || '') + '" loading="lazy">'
      : '<div class="aqb-ap-card__placeholder">' + (product.title || '') + '</div>';

    var badgeHtml = '';
    if (tagContains(tagsJoined, 'new')) {
      badgeHtml = '<span class="aqb-ap-card__badge">New</span>';
    } else if (tagContains(tagsJoined, 'bestseller')) {
      badgeHtml = '<span class="aqb-ap-card__badge">Bestseller</span>';
    }

    var footerHtml = '';
    if (variant && variant.available) {
      footerHtml =
        '<form method="post" action="' +
        cartAddUrl +
        '"><input type="hidden" name="id" value="' +
        variant.id +
        '"><button type="submit" class="aqb-ap-card__add">' +
        addLabel +
        '</button></form>';
    } else {
      footerHtml = '<a href="' + url + '" class="aqb-ap-card__add">' + addLabel + '</a>';
    }

    article.innerHTML =
      '<a href="' +
      url +
      '" class="aqb-ap-card__image" tabindex="-1" aria-hidden="true">' +
      imageHtml +
      badgeHtml +
      '</a><div class="aqb-ap-card__body"><div class="aqb-ap-card__type">' +
      cardMetaLabel(productType, roleInfo, deskInfo) +
      '</div><a href="' +
      url +
      '" class="aqb-ap-card__title">' +
      (product.title || '') +
      '</a><div class="aqb-ap-card__footer"><span class="aqb-ap-card__price">' +
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

  function readDeskCategories() {
    var result = { profession: [], novelty: [] };
    filterBar.querySelectorAll('input[data-desk-category]:checked').forEach(function (input) {
      var forSign = input.getAttribute('data-for-sign');
      var category = input.getAttribute('data-desk-category');
      if (forSign && category && result[forSign]) {
        result[forSign].push(category);
      }
    });
    return result;
  }

  function readStateFromUi() {
    selectedTypes = readCheckboxGroup(document.getElementById('all-products-filter-types'), 'data-product-type');
    selectedRoles = readCheckboxGroup(document.getElementById('all-products-filter-roles'), 'data-role');
    selectedChurchSubs = readCheckboxGroup(filterBar, 'data-church-sub');
    selectedMaterials = readCheckboxGroup(document.getElementById('all-products-filter-material'), 'data-material');
    selectedSignTypes = readCheckboxGroup(document.getElementById('all-products-filter-sign-type'), 'data-sign-type');
    selectedDeskCategories = readDeskCategories();
    sortBy = sortSelect ? sortSelect.value : 'featured';
    priceMin = priceMinInput && priceMinInput.value !== '' ? parseFloat(priceMinInput.value) : null;
    priceMax = priceMaxInput && priceMaxInput.value !== '' ? parseFloat(priceMaxInput.value) : null;
    showAdult = !!(adultCheckbox && adultCheckbox.checked);
  }

  function syncSubfilterVisibility() {
    var roleTypeSelected =
      selectedTypes.indexOf('role-badges') !== -1 || selectedRoles.length > 0 || selectedChurchSubs.length > 0;
    var deskTypeSelected =
      selectedTypes.indexOf('desk-plates') !== -1 ||
      selectedMaterials.length > 0 ||
      selectedSignTypes.length > 0 ||
      selectedDeskCategories.profession.length > 0 ||
      selectedDeskCategories.novelty.length > 0;

    var rolePanel = document.getElementById('all-products-role-filters');
    var churchPanel = document.getElementById('all-products-church-subfilters');
    var deskPanel = document.getElementById('all-products-desk-filters');
    var profPanel = document.getElementById('all-products-desk-sub-profession');
    var novPanel = document.getElementById('all-products-desk-sub-novelty');

    if (rolePanel) rolePanel.hidden = !roleTypeSelected;
    if (churchPanel) {
      churchPanel.hidden = !roleTypeSelected || selectedRoles.indexOf('church') === -1;
    }
    if (deskPanel) deskPanel.hidden = !deskTypeSelected;
    if (profPanel) {
      profPanel.hidden = !deskTypeSelected || selectedSignTypes.indexOf('profession') === -1;
    }
    if (novPanel) {
      novPanel.hidden = !deskTypeSelected || selectedSignTypes.indexOf('novelty') === -1;
    }
  }

  function parseUrlState() {
    var params = new URLSearchParams(window.location.search);
    selectedTypes = (params.get('type') || '')
      .split(',')
      .map(function (v) {
        return v.trim();
      })
      .filter(Boolean);
    selectedRoles = (params.get('role') || '')
      .split(',')
      .map(function (v) {
        return v.trim();
      })
      .filter(Boolean);
    selectedChurchSubs = (params.get('sub') || '')
      .split(',')
      .map(function (v) {
        return v.trim();
      })
      .filter(Boolean)
      .map(function (value) {
        return value.indexOf('church:') === 0 ? value.slice(7) : '';
      })
      .filter(Boolean);
    selectedMaterials = (params.get('material') || '')
      .split(',')
      .map(function (v) {
        return v.trim();
      })
      .filter(function (v) {
        return ['acrylic', 'rosewood', 'plastic'].indexOf(v) !== -1;
      });
    selectedSignTypes = (params.get('sign') || '')
      .split(',')
      .map(function (v) {
        return v.trim();
      })
      .filter(function (v) {
        return ['profession', 'novelty'].indexOf(v) !== -1;
      });
    selectedDeskCategories = { profession: [], novelty: [] };
    (params.get('sub') || '')
      .split(',')
      .map(function (v) {
        return v.trim();
      })
      .filter(Boolean)
      .forEach(function (value) {
        if (value.indexOf('prof:') === 0) {
          selectedDeskCategories.profession.push(value.slice(5));
        } else if (value.indexOf('nov:') === 0) {
          selectedDeskCategories.novelty.push(value.slice(4));
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
    filterBar.querySelectorAll('input[data-product-type]').forEach(function (input) {
      input.checked = selectedTypes.indexOf(input.getAttribute('data-product-type')) !== -1;
    });
    filterBar.querySelectorAll('input[data-role]').forEach(function (input) {
      input.checked = selectedRoles.indexOf(input.getAttribute('data-role')) !== -1;
    });
    filterBar.querySelectorAll('input[data-church-sub]').forEach(function (input) {
      input.checked = selectedChurchSubs.indexOf(input.getAttribute('data-church-sub')) !== -1;
    });
    filterBar.querySelectorAll('input[data-material]').forEach(function (input) {
      input.checked = selectedMaterials.indexOf(input.getAttribute('data-material')) !== -1;
    });
    filterBar.querySelectorAll('input[data-sign-type]').forEach(function (input) {
      input.checked = selectedSignTypes.indexOf(input.getAttribute('data-sign-type')) !== -1;
    });
    filterBar.querySelectorAll('input[data-desk-category]').forEach(function (input) {
      var forSign = input.getAttribute('data-for-sign');
      var category = input.getAttribute('data-desk-category');
      var selected = selectedDeskCategories[forSign] || [];
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
    if (selectedTypes.length) params.set('type', selectedTypes.join(','));
    if (selectedRoles.length) params.set('role', selectedRoles.join(','));
    var subValues = [];
    selectedChurchSubs.forEach(function (id) {
      subValues.push('church:' + id);
    });
    selectedDeskCategories.profession.forEach(function (id) {
      subValues.push('prof:' + id);
    });
    selectedDeskCategories.novelty.forEach(function (id) {
      subValues.push('nov:' + id);
    });
    if (subValues.length) params.set('sub', subValues.join(','));
    if (selectedMaterials.length) params.set('material', selectedMaterials.join(','));
    if (selectedSignTypes.length) params.set('sign', selectedSignTypes.join(','));
    if (sortBy !== 'featured') params.set('sort', sortBy);
    if (priceMin != null && !isNaN(priceMin)) params.set('min', String(priceMin));
    if (priceMax != null && !isNaN(priceMax)) params.set('max', String(priceMax));
    if (showAdult) params.set('adult', '1');

    var query = params.toString();
    var next = catalogueBase + (query ? '?' + query : '');
    window.history.replaceState({}, '', next);
  }

  function cardMatches(card) {
    var productType = card.getAttribute('data-product-type') || 'other';
    var roles = (card.getAttribute('data-roles') || '').split(/\s+/).filter(Boolean);
    var churchSubs = (card.getAttribute('data-church-subs') || '').split(/\s+/).filter(Boolean);
    var material = card.getAttribute('data-desk-material') || '';
    var signType = card.getAttribute('data-desk-sign-type') || '';
    var deskCategories = (card.getAttribute('data-desk-categories') || '').split(/\s+/).filter(Boolean);
    var priceCents = parseInt(card.getAttribute('data-price'), 10) || 0;
    var isAdult = card.getAttribute('data-adult') === '1';

    var roleFiltersActive = selectedRoles.length > 0 || selectedChurchSubs.length > 0;
    var deskFiltersActive =
      selectedMaterials.length > 0 ||
      selectedSignTypes.length > 0 ||
      selectedDeskCategories.profession.length > 0 ||
      selectedDeskCategories.novelty.length > 0;

    if (!showAdult && isAdult) return false;

    if (selectedTypes.length && selectedTypes.indexOf(productType) === -1) return false;

    if (roleFiltersActive) {
      if (productType !== 'role-badges') return false;
      if (selectedRoles.length) {
        var roleMatch = selectedRoles.some(function (role) {
          return roles.indexOf(role) !== -1;
        });
        if (!roleMatch) return false;
      }
      if (selectedRoles.indexOf('church') !== -1 && selectedChurchSubs.length) {
        var churchMatch = selectedChurchSubs.some(function (sub) {
          return churchSubs.indexOf(sub) !== -1;
        });
        if (!churchMatch) return false;
      }
    }

    if (deskFiltersActive) {
      if (productType !== 'desk-plates') return false;
      if (signType === 'gifts') return false;
      if (selectedMaterials.length && selectedMaterials.indexOf(material) === -1) return false;
      if (selectedSignTypes.length && selectedSignTypes.indexOf(signType) === -1) return false;
      if (selectedSignTypes.indexOf('profession') !== -1 && selectedDeskCategories.profession.length) {
        if (signType === 'profession') {
          var profMatch = selectedDeskCategories.profession.some(function (cat) {
            return deskCategories.indexOf(cat) !== -1;
          });
          if (!profMatch) return false;
        }
      }
      if (selectedSignTypes.indexOf('novelty') !== -1 && selectedDeskCategories.novelty.length) {
        if (signType === 'novelty') {
          var novMatch = selectedDeskCategories.novelty.some(function (cat) {
            return deskCategories.indexOf(cat) !== -1;
          });
          if (!novMatch) return false;
        }
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
      countEl.textContent = 'Showing ' + shown + ' of ' + filtered.length + ' products';
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
    selectedTypes = [];
    selectedRoles = [];
    selectedChurchSubs = [];
    selectedMaterials = [];
    selectedSignTypes = [];
    selectedDeskCategories = { profession: [], novelty: [] };
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

  var scrollControls = document.getElementById('all-products-scroll-controls');
  var scrollTopBtn = document.getElementById('all-products-scroll-top');
  var scrollBottomBtn = document.getElementById('all-products-scroll-bottom');

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
