/* buybutton.js (D'Natural Body)
   Global Shopify Buy Button + Cart Drawer wiring

   What this does:
   - Loads Shopify Buy Button SDK once
   - Creates a single Cart Drawer component
   - Keeps your header badge (#cartCount) synced to cart quantity
   - Clicking your cart icon button (#cartButton) opens the cart drawer
   - The drawer's green "Checkout" button sends customers to
     https://shop.dnaturalbody.com/cart (WITH the items carried over)

   Requirements in your HTML header:
   - Cart button:  <button id="cartButton"> ... <span id="cartCount"></span></button>
   - Hidden toggle node somewhere in body: <div id="shopify-cart-toggle" style="display:none"></div>

   To mount a product button on a page, call:
     window.DNShopify.mountProduct({
       id: '14889665036653',
       node: '#product-component-1771275419576',
       options: { ...optional Shopify Buy Button options... }
     });
*/

(function () {
  // Prevent double-init if included on multiple pages/components
  if (window.DNShopify && window.DNShopify.__initialized) return;

  var CONFIG = {
    myshopifyDomain: 'dpscr1-vz.myshopify.com',
    storefrontAccessToken: 'b6634d4da21c44f64244a1ff19a52d78',
    onlineStoreCartBase: 'https://shop.dnaturalbody.com/cart',
    sdkUrl: 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js',

    // Your site IDs
    cartButtonId: 'cartButton',
    cartCountId: 'cartCount',
    toggleNodeId: 'shopify-cart-toggle'
  };

  var state = {
    ui: null,
    cart: null,
    client: null
  };

  function loadSdk(cb) {
    var s = document.createElement('script');
    s.async = true;
    s.src = CONFIG.sdkUrl;
    (document.head || document.body).appendChild(s);
    s.onload = cb;
  }

  function gidToNumericId(gid) {
    // gid example: gid://shopify/ProductVariant/1234567890
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

  function openCartDrawer() {
    try {
      if (state.cart && typeof state.cart.open === 'function') {
        state.cart.open();
        return;
      }
      if (state.cart && typeof state.cart.toggleVisibility === 'function') {
        state.cart.toggleVisibility();
        return;
      }

      // fallback: click the hidden toggle
      var t = document.querySelector('#' + CSS.escape(CONFIG.toggleNodeId) + ' .shopify-buy__cart-toggle');
      if (t) t.click();
    } catch (e) {
      // no-op
    }
  }

  function buildCartPermalinkFromDrawer() {
    // Build: https://shop.dnaturalbody.com/cart/variantId:qty,variantId:qty
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
    // Shopify Buy Button may render checkout button with either of these:
    // - .shopify-buy__btn--cart-checkout
    // - .shopify-buy__cart__checkout
    document.addEventListener('click', function (e) {
      var target = e.target;
      if (!target || !target.closest) return;

      var btn = target.closest('.shopify-buy__btn--cart-checkout, .shopify-buy__cart__checkout');
      if (!btn) return;

      // Stop Buy Button from routing to Storefront checkout
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      window.location.href = buildCartPermalinkFromDrawer();
    }, true);
  }

  function wireCartButton() {
    var btn = document.getElementById(CONFIG.cartButtonId);
    if (!btn) return;

    // Avoid double binding
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

      // initial + delayed (cart loads async)
      updateBadge();
      setTimeout(updateBadge, 600);
      setTimeout(updateBadge, 1500);
    } catch (e) {
      // no-op
    }
  }

  function ensureToggleNodeExists() {
    if (document.getElementById(CONFIG.toggleNodeId)) return;
    var div = document.createElement('div');
    div.id = CONFIG.toggleNodeId;
    div.style.display = 'none';
    document.body.appendChild(div);
  }

  function init() {
    ensureToggleNodeExists();

    state.client = ShopifyBuy.buildClient({
      domain: CONFIG.myshopifyDomain,
      storefrontAccessToken: CONFIG.storefrontAccessToken
    });

    ShopifyBuy.UI.onReady(state.client).then(function (ui) {
      state.ui = ui;

      // Create ONE cart drawer component for the whole page
      state.cart = ui.createComponent('cart', {
        options: {
          cart: {
            startOpen: false,
            popup: false,
            text: {
              total: 'Subtotal',
              button: 'Checkout' // label stays "Checkout" but we redirect to /cart
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

      wireCartButton();
      attachCartModelListeners();
      interceptDrawerCheckoutToCartPage();

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
        // cfg: { id: 'PRODUCT_ID', node: '#selector' OR element, options: {} }
        if (!cfg || !cfg.id || !cfg.node) return;

        var nodeEl = (typeof cfg.node === 'string') ? document.querySelector(cfg.node) : cfg.node;
        if (!nodeEl) return;

        var options = cfg.options || {};

        // Nice default: open the drawer after add
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

  // Boot
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
