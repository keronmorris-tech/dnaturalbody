/* buybutton.js (D'Natural Body)
   One global Shopify Buy Button SDK cart drawer + helpers.

   Exposes:
     - window.DNShopify.mountProduct({id,node,options})
     - window.DNShopify.mountVariantPills({
         productId, pillsNode, priceNode, addBtn, qtyInput,
         optionNames: ['size','weight','amount','title'],
         openCartOnAdd: true,
         showToast: true
       })
*/

(function () {
  if (window.DNShopify && window.DNShopify.__initialized) return;

  var CONFIG = {
    myshopifyDomain: 'dpscr1-vz.myshopify.com',
    storefrontAccessToken: 'b6634d4da21c44f64244a1ff19a52d78',
    // Online Store cart base URL (for last-resort fallback)
    onlineStoreCartBase: 'https://shop.dnaturalbody.com/cart',
    sdkUrl: 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js',
    toggleNodeId: 'shopify-cart-toggle'
  };

  var state = {
    ui: null,
    cart: null,
    client: null,
    productsCache: null,
    productsCachePromise: null,
    cartReadyPromise: null
  };

  /* -------------------- Helpers -------------------- */

  function loadSdk(cb) {
    var s = document.createElement('script');
    s.async = true;
    s.src = CONFIG.sdkUrl;
    (document.head || document.body).appendChild(s);
    s.onload = cb;
  }

  function gidToNumericId(gid) {
    if (!gid) return null;
    try {
      var str = String(gid);
      if (str.indexOf('gid://') === 0) {
        var parts = str.split('/');
        return parts[parts.length - 1] || null;
      }
      // try base64 decode
      var decoded = atob(str);
      if (decoded && decoded.indexOf('gid://') === 0) {
        var p = decoded.split('/');
        return p[p.length - 1] || null;
      }
    } catch (e) {}

    var m = String(gid).match(/(\d+)$/);
    return m ? m[1] : null;
  }

  function getLineItems() {
    try {
      if (state.cart && state.cart.model && state.cart.model.lineItems) {
        return state.cart.model.lineItems;
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  function buildCartPermalinkFromDrawer() {
    var items = getLineItems();
    if (!items.length) return CONFIG.onlineStoreCartBase;

    var segments = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var variantGid = item && item.variant && item.variant.id;
      var variantId = gidToNumericId(variantGid);
      var qty = Number((item && item.quantity) || 0);
      if (variantId && qty > 0) segments.push(variantId + ':' + qty);
    }

    if (!segments.length) return CONFIG.onlineStoreCartBase;
    return CONFIG.onlineStoreCartBase + '/' + segments.join(',');
  }

  // Make sure checkout from the drawer opens in same tab on your Online Store cart page
  function interceptDrawerCheckoutToCartPage() {
    document.addEventListener(
      'click',
      function (e) {
        var target = e.target;
        if (!target || !target.closest) return;

        var btn = target.closest('.shopify-buy__btn--cart-checkout, .shopify-buy__cart__checkout');
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();

        window.location.href = buildCartPermalinkFromDrawer();
      },
      true
    );
  }

  // Wait until the cart drawer has a checkout ID & client
  function waitForCartReady() {
    if (state.cartReadyPromise) return state.cartReadyPromise;

    state.cartReadyPromise = new Promise(function (resolve) {
      var maxMs = 5000;
      var interval = 60;
      var waited = 0;

      function check() {
        if (
          state.cart &&
          state.cart.model &&
          state.cart.model.id &&
          state.cart.props &&
          state.cart.props.client
        ) {
          resolve();
          return;
        }
        waited += interval;
        if (waited >= maxMs) {
          console.error('DNShopify: cart not ready after 5s, will still attempt add.');
          resolve(); // resolve anyway so caller can decide fallback
          return;
        }
        setTimeout(check, interval);
      }

      check();
    });

    return state.cartReadyPromise;
  }

  // Small toast at top center
  function showToast(message) {
    try {
      var existing = document.getElementById('dn-toast');
      if (existing) {
        existing.textContent = message;
        existing.classList.remove('dn-toast-hide');
        existing.classList.add('dn-toast-show');
      } else {
        var div = document.createElement('div');
        div.id = 'dn-toast';
        div.textContent = message;
        div.style.position = 'fixed';
        div.style.top = '20px';
        div.style.left = '50%';
        div.style.transform = 'translateX(-50%)';
        div.style.padding = '10px 18px';
        div.style.borderRadius = '999px';
        div.style.backgroundColor = 'rgba(0,0,0,0.85)';
        div.style.color = '#fff';
        div.style.fontSize = '14px';
        div.style.zIndex = '9999';
        div.style.opacity = '0';
        div.style.transition = 'opacity 0.25s ease';
        document.body.appendChild(div);
      }

      var el = document.getElementById('dn-toast');
      el.offsetHeight; // force reflow
      el.style.opacity = '1';

      setTimeout(function () {
        el.style.opacity = '0';
      }, 2000);
    } catch (e) {
      // fail silently if toast can't render
    }
  }

  // Optional: ensure toggle node exists (we won't auto-create anymore, just check)
  function ensureToggleNodeExists() {
    return !!document.getElementById(CONFIG.toggleNodeId);
  }

  /* -------------------- Init Shopify client + cart -------------------- */

  function init() {
    state.client = ShopifyBuy.buildClient({
      domain: CONFIG.myshopifyDomain,
      storefrontAccessToken: CONFIG.storefrontAccessToken
    });

    ShopifyBuy.UI.onReady(state.client).then(function (ui) {
      state.ui = ui;

      // Create ONE cart drawer for the whole site
      state.cart = ui.createComponent('cart', {
        options: {
          cart: {
            startOpen: false,
            popup: false,
            text: { total: 'Subtotal', button: 'Checkout' }
          }
        }
      });

      // Optional header toggle (if you add <div id="shopify-cart-toggle"></div> in the nav)
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

      interceptDrawerCheckoutToCartPage();

      // Expose helpers
      window.DNShopify = window.DNShopify || {};
      window.DNShopify.__initialized = true;
      window.DNShopify.ui = ui;
      window.DNShopify.cart = state.cart;
      window.DNShopify.client = state.client;

      window.DNShopify.openCart = function () {
        try {
          if (state.cart && typeof state.cart.open === 'function') {
            state.cart.open();
          }
        } catch (e) {}
      };

      /* ---------- Standard product component (rarely needed now) ---------- */
      window.DNShopify.mountProduct = function (cfg) {
        if (!cfg || !cfg.id || !cfg.node) return;
        var nodeEl = typeof cfg.node === 'string' ? document.querySelector(cfg.node) : cfg.node;
        if (!nodeEl) return;

        var options = cfg.options || {};
        options.events = options.events || {};
        if (!options.events.afterAddVariant) {
          options.events.afterAddVariant = function () {
            if (window.DNShopify && window.DNShopify.openCart) {
              window.DNShopify.openCart();
            }
          };
        }

        ui.createComponent('product', {
          id: String(cfg.id),
          node: nodeEl,
          moneyFormat: '${{amount}}',
          options: options
        });
      };

      /* ---------------- Variant Pills UI (body butters) ---------------- */

      // Cache all products once for fast lookups
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

      function defaultMoney(amountStr) {
        var n = Number(amountStr);
        if (isNaN(n)) return '$0.00';
        return '$' + n.toFixed(2);
      }

      // Core add-to-cart helper (used by body butters + scrubs)
      function addVariantToCart(variant, qty, opts) {
        opts = opts || {};
        var openCartOnAdd = opts.openCartOnAdd !== false; // default true
        var showToastFlag = opts.showToast !== false;     // default true

        if (!variant) {
          console.error('DNShopify: no variant provided to addVariantToCart');
          return;
        }

        waitForCartReady().then(function () {
          var ready =
            state.cart &&
            state.cart.props &&
            state.cart.props.client &&
            state.cart.model &&
            state.cart.model.id;

          var lineItem = {
            variantId: String(variant.id),
            quantity: qty
          };

          if (ready) {
            try {
              var p = state.cart.props.client.checkout.addLineItems(
                state.cart.model.id,
                [lineItem]
              );

              if (p && typeof p.then === 'function') {
                p.then(function () {
                  if (openCartOnAdd && window.DNShopify && window.DNShopify.openCart) {
                    window.DNShopify.openCart();
                  }
                  if (showToastFlag) {
                    var name = variant.title || (variant.product && variant.product.title) || 'item';
                    showToast('Added ' + name + ' to your cart');
                  }
                }).catch(function (err) {
                  console.error('DNShopify: error adding item to cart, redirecting to Online Store cart', err);
                  var numericId = gidToNumericId(variant.id);
                  if (numericId) {
                    window.location.href =
                      CONFIG.onlineStoreCartBase + '/' + numericId + ':' + qty;
                  }
                });
              } else {
                // Fallback: cart client not returning a promise but add succeeded
                if (openCartOnAdd && window.DNShopify && window.DNShopify.openCart) {
                  window.DNShopify.openCart();
                }
                if (showToastFlag) {
                  var name2 = variant.title || (variant.product && variant.product.title) || 'item';
                  showToast('Added ' + name2 + ' to your cart');
                }
              }
            } catch (e) {
              console.error('DNShopify: unexpected error in addVariantToCart, redirecting to Online Store cart', e);
              var numericId2 = gidToNumericId(variant.id);
              if (numericId2) {
                window.location.href =
                  CONFIG.onlineStoreCartBase + '/' + numericId2 + ':' + qty;
              }
            }
          } else {
            console.error('DNShopify: cart drawer still not ready, redirecting to Online Store cart');
            var numericId3 = gidToNumericId(variant.id);
            if (numericId3) {
              window.location.href =
                CONFIG.onlineStoreCartBase + '/' + numericId3 + ':' + qty;
            }
          }
        });
      }

      // Export simple helper for single-variant products (scrubs)
      window.DNShopify.addSingleVariantToCart = function (variantId, qty, opts) {
        if (!variantId) return;

        // We need the variant object, not just id. FetchProductsOnce already caches.
        fetchAllProductsOnce().then(function (products) {
          for (var i = 0; i < products.length; i++) {
            var p = products[i];
            var variants = p.variants || [];
            for (var j = 0; j < variants.length; j++) {
              var v = variants[j];
              if (String(v.id) === String(variantId)) {
                v.product = p; // attach for toast name
                addVariantToCart(v, qty, opts || {});
                return;
              }
            }
          }
          console.error('DNShopify: variant not found for addSingleVariantToCart:', variantId);
        });
      };

      // Export variant pills for multi-size products (body butters)
      window.DNShopify.mountVariantPills = function (cfg) {
        if (!cfg || !cfg.productId) return;

        var pillsNode = typeof cfg.pillsNode === 'string' ? document.querySelector(cfg.pillsNode) : cfg.pillsNode;
        var priceNode = typeof cfg.priceNode === 'string' ? document.querySelector(cfg.priceNode) : cfg.priceNode;
        var addBtn = typeof cfg.addBtn === 'string' ? document.querySelector(cfg.addBtn) : cfg.addBtn;
        var qtyInput = typeof cfg.qtyInput === 'string' ? document.querySelector(cfg.qtyInput) : cfg.qtyInput;

        if (!pillsNode || !priceNode || !addBtn) return;

        var optionNames = (cfg.optionNames && cfg.optionNames.length)
          ? cfg.optionNames.map(function (s) { return String(s).toLowerCase(); })
          : ['size', 'weight', 'amount', 'title'];

        var selectedVariant = null;

        function setBtnEnabled(on) {
          addBtn.disabled = !on;
          addBtn.classList.toggle('disabled', !on);
        }

        function setActive(btnEl) {
          var btns = pillsNode.querySelectorAll('.size-pill');
          for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
          if (btnEl) btnEl.classList.add('active');
        }

        function renderPillsFromVariants(product) {
          pillsNode.innerHTML = '';

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
              setBtnEnabled(selectedVariant.available !== false);
            });

            pillsNode.appendChild(btn);

            if (idx === 0) {
              setTimeout(function () { btn.click(); }, 0);
            }
          });

          // Add-to-cart button
          addBtn.addEventListener('click', function () {
            if (!selectedVariant) return;

            var qty = 1;
            if (qtyInput) {
              var q = Number(qtyInput.value);
              if (!isNaN(q) && q > 0) qty = Math.floor(q);
            }

            // Attach product reference for nicer toast name
            selectedVariant.product = product;
            addVariantToCart(selectedVariant, qty, {
              openCartOnAdd: cfg.openCartOnAdd !== false,
              showToast: cfg.showToast !== false
            });
          });
        }

        // Initial state while loading
        setBtnEnabled(false);
        priceNode.textContent = '$0.00';

        // Fetch product by numeric ID (not gid)
        findProductByNumericId(cfg.productId).then(function (product) {
          if (!product) {
            return fetchAllProductsOnce().then(function () {
              return findProductByNumericId(cfg.productId);
            });
          }
          return product;
        }).then(function (product) {
          if (!product) {
            setBtnEnabled(false);
            return;
          }
          renderPillsFromVariants(product);
        });
      };
    });
  }

  window.DNShopify = window.DNShopify || {};
  window.DNShopify.__initialized = false;

  if (window.ShopifyBuy && window.ShopifyBuy.UI) {
    init();
  } else if (window.ShopifyBuy) {
    loadSdk(init);
  } else {
    loadSdk(init);
  }
})();
