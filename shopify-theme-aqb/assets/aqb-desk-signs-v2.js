(function () {
  function populateAcrylicProfessionGrid() {
    var grid = document.getElementById('desk-signs-acrylic-grid');
    if (!grid || grid.children.length > 0) return;

    var label = document.getElementById('desk-signs-acrylic-label');
    if (label) {
      var labelText = label.textContent.trim();
      if (labelText === 'Acrylic — Personalized by profession' || labelText === '') {
        label.textContent = 'Acrylic — Personalized by profession (44 designs)';
      }
    }

    var collectionLink = '/pages/desk-signs-catalogue?material=acrylic&type=profession';
    var cardCta = 'Personalize';
    var professions = [
      {
        title: 'Doctor / Physician',
        meta: 'Acrylic · Medical Cross vector · 2×10"',
        price: '$24.99',
        image: 'https://cdn.shopify.com/s/files/1/0511/0739/7783/files/db215041-2a6a-5d18-85df-d4710b032b44_1df6a4fd-fb47-4601-84b7-bc673241c4ab.jpg?v=1781185001'
      },
      {
        title: 'Financial Planner',
        meta: 'Acrylic · Profession vector · 2×10"',
        price: '$24.99',
        image: 'https://cdn.shopify.com/s/files/1/0511/0739/7783/files/6ceb5aa3-8db4-5a32-9113-ee20fd789cd3.jpg?v=1781178030'
      },
      {
        title: 'Legal Secretary',
        meta: 'Acrylic · Scales of justice vector · 2×10"',
        price: '$24.99',
        image: 'https://cdn.shopify.com/s/files/1/0511/0739/7783/files/cdebe738-1413-51e2-af78-d2f65c95c191.jpg?v=1781178019'
      },
      {
        title: 'Media Planner',
        meta: 'Acrylic · Profession vector · 2×10"',
        price: '$24.99',
        image: 'https://cdn.shopify.com/s/files/1/0511/0739/7783/files/e70b969e-25d8-58d5-9c57-0dedbacac9c1.jpg?v=1781178039'
      },
      {
        title: 'Account Manager',
        meta: 'Acrylic · Profession vector · 2×10"',
        price: '$24.99',
        image: 'https://cdn.shopify.com/s/files/1/0511/0739/7783/files/9628df1b-f141-5ac5-91cd-029e78178352.jpg?v=1781177980'
      },
      {
        title: 'Customer Service Mgr',
        meta: 'Acrylic · Profession vector · 2×10"',
        price: '$24.99',
        image: 'https://cdn.shopify.com/s/files/1/0511/0739/7783/files/553039e7-b65d-5e9e-82f8-d4cfda4f9608.jpg?v=1781177971'
      },
      {
        title: 'Business Reporter',
        meta: 'Acrylic · Gavel vector · 2×10"',
        price: '$24.99',
        image: 'https://cdn.shopify.com/s/files/1/0511/0739/7783/files/f8fb3e72-3c2f-55f9-a4a1-532520ebde33.jpg?v=1781178010'
      }
    ];

    professions.forEach(function (profession) {
      var card = document.createElement('a');
      card.href = collectionLink;
      card.className = 'aqb-ds-prod-card';
      card.setAttribute('data-finish', 'acrylic');
      card.innerHTML =
        '<div class="aqb-ds-prod-card__img">' +
        '<img src="' + profession.image + '" alt="' + profession.title + '" loading="lazy" width="500" height="120">' +
        '</div>' +
        '<div class="aqb-ds-prod-card__body">' +
        '<div class="aqb-ds-prod-card__title">' + profession.title + '</div>' +
        '<div class="aqb-ds-prod-card__meta">' + profession.meta + '</div>' +
        '<div class="aqb-ds-prod-card__footer">' +
        '<span class="aqb-ds-prod-card__price">' + profession.price + '</span>' +
        '<span class="aqb-ds-prod-card__add">' + cardCta + '</span>' +
        '</div>' +
        '</div>';
      grid.appendChild(card);
    });

    var viewAll = document.createElement('a');
    viewAll.href = collectionLink;
    viewAll.className = 'aqb-ds-prod-card aqb-ds-prod-card--view-all';
    viewAll.innerHTML =
      '<div class="aqb-ds-prod-card__view-all-icon" aria-hidden="true">+</div>' +
      '<div class="aqb-ds-prod-card__view-all-title">36 more professions</div>' +
      '<div class="aqb-ds-prod-card__view-all-sub">Nurse · Principal · Realtor · Engineer & more</div>' +
      '<span class="aqb-ds-prod-card__add aqb-ds-prod-card__add--view-all">View All</span>';
    grid.appendChild(viewAll);
  }

  populateAcrylicProfessionGrid();

  /* aqb-desk-signs acrylic grid v2 */
  function setupPagedGrid(gridId, loadWrapId, loadBtnId, filterFn) {
    var grid = document.getElementById(gridId);
    var loadWrap = document.getElementById(loadWrapId);
    var loadBtn = document.getElementById(loadBtnId);
    if (!grid) return null;

    var cards = Array.prototype.slice.call(grid.querySelectorAll('[data-product-index]'));
    var pageSize = parseInt(grid.getAttribute('data-page-size'), 10) || 12;
    var currentPage = 1;

    function filtered() {
      return cards.filter(filterFn || function () {
        return true;
      });
    }

    function render() {
      var list = filtered();
      var visible = pageSize * currentPage;
      cards.forEach(function (card) {
        card.hidden = true;
      });
      list.slice(0, visible).forEach(function (card) {
        card.hidden = false;
      });
      if (loadWrap) loadWrap.hidden = visible >= list.length;
    }

    if (loadBtn) {
      loadBtn.addEventListener('click', function () {
        currentPage += 1;
        render();
      });
    }

    return {
      cards: cards,
      render: function () {
        currentPage = 1;
        render();
      },
      resetPage: function () {
        currentPage = 1;
      }
    };
  }

  var anchorBar = document.getElementById('desk-signs-anchor-bar');
  if (anchorBar) {
    anchorBar.querySelectorAll('.aqb-ds-anchor-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        anchorBar.querySelectorAll('.aqb-ds-anchor-btn').forEach(function (el) {
          el.classList.remove('active');
        });
        btn.classList.add('active');
      });
    });

    var sections = ['section-custom', 'section-business', 'section-novelty'];
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            var id = entry.target.id;
            anchorBar.querySelectorAll('.aqb-ds-anchor-btn').forEach(function (btn) {
              var href = btn.getAttribute('href') || '';
              btn.classList.toggle('active', href.indexOf('#' + id) !== -1);
            });
          });
        },
        { rootMargin: '-30% 0px -55% 0px', threshold: 0 }
      );
      sections.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) observer.observe(el);
      });
    }
  }

  var finishToggle = document.getElementById('desk-signs-finish-toggle');
  if (finishToggle) {
    var acrylicGrid = document.getElementById('desk-signs-acrylic-grid');
    var rosewoodGrid = document.getElementById('desk-signs-rosewood-grid');
    var acrylicLabel = document.getElementById('desk-signs-acrylic-label');
    var rosewoodLabel = document.getElementById('desk-signs-rosewood-label');
    var rosewoodBand = document.querySelector('.aqb-ds-rosewood');

    finishToggle.querySelectorAll('.aqb-ds-finish-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        finishToggle.querySelectorAll('.aqb-ds-finish-btn').forEach(function (el) {
          el.classList.remove('active');
        });
        btn.classList.add('active');
        var finish = btn.dataset.finish;
        if (acrylicGrid) acrylicGrid.hidden = finish !== 'acrylic';
        if (acrylicLabel) acrylicLabel.hidden = finish !== 'acrylic';
        if (rosewoodGrid) rosewoodGrid.hidden = finish !== 'rosewood';
        if (rosewoodLabel) rosewoodLabel.hidden = finish !== 'rosewood';
        if (rosewoodBand) rosewoodBand.style.display = finish === 'rosewood' ? '' : 'none';
      });
    });
  }

  var activeIndustry = 'all';
  var businessController = setupPagedGrid(
    'desk-signs-business-grid',
    'desk-signs-business-load-more',
    'desk-signs-business-load-btn',
    function (card) {
      if (activeIndustry === 'all') return true;
      var industries = (card.getAttribute('data-industries') || '').split(/\s+/).filter(Boolean);
      return industries.indexOf(activeIndustry) !== -1;
    }
  );

  var industryBar = document.getElementById('desk-signs-industries');
  if (industryBar && businessController) {
    industryBar.querySelectorAll('.aqb-ds-ind-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        industryBar.querySelectorAll('.aqb-ds-ind-chip').forEach(function (el) {
          el.classList.remove('active');
          el.setAttribute('aria-selected', 'false');
        });
        chip.classList.add('active');
        chip.setAttribute('aria-selected', 'true');
        activeIndustry = chip.dataset.industry || 'all';
        businessController.resetPage();
        businessController.render();
      });
    });
    businessController.render();
  }

  var activeChip = 'all';
  var noveltyController = setupPagedGrid(
    'desk-signs-novelty-grid',
    'desk-signs-novelty-load-more',
    'desk-signs-novelty-load-btn',
    function (card) {
      if (activeChip === 'all') return true;
      var chips = (card.getAttribute('data-chips') || '').split(/\s+/).filter(Boolean);
      return chips.indexOf(activeChip) !== -1;
    }
  );

  var chipBar = document.getElementById('desk-signs-novelty-chips');
  if (chipBar && noveltyController) {
    chipBar.querySelectorAll('.aqb-ds-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        chipBar.querySelectorAll('.aqb-ds-chip').forEach(function (el) {
          el.classList.remove('active');
          el.setAttribute('aria-selected', 'false');
        });
        chip.classList.add('active');
        chip.setAttribute('aria-selected', 'true');
        activeChip = chip.dataset.chip || 'all';
        noveltyController.resetPage();
        noveltyController.render();
      });
    });
    noveltyController.render();
  }
})();
