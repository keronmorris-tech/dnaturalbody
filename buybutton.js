/* buybutton.js (D'Natural Body)
   Shopify Buy Button SDK + Cart Drawer + Header Toggle
   + custom variant pills UI.

   Behavior:
   - Creates ONE global cart drawer.
   - Renders Shopify's cart toggle into #shopify-cart-toggle.
   - Exposes window.DNShopify.mountVariantPills({
       productId,      // numeric product id, e.g. "14889665036653"
       pillsNode,      // selector or element for the size pills container
       priceNode,      // selector or element where the price shows
       addBtn,         // selector or element for the Add to Cart button
       qtyInput,       // selector or element for the quantity input
       optionNames,    // optional: ['size','weight','amount','title']
       openCartOnAdd   // optional: default true
     })

   Result:
   - Add to cart => adds item to the drawer cart AND opens the drawer.
   - Checkout button in the drawer => goes to Shopify checkout page (default behavior).
*/

(function () {
  // prevent double init
  if (window.DNShopify && window.DNShopify.__initialized) return;

  var CONFIG = {
    myshopifyDomain: 'dpscr1-vz.myshopify.com',
    storefrontAccessToken: 'b6634d4da21c44f64244a1ff19a52d78',
    onlineStoreCartBase: 'https://shop.dnaturalbody.com/cart',
    sdkUrl: 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js',
    toggleNodeId: 'shopify-cart-toggle'
  };

  var state = {
    client: null,
    ui: null,
    cart: null,
    productsCache: null,
    productsCachePromise: null
  };

  // ------------------- SDK LOADER -------------------

  function loadSdk(cb) {
    // If already loaded, just go
    if (window.ShopifyBuy && window.ShopifyBuy.UI) {
      cb();
      return;
    }

    // Reuse existing script if present
    var existing = document.querySelector(
      'script[src*="buy-button-storefront.min.js"]'
    );
    if (existing) {
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

  // ------------------- CART HELPERS -------------------

  function ensureCartReady() {
    // In this setup the cart is created synchronously in init(),
    // but this keeps us safe if mountVariantPills gets called ASAP.
    return new Promise(function (resolve) {
      if (state.cart) return resolve(state.cart);

      var attempts = 0;
      (function check() {
        if (state.cart || attempts > 60) {
          resolve(state.cart || null);
        } else {
          attempts++;
          setTimeout(check, 50);
        }
      })();
    });
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

  // ------------------- VARIANT PILLS -------------------

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

      // Figure out which option index matches "size"/etc.
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

      // Hook Add to Cart (once per mount)
      addBtn.addEventListener('click', function () {
        if (!selectedVariant) return;

        // Quantity
        var qty = 1;
        if (qtyInput) {
          var q = Number(qtyInput.value);
          if (!isNaN(q) && q > 0) qty = Math.floor(q);
        }

        ensureCartReady().then(function (cart) {
          if (!cart || !cart.props || !cart.props.client || !cart.model) {
            throw new Error('Cart drawer not ready');
          }

          var client = cart.props.client;
          var checkoutId = cart.model.id;

          var lineItem = {
            variantId: String(selectedVariant.id),
            quantity: qty
          };

          return client.checkout.addLineItems(checkoutId, [lineItem]).then(function () {
            if (cfg.openCartOnAdd !== false && typeof cart.open === 'function') {
              cart.open();
            }
          });
        }).catch(function (err) {
          console.error('Error adding item to Shopify cart; falling back to cart URL.', err);

          // Fallback: send them to the Online Store cart with just this item
          var numericId = gidToNumericId(selectedVariant.id);
          if (numericId) {
            var url = CONFIG.onlineStoreCartBase + '/' + numericId + ':' + qty;
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

      // 1. Create cart drawer (synchronously in this SDK)
      state.cart = ui.createComponent('cart', {
        options: {
          cart: {
            startOpen: false,
            popup: false, // checkout in same window/tab
            text: { total: 'Subtotal', button: 'Checkout' }
          }
        }
      });

      // 2. Create header toggle if node exists
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

      // 3. Expose globals
      window.DNShopify = window.DNShopify || {};
      window.DNShopify.__initialized = true;
      window.DNShopify.ui = ui;
      window.DNShopify.client = state.client;
      window.DNShopify.cart = state.cart;

      window.DNShopify.openCart = function () {
        ensureCartReady().then(function (cart) {
          if (cart && typeof cart.open === 'function') {
            cart.open();
          }
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
  } else {
    loadSdk(init);
  }
})();
