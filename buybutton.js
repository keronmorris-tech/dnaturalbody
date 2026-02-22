/* buybutton.js (D'Natural Body)
   Shopify Buy Button SDK + Cart Drawer + Header Toggle
   + OPTIONAL custom variant pills UI

   Exposes:
     - window.DNShopify.mountVariantPills({
         productId,      // numeric product id, e.g. "14889665036653"
         pillsNode,      // selector or element for the size pills container
         priceNode,      // selector or element where the price shows
         addBtn,         // selector or element for the Add to Cart button
         qtyInput,       // selector or element for the quantity input
         optionNames,    // optional: ['size','weight','amount','title']
         openCartOnAdd   // optional: default true
       })
*/

(function () {
  // prevent double init
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
    cartPromise: null,
    productsCache: null,
    productsCachePromise: null
  };

  // ------------------- SDK LOADER -------------------

  function loadSdk(cb) {
    var s = document.createElement('script');
    s.async = true;
    s.src = CONFIG.sdkUrl;
    (document.head || document.body).appendChild(s);
    s.onload = cb;
  }

  // Turn any gid / base64 gid / id string into a plain numeric variant/product id
  function gidToNumericId(gid) {
    if (!gid) return null;
    try {
      var str = String(gid);

      // Already looks like gid://...
      if (str.indexOf('gid://') === 0) {
        var parts = str.split('/');
        return parts[parts.length - 1] || null;
      }

      // Try base64 decode
      var decoded = atob(str);
      if (decoded && decoded.indexOf('gid://') === 0) {
        var p = decoded.split('/');
        return p[p.length - 1] || null;
      }
    } catch (e) {
      // ignore decode errors
    }

    // Fallback: last digits
    var m = String(gid).match(/(\d+)$/);
    return m ? m[1] : null;
  }

  // ------------------- CART HELPERS -------------------

  function ensureCartReady() {
    // If we already have a ready cart, just resolve with it
    if (state.cart) return Promise.resolve(state.cart);
    // If cart is in-flight, reuse the same promise
    if (state.cartPromise) return state.cartPromise;

    // Otherwise, if UI isn't ready yet, wait for init to finish
    return Promise.reject(new Error('Cart not initialized yet'));
  }

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

  // ------------------- PRODUCT FETCHING (for pills) -------------------

  function fetchAllProductsOnce() {
    if (state.productsCache) return Promise.resolve(state.productsCache);
    if (state.productsCachePromise) return state.productsCachePromise;

    state.productsCachePromise = state.client.product.fetchAll(250).then(function (products) {
      state.productsCache = products || [];
      return state.productsCache;
    }).catch(function (err) {
      console.error('Error fetching all Shopify products for pills:', err);
      state.productsCache = [];
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

  // ------------------- VARIANT PILLS MOUNT -------------------

  function mountVariantPills(cfg) {
    if (!cfg || !cfg.productId) return;

    var pillsNode = typeof cfg.pillsNode === 'string'
      ? document.querySelector(cfg.pillsNode)
      : cfg.pillsNode;
    var priceNode = typeof cfg.priceNode === 'string'
      ? document.querySelector(cfg.priceNode)
      : cfg.priceNode;
    var addBtn = typeof cfg.addBtn === 'string'
      ? document.querySelector(cfg.addBtn)
      : cfg.addBtn;
    var qtyInput = typeof cfg.qtyInput === 'string'
      ? document.querySelector(cfg.qtyInput)
      : cfg.qtyInput;

    if (!pillsNode || !priceNode || !addBtn) {
      console.warn('DNShopify.mountVariantPills: missing DOM nodes');
      return;
    }

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

    function renderPillsFromProduct(product) {
      pillsNode.innerHTML = '';

      // Figure out which option index matches "size" / etc.
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

        // auto-select first
        if (idx === 0) {
          setTimeout(function () { btn.click(); }, 0);
        }
      });

      // Hook Add to Cart (only once)
      addBtn.addEventListener('click', function () {
        if (!selectedVariant) return;

        // Quantity
        var qty = 1;
        if (qtyInput) {
          var q = Number(qtyInput.value);
          if (!isNaN(q) && q > 0) qty = Math.floor(q);
        }

        // Use the cart component's checkout to add the item
        ensureCartReady().then(function (cart) {
          if (!cart || !cart.props || !cart.props.client || !cart.model) {
            throw new Error('Cart drawer not ready');
          }

          var lineItem = {
            variantId: String(selectedVariant.id),
            quantity: qty
          };

          return cart.props.client.checkout.addLineItems(cart.model.id, [lineItem])
            .then(function () {
              if (cfg.openCartOnAdd !== false && typeof cart.open === 'function') {
                cart.open();
              }
            });
        }).catch(function (err) {
          console.error('Error adding item to Shopify cart; falling back to direct checkout.', err);

          // Last-resort fallback: send them straight to the online store cart
          var numericId = gidToNumericId(selectedVariant.id);
          if (numericId) {
            var url = '/cart/' + numericId + ':' + qty;
            window.location.href = url;
          }
        });
      });
    }

    // Initial state while product loads
    setBtnEnabled(false);
    priceNode.textContent = '$0.00';

    // Fetch product by numeric id
    findProductByNumericId(cfg.productId).then(function (product) {
      if (!product) {
        // If not found yet, make sure the cache is hydrated and try again
        return fetchAllProductsOnce().then(function () {
          return findProductByNumericId(cfg.productId);
        });
      }
      return product;
    }).then(function (product) {
      if (!product) {
        console.error('DNShopify.mountVariantPills: could not find product with id', cfg.productId);
        setBtnEnabled(false);
        return;
      }
      renderPillsFromProduct(product);
    }).catch(function (err) {
      console.error('Error setting up variant pills:', err);
      setBtnEnabled(false);
    });
  }

  // ------------------- INIT -------------------

  function init() {
    state.client = ShopifyBuy.buildClient({
      domain: CONFIG.myshopifyDomain,
      storefrontAccessToken: CONFIG.storefrontAccessToken
    });

    ShopifyBuy.UI.onReady(state.client).then(function (ui) {
      state.ui = ui;

      // 1) Create the cart drawer (one per page)
      state.cartPromise = ui.createComponent('cart', {
        options: {
          cart: {
            startOpen: false,
            popup: true, // default: Shopify opens checkout in a popup window
            text: { total: 'Subtotal', button: 'Checkout' }
          }
        }
      }).then(function (cart) {
        state.cart = cart;
        return cart;
      }).catch(function (err) {
        console.error('Error creating Shopify cart component:', err);
        state.cart = null;
        return null;
      });

      // 2) Create header toggle, if the node exists
      var toggleNode = document.getElementById(CONFIG.toggleNodeId);
      if (toggleNode) {
        ui.createComponent('toggle', {
          node: toggleNode,
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

      // 3) Expose global helpers
      window.DNShopify = window.DNShopify || {};
      window.DNShopify.__initialized = true;
      window.DNShopify.ui = ui;
      window.DNShopify.client = state.client;

      window.DNShopify.openCart = function () {
        ensureCartReady().then(function (cart) {
          if (cart && typeof cart.open === 'function') cart.open();
        }).catch(function () {});
      };

      window.DNShopify.mountVariantPills = mountVariantPills;
    });
  }

  // ------------------- BOOTSTRAP -------------------

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
