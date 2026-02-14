// cart.js — Shopify-synced drawer cart (via Netlify Functions proxy)
//
// Requires these Netlify functions:
//   GET  /.netlify/functions/cart-get     -> returns Shopify cart JSON
//   POST /.netlify/functions/cart-add     -> body: { items: [{ id, quantity }] }
// Optional (not required): cart-change / cart-clear, etc.
//
// This script:
// - Opens/closes the drawer
// - Renders items + subtotal
// - Updates the 👜 badge count
// - Sends checkout to Shopify checkout

(function () {
  const SHOP_DOMAIN = "https://shop.dnaturalbody.com";

  // Elements (some pages only have some of these)
  const cartButton   = document.getElementById("cartButton");
  const cartCountEl  = document.getElementById("cartCount");

  const overlay      = document.getElementById("cartOverlay");
  const drawer       = document.getElementById("cartDrawer");
  const closeBtn     = document.getElementById("closeCart");
  const continueBtn  = document.getElementById("cartContinue");

  // Drawer containers (preferred IDs)
  const itemsDrawerEl    = document.getElementById("cartItemsDrawer") || document.getElementById("cartItems");
  const subtotalDrawerEl = document.getElementById("cartSubtotalDrawer") || document.getElementById("cartSubtotal");

  const checkoutEls = document.querySelectorAll(".cart-checkout, #drawerCheckout, [data-checkout]");

  function money(cents) {
    return "$" + (Number(cents || 0) / 100).toFixed(2);
  }

  function openCart() {
    if (overlay) overlay.classList.add("is-open");
    if (drawer)  drawer.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  function closeCart() {
    if (overlay) overlay.classList.remove("is-open");
    if (drawer)  drawer.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  async function fetchCart() {
    const res = await fetch("/.netlify/functions/cart-get", { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "Could not load cart");
    }
    return res.json();
  }

  async function addVariant(variantId, qty) {
    const res = await fetch("/.netlify/functions/cart-add", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: Number(qty || 1) }] })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "Add to cart failed");
    }
    return res.json().catch(() => ({}));
  }

  function updateCount(cart) {
    if (!cartCountEl) return;
    const count = (cart?.items || []).reduce((sum, i) => sum + (i.quantity || 0), 0);
    cartCountEl.textContent = String(count);
    cartCountEl.style.display = count > 0 ? "inline-block" : "none";
  }

  function renderCart(cart) {
    if (!itemsDrawerEl || !subtotalDrawerEl) return;

    if (!cart?.items?.length) {
      itemsDrawerEl.innerHTML = `<p class="cart-empty">Your cart is empty.</p>`;
      subtotalDrawerEl.textContent = "$0.00";
      return;
    }

    itemsDrawerEl.innerHTML = cart.items.map(item => {
      const img = item.image
        ? `<img src="${item.image}" alt="" style="width:54px;height:54px;object-fit:cover;border-radius:10px;">`
        : "";

      const title = item.product_title || item.title || "Item";
      const variant = item.variant_title || "";
      const qty = item.quantity || 0;

      return `
        <div class="cart-line">
          <div class="cart-line-img">${img}</div>
          <div class="cart-line-main">
            <div class="cart-line-name">${title}</div>
            <div class="cart-line-meta">${variant ? variant + " • " : ""}Qty: ${qty}</div>
          </div>
          <div class="cart-line-total">${money(item.final_line_price)}</div>
        </div>
      `;
    }).join("");

    subtotalDrawerEl.textContent = money(cart.total_price);
  }

  async function refreshCart(open = false) {
    const cart = await fetchCart();
    renderCart(cart);
    updateCount(cart);
    if (open) openCart();
    return cart;
  }

  // Public API for product pages
  window.DNBShopifyCart = {
    addVariantAndOpen: async function (variantId, qty = 1) {
      await addVariant(variantId, qty);
      return refreshCart(true);
    },
    refresh: refreshCart,
    open: async function () {
      try { await refreshCart(true); }
      catch (e) { window.location.href = SHOP_DOMAIN + "/cart"; }
    },
    close: closeCart
  };

  // Cart button opens drawer
  if (cartButton) {
    cartButton.addEventListener("click", async (e) => {
      e.preventDefault?.();
      try { await refreshCart(true); }
      catch (err) { window.location.href = SHOP_DOMAIN + "/cart"; }
    });
  }

  // Close actions
  if (overlay) overlay.addEventListener("click", closeCart);
  if (closeBtn) closeBtn.addEventListener("click", closeCart);
  if (continueBtn) continueBtn.addEventListener("click", closeCart);

  // Checkout buttons go to Shopify checkout
  checkoutEls.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = SHOP_DOMAIN + "/checkout";
    });
  });

  // On load, set badge count
  refreshCart(false).catch(() => {});
})();
