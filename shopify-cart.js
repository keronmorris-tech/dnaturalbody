/* shopify-cart.js (D'Natural Body)
   Use this on pages that only need the CART drawer + badge.

   Requirements:
   - <button id="cartButton"> ... <span id="cartCount"></span></button>
   - <div id="shopify-cart-toggle" style="display:none"></div>
*/

(function () {
  // Prevent double-init on the same page
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

  var state = { ui: null, cart: null, client: null };

  function loadSdk(cb) {
    // If SDK is already loaded, just run the callback
    if (window.ShopifyBuy && window.ShopifyBuy.UI) {
      cb();
      return;
    }

    var s = document.createElement('script');
    s.async = true;
    s.src = CONFIG.sdkUrl;
    s.onload = cb;
    (document.head || document.body).appendChild(s);
  }

  function ensureToggleNodeExists() {
    if (document.getElementById(CONFIG.toggleNodeId)) return;
    var div = document.createElement('div');
    div.id = CONFIG.toggleNodeId;
    div.style.display = 'none';
    document.body.appendChild(div);
  }

  function gidToNumericId(gid) {
    if (!gid) return null;
    var parts = String(gid).split('/');
    return parts[parts.length - 1] || null;
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

  function openCartDrawer() {
    try {
      if (state.cart && typeof state.cart.open === 'function') {
        return state.cart.open();
      }
      if (state.cart && typeof state.cart.toggleVisibility === 'function') {
        return state.cart.toggleVisibility();
      }

      // Fallback: click the internal cart toggle button if we can find it
      var selector = '#' + CSS.escape(CONFIG.toggleNodeId) + ' .shopify-buy__cart-toggle';
      var t = document.querySelector(selector);
      if (t) t.click();
    } catch (e) {
      // swallow
    }
  }

  function buildCartPermalinkFromDrawer() {
    var items = getLineItems();
    if (!items.length) return CONFIG.onlineStoreCartBase;

    var segments = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var variantId = gidToNumericId(item && item.variant && item.variant.id);
      var qty = Number(item && item.quantity || 0);
      if (variantId && qty > 0) {
        segments.push(variantId + ':' + qty);
      }
    }

    return segments.length
      ? (CONFIG.onlineStoreCartBase + '/' + segments.join(','))
      : CONFIG.onlineStoreCartBase;
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

  function attachCartModelListeners() {
    try {
      if (!state.cart || !state.cart.model || !state.cart.model.on) return;
      state.cart.model.on('change', updateBadge);
      state.cart.model.on('update', updateBadge);
      updateBadge();
      // a couple of delayed updates in case things arrive async
      setTimeout(updateBadge, 600);
      setTimeout(updateBadge, 1500);
    } catch (e) {
      // swallow
    }
  }

  function afterCartReady(ui, cartInstance) {
    state.ui = ui;
    state.cart = cartInstance;

    wireCartButton();
    attachCartModelListeners();
    interceptDrawerCheckoutToCartPage();

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
  }

  function init() {
    ensureToggleNodeExists();

    state.client = ShopifyBuy.buildClient({
      domain: CONFIG.myshopifyDomain,
      storefrontAccessToken: CONFIG.storefrontAccessToken
    });

    ShopifyBuy.UI.onReady(state.client).then(function (ui) {
      var node = document.getElementById(CONFIG.toggleNodeId);

      // IMPORTANT: use top-level `node` for the cart component
      var cartComponent = ui.createComponent('cart', {
        node: node,
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
            sticky: false
          }
        }
      });

      // Support both promise and non-promise returns (depending on SDK version)
      if (cartComponent && typeof cartComponent.then === 'function') {
        cartComponent.then(function (cart) {
          afterCartReady(ui, cart);
        });
      } else {
        afterCartReady(ui, cartComponent);
      }
    });
  }

  // Global flag default
  window.DNShopify = window.DNShopify || {};
  window.DNShopify.__initialized = false;

  // Bootstrapping logic
  if (window.ShopifyBuy && window.ShopifyBuy.UI) {
    init();
  } else {
    loadSdk(init);
  }
})();
