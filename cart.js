/* D'NATURAL BODY — Drawer Cart (LOCAL cart -> Shopify checkout)
   - Drawer + badge use localStorage (always works on dnaturalbody.com)
   - Checkout sends items to Shopify using cart permalink (tracks inventory/sales)
*/

(function () {
  const SHOP_DOMAIN = "https://shop.dnaturalbody.com";
  const SHOPIFY_CART_BASE = `${SHOP_DOMAIN}/cart`;
  const STORAGE_KEY = "dnb_cart_v1";

  // Elements
  const overlay = document.getElementById("cartOverlay");
  const drawer = document.getElementById("cartDrawer");
  const closeBtn = document.getElementById("closeCart");
  const contBtn = document.getElementById("cartContinue");

  const cartButton = document.getElementById("cartButton");
  const cartCountEl = document.getElementById("cartCount");

  const itemsEl =
    document.getElementById("cartItemsDrawer") ||
    document.getElementById("cartItems");

  const subtotalEl =
    document.getElementById("cartSubtotalDrawer") ||
    document.getElementById("cartSubtotal");

  const drawerCheckoutBtn = document.querySelector(".cart-checkout");

  // ---------- Helpers ----------
  function money(n) {
    return "$" + Number(n || 0).toFixed(2);
  }

  function getCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : { items: [] };
      if (!parsed.items) parsed.items = [];
      return parsed;
    } catch {
      return { items: [] };
    }
  }

  function saveCart(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }

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

  function updateCartCount(cart) {
    if (!cartCountEl) return;
    const count = (cart.items || []).reduce((sum, i) => sum + (i.qty || 0), 0);
    cartCountEl.textContent = count;
    cartCountEl.style.display = count > 0 ? "inline-block" : "none";
  }

  function renderCart(cart) {
    if (!itemsEl || !subtotalEl) return;

    if (!cart.items.length) {
      itemsEl.innerHTML = `<p class="cart-empty" style="margin:0;">Your cart is empty.</p>`;
      subtotalEl.textContent = "$0.00";
      return;
    }

    let subtotal = 0;

    itemsEl.innerHTML = cart.items.map(item => {
      const lineTotal = (Number(item.price || 0) * Number(item.qty || 0));
      subtotal += lineTotal;

      const img = item.image
        ? `<div class="cart-line-img"><img src="${item.image}" alt=""></div>`
        : "";

      return `
        <div class="cart-line" data-variant="${item.variantId}">
          ${img}
          <div class="cart-line-main">
            <div class="cart-line-name">${item.title || ""}</div>
            <div class="cart-line-meta">${item.variantTitle || ""}</div>
            <div class="cart-line-meta">Qty: ${item.qty}</div>
            <button class="cart-remove" type="button" data-remove="${item.variantId}">Remove</button>
          </div>
          <div class="cart-line-total">${money(lineTotal)}</div>
        </div>
      `;
    }).join("");

    subtotalEl.textContent = money(subtotal);
  }

  function buildShopifyPermalink(cart) {
    // Shopify format: /cart/variantId:qty,variantId:qty
    // (variantId must be numeric)
    const parts = cart.items
      .filter(i => i.variantId && i.qty > 0)
      .map(i => `${encodeURIComponent(i.variantId)}:${encodeURIComponent(i.qty)}`);

    return parts.length ? `${SHOPIFY_CART_BASE}/${parts.join(",")}` : SHOPIFY_CART_BASE;
  }

  // ---------- Variant / Product data ----------
  function getActiveSizeOption() {
    return (
      document.querySelector(".size-option.active") ||
      document.querySelector(".size-option")
    );
  }

  function getVariantIdFromPage(btn) {
    // prefer active size option variant
    const active = getActiveSizeOption();
    if (active?.dataset?.variant) return active.dataset.variant;

    // fallback: button dataset
    return btn?.dataset?.variant || btn?.dataset?.variantId || null;
  }

  function getVariantMetaFromPage(btn) {
    const active = getActiveSizeOption();

    const sizeLabel = active?.dataset?.size ? `${active.dataset.size}` : "";
    const grams = active?.dataset?.grams ? `${active.dataset.grams} g` : "";
    const variantTitle = sizeLabel ? (grams ? `${sizeLabel} / ${grams}` : sizeLabel) : "";

    const price = active?.dataset?.price
      ? Number(active.dataset.price)
      : (btn?.dataset?.price ? Number(btn.dataset.price) : 0);

    return {
      title: btn?.dataset?.title || document.querySelector(".product-info h1")?.textContent?.trim() || "Item",
      image: btn?.dataset?.image || document.querySelector(".product-image img")?.getAttribute("src") || "",
      price,
      variantTitle
    };
  }

  function addItemToLocalCart(variantId, meta, qty = 1) {
    const cart = getCart();
    const existing = cart.items.find(i => i.variantId === variantId);

    if (existing) {
      existing.qty += qty;
      // keep latest meta just in case
      existing.price = meta.price;
      existing.title = meta.title;
      existing.image = meta.image;
      existing.variantTitle = meta.variantTitle;
    } else {
      cart.items.push({
        variantId,
        qty,
        title: meta.title,
        image: meta.image,
        price: meta.price,
        variantTitle: meta.variantTitle
      });
    }

    saveCart(cart);
    return cart;
  }

  function removeItemFromLocalCart(variantId) {
    const cart = getCart();
    cart.items = cart.items.filter(i => i.variantId !== variantId);
    saveCart(cart);
    return cart;
  }

  // ---------- Events ----------
  overlay && overlay.addEventListener("click", closeCart);
  closeBtn && closeBtn.addEventListener("click", closeCart);
  contBtn && contBtn.addEventListener("click", closeCart);

  // Cart icon opens drawer
  cartButton && cartButton.addEventListener("click", (e) => {
    e.preventDefault();
    const cart = getCart();
    renderCart(cart);
    updateCartCount(cart);
    openCart();
  });

  // Checkout goes to Shopify cart page with items
  drawerCheckoutBtn && drawerCheckoutBtn.addEventListener("click", () => {
    const cart = getCart();
    window.location.href = buildShopifyPermalink(cart);
  });

  // Remove buttons inside drawer
  document.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove]");
    if (!removeBtn) return;

    const variantId = removeBtn.getAttribute("data-remove");
    const cart = removeItemFromLocalCart(variantId);
    renderCart(cart);
    updateCartCount(cart);
  });

  // Add to cart (works for #addToCartBtn and .add-to-cart)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("#addToCartBtn, .add-to-cart");
    if (!btn) return;

    e.preventDefault();

    const variantId = getVariantIdFromPage(btn);
    if (!variantId) return alert("Missing variant ID on this page.");

    const meta = getVariantMetaFromPage(btn);
    const cart = addItemToLocalCart(variantId, meta, 1);

    renderCart(cart);
    updateCartCount(cart);
    openCart();
  });

  // Initial badge load
  const initial = getCart();
  updateCartCount(initial);
})();
