<!-- buybutton.js -->
<script>
(function () {
  var SHOPIFY_DOMAIN = "dpscr1-vz.myshopify.com";
  var STOREFRONT_TOKEN = "b6634d4da21c44f64244a1ff19a52d78";

  // Where you want people to land when they click the drawer button
  var SHOP_CART_URL = "https://shop.dnaturalbody.com/cart";

  var scriptURL = "https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js";

  function loadScript(cb) {
    var s = document.createElement("script");
    s.async = true;
    s.src = scriptURL;
    s.onload = cb;
    (document.head || document.body).appendChild(s);
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
            text: {
              total: "Subtotal",
              // We will intercept this click and send to Shopify cart page
              button: "View Cart"
            },
            styles: {
              button: {
                "background-color": "#1d201c",
                ":hover": { "background-color": "#313630" },
                ":focus": { "background-color": "#313630" }
              }
            }
          },
          toggle: {
            // We’re NOT using Shopify’s floating toggle UI
            node: document.getElementById("shopify-cart-toggle") || undefined,
            styles: {
              toggle: {
                "background-color": "#1d201c",
                ":hover": { "background-color": "#313630" },
                ":focus": { "background-color": "#313630" }
              }
            }
          },
          lineItem: {
            contents: { image: true }
          }
        }
      });

      // -------------------------
      // Hook YOUR 👜 icon to open the drawer
      // -------------------------
      var cartBtn = document.getElementById("cartButton");
      if (cartBtn) {
        cartBtn.addEventListener("click", function (e) {
          e.preventDefault();
          var toggle = document.querySelector(".shopify-buy__cart-toggle");
          if (toggle) toggle.click();
        });
      }

      // -------------------------
      // Force drawer "button" to go to Shopify CART page (not checkout)
      // -------------------------
      document.addEventListener("click", function (e) {
        // Shopify buy-button uses different classnames across versions, so catch a few
        var btn =
          e.target.closest(".shopify-buy__btn--checkout") ||
          e.target.closest(".shopify-buy__cart__checkout") ||
          e.target.closest(".shopify-buy__btn.shopify-buy__btn--checkout");

        if (btn) {
          e.preventDefault();
          window.location.href = SHOP_CART_URL;
        }
      });

      // -------------------------
      // Cart count badge update (👜 2)
      // -------------------------
      function updateCount() {
        try {
          var countEl = document.getElementById("cartCount");
          if (!countEl) return;

          var model = cartComponent && cartComponent.model;
          if (!model || !model.lineItems) return;

          var totalQty = 0;
          model.lineItems.forEach(function (li) {
            totalQty += (li.quantity || 0);
          });

          countEl.textContent = totalQty;
          countEl.style.display = totalQty > 0 ? "inline-block" : "none";
        } catch (err) {
          // ignore
        }
      }

      // Try to subscribe to changes (Buy Button uses Backbone models)
      try {
        if (cartComponent && cartComponent.model && cartComponent.model.on) {
          cartComponent.model.on("change", updateCount);
        }
      } catch (e) {}

      // Also do a periodic refresh (safe fallback)
      updateCount();
      setInterval(updateCount, 1200);

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
              // show variants dropdown (Size) + button, but hide extra clutter
              contents: {
                img: false,
                title: false,
                price: false,
                options: true
              },
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
            cart: {
              startOpen: true
            }
          }
        });
      });
    });
  }

  if (window.ShopifyBuy && window.ShopifyBuy.UI) init();
  else loadScript(init);
})();
</script>
