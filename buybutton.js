(function () {
  // Shopify Buy Button SDK - Global cart drawer + badge + icon opens drawer
  var SHOPIFY_DOMAIN = "dpscr1-vz.myshopify.com";
  var STOREFRONT_TOKEN = "b6634d4da21c44f64244a1ff19a52d78";

  // Drawer button should go to Shopify cart page
  var SHOP_CART_URL = "https://shop.dnaturalbody.com/cart";

  var scriptURL = "https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js";

  function loadScript(cb) {
    var s = document.createElement("script");
    s.async = true;
    s.src = scriptURL;
    s.onload = cb;
    (document.head || document.body).appendChild(s);
  }

  function safeOn(model, evt, fn) {
    try {
      if (model && typeof model.on === "function") model.on(evt, fn);
    } catch (e) {}
  }

  function init() {
    var client = ShopifyBuy.buildClient({
      domain: SHOPIFY_DOMAIN,
      storefrontAccessToken: STOREFRONT_TOKEN
    });

    ShopifyBuy.UI.onReady(client).then(function (ui) {
      // -------------------------
      // CART DRAWER (single global)
      // -------------------------
      var cartComponent = ui.createComponent("cart", {
        options: {
          cart: {
            startOpen: false,
            text: { total: "Subtotal", button: "View Cart" },
            styles: {
              button: {
                "background-color": "#1d201c",
                ":hover": { "background-color": "#313630" },
                ":focus": { "background-color": "#313630" }
              }
            }
          },
          toggle: {
            node: document.getElementById("shopify-cart-toggle") || undefined,
            styles: {
              toggle: {
                "background-color": "#1d201c",
                ":hover": { "background-color": "#313630" },
                ":focus": { "background-color": "#313630" }
              }
            }
          },
          lineItem: { contents: { image: true } }
        }
      });

      // -------------------------
      // Hook YOUR 👜 icon to open the drawer
      // -------------------------
      var cartBtn = document.getElementById("cartButton");
      if (cartBtn) {
        cartBtn.addEventListener("click", function (e) {
          if (e && typeof e.preventDefault === "function") e.preventDefault();

          if (cartComponent && typeof cartComponent.toggleVisibility === "function") {
            cartComponent.toggleVisibility();
            return;
          }

          var toggle = document.querySelector(".shopify-buy__cart-toggle");
          if (toggle) toggle.click();
        });
      }

      // -------------------------
      // Force drawer "checkout" button to go to Shopify CART page (not checkout)
      // -------------------------
      document.addEventListener("click", function (e) {
        var btn =
          e.target.closest(".shopify-buy__btn--checkout") ||
          e.target.closest(".shopify-buy__cart__checkout") ||
          e.target.closest(".shopify-buy__btn.shopify-buy__btn--checkout") ||
          e.target.closest(".shopify-buy__btn--cart-checkout");

        if (btn) {
          e.preventDefault();
          window.location.href = SHOP_CART_URL;
        }
      });

      // -------------------------
      // Cart count badge update (👜 2)
      // -------------------------
      function updateCount() {
        var badge = document.getElementById("cartCount");
        if (!badge) return;

        var model = cartComponent && cartComponent.model;
        var items = model && model.lineItems;

        if (Array.isArray(items)) {
          var totalQty = 0;
          for (var i = 0; i < items.length; i++) totalQty += (items[i].quantity || 0);
          badge.textContent = String(totalQty);
          badge.style.display = totalQty > 0 ? "inline-block" : "none";
          return;
        }

        // fallback: use Shopify's toggle count if it exists
        var countEl = document.querySelector(".shopify-buy__cart-toggle__count");
        var n = countEl ? parseInt(countEl.textContent || "0", 10) : 0;
        if (!Number.isFinite(n) || n <= 0) {
          badge.style.display = "none";
          badge.textContent = "0";
        } else {
          badge.style.display = "inline-block";
          badge.textContent = String(n);
        }
      }

      safeOn(cartComponent && cartComponent.model, "change", updateCount);
      safeOn(cartComponent && cartComponent.model, "update", updateCount);
      safeOn(cartComponent && cartComponent.model, "change:lineItems", updateCount);

      updateCount();
      setInterval(updateCount, 800);

      // -------------------------
      // Render ALL product buttons found on the page
      // <div class="buybutton" data-product-id="..."></div>
      // -------------------------
      document.querySelectorAll(".buybutton[data-product-id]").forEach(function (mount) {
        var pid = mount.getAttribute("data-product-id");
        if (!pid) return;

        ui.createComponent("product", {
          id: pid,
          node: mount,
          options: {
            product: {
              contents: { img: false, title: false, price: false, options: true },
              text: { button: "Add to Cart" },
              styles: {
                button: {
                  "background-color": "#1d201c",
                  ":hover": { "background-color": "#313630" },
                  ":focus": { "background-color": "#313630" },
                  "padding": "14px 18px",
                  "border-radius": "10px",
                  "font-weight": "700"
                }
              }
            },
            cart: { startOpen: true }
          }
        });
      });
    });
  }

  if (window.ShopifyBuy && window.ShopifyBuy.UI) init();
  else loadScript(init);
})();