/**
 * My Almari Styled Live Predictive Search
 * Replicating reference behavior from https://myalmari.in/
 */

(function () {
  'use strict';

  let searchWrapper = null;
  let searchPanel = null;
  let searchInput = null;
  let searchResultsWrap = null;
  let searchContent = null;
  let searchLoading = null;
  let searchForm = null;
  let debounceTimer = null;
  let activeQuery = '';
  let lastActiveTrigger = null;

  function init() {
    searchWrapper = document.getElementById('myalmari-search-wrapper');
    if (!searchWrapper) return;

    searchPanel = searchWrapper.querySelector('.myalmari-search-panel');
    searchInput = document.getElementById('myalmari-search-input');
    searchResultsWrap = document.getElementById('myalmari-search-results');
    searchContent = document.getElementById('myalmari-search-content');
    searchLoading = document.getElementById('myalmari-search-loading');
    searchForm = document.getElementById('myalmari-search-form');

    // Attach open triggers
    document.querySelectorAll('[data-myalmari-search-open]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        lastActiveTrigger = btn;
        openSearch();
      });
    });

    // Attach close triggers (X button and backdrop)
    searchWrapper.querySelectorAll('[data-myalmari-search-close]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        closeSearch();
      });
    });

    // Keyboard navigation (Esc to close)
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && searchWrapper && searchWrapper.classList.contains('is-open')) {
        e.preventDefault();
        closeSearch();
      }
    });

    // Handle typing in input with 250ms debounce
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        const query = searchInput.value.trim();
        clearTimeout(debounceTimer);

        if (query.length < 2) {
          // Empty State: only show input + close (No trending, no popular searches)
          if (searchResultsWrap) searchResultsWrap.style.display = 'none';
          if (searchContent) searchContent.innerHTML = '';
          if (searchLoading) searchLoading.style.display = 'none';
          activeQuery = '';
          return;
        }

        activeQuery = query;
        if (searchResultsWrap) searchResultsWrap.style.display = 'block';
        if (searchLoading) searchLoading.style.display = 'block';

        debounceTimer = setTimeout(function () {
          fetchLiveSuggestions(query);
        }, 250);
      });

      // Uppercase value handling on paste/type
      searchInput.addEventListener('change', function () {
        searchInput.value = searchInput.value.toUpperCase();
      });
    }

    // Handle Form Submit
    if (searchForm) {
      searchForm.addEventListener('submit', function (e) {
        const query = searchInput ? searchInput.value.trim() : '';
        if (!query) {
          e.preventDefault();
        }
      });
    }

    // Adjust position on window scroll or resize
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, { passive: true });
  }

  function getHeaderBottom() {
    const desktopHeader = document.querySelector('.header-navigation') ||
                          document.querySelector('.section-header-navigation') ||
                          document.querySelector('sticky-header');
    const mobileHeader = document.querySelector('.header-mobile');

    let target = null;
    if (window.innerWidth <= 1024 && mobileHeader && mobileHeader.offsetParent !== null) {
      target = mobileHeader;
    } else if (desktopHeader && desktopHeader.offsetParent !== null) {
      target = desktopHeader;
    } else {
      target = document.querySelector('header');
    }

    if (target) {
      const rect = target.getBoundingClientRect();
      return Math.max(0, Math.round(rect.bottom));
    }
    return 70;
  }

  function updatePosition() {
    if (!searchWrapper || !searchWrapper.classList.contains('is-open') || !searchPanel) return;
    const bottom = getHeaderBottom();
    searchPanel.style.top = bottom + 'px';
  }

  function openSearch() {
    if (!searchWrapper) return;
    updatePosition();
    searchWrapper.classList.add('is-open');
    searchWrapper.setAttribute('aria-hidden', 'false');

    document.querySelectorAll('[data-myalmari-search-open]').forEach(function (btn) {
      btn.setAttribute('aria-expanded', 'true');
    });

    if (searchInput) {
      setTimeout(function () {
        searchInput.focus();
        if (searchInput.value) {
          searchInput.select();
        }
      }, 50);
    }
  }

  function closeSearch() {
    if (!searchWrapper) return;
    searchWrapper.classList.remove('is-open');
    searchWrapper.setAttribute('aria-hidden', 'true');

    document.querySelectorAll('[data-myalmari-search-open]').forEach(function (btn) {
      btn.setAttribute('aria-expanded', 'false');
    });

    if (lastActiveTrigger && typeof lastActiveTrigger.focus === 'function') {
      lastActiveTrigger.focus();
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function formatPrice(centsOrNum) {
    const num = Math.round(Number(centsOrNum));
    return 'RS. ' + num.toLocaleString('en-IN');
  }

  function extractCondition(product) {
    const knownConditions = ['NEW', 'VERY GOOD', 'EXCELLENT', 'GOOD', 'LIKE NEW', 'PRISTINE', 'FAIR', 'NEVER BEEN USED'];
    if (product.tags && Array.isArray(product.tags)) {
      for (let i = 0; i < product.tags.length; i++) {
        const tag = product.tags[i].trim();
        const tagUpper = tag.toUpperCase();
        if (tagUpper.startsWith('CONDITION:')) {
          const val = tag.substring(10).trim();
          if (val) return val.toUpperCase();
        }
        for (let k = 0; k < knownConditions.length; k++) {
          if (tagUpper === knownConditions[k] || tagUpper === 'CONDITION ' + knownConditions[k]) {
            return knownConditions[k];
          }
        }
      }
    }

    if (product.body) {
      const match = product.body.match(/<strong>Condition:?<\/strong>\s*([^<.,]+)/i);
      if (match && match[1]) {
        const descCond = match[1].trim().toUpperCase();
        for (let k = 0; k < knownConditions.length; k++) {
          if (descCond.includes(knownConditions[k])) {
            return knownConditions[k];
          }
        }
        if (descCond.length > 0 && descCond.length <= 15) {
          return descCond;
        }
      }
    }

    return null;
  }

  function productMatchesQuery(p, query) {
    // Partial-word matching must work: "bir" matches "Birkin"
    // Disallow spelling / typo tolerance for completely unrelated strings
    const q = query.toLowerCase().trim();
    if (!q) return false;
    const title = (p.title || '').toLowerCase();
    const vendor = (p.vendor || '').toLowerCase();
    const type = (p.type || '').toLowerCase();
    const handle = (p.handle || '').toLowerCase();
    const tags = Array.isArray(p.tags) ? p.tags.join(' ').toLowerCase() : '';
    const body = (p.body || '').toLowerCase();

    const tokens = q.split(/\s+/).filter(Boolean);
    return tokens.every(token => 
      title.includes(token) || 
      vendor.includes(token) || 
      type.includes(token) || 
      handle.includes(token) || 
      tags.includes(token) || 
      body.includes(token)
    );
  }

  function fetchLiveSuggestions(query) {
    const url = `/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product,collection,query&resources[limit]=10`;

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('Search network error');
        return res.json();
      })
      .then(function (data) {
        if (query !== activeQuery) return;

        if (searchLoading) searchLoading.style.display = 'none';

        const resources = data.resources && data.resources.results ? data.resources.results : {};
        const queries = resources.queries || [];
        const rawProducts = resources.products || [];
        // Filter out non-matching products to avoid false typo/spelling fallbacks
        const matchedProducts = rawProducts.filter(p => productMatchesQuery(p, query));
        const products = matchedProducts.slice(0, 4);
        const collections = resources.collections || [];

        renderResults(query, queries, products, collections);
      })
      .catch(function (err) {
        console.error('My Almari search error:', err);
        if (query !== activeQuery) return;
        if (searchLoading) searchLoading.style.display = 'none';
        renderNoResults();
      });
  }

  function renderNoResults() {
    if (!searchContent) return;
    searchContent.innerHTML = `
      <div class="myalmari-no-results">
        No results could be found. Please try again with a different query.
      </div>
    `;
  }

  function renderResults(query, queries, products, collections) {
    if (!searchContent) return;

    if (queries.length === 0 && products.length === 0 && collections.length === 0) {
      renderNoResults();
      return;
    }

    let html = '';

    // LEFT COLUMN: SUGGESTIONS (Up to 10)
    let leftColumnHtml = '';
    if (queries.length > 0) {
      const listItems = queries.map(function (q) {
        let displayHtml = '';
        if (q.styled_text) {
          displayHtml = q.styled_text;
        } else {
          const reg = new RegExp(`(${escapeRegex(query)})`, 'gi');
          displayHtml = escapeHtml(q.text).replace(reg, '<strong>$1</strong>');
        }
        return `
          <li>
            <a href="/search?q=${encodeURIComponent(q.text)}&type=product" class="myalmari-suggestion-link">
              ${displayHtml}
            </a>
          </li>
        `;
      }).join('');

      leftColumnHtml = `
        <div class="myalmari-col-suggestions">
          <h3 class="myalmari-col-heading">SUGGESTIONS</h3>
          <ul class="myalmari-suggestions-list">
            ${listItems}
          </ul>
        </div>
      `;
    }

    // RIGHT COLUMN: TABS (PRODUCTS & COLLECTIONS)
    let rightColumnHtml = '';
    const hasProducts = products.length > 0;
    const hasCollections = collections.length > 0;

    let tabsHeaderHtml = `
      <div class="myalmari-tabs-header" role="tablist">
        <button type="button" class="myalmari-tab-btn is-active" role="tab" aria-selected="true" data-tab="products">
          PRODUCTS (${products.length})
        </button>
        ${hasCollections ? `
        <button type="button" class="myalmari-tab-btn" role="tab" aria-selected="false" data-tab="collections">
          COLLECTIONS (${collections.length})
        </button>
        ` : ''}
      </div>
    `;

    // PRODUCTS GRID
    let productsHtml = '';
    if (hasProducts) {
      const cardItems = products.map(function (p) {
        const pImg = p.image || (p.featured_image ? p.featured_image.url : '');
        const pTitle = escapeHtml(p.title || '').toUpperCase();
        const pVendor = escapeHtml(p.vendor || '');
        const pUrl = p.url;

        const priceNum = parseFloat(p.price) || 0;
        const compareNum = parseFloat(p.compare_at_price_max) || 0;
        const isOnSale = compareNum > priceNum;

        // Condition badge
        const condition = extractCondition(p);
        let conditionBadgeHtml = '';
        if (condition) {
          conditionBadgeHtml = `<span class="myalmari-badge-condition">${escapeHtml(condition)}</span>`;
        }

        // Discount badge
        let discountBadgeHtml = '';
        if (isOnSale && compareNum > 0) {
          const discountPct = Math.round(((compareNum - priceNum) / compareNum) * 100);
          if (discountPct > 0) {
            discountBadgeHtml = `<span class="myalmari-badge-discount">SAVE ${discountPct}%</span>`;
          }
        }

        // Pricing HTML
        let priceHtml = '';
        if (isOnSale) {
          priceHtml = `
            <div class="myalmari-card-prices">
              <div class="myalmari-price-row">
                <span class="myalmari-price-label">SALE PRICE</span>
                <span class="myalmari-price-sale">${formatPrice(priceNum)}</span>
              </div>
              <div class="myalmari-price-row">
                <span class="myalmari-price-label">REGULAR PRICE</span>
                <span class="myalmari-price-struck">${formatPrice(compareNum)}</span>
              </div>
            </div>
          `;
        } else {
          priceHtml = `
            <div class="myalmari-card-prices">
              <div class="myalmari-price-row">
                <span class="myalmari-price-single">${formatPrice(priceNum)}</span>
              </div>
            </div>
          `;
        }

        return `
          <a href="${pUrl}" class="myalmari-card">
            <div class="myalmari-card-img-wrap">
              ${(conditionBadgeHtml || discountBadgeHtml) ? `
                <div class="myalmari-card-badges">
                  ${conditionBadgeHtml}
                  ${discountBadgeHtml}
                </div>
              ` : ''}
              ${pImg ? `<img src="${pImg}" alt="${pTitle}" class="myalmari-card-img" loading="lazy" width="280" height="370">` : ''}
            </div>
            ${pVendor ? `<div class="myalmari-card-vendor">${pVendor}</div>` : ''}
            <div class="myalmari-card-title">${pTitle}</div>
            ${priceHtml}
          </a>
        `;
      }).join('');

      productsHtml = `
        <div class="myalmari-tab-panel is-active" id="myalmari-panel-products" role="tabpanel">
          <div class="myalmari-products-grid">
            ${cardItems}
          </div>
        </div>
      `;
    } else {
      productsHtml = `
        <div class="myalmari-tab-panel is-active" id="myalmari-panel-products" role="tabpanel">
          <div class="myalmari-no-results">No products found.</div>
        </div>
      `;
    }

    // COLLECTIONS LIST
    let collectionsHtml = '';
    if (hasCollections) {
      const collItems = collections.map(function (c) {
        return `
          <li>
            <a href="${c.url}" class="myalmari-collection-item">
              ${escapeHtml(c.title).toUpperCase()}
            </a>
          </li>
        `;
      }).join('');

      collectionsHtml = `
        <div class="myalmari-tab-panel" id="myalmari-panel-collections" role="tabpanel">
          <ul class="myalmari-collections-list">
            ${collItems}
          </ul>
        </div>
      `;
    }

    // VIEW ALL RESULTS BUTTON
    const viewAllBtnHtml = `
      <div class="myalmari-view-all-wrap">
        <a href="/search?q=${encodeURIComponent(query)}&type=product" class="myalmari-view-all-btn">
          VIEW ALL RESULTS
        </a>
      </div>
    `;

    rightColumnHtml = `
      <div class="myalmari-col-tabs-wrapper">
        ${tabsHeaderHtml}
        ${productsHtml}
        ${collectionsHtml}
        ${viewAllBtnHtml}
      </div>
    `;

    // Combine
    html = `
      <div class="myalmari-search-results-content">
        ${leftColumnHtml}
        ${rightColumnHtml}
      </div>
    `;

    searchContent.innerHTML = html;

    // Attach Tab Switching Events
    const tabBtns = searchContent.querySelectorAll('.myalmari-tab-btn');
    tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const targetTab = btn.getAttribute('data-tab');

        tabBtns.forEach(function (b) {
          b.classList.remove('is-active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-selected', 'true');

        const panels = searchContent.querySelectorAll('.myalmari-tab-panel');
        panels.forEach(function (p) {
          p.classList.remove('is-active');
        });

        const activePanel = searchContent.querySelector('#myalmari-panel-' + targetTab);
        if (activePanel) {
          activePanel.classList.add('is-active');
        }
      });
    });
  }

  // Self initialize on DOMContentLoaded or immediate
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
