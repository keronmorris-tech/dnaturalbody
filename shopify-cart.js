/* shopify-cart.js (D'Natural Body)
   Use this on pages that only need the CART drawer + badge.
   (It is safe to use buybutton.js instead everywhere.)

   Requirements:
   - <button id="cartButton"> ... <span id="cartCount"></span></button>
   - <div id="shopify-cart-toggle" style="display:none"></div>
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
      return (state.cart && state.cart.model && state.cart.model.lineItems) ? state.cart.model.lineItems : [];
    } catch (e) {
      return [];
    }
  }

  function getItemCount() {
    var items = getLineItems();
    var count = 0;
    for (var i = 0; i < items.length; i++) count += Number(items[i].quantity || 0);
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
      if (state.cart && typeof state.cart.open === 'function') return state.cart.open();
      if (state.cart && typeof state.cart.toggleVisibility === 'function') return state.cart.toggleVisibility();
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
      var variantId = gidToNumericId(item && item.variant && item.variant.id);
      var qty = Number(item && item.quantity || 0);
      if (variantId && qty > 0) segments.push(variantId + ':' + qty);
    }

    return segments.length ? (CONFIG.onlineStoreCartBase + '/' + segments.join(',')) : CONFIG.onlineStoreCartBase;
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
      setTimeout(updateBadge, 600);
      setTimeout(updateBadge, 1500);
    } catch (e) {}
  }

  function init() {
    ensureToggleNodeExists();

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
            text: { total: 'Subtotal', button: 'Checkout' }
          },
          toggle: {
            node: document.getElementById(CONFIG.toggleNodeId)
          }
        }
      });

      wireCartButton();
      attachCartModelListeners();
      interceptDrawerCheckoutToCartPage();

      window.DNShopify = window.DNShopify || {};
      window.DNShopify.__initialized = true;
      window.DNShopify.ui = ui;
      window.DNShopify.cart = state.cart;
      window.DNShopify.client = state.client;
      window.DNShopify.openCart = function () { updateBadge(); openCartDrawer(); };
      window.DNShopify.updateBadge = updateBadge;
    });
  }

  window.DNShopify = window.DNShopify || {};
  window.DNShopify.__initialized = false;

  if (window.ShopifyBuy && window.ShopifyBuy.UI) init();
  else if (window.ShopifyBuy) loadSdk(init);
  else loadSdk(init);
})();
