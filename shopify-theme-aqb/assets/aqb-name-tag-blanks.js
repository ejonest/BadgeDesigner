(function () {
  var shapeGrid = document.getElementById('blanks-shape-grid');
  var configPanel = document.getElementById('blanks-config');
  var photoBaseEl = document.getElementById('blanks-photo-base');
  var photoConfigUrlEl = document.getElementById('blanks-photo-config-url');
  var handlesUrlEl = document.getElementById('blanks-handles-url');
  var pricesUrlEl = document.getElementById('blanks-prices-url');
  if (!shapeGrid || !configPanel) return;

  var assetBase = '';
  if (photoBaseEl && photoBaseEl.dataset.url) {
    assetBase = photoBaseEl.dataset.url.replace(/aqb-blank-shape-rounded\.jpg(?:\?.*)?$/, '');
  }

  var photoCfg = null;
  var handlesCatalog = null;
  var priceCatalog = null;
  var productCache = {};
  var productRequestId = 0;

  var state = {
    shapeId: 'rounded',
    shapeName: 'Rounded Rectangle',
    product: null,
    color: 'white',
    size: '1x3',
    back: 'adhesive',
    qty: 10,
    variantId: null,
    loading: false
  };

  var els = {
    name: document.getElementById('blanks-config-name'),
    price: document.getElementById('blanks-config-price'),
    saving: document.getElementById('blanks-config-saving'),
    colOpts: document.getElementById('blanks-col-opts'),
    sizeOpts: document.getElementById('blanks-size-opts'),
    backOpts: configPanel,
    qtyOpts: configPanel,
    variantId: document.getElementById('blanks-variant-id'),
    cartQty: document.getElementById('blanks-cart-qty'),
    change: document.getElementById('blanks-config-change'),
    addBtn: document.getElementById('blanks-add-btn'),
    addForm: document.getElementById('blanks-add-form')
  };

  var ALL_COLORS = [
    { id: 'white', name: 'White', css: '#F2F2F2', br: '#ccc' },
    { id: 'gold', name: 'Brushed Gold', css: 'linear-gradient(135deg,#C9A84C,#E0C060)' },
    { id: 'silv', name: 'Brushed Silver', css: 'linear-gradient(135deg,#A0A0A0,#D0D0D0)' },
    { id: 'black', name: 'Black', css: '#1A1A1A' },
    { id: 'blue', name: 'Blue', css: '#2B4EAF' },
    { id: 'red', name: 'Red', css: '#C0392B' }
  ];

  var SHAPE_CONFIG = {
    rounded: {
      sizes: [
        { id: '1x3', name: '1″ × 3″', sub: 'Standard size' },
        { id: '1h5x3', name: '1.5″ × 3″', sub: 'Large size' }
      ]
    },
    oval: {
      sizes: [{ id: '1x3', name: 'Standard Oval', sub: 'Approx 2.5″ × 3.5″' }]
    },
    square: {
      sizes: [
        { id: '1x3', name: '1″ × 3″', sub: 'Standard size' },
        { id: '1h5x3', name: '1.5″ × 3″', sub: 'Large size' }
      ]
    },
    designer: {
      sizes: [{ id: '1x3', name: 'Standard', sub: 'Decorative flourish shape' }]
    }
  };

  function displaySizeForShape(shapeId) {
    var cfg = SHAPE_CONFIG[shapeId];
    if (!cfg || !cfg.sizes.length) return '1x3';
    var supported = cfg.sizes.some(function (s) {
      return s.id === state.size;
    });
    return supported ? state.size : cfg.sizes[0].id;
  }

  function priceTier() {
    var size = displaySizeForShape(state.shapeId);
    if (state.shapeId === 'oval' || state.shapeId === 'designer' || size === '1h5x3') {
      return 'large';
    }
    return 'standard';
  }

  function backingSlug(back) {
    return (back || state.back) === 'magnetic' ? 'magnet' : (back || state.back);
  }

  function variantKeyFor(qty, back) {
    return String(qty) + '-pack-' + backingSlug(back);
  }

  function resolveHandle() {
    if (!handlesCatalog) return null;
    var shapeEntry = handlesCatalog[state.shapeId];
    if (!shapeEntry) return null;
    var size = displaySizeForShape(state.shapeId);
    var sizeEntry = shapeEntry[size];
    if (!sizeEntry) return null;
    return sizeEntry[state.color] || null;
  }

  function loadProduct(handle) {
    if (!handle) return Promise.resolve(null);
    if (productCache[handle]) return Promise.resolve(productCache[handle]);
    return fetch('/products/' + encodeURIComponent(handle) + '.js')
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (product) {
        if (product) productCache[handle] = product;
        return product;
      })
      .catch(function () {
        return null;
      });
  }

  function findVariantForOptions(product, qty, back) {
    var key = variantKeyFor(qty, back);
    if (product && product.variants) {
      var match = product.variants.find(function (variant) {
        return variant.title === key || variant.public_title === key;
      });
      if (match) return match;
    }

    var tier = priceCatalog && priceCatalog[priceTier()];
    if (tier && tier[key] != null) {
      return {
        title: key,
        price: Math.round(Number(tier[key]) * 100),
        available: true
      };
    }

    return null;
  }

  function findVariant() {
    return findVariantForOptions(state.product, state.qty, state.back);
  }

  function formatMoney(amount) {
    return '$' + amount.toFixed(2);
  }

  function templateIdForShape(shapeId, size) {
    if (!photoCfg || !photoCfg.shapeTemplates) return null;
    var map = photoCfg.shapeTemplates[shapeId];
    if (!map) return null;
    return map[size] || map['1x3'] || null;
  }

  function photoUrl(shapeId, size, color) {
    if (!assetBase || !photoCfg || !photoCfg.assetFiles) return null;
    var templateId = templateIdForShape(shapeId, size);
    if (!templateId) return null;
    var files = photoCfg.assetFiles[templateId];
    if (!files) return null;
    var file = files[color] || files.white;
    return file ? assetBase + file : null;
  }

  function applyPhotoCrop(img, templateId) {
    if (!photoCfg || !photoCfg.templates) return;
    var plate = photoCfg.templates[templateId];
    if (!plate || !plate.previewCropRectNorm) return;
    var c = plate.previewCropRectNorm;
    var wrap = img.parentElement;
    if (!wrap) return;

    wrap.style.aspectRatio = String(c.widthNorm / c.heightNorm);
    wrap.style.width = '100%';
    wrap.style.height = 'auto';
    wrap.style.maxHeight = '100%';

    img.style.width = (100 / c.widthNorm) + '%';
    img.style.height = (100 / c.heightNorm) + '%';
    img.style.left = (-c.xNorm / c.widthNorm * 100) + '%';
    img.style.top = (-c.yNorm / c.heightNorm * 100) + '%';
    img.style.position = 'absolute';
  }

  function updateAllShapePhotos() {
    shapeGrid.querySelectorAll('.aqb-bl-shape-card').forEach(function (card) {
      var shapeId = card.dataset.shape;
      var img = card.querySelector('.aqb-bl-shape-card__photo');
      if (!img) return;
      var size = displaySizeForShape(shapeId);
      var templateId = templateIdForShape(shapeId, size);
      var next = photoUrl(shapeId, size, state.color);
      if (next) {
        img.onload = function () {
          if (templateId) applyPhotoCrop(img, templateId);
        };
        img.src = next;
        if (img.complete) {
          if (templateId) applyPhotoCrop(img, templateId);
        }
      } else if (templateId) {
        applyPhotoCrop(img, templateId);
      }
    });
  }

  function setBackingSelection(back) {
    if (!els.backOpts) return;
    els.backOpts.querySelectorAll('.aqb-bl-back-opt').forEach(function (el) {
      el.classList.toggle('sel', el.dataset.back === back);
    });
  }

  function setQtySelection(qty) {
    if (!els.qtyOpts) return;
    els.qtyOpts.querySelectorAll('.aqb-bl-qty-opt').forEach(function (el) {
      el.classList.toggle('sel', parseInt(el.dataset.qty, 10) === qty);
    });
  }

  function updateQtyLabels() {
    if (!els.qtyOpts) return;
    els.qtyOpts.querySelectorAll('.aqb-bl-qty-opt').forEach(function (btn) {
      var qty = parseInt(btn.dataset.qty, 10);
      var label = btn.querySelector('.aqb-bl-qty-opt__e');
      if (!label || !qty) return;
      var variant = findVariantForOptions(state.product, qty, state.back);
      if (variant && variant.price) {
        label.textContent = formatMoney(variant.price / 100 / qty) + ' ea';
      }
    });
  }

  function refreshPrice() {
    var variant = findVariant();
    var expectedKey = variantKeyFor(state.qty, state.back);
    var hasPackVariant = !!(variant && variant.title === expectedKey && variant.id);
    state.variantId = hasPackVariant ? variant.id : null;

    if (els.variantId) els.variantId.value = state.variantId || '';
    if (els.cartQty) els.cartQty.value = '1';

    var total = 0;
    var unit = 0;
    if (variant && variant.price) {
      total = variant.price / 100;
      unit = total / state.qty;
    }

    if (els.price) {
      els.price.textContent = state.loading ? '…' : (total ? formatMoney(total) : '—');
    }

    updateQtyLabels();
    updateAllShapePhotos();

    if (els.saving) {
      if (variant && variant.price && state.qty > 10) {
        var tenVariant = findVariantForOptions(state.product, 10, state.back);
        if (tenVariant && tenVariant.price) {
          var tenUnit = tenVariant.price / 100 / 10;
          var saved = ((tenUnit * state.qty) - total).toFixed(2);
          if (parseFloat(saved) > 0) {
            els.saving.textContent = 'Saving $' + saved + ' vs 10-pack pricing';
            els.saving.hidden = false;
          } else {
            els.saving.hidden = true;
          }
        } else {
          els.saving.hidden = true;
        }
      } else {
        els.saving.hidden = true;
      }
    }

    if (els.addBtn) {
      var ready = !!state.variantId && !state.loading;
      els.addBtn.disabled = !ready;
      if (state.loading) {
        els.addBtn.textContent = 'Loading…';
      } else if (ready) {
        els.addBtn.textContent = 'Add ' + state.qty + '-Pack to Cart →';
      } else {
        els.addBtn.textContent = 'Add to Cart →';
      }
    }
  }

  function syncProduct() {
    var handle = resolveHandle();
    var requestId = ++productRequestId;
    state.loading = true;
    refreshPrice();

    return loadProduct(handle).then(function (product) {
      if (requestId !== productRequestId) return;
      state.product = product;
      state.loading = false;
      refreshPrice();
    });
  }

  function renderColors() {
    if (!els.colOpts) return;
    els.colOpts.innerHTML = '';
    ALL_COLORS.forEach(function (c) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'aqb-bl-col-opt' + (c.id === state.color ? ' sel' : '');
      btn.dataset.col = c.id;
      btn.innerHTML =
        '<span class="aqb-bl-col-opt__swatch" style="background:' +
        c.css +
        ';' +
        (c.br ? 'border-color:' + c.br + ';' : '') +
        '"></span><span class="aqb-bl-col-opt__name">' +
        c.name +
        '</span>';
      btn.addEventListener('click', function () {
        els.colOpts.querySelectorAll('.aqb-bl-col-opt').forEach(function (el) {
          el.classList.remove('sel');
        });
        btn.classList.add('sel');
        state.color = c.id;
        syncProduct();
      });
      els.colOpts.appendChild(btn);
    });
  }

  function renderSizes(sizes) {
    if (!els.sizeOpts) return;
    els.sizeOpts.innerHTML = '';
    var hasCurrent = sizes.some(function (s) {
      return s.id === state.size;
    });
    if (!hasCurrent) state.size = sizes[0] ? sizes[0].id : null;
    sizes.forEach(function (s) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'aqb-bl-size-opt' + (s.id === state.size ? ' sel' : '');
      btn.dataset.sz = s.id;
      btn.innerHTML =
        '<span class="aqb-bl-size-opt__name">' + s.name + '</span><span class="aqb-bl-size-opt__sub">' + s.sub + '</span>';
      btn.addEventListener('click', function () {
        els.sizeOpts.querySelectorAll('.aqb-bl-size-opt').forEach(function (el) {
          el.classList.remove('sel');
        });
        btn.classList.add('sel');
        state.size = s.id;
        syncProduct();
      });
      els.sizeOpts.appendChild(btn);
    });
  }

  function selectShape(shapeId, shapeName) {
    state.shapeId = shapeId;
    state.shapeName = shapeName;
    if (els.name) els.name.textContent = shapeName;

    var cfg = SHAPE_CONFIG[shapeId] || SHAPE_CONFIG.rounded;
    renderColors();
    renderSizes(cfg.sizes);

    shapeGrid.querySelectorAll('.aqb-bl-shape-card').forEach(function (card) {
      card.classList.toggle('active', card.dataset.shape === shapeId);
    });

    configPanel.classList.remove('aqb-bl-hidden');
    syncProduct();
  }

  function clearShape() {
    configPanel.classList.add('aqb-bl-hidden');
    shapeGrid.querySelectorAll('.aqb-bl-shape-card').forEach(function (card) {
      card.classList.remove('active');
    });
    shapeGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bindEvents() {
    shapeGrid.querySelectorAll('.aqb-bl-shape-card').forEach(function (card) {
      card.addEventListener('click', function () {
        selectShape(card.dataset.shape, card.dataset.shapeName || card.dataset.shape);
        configPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });

    if (els.change) {
      els.change.addEventListener('click', clearShape);
      els.change.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          clearShape();
        }
      });
    }

    if (els.backOpts) {
      els.backOpts.querySelectorAll('.aqb-bl-back-opt').forEach(function (btn) {
        btn.addEventListener('click', function () {
          state.back = btn.dataset.back;
          setBackingSelection(state.back);
          refreshPrice();
        });
      });
    }

    if (els.qtyOpts) {
      els.qtyOpts.querySelectorAll('.aqb-bl-qty-opt').forEach(function (btn) {
        btn.addEventListener('click', function () {
          state.qty = parseInt(btn.dataset.qty, 10) || 10;
          setQtySelection(state.qty);
          refreshPrice();
        });
      });
    }

    if (els.addForm) {
      els.addForm.addEventListener('submit', function (e) {
        if (!state.variantId || state.loading) {
          e.preventDefault();
        }
      });
    }
  }

  function boot() {
    bindEvents();
    var initialCard = shapeGrid.querySelector('.aqb-bl-shape-card.active') || shapeGrid.querySelector('.aqb-bl-shape-card');
    if (initialCard) {
      selectShape(initialCard.dataset.shape, initialCard.dataset.shapeName || initialCard.dataset.shape);
    }
  }

  function loadConfig(url) {
    return fetch(url)
      .then(function (res) {
        return res.json();
      })
      .catch(function () {
        return null;
      });
  }

  var handlesUrl = handlesUrlEl && handlesUrlEl.dataset.url;
  var photoUrlConfig = photoConfigUrlEl && photoConfigUrlEl.dataset.url;
  var pricesUrl = pricesUrlEl && pricesUrlEl.dataset.url;
  var pending = [];

  if (handlesUrl) pending.push(loadConfig(handlesUrl).then(function (cfg) { handlesCatalog = cfg; }));
  if (photoUrlConfig) pending.push(loadConfig(photoUrlConfig).then(function (cfg) { photoCfg = cfg; }));
  if (pricesUrl) pending.push(loadConfig(pricesUrl).then(function (cfg) { priceCatalog = cfg; }));

  if (pending.length) {
    Promise.all(pending).then(boot);
  } else {
    boot();
  }
})();
