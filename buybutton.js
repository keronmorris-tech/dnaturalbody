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

  /* ----------------- helpers ----------------- */

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
    // We don’t auto-create the toggle; it must exist in the header markup.
    return !!document.getElementById(CONFIG.toggleNodeId);
  }

  /* -------- toast for "item added" -------- */

  function showToast(message) {
    var text = message || 'Item was added to your cart.';

    var toast = document.getElementById('dn-cart-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'dn-cart-toast';
      toast.style.position = 'fixed';
      toast.style.top = '16px';
      toast.style.left = '50%';
      toast.style.transform = 'translateX(-50%)';
      toast.style.background = 'rgba(0,0,0,0.9)';
      toast.style.color = '#fff';
      toast.style.padding = '10px 18px';
      toast.style.borderRadius = '999px';
      toast.style.fontSize = '14px';
      toast.style.fontFamily = 'Montserrat, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      toast.style.zIndex = '9999';
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s ease';
      toast.style.pointerEvents = 'none';
      document.body.appendChild(toast);
    }

    toast.textContent = text;
    toast.style.opacity = '1';

    clearTimeout(showToast._hideTimer);
    showToast._hideTimer = setTimeout(function () {
      toast.style.opacity = '0';
    }, 2200);
  }

  /* ---------- product cache helpers ---------- */

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

  /* ------------- init + globals ------------- */

  function init() {
    state.client = ShopifyBuy.buildClient({
      domain: CONFIG.myshopifyDomain,
      storefrontAccessToken: CONFIG.storefrontAccessToken
    });

    ShopifyBuy.UI.onReady(state.client).then(function (ui) {
      state.ui = ui;

      // main cart drawer
      state.cart = ui.createComponent('cart', {
        options: {
          cart: {
            startOpen: false,
            popup: false,
            text: { total: 'Subtotal', button: 'Checkout' }
          }
        }
      });

      // header cart toggle, if present in DOM
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

      window.DNShopify = window.DNShopify || {};
      window.DNShopify.__initialized = true;
      window.DNShopify.ui = ui;
      window.DNShopify.cart = state.cart;
      window.DNShopify.client = state.client;

      window.DNShopify.openCart = function () {
        try {
          if (state.cart && typeof state.cart.open === 'function') {
            state.cart.open();
          } else if (state.cart && typeof state.cart.toggleVisibility === 'function') {
            state.cart.toggleVisibility();
          }
        } catch (e) {
          console.warn('DNShopify: unable to open cart drawer', e);
        }
      };

      /* ------- Standard Buy Button products (optional) ------- */
      window.DNShopify.mountProduct = function (cfg) {
        if (!cfg || !cfg.id || !cfg.node) return;
        var nodeEl = typeof cfg.node === 'string' ? document.querySelector(cfg.node) : cfg.node;
        if (!nodeEl) return;

        var options = cfg.options || {};
        options.events = options.events || {};
        if (!options.events.afterAddVariant) {
          options.events.afterAddVariant = function () {
            if (window.DNShopify && window.DNShopify.openCart) window.DNShopify.openCart();
          };
        }

        ui.createComponent('product', {
          id: String(cfg.id),
          node: nodeEl,
          moneyFormat: '${{amount}}',
          options: options
        });
      };

      /* ---------- Variant Pills (custom UI) ---------- */

      window.DNShopify.mountVariantPills = function (cfg) {
        if (!cfg || !cfg.productId) return;

        var pillsNode = typeof cfg.pillsNode === 'string' ? document.querySelector(cfg.pillsNode) : cfg.pillsNode;
        var priceNode = typeof cfg.priceNode === 'string' ? document.querySelector(cfg.priceNode) : cfg.priceNode;
        var addBtn    = typeof cfg.addBtn === 'string'    ? document.querySelector(cfg.addBtn)    : cfg.addBtn;
        var qtyInput  = typeof cfg.qtyInput === 'string'  ? document.querySelector(cfg.qtyInput)  : cfg.qtyInput;

        if (!pillsNode || !priceNode || !addBtn) return;

        var optionNames = (cfg.optionNames && cfg.optionNames.length)
          ? cfg.optionNames.map(function (s) { return String(s).toLowerCase(); })
          : ['size', 'weight', 'amount', 'title'];

        var selectedVariant = null;
        var currentProduct  = null;

        function setBtnEnabled(on) {
          addBtn.disabled = !on;
          addBtn.classList.toggle('disabled', !on);
        }

        function setActive(btnEl) {
          var btns = pillsNode.querySelectorAll('.size-pill');
          for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
          if (btnEl) btnEl.classList.add('active');
        }

        function addToCart(selectedVariant, qty) {
          if (!selectedVariant) return;

          var lineItem = {
            variantId: String(selectedVariant.id),
            quantity: qty
          };

          try {
            var cart = state.cart;
            var client = (cart && cart.props && cart.props.client) || state.client;
            var checkoutId = cart && cart.model && cart.model.id;

            if (client && client.checkout && checkoutId) {
              var p = client.checkout.addLineItems(checkoutId, [lineItem]);

              if (p && typeof p.then === 'function') {
                p.then(function () {
                  showToast((currentProduct && currentProduct.title) || 'Item');
                  if (
                    cfg.openCartOnAdd !== false &&
                    window.DNShopify &&
                    typeof window.DNShopify.openCart === 'function'
                  ) {
                    window.DNShopify.openCart();
                  }
                }).catch(function (err) {
                  console.error('DNShopify: error adding via cart drawer, falling back to cart URL', err);
                  var numericId = gidToNumericId(selectedVariant.id);
                  if (numericId) {
                    window.location.href =
                      CONFIG.onlineStoreCartBase + '/' + numericId + ':' + qty;
                  }
                });
              } else {
                // No promise returned – just show toast + open cart
                showToast((currentProduct && currentProduct.title) || 'Item');
                if (
                  cfg.openCartOnAdd !== false &&
                  window.DNShopify &&
                  typeof window.DNShopify.openCart === 'function'
                ) {
                  window.DNShopify.openCart();
                }
              }
            } else {
              console.warn('DNShopify: cart drawer not ready, redirecting to Online Store cart');
              var numericId2 = gidToNumericId(selectedVariant.id);
              if (numericId2) {
                window.location.href =
                  CONFIG.onlineStoreCartBase + '/' + numericId2 + ':' + qty;
              }
            }
          } catch (e) {
            console.error('DNShopify: unexpected error adding to cart', e);
          }
        }

        function renderPillsFromVariants(product) {
          currentProduct = product || null;
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

            if (idx === 0) setTimeout(function () { btn.click(); }, 0);
          });

          addBtn.addEventListener('click', function () {
            if (!selectedVariant) return;

            var qty = 1;
            if (qtyInput) {
              var q = Number(qtyInput.value);
              if (!isNaN(q) && q > 0) qty = Math.floor(q);
            }

            addToCart(selectedVariant, qty);
          });
        }

        setBtnEnabled(false);
        priceNode.textContent = '$0.00';

        // fetch product and then render pills
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

  if (window.ShopifyBuy && window.ShopifyBuy.UI) init();
  else if (window.ShopifyBuy) loadSdk(init);
  else loadSdk(init);
})();
