(function () {
  const GOAL = 5;
  const REFRESH_DEBOUNCE_MS = 350;
  let refreshTimer = null;
  let pubsubBound = false;
  let cartObserversBound = false;

  function normalizeLineProperties(item) {
    var raw = item && item.properties;
    if (!raw) return {};
    if (Array.isArray(raw)) {
      var out = {};
      raw.forEach(function (prop) {
        if (prop && prop.name != null) out[prop.name] = prop.value;
      });
      return out;
    }
    return raw;
  }

  function prop(props, name) {
    if (!props) return undefined;
    if (props['_' + name] != null && String(props['_' + name]).trim() !== '') {
      return props['_' + name];
    }
    return props[name];
  }

  function isBadgeCartLine(item) {
    if (!item) return false;
    var handle = String(
      item.product_handle || item.handle || '',
    ).toLowerCase();
    if (handle === 'custom-1x3-badge') return true;
    if (/^custom-1x3-.+-badge$/.test(handle)) return true;
    var props = normalizeLineProperties(item);
    if (prop(props, 'Custom Badge Design') === 'Yes') {
      var designer = String(prop(props, 'Designer') || '')
        .trim()
        .toLowerCase();
      return designer !== 'sign' && designer !== 'plaque';
    }
    return false;
  }

  function countBadgePieces(cart) {
    return (cart.items || []).reduce(function (sum, item) {
      return isBadgeCartLine(item) ? sum + (Number(item.quantity) || 0) : sum;
    }, 0);
  }

  function copyForCount(count) {
    var n = Math.max(0, Math.floor(Number(count) || 0));
    if (n <= 0) {
      return { hidden: true };
    }
    var remaining = GOAL - n;
    var pct = Math.min(100, Math.max(0, (n / GOAL) * 100));
    if (n >= GOAL) {
      return {
        hidden: false,
        unlocked: true,
        icon: '\u2713',
        headline: 'Free shipping unlocked!',
        detail: 'Your custom badge order ships free within the USA.',
        progressLabel: n + ' of ' + GOAL + ' badges',
        progressPct: pct,
      };
    }
    return {
      hidden: false,
      unlocked: false,
      icon: '\uD83D\uDE9A',
      headline:
        remaining === 1
          ? "You're 1 badge away from FREE shipping!"
          : "You're " + remaining + ' badges away from FREE shipping!',
      detail:
        'Add more custom badges to your cart — free shipping kicks in at 5.',
      progressLabel: n + ' of ' + GOAL + ' badges',
      progressPct: pct,
    };
  }

  function updateBanner(root, count) {
    var state = copyForCount(count);
    if (state.hidden) {
      root.hidden = true;
      return;
    }

    root.hidden = false;
    root.dataset.badgePieces = String(Math.floor(Number(count) || 0));
    if (state.unlocked) {
      root.classList.add('is-unlocked');
    } else {
      root.classList.remove('is-unlocked');
    }

    var iconEl = root.querySelector('.aqb-cart-free-shipping__icon');
    var headlineEl = root.querySelector(
      '[data-aqb-cart-free-shipping-headline]',
    );
    var detailEl = root.querySelector('[data-aqb-cart-free-shipping-detail]');
    var progressLabelEl = root.querySelector(
      '[data-aqb-cart-free-shipping-progress-label]',
    );
    var fillEl = root.querySelector('[data-aqb-cart-free-shipping-fill]');
    var trackEl = root.querySelector('.aqb-cart-free-shipping__track');

    if (iconEl) iconEl.textContent = state.icon;
    if (headlineEl) headlineEl.textContent = state.headline;
    if (detailEl) detailEl.textContent = state.detail;
    if (progressLabelEl) progressLabelEl.textContent = state.progressLabel;
    if (fillEl) {
      fillEl.style.width = state.progressPct + '%';
    }
    if (trackEl) {
      trackEl.setAttribute('aria-valuenow', String(Math.round(state.progressPct)));
    }
  }

  function getCartJsonUrl() {
    var cartRoot =
      window.Shopify && window.Shopify.routes && window.Shopify.routes.root
        ? window.Shopify.routes.root
        : '/';
    return cartRoot.replace(/\/$/, '') + '/cart.js';
  }

  function refreshAllBanners(delayMs) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(function () {
      fetch(getCartJsonUrl(), {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
        .then(function (res) {
          if (!res.ok) throw new Error('cart.js failed');
          return res.json();
        })
        .then(function (cart) {
          var count = countBadgePieces(cart);
          document
            .querySelectorAll('[data-aqb-cart-free-shipping]')
            .forEach(function (root) {
              updateBanner(root, count);
            });
        })
        .catch(function () {
          /* keep current banner state on transient network errors */
        });
    }, typeof delayMs === 'number' ? delayMs : REFRESH_DEBOUNCE_MS);
  }

  function bindPubsub() {
    if (pubsubBound) return;
    if (typeof subscribe !== 'function' || typeof PUB_SUB_EVENTS === 'undefined') {
      return;
    }
    pubsubBound = true;
    subscribe(PUB_SUB_EVENTS.cartUpdate, function () {
      refreshAllBanners(REFRESH_DEBOUNCE_MS);
    });
  }

  function observeCartSection(id) {
    var section = document.getElementById(id);
    if (!section) return;
    var target = section.querySelector('.js-contents') || section;
    var observer = new MutationObserver(function () {
      refreshAllBanners(REFRESH_DEBOUNCE_MS);
    });
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function bindCartObservers() {
    if (cartObserversBound) return;
    cartObserversBound = true;
    observeCartSection('main-cart-items');
    observeCartSection('main-cart-footer');
    observeCartSection('CartDrawer-CartItems');
    var drawerFooter = document.querySelector('.cart-drawer__footer');
    if (drawerFooter) {
      var drawerObserver = new MutationObserver(function () {
        refreshAllBanners(REFRESH_DEBOUNCE_MS);
      });
      drawerObserver.observe(drawerFooter, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  }

  function bindInteractionListeners() {
    document.addEventListener(
      'change',
      function (event) {
        var target = event.target;
        if (
          target &&
          target.matches &&
          target.matches('input[name="updates[]"]')
        ) {
          refreshAllBanners(REFRESH_DEBOUNCE_MS);
        }
      },
      true,
    );

    document.addEventListener(
      'click',
      function (event) {
        if (event.target.closest('cart-remove-button')) {
          refreshAllBanners(REFRESH_DEBOUNCE_MS);
        }
      },
      true,
    );
  }

  function init() {
    bindPubsub();
    bindCartObservers();
    bindInteractionListeners();
    refreshAllBanners(0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('load', function () {
    bindPubsub();
    bindCartObservers();
    refreshAllBanners(0);
  });

  document.addEventListener('shopify:section:load', function () {
    cartObserversBound = false;
    bindCartObservers();
    refreshAllBanners(100);
  });
})();
