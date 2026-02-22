/* buybutton.js (D'Natural Body)
   Shopify Buy Button SDK + Cart Drawer + Header Toggle
   + OPTIONAL custom variant pills UI

   Exposes:
     - window.DNShopify.mountProduct({id,node,options})
     - window.DNShopify.mountVariantPills({
         productId, pillsNode, priceNode, addBtn, qtyInput,
         optionNames: ['size','weight','amount','title'],
         openCartOnAdd: true
       })
*/

(function () {
  // If DNShopify is already fully initialized, don't re-init core again.
  if (window.DNShopify && window.DNShopify.__initialized) return;

  var CONFIG = {
    myshopifyDomain: 'dpscr1-vz.myshopify.com',
    storefrontAccessToken: 'b6634d4da21c44f64244a1ff19a52d78',
    onlineStoreCartBase: 'https://shop.dnaturalbody.com/cart',
    sdkUrl: 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js',
    toggleNodeId: 'shopify-cart-toggle'
  };

  var state = {
    ui: null,
    cart: null,
    client: null,
    productsCache: null,
    productsCachePromise: null
  };

  // Safer SDK loader: re-use existing script if present, and don't double-load
  function loadSdk(cb) {
    if (window.ShopifyBuy && window.ShopifyBuy.UI) {
      cb();
      return;
    }

    var existing = document.querySelector(
      'script[src*="buy-button-storefront.min.js"]'
    );
    if (existing) {
      // If it’s already on the page but still loading, hook into its onload
      if (existing.dataset.dnLoaded === '1') {
        cb();
      } else {
        existing.addEventListener('load', function () {
          existing.dataset.dnLoaded = '1';
          cb();
        });
      }
      return;
    }

    var s = document.createElement('script');
    s.async = true;
    s.src = CONFIG.sdkUrl;
    s.onload = function () {
      s.dataset.dnLoaded = '1';
      cb();
    };
    (document.head || document.body).appendChild(s);
  }

  function gidToNumericId(gid) {
    if (!gid) return null;
    try {
      // gid sometimes is base64; sometimes already looks like gid://...
      if (String(gid).indexOf('gid://') === 0) {
        var parts = String(gid).split('/');
        return parts[parts.length - 1] || null;
      }
      // try base64 decode
      var decoded = atob(String(gid));
      if (decoded && decoded.indexOf('gid://') === 0) {
        var p = decoded.split('/');
        return p[p.length - 1] || null;
      }
    } catch (e) {}

    // last resort: pull trailing digits
    var m = String(gid).match(/(\d+)$/);
    return m ? m[1] : null;
  }

  function getLineItems() {
    try {
      return (state.cart && state.cart.model && state.cart.model.lineItems)
        ? state.cart.model.lineItems
        : [];
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

  function ensureToggleNodeExists() {
    // IMPORTANT: Do NOT auto-create a hidden toggle anymore.
    // If you want it in your header, include: <div id="shopify-cart-toggle"></div>
    return !!document.getElementById(CONFIG.toggleNodeId);
  }

  function defaultMoney(amountStr) {
    var n = Number(amountStr);
    if (isNaN(n)) return '$0.00';
    return '$' + n.toFixed(2);
  }

  function init() {
    state.client = ShopifyBuy.buildClient({
      domain: CONFIG.myshopifyDomain,
      storefrontAccessToken: CONFIG.storefrontAccessToken
    });

    ShopifyBuy.UI.onReady(state.client).then(function (ui) {
      state.ui = ui;

      // Create the cart drawer once. Some SDK versions return a Promise instead of the cart instance.
      var cartComponent = ui.createComponent('cart', {
        options: {
          cart: {
            startOpen: false,
            popup: false,
            text: { total: 'Subtotal', button: 'Checkout' }
          }
        }
      });

      function afterCartReady(cartInstance) {
        state.cart = cartInstance;

        // Expose DNShopify core
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

        // Create header toggle ONLY if node exists
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

        // ------- Standard Buy Button products -------
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

        // ---------- Variant Pills ----------
        setupVariantPillsHelpers();
      }

      // Handle both sync + promise returns from createComponent('cart')
      if (cartComponent && typeof cartComponent.then === 'function') {
        cartComponent.then(afterCartReady);
      } else {
        afterCartReady(cartComponent);
      }
    });
  }

  function setupVariantPillsHelpers() {
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

        // Choose which option index to use
        var optionIndex = -1;
        if (product && product.options && product.options.length) {
          for (var oi = 0; oi < product.options.length; oi++) {
            var name = String(product.options[oi].name || '').toLowerCase();
            if (optionNames.indexOf(name) !== -1) {
              optionIndex = oi;
              break;
            }
          }
          // if none match, but there is exactly 1 option, use it
          if (optionIndex === -1 && product.options.length === 1) optionIndex = 0;
        }

        // Build unique labels from variants
        var labels = [];
        var labelToVariant = {};
        (product.variants || []).forEach(function (v) {
          var label = null;
          if (optionIndex >= 0 && v.options && v.options[optionIndex]) {
            label = v.options[optionIndex];
          }
          if (!label) label = v.title || 'Default';

          // normalize
          label = String(label).trim();
          if (!label) label = 'Default';

          if (!labelToVariant[label]) {
            labels.push(label);
            labelToVariant[label] = v;
          }
        });

        // If still nothing, hard fail
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

          // auto-select first
          if (idx === 0) {
            setTimeout(function () { btn.click(); }, 0);
          }
        });

        // Hook add button (once per mount)
        addBtn.addEventListener('click', function () {
          if (!selectedVariant) return;

          // Read quantity (default 1)
          var qty = 1;
          if (qtyInput) {
            var q = Number(qtyInput.value);
            if (!isNaN(q) && q > 0) qty = Math.floor(q);
          }

          try {
            // Do we have a cart drawer + checkout?
            var hasCartCheckout =
              state.cart &&
              state.client &&
              state.cart.model &&
              state.cart.model.id;

            var numericId = gidToNumericId(selectedVariant.id);

            if (hasCartCheckout) {
              var lineItem = {
                variantId: String(selectedVariant.id),
                quantity: qty
              };

              // Use the main client to add line items to the existing checkout
              var p = state.client.checkout.addLineItems(
                state.cart.model.id,
                [lineItem]
              );

              if (p && typeof p.then === 'function') {
                p.then(function () {
                  // Always open the drawer when requested and available
                  if (
                    cfg.openCartOnAdd !== false &&
                    window.DNShopify &&
                    typeof window.DNShopify.openCart === 'function'
                  ) {
                    window.DNShopify.openCart();
                  }
                }).catch(function (err) {
                  console.error('Error adding item to Shopify cart, falling back to cart URL', err);
                  // Fallback: go to Online Store cart page with just this item
                  if (numericId) {
                    window.location.href =
                      CONFIG.onlineStoreCartBase + '/' + numericId + ':' + qty;
                  }
                });
              } else {
                // No promise returned – just open the drawer
                if (
                  cfg.openCartOnAdd !== false &&
                  window.DNShopify &&
                  typeof window.DNShopify.openCart === 'function'
                ) {
                  window.DNShopify.openCart();
                }
              }
            } else if (numericId) {
              // Drawer not initialized → go straight to Online Store cart page
              window.location.href =
                CONFIG.onlineStoreCartBase + '/' + numericId + ':' + qty;
            } else {
              console.error('Shopify cart not ready and could not resolve variant id');
            }
          } catch (e) {
            console.error('Error adding item to Shopify cart', e);
          }
        });
      }

      // Fetch product by numeric ID
      setBtnEnabled(false);
      priceNode.textContent = '$0.00';

      findProductByNumericId(cfg.productId).then(function (product) {
        if (!product) {
          // If not found, try again after the cache is hydrated
          return fetchAllProductsOnce().then(function () {
            return findProductByNumericId(cfg.productId);
          });
        }
        return product;
      }).then(function (product) {
        if (!product) {
          // Still not found
          setBtnEnabled(false);
          return;
        }
        renderPillsFromVariants(product);
      });
    };
  }

  // Bootstrap
  window.DNShopify = window.DNShopify || {};
  window.DNShopify.__initialized = false;

  if (window.ShopifyBuy && window.ShopifyBuy.UI) {
    init();
  } else {
    loadSdk(init);
  }
})();
