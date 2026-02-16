/* D'NATURAL BODY — Cart (Netlify Functions -> Shopify)
   - Adds items via /.netlify/functions/cart-add
   - Reads cart via /.netlify/functions/cart-get
   - Drawer open/close
   - Updates cart count everywhere
   - Checkout button sends customer to Shopify CART PAGE with the SAME items
*/

(function () {
  const SHOP_DOMAIN = "https://shop.dnaturalbody.com";
  const SHOPIFY_CART_URL = `${SHOP_DOMAIN}/cart`;

  // Elements
  const overlay = document.getElementById("cartOverlay");
  const drawer  = document.getElementById("cartDrawer");
  const closeBtn = document.getElementById("closeCart");
  const contBtn  = document.getElementById("cartContinue");

  const cartButton  = document.getElementById("cartButton");
  const cartCountEl = document.getElementById("cartCount");

  const itemsEl =
    document.getElementById("cartItemsDrawer") ||
    document.getElementById("cartItems");

  const subtotalEl =
    document.getElementById("cartSubtotalDrawer") ||
    document.getElementById("cartSubtotal");

  const drawerCheckoutBtn = document.querySelector(".cart-checkout");

  // Keep the latest cart in memory so Checkout can build the Shopify cart URL
  let lastCart = null;

  const money = (cents) => "$" + (Number(cents || 0) / 100).toFixed(2);

  function openCart() {
    if (!overlay || !drawer) return;
    overlay.classList.add("is-open");
    drawer.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  function closeCart() {
    if (!overlay || !drawer) return;
    overlay.classList.remove("is-open");
    drawer.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  overlay?.addEventListener("click", closeCart);
  closeBtn?.addEventListener("click", closeCart);
  contBtn?.addEventListener("click", closeCart);

  async function fetchCart() {
    const res = await fetch("/.netlify/functions/cart-get", {
      cache: "no-store",
      credentials: "include" // IMPORTANT
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error("cart-get failed: " + res.status + " " + t);
    }

    return res.json();
  }

  async function addToCart(variantId, qty = 1) {
    const res = await fetch("/.netlify/functions/cart-add", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: Number(qty) || 1 }] }),
      credentials: "include" // IMPORTANT
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error("cart-add failed: " + res.status + " " + t);
    }

    // Function may or may not return cart JSON
    try { return await res.json(); } catch { return null; }
  }

  function updateCartCount(cart) {
    if (!cartCountEl) return;
    const count = (cart?.items || []).reduce((sum, i) => sum + (i.quantity || 0), 0);
    cartCountEl.textContent = count;
    cartCountEl.style.display = count > 0 ? "inline-block" : "none";
  }

  function renderCart(cart) {
    lastCart = cart || null;

    if (!itemsEl || !subtotalEl) return;

    if (!cart?.items?.length) {
      itemsEl.innerHTML = `<p class="cart-empty" style="margin:0;">Your cart is empty.</p>`;
      subtotalEl.textContent = "$0.00";
      return;
    }

    itemsEl.innerHTML = cart.items.map(item => {
      const img = item.image
        ? `<div class="cart-line-img"><img src="${item.image}" alt=""></div>`
        : "";

      return `
        <div class="cart-line">
          ${img}
          <div class="cart-line-main">
            <div class="cart-line-name">${item.product_title || ""}</div>
            <div class="cart-line-meta">${item.variant_title || ""}</div>
            <div class="cart-line-meta">Qty: ${item.quantity}</div>
          </div>
          <div class="cart-line-total">${money(item.final_line_price)}</div>
        </div>
      `;
    }).join("");

    subtotalEl.textContent = money(cart.total_price);
  }

  // Build a Shopify cart URL that pre-loads the same items:
  // https://shop.domain/cart/VARIANT:QTY,VARIANT:QTY
  function buildShopifyCartUrlFromCart(cart) {
    if (!cart?.items?.length) return SHOPIFY_CART_URL;

    // Shopify cart.js items usually include "variant_id"
    const parts = cart.items
      .map(i => {
        const vid = i.variant_id || i.id; // fallback
        const qty = i.quantity || 1;
        if (!vid) return null;
        return `${vid}:${qty}`;
      })
      .filter(Boolean);

    if (!parts.length) return SHOPIFY_CART_URL;

    return `${SHOP_DOMAIN}/cart/${parts.join(",")}`;
  }

  // Cart icon opens drawer
  cartButton?.addEventListener("click", async (e) => {
    // if cartButton becomes an <a> later
    if (cartButton.tagName === "A") e.preventDefault();

    try {
      const cart = await fetchCart();
      renderCart(cart);
      updateCartCount(cart);
      openCart();
    } catch (err) {
      console.error(err);
      window.location.href = SHOPIFY_CART_URL;
    }
  });

  // Checkout goes to Shopify CART page with same items
  drawerCheckoutBtn?.addEventListener("click", () => {
    const url = buildShopifyCartUrlFromCart(lastCart);
    window.location.href = url;
  });

  // Add-to-cart: uses active size-option[data-variant]
  function getVariantIdFromPage() {
    const active = document.querySelector(".size-option.active[data-variant]");
    if (active?.dataset?.variant) return active.dataset.variant;

    const first = document.querySelector(".size-option[data-variant]");
    if (first?.dataset?.variant) return first.dataset.variant;

    return null;
  }

  async function handleAdd(btn) {
    const variantId = getVariantIdFromPage();
    if (!variantId) return alert("Missing variant ID on this page.");

    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Adding...";

    try {
      await addToCart(variantId, 1);

      const cart = await fetchCart(); // should now reflect the added item
      renderCart(cart);
      updateCartCount(cart);
      openCart();
    } catch (err) {
      console.error(err);
      alert("Cart error. Please check your Netlify functions deployment.");
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  // Click handler for Add to Cart buttons
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("#addToCartBtn, .add-to-cart");
    if (!btn) return;
    e.preventDefault();
    handleAdd(btn);
  });

  // Initial badge
  fetchCart().then(updateCartCount).catch(() => {});
})();

