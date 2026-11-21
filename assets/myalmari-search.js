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
  let skuIndexData = null;
  let skuIndexLoading = false;

  function loadSkuIndex() {
    if (skuIndexData || skuIndexLoading) return;
    skuIndexLoading = true;
    const indexUrl = window.__BBS_SKU_INDEX_URL || '/assets/bbs-sku-index.json';
    fetch(indexUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load SKU index: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        skuIndexData = data;
      })
      .catch(function (err) {
        console.warn('BBS SKU index notice:', err);
      })
      .finally(function () {
        skuIndexLoading = false;
      });
  }

  function lookupSkuInIndex(query) {
    if (!skuIndexData || !skuIndexData.skus || !skuIndexData.products) return null;
    const q = (query || '').toLowerCase().trim();
    if (!q || q.length < 3) return null;
    const cleanQ = q.replace(/[^a-z0-9]/g, '');

    let pIdx = skuIndexData.skus[q];
    if (pIdx === undefined) pIdx = skuIndexData.skus[cleanQ];
    if (pIdx === undefined && (q.startsWith('bbs_') || q.startsWith('bbs-') || q.startsWith('bbs '))) {
      const shortQ = q.replace(/^bbs[_\-\s]+/, '');
      pIdx = skuIndexData.skus[shortQ];
      if (pIdx === undefined) pIdx = skuIndexData.skus[shortQ.replace(/[^a-z0-9]/g, '')];
    }
    if (pIdx === undefined && !cleanQ.startsWith('bbs')) {
      pIdx = skuIndexData.skus['bbs' + cleanQ];
      if (pIdx === undefined) pIdx = skuIndexData.skus['bbs_' + cleanQ];
    }

    if (pIdx !== undefined && skuIndexData.products[pIdx]) {
      const p = skuIndexData.products[pIdx];
      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        vendor: p.vendor,
        price: p.price,
        compare_at_price_max: '0.00',
        image: p.image,
        featured_image: { url: p.image },
        url: p.url,
        tags: [query, p.title]
      };
    }
    return null;
  }

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

    // Pre-load SKU index in background
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(loadSkuIndex);
    } else {
      setTimeout(loadSkuIndex, 1000);
    }
  }

  function getHeaderBottom() {
    const mobileHeader = document.querySelector('.header-mobile');
    const desktopHeader = document.querySelector('.header-navigation') ||
                          document.querySelector('.section-header-navigation') ||
                          document.querySelector('#shopify-section-header') ||
                          document.querySelector('sticky-header');

    let target = null;
    if (window.innerWidth <= 1024 && mobileHeader && mobileHeader.clientHeight > 0) {
      target = mobileHeader;
    } else if (desktopHeader && desktopHeader.clientHeight > 0) {
      target = desktopHeader;
    }

    if (target) {
      const rect = target.getBoundingClientRect();
      if (rect && rect.bottom > 0) {
        return Math.round(rect.bottom);
      }
    }
    return 140;
  }

  function updatePosition() {
    if (!searchWrapper || !searchPanel) return;
    const bottom = getHeaderBottom();
    searchPanel.style.top = bottom + 'px';
  }

  function openSearch() {
    if (!searchWrapper) return;
    loadSkuIndex();
    searchWrapper.classList.add('is-open');
    updatePosition();
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

  function calculateProductScore(p, query) {
    const q = query.toLowerCase().trim();
    if (!q) return 0;

    const title = (p.title || '').toLowerCase();
    const vendor = (p.vendor || '').toLowerCase();
    const type = (p.type || '').toLowerCase();
    const handle = (p.handle || '').toLowerCase();
    const tags = Array.isArray(p.tags) ? p.tags.map(function(t) { return t.toLowerCase(); }) : [];
    const tagsStr = tags.join(' ');
    const body = (p.body || '').toLowerCase();
    const image = (p.image || (p.featured_image ? p.featured_image.url : '') || '').toLowerCase();
    const url = (p.url || '').toLowerCase();

    // Check SKU: in variants, in image filename, or in Shopify _psq
    let matchesSku = false;
    if (p.variants && Array.isArray(p.variants)) {
      for (let i = 0; i < p.variants.length; i++) {
        const sku = (p.variants[i].sku || '').toLowerCase();
        if (sku && (sku === q || sku.includes(q) || q.includes(sku))) {
          matchesSku = true;
          break;
        }
      }
    }

    const isSkuQuery = /^bbs[\s_-]?[a-z0-9]+/i.test(q) || (/^[a-z0-9_-]{4,}$/i.test(q) && /\d/.test(q) && /[a-z]/i.test(q));

    const cleanQ = q.replace(/[^a-z0-9]/g, '');
    const cleanImg = image.replace(/[^a-z0-9]/g, '');
    if (isSkuQuery && cleanQ.length >= 4 && cleanImg.includes(cleanQ)) {
      matchesSku = true;
    }

    if (isSkuQuery && (url.includes('_psq=' + encodeURIComponent(q).toLowerCase()) || url.includes('_psq=' + q))) {
      matchesSku = true;
    }

    if (isSkuQuery && matchesSku) {
      return 1000; // Top priority for SKU matches!
    }

    let score = 0;

    // 1. Exact match in title
    if (title === q) {
      score += 250;
    } else if (title.startsWith(q + ' ') || title.includes(' ' + q + ' ') || title.endsWith(' ' + q)) {
      score += 150;
    } else if (title.includes(q)) {
      score += 90;
    }

    // 2. Exact match in vendor (Brand)
    if (vendor === q) {
      score += 180;
    } else if (vendor.includes(q)) {
      score += 100;
    }

    // 3. Match in tags
    if (tags.some(function(t) { return t === q; })) {
      score += 120;
    } else if (tagsStr.includes(q)) {
      score += 60;
    }

    // 4. Match in handle or type
    if (handle === q || handle.includes(q)) {
      score += 50;
    }
    if (type && type.includes(q)) {
      score += 40;
    }

    // 5. Multi-token queries (all tokens must match somewhere relevant)
    const tokens = q.split(/[\s_-]+/).filter(Boolean);
    if (tokens.length > 1) {
      const allTokensMatch = tokens.every(function(token) {
        return title.includes(token) || 
               vendor.includes(token) || 
               tagsStr.includes(token) || 
               handle.includes(token) ||
               matchesSku;
      });
      if (allTokensMatch) {
        score += 80;
      }
    }

    if (matchesSku) {
      score += 200;
    }

    // Filter out completely unrelated products (fuzzy / typo pollution)
    const hasAnyRelevantMatch = tokens.some(function(token) {
      return title.includes(token) || 
             vendor.includes(token) || 
             tagsStr.includes(token) || 
             handle.includes(token) || 
             matchesSku;
    });

    if (!hasAnyRelevantMatch) {
      return 0; // Filter out products that have no relevant connection
    }

    return score;
  }

  function fetchLiveSuggestions(query) {
    // Explicitly query all essential product fields including variants.sku
    const url = `/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product,collection,query&resources[options][fields]=title,body,vendor,product_type,tag,variants.title,variants.sku&resources[options][unavailable_products]=hide&resources[limit]=10`;

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

        // Score, filter and rank products by relevance
        const scoredProducts = [];
        for (let i = 0; i < rawProducts.length; i++) {
          const p = rawProducts[i];
          const score = calculateProductScore(p, query);
          if (score > 0) {
            scoredProducts.push({ product: p, score: score });
          }
        }

        // Instant SKU lookup integration: if query matches SKU index, include it
        const matchedSkuProduct = lookupSkuInIndex(query);
        if (matchedSkuProduct) {
          const alreadyIncluded = scoredProducts.some(function(item) {
            return item.product.handle === matchedSkuProduct.handle || String(item.product.id) === String(matchedSkuProduct.id);
          });
          if (!alreadyIncluded) {
            scoredProducts.unshift({ product: matchedSkuProduct, score: 9999 });
          }
          if (queries.length === 0) {
            queries.push({
              text: query.toUpperCase(),
              styled_text: '<strong>' + escapeHtml(query.toUpperCase()) + '</strong>'
            });
          }
        }

        // Sort descending by relevance score
        scoredProducts.sort(function(a, b) {
          return b.score - a.score;
        });

        const products = scoredProducts.slice(0, 4).map(function(item) {
          return item.product;
        });

        const collections = resources.collections || [];

        renderResults(query, queries, products, collections);
      })
      .catch(function (err) {
        console.error('My Almari search error:', err);
        if (query !== activeQuery) return;
        if (searchLoading) searchLoading.style.display = 'none';

        const fallbackSku = lookupSkuInIndex(query);
        if (fallbackSku) {
          renderResults(query, [{ text: query.toUpperCase(), styled_text: '<strong>' + escapeHtml(query.toUpperCase()) + '</strong>' }], [fallbackSku], []);
          return;
        }

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
      const fallbackSku = lookupSkuInIndex(query);
      if (fallbackSku) {
        products = [fallbackSku];
        queries = [{ text: query.toUpperCase(), styled_text: '<strong>' + escapeHtml(query.toUpperCase()) + '</strong>' }];
      } else {
        renderNoResults();
        return;
      }
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

    // Combine - inject directly into searchContent without nested div
    html = `${leftColumnHtml}${rightColumnHtml}`;
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
