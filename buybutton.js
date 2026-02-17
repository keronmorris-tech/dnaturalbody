/* buybutton.js (D'Natural Body)
   Global Shopify Buy Button + Cart Drawer wiring

   - Loads Shopify Buy Button SDK once
   - Creates a single Cart Drawer component
   - Keeps header badge (#cartCount) synced
   - Clicking #cartButton opens drawer
   - Drawer "Checkout" redirects to Shopify cart page WITH items carried over
*/

(function () {
  if (window.DNShopify && window.DNShopify.__initialized) return;

  var CONFIG = {
    myshopifyDomain: 'dpscr1-vz.myshopify.com',
    storefrontAccessToken: 'b6634d4da21c44f64244a1ff19a52d78',
    onlineStoreCartBase: 'https://shop.dnaturalbody.com/cart',
    sdkUrl: 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js',

    cartButtonId: 'cartButton',
    cartCountId: 'cartCount',
    toggleNodeId: 'shopify-cart-toggle'
  };

  var state = {
    ui: null,
    cart: null,
    client: null,
    cartReady: false,
    pendingOpen: false
  };

  function loadSdk(cb) {
    var s = document.createElement('script');
    s.async = true;
    s.src = CONFIG.sdkUrl;
    (document.head || document.body).appendChild(s);
    s.onload = cb;
  }

  function gidToNumericId(gid) {
    if (!gid) return null;
    var parts = String(gid).split('/');
    return parts[parts.length - 1] || null;
  }

  function getLineItems() {
    try {
      return (state.cart && state.cart.model && state.cart.model.lineItems) ? state.cart.model.lineItems : [];
    } catch (e) {
      return [];
    }
  }

  function getItemCount() {
    var items = getLineItems();
    var count = 0;
    for (var i = 0; i < items.length; i++) {
      count += Number(items[i].quantity || 0);
    }
    return count;
  }

  function updateBadge() {
    var badge = document.getElementById(CONFIG.cartCountId);
    if (!badge) return;

    var count = getItemCount();
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  function ensureToggleNodeExists() {
    if (document.getElementById(CONFIG.toggleNodeId)) return;
    var div = document.createElement('div');
    div.id = CONFIG.toggleNodeId;
    div.style.display = 'none';
    document.body.appendChild(div);
  }

  function openCartDrawer() {
    // If cart isn't ready yet, queue an open
    if (!state.cartReady || !state.cart) {
      state.pendingOpen = true;
      return;
    }

    try {
      if (typeof state.cart.open === 'function') {
        state.cart.open();
        return;
      }
      if (typeof state.cart.toggleVisibility === 'function') {
        state.cart.toggleVisibility();
        return;
      }

      // fallback: click the hidden toggle
      var t = document.querySelector('#' + CSS.escape(CONFIG.toggleNodeId) + ' .shopify-buy__cart-toggle');
      if (t) t.click();
    } catch (e) {}
  }

  function buildCartPermalinkFromDrawer() {
    var items = getLineItems();
    if (!items.length) return CONFIG.onlineStoreCartBase;

    var segments = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var variantGid = item && item.variant && item.variant.id;
      var variantId = gidToNumericId(variantGid);
      var qty = Number(item && item.quantity || 0);
      if (variantId && qty > 0) segments.push(variantId + ':' + qty);
    }

    if (!segments.length) return CONFIG.onlineStoreCartBase;
    return CONFIG.onlineStoreCartBase + '/' + segments.join(',');
  }

  function interceptDrawerCheckoutToCartPage() {
    document.addEventListener('click', function (e) {
      var target = e.target;
      if (!target || !target.closest) return;

      var btn = target.closest('.shopify-buy__btn--cart-checkout, .shopify-buy__cart__checkout');
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      window.location.href = buildCartPermalinkFromDrawer();
    }, true);
  }

  function wireCartButton() {
    var btn = document.getElementById(CONFIG.cartButtonId);
    if (!btn) return;

    if (btn.dataset.dnCartWired === '1') return;
    btn.dataset.dnCartWired = '1';

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      updateBadge();
      openCartDrawer();
    });
  }

  function attachAllCartListeners() {
    // 1) Listen on cart model (works sometimes)
    try {
      if (state.cart && state.cart.model && state.cart.model.on) {
        state.cart.model.on('change', updateBadge);
        state.cart.model.on('update', updateBadge);
      }
    } catch (e) {}

    // 2) Listen on UI events (more reliable)
    try {
      if (state.ui && typeof state.ui.on === 'function') {
        state.ui.on('cart:update', function () { updateBadge(); });
        state.ui.on('cart:open', function () { updateBadge(); });
      }
    } catch (e) {}

    // initial + delayed (async load)
    updateBadge();
    setTimeout(updateBadge, 600);
    setTimeout(updateBadge, 1500);
  }

  function init() {
    ensureToggleNodeExists();
    wireCartButton(); // wire early so button never "does nothing"

    state.client = ShopifyBuy.buildClient({
      domain: CONFIG.myshopifyDomain,
      storefrontAccessToken: CONFIG.storefrontAccessToken
    });

    ShopifyBuy.UI.onReady(state.client).then(function (ui) {
      state.ui = ui;

      state.cart = ui.createComponent('cart', {
        options: {
          cart: {
            startOpen: false,
            popup: false,
            text: {
              total: 'Subtotal',
              button: 'Checkout'
            }
          },
          toggle: {
            node: document.getElementById(CONFIG.toggleNodeId),
            styles: {
              toggle: {
                'background-color': '#1d201c',
                ':hover': { 'background-color': '#313630' },
                ':focus': { 'background-color': '#313630' }
              }
            }
          }
        }
      });

      state.cartReady = true;

      attachAllCartListeners();
      interceptDrawerCheckoutToCartPage();

      // If user clicked cart before it was ready, open now
      if (state.pendingOpen) {
        state.pendingOpen = false;
        openCartDrawer();
      }

      // Public API
      window.DNShopify = window.DNShopify || {};
      window.DNShopify.__initialized = true;
      window.DNShopify.ui = ui;
      window.DNShopify.cart = state.cart;
      window.DNShopify.client = state.client;

      window.DNShopify.openCart = function () {
        updateBadge();
        openCartDrawer();
      };

      window.DNShopify.updateBadge = updateBadge;

      window.DNShopify.mountProduct = function (cfg) {
        if (!cfg || !cfg.id || !cfg.node) return;

        var nodeEl = (typeof cfg.node === 'string') ? document.querySelector(cfg.node) : cfg.node;
        if (!nodeEl) return;

        var options = cfg.options || {};
        options.events = options.events || {};

        if (!options.events.afterAddVariant) {
          options.events.afterAddVariant = function () {
            updateBadge();
            openCartDrawer();
          };
        }

        ui.createComponent('product', {
          id: String(cfg.id),
          node: nodeEl,
          moneyFormat: '${{amount}}',
          options: options
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
