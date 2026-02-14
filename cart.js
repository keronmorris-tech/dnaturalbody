/* cart.js — Drawer cart + Shopify checkout permalink
   Works across all pages (shop, product, etc.)
*/

(function () {
  // ✅ your Shopify storefront domain
  const SHOP_DOMAIN = "https://shop.dnaturalbody.com";

  // ---------------------------
  // Helpers
  // ---------------------------
  function money(cents) {
    return "$" + (Number(cents || 0) / 100).toFixed(2);
  }

  function $(id) {
    return document.getElementById(id);
  }

  function safeJson(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  // Local cache as a fallback (drawer UI uses this if functions fail)
  // NOTE: Your real inventory sync happens in Shopify. This cache is only for UI stability.
  const STORAGE_KEY = "dnatural_cart_cache_v1";

  function getCachedCart() {
    return safeJson(localStorage.getItem(STORAGE_KEY), { items: [], total_price: 0 });
  }

  function setCachedCart(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart || { items: [], total_price: 0 }));
  }

  // ---------------------------
  // Drawer elements (may or may not exist on every page)
  // ---------------------------
  const overlay = $("cartOverlay");
  const drawer  = $("cartDrawer");
  const cartBtn = $("cartButton");
  const closeBtn = $("closeCart");
  const contBtn = $("cartContinue");

  const countEl = $("cartCount");

  // drawer vs page ids differ on some pages, support both
  const itemsEl = $("cartItemsDrawer") || $("cartItems");
  const subtotalEl = $("cartSubtotalDrawer") || $("cartSubtotal");

  // IMPORTANT: attach to ALL checkout buttons
  const checkoutEls = Array.from(document.querySelectorAll(".cart-checkout"));

  // ---------------------------
  // Drawer open/close
  // ---------------------------
  function openDrawer() {
    if (!overlay || !drawer) return;
    overlay.classList.add("is-open");
    drawer.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    if (!overlay || !drawer) return;
    overlay.classList.remove("is-open");
    drawer.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  overlay && overlay.addEventListener("click", closeDrawer);
  closeBtn && closeBtn.addEventListener("click", closeDrawer);
  contBtn && contBtn.addEventListener("click", closeDrawer);

  // ---------------------------
  // Shopify cart permalink checkout URL
  // /cart/VARIANT:QTY,VARIANT:QTY?checkout
  // ---------------------------
  function buildCheckoutUrl(cart) {
    const items = (cart && cart.items) ? cart.items : [];
    const parts = items
      .filter(i => i && i.id && Number(i.quantity) > 0)
      .map(i => `${Number(i.id)}:${Number(i.quantity)}`);

    if (!parts.length) return `${SHOP_DOMAIN}/cart`;
    return `${SHOP_DOMAIN}/cart/${parts.join(",")}?checkout`;
  }

  function updateCount(cart) {
    if (!countEl) return;
    const count = (cart?.items || []).reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    countEl.textContent = String(count);
    countEl.style.display = count > 0 ? "inline-block" : "none";
  }

  function renderCart(cart) {
    if (!itemsEl || !subtotalEl) return;

    const items = cart?.items || [];

    if (!items.length) {
      itemsEl.innerHTML = `<p class="cart-empty" style="margin:0;">Your cart is empty.</p>`;
      subtotalEl.textContent = "$0.00";
      updateCount(cart);
      return;
    }

    itemsEl.innerHTML = items.map(item => {
      const img = item.image
        ? `<img src="${item.image}" alt="" style="width:54px;height:54px;object-fit:cover;border-radius:10px;">`
        : "";

      return `
        <div class="cart-line" style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">
          <div class="cart-line-img">${img}</div>
          <div class="cart-line-main" style="flex:1;">
            <div class="cart-line-name" style="font-weight:700;">${item.product_title || item.title || "Item"}</div>
            <div class="cart-line-meta" style="opacity:.85;">${item.variant_title || ""}</div>
            <div class="cart-line-meta" style="opacity:.85;">Qty: ${item.quantity}</div>
          </div>
          <div class="cart-line-total" style="font-weight:700;">
            ${money(item.final_line_price ?? ((item.priceCents || 0) * (item.quantity || 0)))}
          </div>
        </div>
      `;
    }).join("");

    subtotalEl.textContent = money(cart.total_price ?? items.reduce((s,i)=>s+(i.final_line_price||0),0));
    updateCount(cart);
  }

  // ---------------------------
  // Fetch cart from your Netlify functions
  // ---------------------------
  async function fetchCart() {
    const res = await fetch("/.netlify/functions/cart-get", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load cart");
    return res.json();
  }

  // ---------------------------
  // Sync UI on load
  // ---------------------------
  async function syncCartUI() {
    try {
      const cart = await fetchCart();
      renderCart(cart);
      setCachedCart(cart);
      return cart;
    } catch (e) {
      // fallback so the UI doesn’t break
      const cached = getCachedCart();
      renderCart(cached);
      return cached;
    }
  }

  // Cart icon opens drawer
  if (cartBtn) {
    cartBtn.addEventListener("click", async () => {
      await syncCartUI();
      openDrawer();
    });
  }

  // ✅ Checkout buttons (ALL of them)
  checkoutEls.forEach(el => {
    el.addEventListener("click", async (e) => {
      // If it's an <a>, prevent default so we control the final URL
      e.preventDefault();

      const cart = await syncCartUI();
      const url = buildCheckoutUrl(cart);

      // Go to Shopify checkout
      window.location.assign(url);
    });
  });

  // Initial load count/subtotal
  syncCartUI();
})();
