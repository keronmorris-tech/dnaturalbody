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

      // Create one cart drawer + toggle
      state.cart = ui.createComponent('cart', {
        options: {
          cart: {
            startOpen: false,
            popup: false,
            text: { total: 'Subtotal', button: 'Checkout' }
          },
          toggle: {
            node: document.getElementById(CONFIG.toggleNodeId),
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

      // ---- Custom Size Pills UI (no dropdown) ----
      window.DNShopify.mountSizePills = function (cfg) {
        cfg = cfg || {};
        var productId = String(cfg.productId || cfg.id || '');
        if (!productId) return;

        function byId(id){ return document.getElementById(id); }

        var sizeWrap = byId(cfg.sizeWrapId || 'size-options');
        var priceEl  = byId(cfg.priceId || 'variant-price');
        var noteEl   = byId(cfg.noteId || 'variant-note');
        var addBtn   = byId(cfg.addBtnId || 'add-to-cart');

        var qtyMinus = byId(cfg.qtyMinusId || 'qty-minus');
        var qtyPlus  = byId(cfg.qtyPlusId || 'qty-plus');
        var qtyInput = byId(cfg.qtyInputId || 'qty-input');

        if (!sizeWrap || !priceEl || !addBtn) return;

        var cartComp = state.cart;
        var selectedVariant = null;

        function formatMoney(amount) {
          var n = Number(amount);
          if (!isFinite(n)) n = 0;
          return '$' + n.toFixed(2);
        }

        function getQty() {
          var q = qtyInput ? Number(qtyInput.value) : 1;
          if (!isFinite(q) || q < 1) q = 1;
          return Math.min(q, 99);
        }

        function setQty(q) {
          if (!qtyInput) return;
          q = Number(q);
          if (!isFinite(q) || q < 1) q = 1;
          if (q > 99) q = 99;
          qtyInput.value = q;
        }

        function setActivePill(value) {
          var pills = sizeWrap.querySelectorAll('.size-pill');
          for (var i=0;i<pills.length;i++){
            pills[i].classList.toggle('active', pills[i].getAttribute('data-value') === value);
          }
        }

        function sortSizes(values) {
          // Try to sort like 8oz, 4oz, 2oz (desc)
          return values.slice().sort(function(a,b){
            var na = parseFloat(String(a).replace(/[^0-9.]/g,''));
            var nb = parseFloat(String(b).replace(/[^0-9.]/g,''));
            if (isFinite(na) && isFinite(nb)) return nb - na;
            return String(a).localeCompare(String(b));
          });
        }

        function bindQty() {
          if (qtyMinus) qtyMinus.addEventListener('click', function(){
            setQty(getQty() - 1);
          });
          if (qtyPlus) qtyPlus.addEventListener('click', function(){
            setQty(getQty() + 1);
          });
          if (qtyInput) qtyInput.addEventListener('change', function(){
            setQty(getQty());
          });
        }

        function bindAdd() {
          addBtn.addEventListener('click', function () {
            if (!selectedVariant || !cartComp || typeof cartComp.addLineItems !== 'function') return;

            cartComp.addLineItems([{ variantId: selectedVariant.id, quantity: getQty() }]).then(function(){
              if (window.DNShopify && window.DNShopify.openCart) window.DNShopify.openCart();
            }).catch(function(){});
          });
        }

        bindQty();
        bindAdd();

        // Pull product + variants and render pills
        state.client.product.fetch(productId).then(function (product) {
          if (!product) return;

          // Locate "Size" option
          var sizeOptIndex = -1;
          for (var i=0;i<(product.options||[]).length;i++){
            var n = (product.options[i].name || '').toLowerCase();
            if (n === 'size') { sizeOptIndex = i; break; }
          }

          // If no size option, just default to first variant
          if (sizeOptIndex === -1) {
            selectedVariant = (product.variants && product.variants[0]) ? product.variants[0] : null;
            if (selectedVariant) {
              priceEl.textContent = formatMoney(selectedVariant.price);
              if (noteEl) noteEl.textContent = 'Selected: ' + (selectedVariant.title || 'Default');
              addBtn.disabled = false;
            }
            return;
          }

          var sizeValues = (product.options[sizeOptIndex].values || []);
          sizeValues = sortSizes(sizeValues);

          sizeWrap.innerHTML = '';
          for (var s=0;s<sizeValues.length;s++){
            (function(val){
              var btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'size-pill';
              btn.textContent = val;
              btn.setAttribute('data-value', val);

              btn.addEventListener('click', function(){
                // Find matching variant by size option value
                var variants = product.variants || [];
                for (var v=0; v<variants.length; v++){
                  var vr = variants[v];
                  if (vr && vr.options && vr.options[sizeOptIndex] === val) {
                    selectedVariant = vr;
                    break;
                  }
                }
                if (!selectedVariant) return;

                setActivePill(val);
                priceEl.textContent = formatMoney(selectedVariant.price);
                if (noteEl) noteEl.textContent = 'Selected: ' + val;
                addBtn.disabled = false;
              });

              sizeWrap.appendChild(btn);
            })(sizeValues[s]);
          }

          // Auto-select first size
          var first = sizeValues[0];
          var firstBtn = sizeWrap.querySelector('.size-pill');
          if (firstBtn) firstBtn.click();
        }).catch(function(){});
      };
      };
    });
  }

  window.DNShopify = window.DNShopify || {};
  window.DNShopify.__initialized = false;

  if (window.ShopifyBuy && window.ShopifyBuy.UI) init();
  else loadSdk(init);
})();
