/* buybutton.js (D'Natural Body)
   Global Shopify Buy Button + Cart Drawer wiring

   - Loads Shopify Buy Button SDK once
   - Creates ONE Shopify cart drawer
   - Renders Shopify cart toggle inside #shopify-cart-toggle (header)
   - Drawer "Checkout" redirects to Shopify cart page WITH items carried over
   - Exposes window.DNShopify.mountProduct({id, node, options})
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

  var state = { ui: null, cart: null, client: null };

  function loadSdk(cb) {
    var s = document.createElement('script');
    s.async = true;
    s.src = CONFIG.sdkUrl;
    (document.head || document.body).appendChild(s);
    s.onload = cb;
  }

  function ensureToggleNodeExists() {
    if (document.getElementById(CONFIG.toggleNodeId)) return;
    var div = document.createElement('div');
    div.id = CONFIG.toggleNodeId;
    document.body.appendChild(div);
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

  function buildCartPermalinkFromDrawer() {
    // https://shop.dnaturalbody.com/cart/variantId:qty,variantId:qty
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

  function init() {
    ensureToggleNodeExists();

    state.client = ShopifyBuy.buildClient({
      domain: CONFIG.myshopifyDomain,
      storefrontAccessToken: CONFIG.storefrontAccessToken
    });

    ShopifyBuy.UI.onReady(state.client).then(function (ui) {
      state.ui = ui;

      // Create one cart drawer
      state.cart = ui.createComponent('cart', {
        options: {
          cart: {
            startOpen: false,
            popup: false,
            text: { total: 'Subtotal', button: 'Checkout' }
          }
        }
      });

      // Create header cart icon + count (toggle)
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

interceptDrawerCheckoutToCartPage();

      window.DNShopify = window.DNShopify || {};
      window.DNShopify.__initialized = true;
      window.DNShopify.ui = ui;
      window.DNShopify.cart = state.cart;
      window.DNShopify.client = state.client;

      window.DNShopify.openCart = function () {
        try {
          if (state.cart && typeof state.cart.open === 'function') state.cart.open();
          else {
            var t = document.querySelector('#' + CONFIG.toggleNodeId + ' .shopify-buy__cart-toggle');
            if (t) t.click();
          }
        } catch (e) {}
      };

      window.DNShopify.mountProduct = function (cfg) {
        if (!cfg || !cfg.id || !cfg.node) return;
        var nodeEl = (typeof cfg.node === 'string') ? document.querySelector(cfg.node) : cfg.node;
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
    });
  }

  window.DNShopify = window.DNShopify || {};
  window.DNShopify.__initialized = false;

  if (window.ShopifyBuy && window.ShopifyBuy.UI) init();
  else loadSdk(init);
})();
