/* buybutton.js (D'Natural Body)
   - Loads Shopify Buy Button SDK once
   - Creates ONE shared cart drawer + toggle
   - Exposes:
       window.DNShopify.mountVariantPills({
         productId,           // numeric product id string, e.g. "14889665036653"
         pillsNode,           // selector or element for size pills wrapper
         priceNode,           // selector or element for price text
         addBtn,              // selector or element for your Add to cart button
         qtyInput,            // selector or element for your visible qty input
         optionNames,         // ['size','weight','amount','title'] etc.
         openCartOnAdd: true  // (we let Shopify open drawer automatically)
       })
*/

(function () {
  if (window.DNShopify && window.DNShopify.__initialized) return;

  var CONFIG = {
    myshopifyDomain: 'dpscr1-vz.myshopify.com',
    storefrontAccessToken: 'b6634d4da21c44f64244a1ff19a52d78',
    sdkUrl: 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js',
    toggleNodeId: 'shopify-cart-toggle'
  };

  var state = {
    client: null,
    ui: null,
    cart: null,
    productsCache: null,
    productsCachePromise: null,
    hiddenProducts: {} // productId -> {component, root}
  };

  // ---------------------------
  // SDK loader
  // ---------------------------
  function loadSdk(cb) {
    var s = document.createElement('script');
    s.async = true;
    s.src = CONFIG.sdkUrl;
    (document.head || document.body).appendChild(s);
    s.onload = cb;
  }

  function ensureToggleNodeExists() {
    return !!document.getElementById(CONFIG.toggleNodeId);
  }

  // ---------------------------
  // Helpers for product lookup
  // ---------------------------
  function gidToNumericId(gid) {
    if (!gid) return null;
    try {
      var str = String(gid);
      if (str.indexOf('gid://') === 0) {
        var parts = str.split('/');
        return parts[parts.length - 1] || null;
      }
      var decoded = atob(str);
      if (decoded && decoded.indexOf('gid://') === 0) {
        var p = decoded.split('/');
        return p[p.length - 1] || null;
      }
    } catch (e) {}

    var m = String(gid).match(/(\d+)$/);
    return m ? m[1] : null;
  }

  function fetchAllProductsOnce() {
    if (state.productsCache) return Promise.resolve(state.productsCache);
    if (state.productsCachePromise) return state.productsCachePromise;

    state.productsCachePromise = state.client.product.fetchAll(250).then(function (products) {
      state.productsCache = products || [];
      return state.productsCache;
    });

    return state.productsCachePromise;
  }

  function findProductByNumericId(numericId) {
    var wanted = String(numericId);
    return fetchAllProductsOnce().then(function (products) {
      for (var i = 0; i < products.length; i++) {
        var p = products[i];
        var num = gidToNumericId(p && p.id);
        if (num && String(num) === wanted) return p;
      }
      return null;
    });
  }

  // ---------------------------
  // Hidden Shopify product (for real cart add)
  // ---------------------------
  function ensureHiddenProductComponent(productId) {
    var key = String(productId);
    if (state.hiddenProducts[key]) return state.hiddenProducts[key];

    var nodeId = 'product-component-' + key;
    var root = document.getElementById(nodeId);
    if (!root || !state.ui) return null;

    // Render Shopify product into this node (we keep it invisible via CSS/inline style)
    var comp = state.ui.createComponent('product', {
      id: key,
      node: root,
      moneyFormat: '${{amount}}',
      options: {
        product: {
          iframe: false, // render directly in DOM so we can poke its <select>, qty, button
          styles: {
            product: {
              display: 'none'
            }
          }
        },
        // We DON'T specify cart/toggle options here; they use the global cart we created.
      }
    });

    var entry = { component: comp, root: root };
    state.hiddenProducts[key] = entry;
    return entry;
  }

  // ---------------------------
  // Init Shopify client + UI
  // ---------------------------
  function init() {
    state.client = ShopifyBuy.buildClient({
      domain: CONFIG.myshopifyDomain,
      storefrontAccessToken: CONFIG.storefrontAccessToken
    });

    ShopifyBuy.UI.onReady(state.client).then(function (ui) {
      state.ui = ui;

      // Global cart drawer
      state.cart = ui.createComponent('cart', {
        options: {
          cart: {
            iframe: true,
            popup: true,
            startOpen: false
          }
        }
      });

      // Header toggle, if node exists
      if (ensureToggleNodeExists()) {
        ui.createComponent('toggle', {
          node: document.getElementById(CONFIG.toggleNodeId),
          options: {
            toggle: {
              styles: {
                toggle: {
                  'background-color': 'transparent',
                  ':hover': { 'background-color': 'transparent' },
                  ':focus': { 'background-color': 'transparent' }
                }
              }
            }
          }
        });
      }

      // Expose global object
      window.DNShopify = window.DNShopify || {};
      window.DNShopify.__initialized = true;
      window.DNShopify.client = state.client;
      window.DNShopify.ui = ui;
      window.DNShopify.cart = state.cart;

      // ---------------------------
      // Variant pills helper
      // ---------------------------
      window.DNShopify.mountVariantPills = function (cfg) {
        if (!cfg || !cfg.productId) return;

        var productId = String(cfg.productId);

        var pillsNode =
          typeof cfg.pillsNode === 'string'
            ? document.querySelector(cfg.pillsNode)
            : cfg.pillsNode;

        var priceNode =
          typeof cfg.priceNode === 'string'
            ? document.querySelector(cfg.priceNode)
            : cfg.priceNode;

        var addBtn =
          typeof cfg.addBtn === 'string'
            ? document.querySelector(cfg.addBtn)
            : cfg.addBtn;

        var qtyInput =
          typeof cfg.qtyInput === 'string'
            ? document.querySelector(cfg.qtyInput)
            : cfg.qtyInput;

        if (!pillsNode || !priceNode || !addBtn) return;

        var optionNames = (cfg.optionNames && cfg.optionNames.length)
          ? cfg.optionNames.map(function (s) { return String(s).toLowerCase(); })
          : ['size', 'weight', 'amount', 'title'];

        var selectedVariant = null;

        function defaultMoney(amountStr) {
          var n = Number(amountStr);
          if (isNaN(n)) return '$0.00';
          return '$' + n.toFixed(2);
        }

        function getVariantPrice(v) {
          if (!v) return null;
          if (typeof v.price === 'string' || typeof v.price === 'number') return String(v.price);
          if (v.priceV2) {
            if (typeof v.priceV2 === 'string' || typeof v.priceV2 === 'number') return String(v.priceV2);
            if (v.priceV2.amount) return String(v.priceV2.amount);
          }
          if (v.price && v.price.amount) return String(v.price.amount);
          return null;
        }

        function setBtnEnabled(on) {
          addBtn.disabled = !on;
          addBtn.classList.toggle('disabled', !on);
        }

        function setActive(btnEl) {
          var btns = pillsNode.querySelectorAll('.size-pill');
          for (var i = 0; i < btns.length; i++) {
            btns[i].classList.remove('active');
          }
          if (btnEl) btnEl.classList.add('active');
        }

        function renderPillsFromProduct(product, hiddenRoot) {
          pillsNode.innerHTML = '';

          // Which option index corresponds to size?
          var optionIndex = -1;
          if (product && product.options && product.options.length) {
            for (var oi = 0; oi < product.options.length; oi++) {
              var name = String(product.options[oi].name || '').toLowerCase();
              if (optionNames.indexOf(name) !== -1) {
                optionIndex = oi;
                break;
              }
            }
            if (optionIndex === -1 && product.options.length === 1) optionIndex = 0;
          }

          var labels = [];
          var labelToVariant = {};
          (product.variants || []).forEach(function (v) {
            var label = null;
            if (optionIndex >= 0 && v.options && v.options[optionIndex]) {
              label = v.options[optionIndex];
            }
            if (!label) label = v.title || 'Default';
            label = String(label).trim();
            if (!label) label = 'Default';

            if (!labelToVariant[label]) {
              labels.push(label);
              labelToVariant[label] = v;
            }
          });

          if (!labels.length) {
            priceNode.textContent = defaultMoney('0');
            setBtnEnabled(false);
            return;
          }

          labels.forEach(function (label, idx) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'size-pill';
            btn.textContent = label;
            btn.dataset.value = label;

            btn.addEventListener('click', function () {
              var v = labelToVariant[label];
              if (!v) return;
              selectedVariant = v;
              setActive(btn);
              priceNode.textContent = defaultMoney(getVariantPrice(selectedVariant));
              setBtnEnabled(true);
            });

            pillsNode.appendChild(btn);

            // Auto-select first pill
            if (idx === 0) {
              setTimeout(function () { btn.click(); }, 0);
            }
          });

          // Hook Add to cart click -> drive hidden Shopify product
          addBtn.addEventListener('click', function () {
            if (!selectedVariant) return;

            // Find hidden Shopify controls
            var hiddenSelect = hiddenRoot
              ? hiddenRoot.querySelector('select.shopify-buy__option-select__select')
              : null;
            var hiddenQtyInput = hiddenRoot
              ? hiddenRoot.querySelector('input.shopify-buy__quantity')
              : null;
            var hiddenBtn = hiddenRoot
              ? hiddenRoot.querySelector('.shopify-buy__btn')
              : null;

            // Sync size selection into hidden select (by label text)
            if (hiddenSelect) {
              var targetLabel = null;

              // Figure out which label this variant uses on our pills
              var keyLabel = null;
              if (optionIndex >= 0 && selectedVariant.options && selectedVariant.options[optionIndex]) {
                keyLabel = String(selectedVariant.options[optionIndex]).trim();
              } else {
                keyLabel = String(selectedVariant.title || '').trim();
              }

              var opts = hiddenSelect.options;
              for (var i = 0; i < opts.length; i++) {
                var txt = String(opts[i].textContent || opts[i].value || '').trim();
                if (txt === keyLabel) {
                  hiddenSelect.selectedIndex = i;
                  targetLabel = txt;
                  break;
                }
              }

              // Trigger change so Shopify updates selectedVariant internally
              var evt;
              if (typeof Event === 'function') {
                evt = new Event('change', { bubbles: true });
              } else {
                // IE fallback
                evt = document.createEvent('Event');
                evt.initEvent('change', true, true);
              }
              hiddenSelect.dispatchEvent(evt);
            }

            // Sync quantity
            if (hiddenQtyInput && qtyInput) {
              hiddenQtyInput.value = qtyInput.value;
            }

            // Click Shopify's own Add to cart button
            if (hiddenBtn && typeof hiddenBtn.click === 'function') {
              hiddenBtn.click();
            }
          });
        }

        // Start disabled until product loads
        setBtnEnabled(false);
        priceNode.textContent = '$0.00';

        // Make sure hidden Shopify product for this ID exists
        var hiddenEntry = ensureHiddenProductComponent(productId);
        var hiddenRoot = hiddenEntry ? hiddenEntry.root : null;

        // Fetch product (from cache) and build pills
        findProductByNumericId(productId)
          .then(function (product) {
            if (!product) {
              // Try again after cache warm if needed
              return fetchAllProductsOnce().then(function () {
                return findProductByNumericId(productId);
              });
            }
            return product;
          })
          .then(function (product) {
            if (!product) {
              setBtnEnabled(false);
              return;
            }
            renderPillsFromProduct(product, hiddenRoot);
          });
      };
    });
  }

  // ---------------------------
  // Boot
  // ---------------------------
  window.DNShopify = window.DNShopify || {};
  window.DNShopify.__initialized = false;

  if (window.ShopifyBuy && window.ShopifyBuy.UI) init();
  else loadSdk(init);
})();
