(function () {
  var shapeGrid = document.getElementById('blanks-shape-grid');
  var configPanel = document.getElementById('blanks-config');
  var dataEl = document.getElementById('blanks-shape-data');
  var photoBaseEl = document.getElementById('blanks-photo-base');
  var photoConfigUrlEl = document.getElementById('blanks-photo-config-url');
  if (!shapeGrid || !configPanel || !dataEl) return;

  var assetBase = '';
  if (photoBaseEl && photoBaseEl.dataset.url) {
    assetBase = photoBaseEl.dataset.url.replace(/aqb-blank-shape-rounded\.jpg(?:\?.*)?$/, '');
  }

  var photoCfg = null;

  var shapes = [];
  try {
    shapes = JSON.parse(dataEl.textContent || '[]');
  } catch (e) {
    shapes = [];
  }

  var shapeMap = {};
  shapes.forEach(function (entry) {
    shapeMap[entry.shapeId] = entry;
  });

  var state = {
    shapeId: 'rounded',
    shapeName: 'Rounded Rectangle',
    product: shapeMap.rounded || null,
    color: 'white',
    size: '1x3',
    back: 'adhesive',
    qty: 10,
    variantId: null
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

  var PRICES = {
    '1x3': {
      adhesive: { 10: 1.299, 25: 1.19, 50: 1.19, 100: 1.09, 250: 0.9 },
      pin: { 10: 1.499, 25: 1.28, 50: 1.29, 100: 1.19, 250: 0.996 },
      magnetic: { 10: 2.299, 25: 1.35, 50: 1.59, 100: 1.49, 250: 1.196 }
    },
    '1h5x3': {
      adhesive: { 10: 1.499, 25: 1.3, 50: 1.29, 100: 1.19, 250: 0.98 },
      pin: { 10: 1.699, 25: 1.4, 50: 1.39, 100: 1.29, 250: 1.076 },
      magnetic: { 10: 2.499, 25: 1.46, 50: 1.69, 100: 1.59, 250: 1.276 }
    }
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

  var QTY_TIERS = [10, 25, 50, 100, 250];

  var PACK_MAP = {
    10: ['10 pack', '10-pack', '10 pk', 'pack of 10', '10 badges', '10 badge', '10 count'],
    25: ['25 pack', '25-pack', '25 pk', 'pack of 25', '25 badges', '25 badge', '25 count'],
    50: ['50 pack', '50-pack', '50 pk', 'pack of 50', '50 badges', '50 badge', '50 count'],
    100: ['100 pack', '100-pack', '100 pk', 'pack of 100', '100 badges', '100 badge', '100 count'],
    250: ['250 pack', '250-pack', '250 pk', 'pack of 250', '250 badges', '250 badge', '250 count']
  };

  function sizeKey() {
    return state.size === '1h5x3' ? '1h5x3' : '1x3';
  }

  function tiersForState() {
    var key = sizeKey();
    return (PRICES[key] && PRICES[key][state.back]) || PRICES['1x3'].adhesive;
  }

  function unitPriceAmount() {
    var tiers = tiersForState();
    var unit = tiers[10];
    QTY_TIERS.forEach(function (q) {
      if (state.qty >= q) unit = tiers[q];
    });
    return unit;
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

    var aspect = c.widthNorm / c.heightNorm;
    wrap.style.aspectRatio = String(aspect);
    wrap.style.width = '100%';
    wrap.style.height = 'auto';
    wrap.style.maxHeight = '100%';

    img.style.width = (100 / c.widthNorm) + '%';
    img.style.height = (100 / c.heightNorm) + '%';
    img.style.left = (-c.xNorm / c.widthNorm * 100) + '%';
    img.style.top = (-c.yNorm / c.heightNorm * 100) + '%';
    img.style.position = 'absolute';
  }

  function variantText(variant) {
    return (variant.title + ' ' + (variant.options || []).join(' ')).toLowerCase();
  }

  function matchOption(variant, keywords) {
    var text = variantText(variant);
    return keywords.some(function (kw) {
      return text.indexOf(kw) !== -1;
    });
  }

  function packKeywords(packSize) {
    var keywords = (PACK_MAP[packSize] || []).slice();
    keywords.push(String(packSize));
    return keywords;
  }

  function variantMatchesPack(variant, packSize) {
    if (!variant || !packSize) return false;
    return matchOption(variant, packKeywords(packSize));
  }

  function findVariant() {
    if (!state.product || !state.product.variants.length) return null;
    var variants = state.product.variants.filter(function (v) {
      return v.available;
    });
    if (!variants.length) return state.product.variants[0];

    var colorMap = {
      white: ['white'],
      gold: ['gold', 'brushed gold'],
      silv: ['silver', 'brushed silver'],
      black: ['black'],
      blue: ['blue'],
      red: ['red']
    };
    var backMap = {
      adhesive: ['adhesive', 'stick'],
      pin: ['pin'],
      magnetic: ['magnetic', 'mag']
    };
    var sizeMap = {
      '1x3': ['1 x 3', '1x3', '1" x 3', 'standard'],
      '1h5x3': ['1.5', '1.5 x 3', '1.5x3', 'large']
    };

    var filtered = variants.slice();
    if (state.color && colorMap[state.color]) {
      var byColor = filtered.filter(function (v) {
        return matchOption(v, colorMap[state.color]);
      });
      if (byColor.length) filtered = byColor;
    }
    if (state.back && backMap[state.back]) {
      var byBack = filtered.filter(function (v) {
        return matchOption(v, backMap[state.back]);
      });
      if (byBack.length) filtered = byBack;
    }
    if (state.size && sizeMap[state.size]) {
      var bySize = filtered.filter(function (v) {
        return matchOption(v, sizeMap[state.size]);
      });
      if (bySize.length) filtered = bySize;
    }
    if (state.qty) {
      var byPack = filtered.filter(function (v) {
        return variantMatchesPack(v, state.qty);
      });
      if (byPack.length) filtered = byPack;
    }
    return filtered[0] || variants[0];
  }

  function findVariantForPack(packSize) {
    var prevQty = state.qty;
    state.qty = packSize;
    var variant = findVariant();
    state.qty = prevQty;
    return variant;
  }

  function displaySizeForShape(shapeId) {
    var cfg = SHAPE_CONFIG[shapeId];
    if (!cfg || !cfg.sizes.length) return '1x3';
    var supported = cfg.sizes.some(function (s) {
      return s.id === state.size;
    });
    return supported ? state.size : cfg.sizes[0].id;
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

  function updateQtyLabels() {
    if (!els.qtyOpts) return;
    var tiers = tiersForState();
    QTY_TIERS.forEach(function (q) {
      var btn = els.qtyOpts.querySelector('[data-qty="' + q + '"]');
      if (!btn) return;
      var label = btn.querySelector('.aqb-bl-qty-opt__e');
      if (!label) return;
      var packVariant = findVariantForPack(q);
      if (packVariant && packVariant.price && variantMatchesPack(packVariant, q)) {
        var unit = packVariant.price / 100 / q;
        label.textContent = '$' + unit.toFixed(2) + ' ea';
      } else if (tiers[q]) {
        label.textContent = '$' + tiers[q].toFixed(2) + ' ea';
      }
    });
  }

  function refreshPrice() {
    var variant = findVariant();
    var packVariant = variant && variantMatchesPack(variant, state.qty);
    state.variantId = variant ? variant.id : null;
    if (els.variantId) els.variantId.value = state.variantId || '';
    if (els.cartQty) els.cartQty.value = packVariant ? '1' : String(state.qty);

    var unit;
    var total;
    if (packVariant && variant.price) {
      total = variant.price / 100;
      unit = total / state.qty;
    } else {
      unit = unitPriceAmount();
      total = unit * state.qty;
    }

    if (els.price) els.price.textContent = '$' + total.toFixed(2);

    updateQtyLabels();
    updateAllShapePhotos();

    if (els.saving) {
      if (state.qty >= 25) {
        var tiers = tiersForState();
        var base = packVariant && findVariantForPack(10) && variantMatchesPack(findVariantForPack(10), 10)
          ? findVariantForPack(10).price / 100 / 10
          : tiers[10];
        var saved = ((base - unit) * state.qty).toFixed(2);
        if (parseFloat(saved) > 0) {
          els.saving.textContent = 'Saving $' + saved + ' vs 10-pack pricing';
          els.saving.hidden = false;
        } else {
          els.saving.hidden = true;
        }
      } else {
        els.saving.hidden = true;
      }
    }

    if (els.addBtn) {
      els.addBtn.disabled = !state.variantId;
      els.addBtn.textContent = packVariant
        ? 'Add ' + state.qty + '-Pack to Cart →'
        : 'Add to Cart →';
    }
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
        refreshPrice();
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
        refreshPrice();
      });
      els.sizeOpts.appendChild(btn);
    });
  }

  function selectShape(shapeId, shapeName) {
    state.shapeId = shapeId;
    state.shapeName = shapeName;
    state.product = shapeMap[shapeId] || null;
    if (els.name) els.name.textContent = shapeName;

    var cfg = SHAPE_CONFIG[shapeId] || SHAPE_CONFIG.rounded;
    renderColors();
    renderSizes(cfg.sizes);

    shapeGrid.querySelectorAll('.aqb-bl-shape-card').forEach(function (card) {
      card.classList.toggle('active', card.dataset.shape === shapeId);
    });

    configPanel.classList.remove('aqb-bl-hidden');
    refreshPrice();
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
          els.backOpts.querySelectorAll('.aqb-bl-back-opt').forEach(function (el) {
            el.classList.remove('sel');
          });
          btn.classList.add('sel');
          state.back = btn.dataset.back;
          refreshPrice();
        });
      });
    }

    if (els.qtyOpts) {
      els.qtyOpts.querySelectorAll('.aqb-bl-qty-opt').forEach(function (btn) {
        btn.addEventListener('click', function () {
          els.qtyOpts.querySelectorAll('.aqb-bl-qty-opt').forEach(function (el) {
            el.classList.remove('sel');
          });
          btn.classList.add('sel');
          state.qty = parseInt(btn.dataset.qty, 10) || 10;
          refreshPrice();
        });
      });
    }

    if (els.addForm) {
      els.addForm.addEventListener('submit', function (e) {
        if (!state.variantId) {
          e.preventDefault();
          if (state.product && state.product.url) {
            window.location.href = state.product.url;
          }
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

  var configUrl = photoConfigUrlEl && photoConfigUrlEl.dataset.url;
  if (configUrl) {
    fetch(configUrl)
      .then(function (res) {
        return res.json();
      })
      .then(function (cfg) {
        photoCfg = cfg;
        boot();
      })
      .catch(function () {
        boot();
      });
  } else {
    boot();
  }
})();
