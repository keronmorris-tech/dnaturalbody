// D'Natural Body - Simple Shopify Permalink Cart (no cookies / no Shopify SDK)
// Stores cart in localStorage and sends customers to Shopify checkout via /cart/<variant>:<qty>?checkout

(function () {
  const STORAGE_KEY = "dnb_cart_v1";

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function loadCart() {
    return safeJsonParse(localStorage.getItem(STORAGE_KEY) || "[]", []);
  }

  function saveCart(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items || []));
  }

  function moneyFromCents(cents) {
    const v = (Number(cents || 0) / 100);
    return "$" + v.toFixed(2);
  }

  function priceToCents(priceStr) {
    // accepts "22.00" or "$22.00"
    const n = Number(String(priceStr || "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  function computeCount(items) {
    return (items || []).reduce((sum, i) => sum + (i.quantity || 0), 0);
  }

  function computeSubtotal(items) {
    return (items || []).reduce((sum, i) => sum + (i.priceCents || 0) * (i.quantity || 0), 0);
  }

  function buildCheckoutUrl(items) {
    const parts = (items || [])
      .filter(i => i && i.id && i.quantity > 0)
      .map(i => `${i.id}:${i.quantity}`);
    if (!parts.length) return `${SHOP_DOMAIN}/cart`;
    return `${SHOP_DOMAIN}/cart/${parts.join(",")}?checkout=1`;
  }

  // ------- UI wiring -------
  function $(id) { return document.getElementById(id); }

  const overlay = $("cartOverlay");
  const drawer  = $("cartDrawer");
  const cartBtn = $("cartButton");
  const closeBtn = $("closeCart");
  const contBtn = $("cartContinue");
  const countEl = $("cartCount");
  const itemsEl = $("cartItemsDrawer") || $("cartItems");
  const subtotalEl = $("cartSubtotalDrawer") || $("cartSubtotal");
  const checkoutBtn = document.querySelector(".cart-checkout");

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

  function updateCountUI(items) {
    if (!countEl) return;
    const count = computeCount(items);
    countEl.textContent = String(count);
    countEl.style.display = count > 0 ? "inline-block" : "none";
  }

  function renderDrawer() {
    const items = loadCart();
    updateCountUI(items);

    if (!itemsEl || !subtotalEl) return;

    if (!items.length) {
      itemsEl.innerHTML = `<p class="cart-empty" style="margin:0;">Your cart is empty.</p>`;
      subtotalEl.textContent = moneyFromCents(0);
      return;
    }

    itemsEl.innerHTML = items.map((item, idx) => {
      const img = item.image ? `<div class="cart-line-img"><img src="${item.image}" alt=""></div>` : "";
      const variantLine = item.variantTitle ? `<div class="cart-line-meta">${item.variantTitle}</div>` : "";
      return `
        <div class="cart-line" data-index="${idx}">
          ${img}
          <div class="cart-line-main">
            <div class="cart-line-name">${item.title || "Item"}</div>
            ${variantLine}
            <div class="cart-line-meta">${moneyFromCents(item.priceCents)} each</div>
            <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
              <button type="button" class="qty-btn" data-action="dec">−</button>
              <span style="min-width:24px;text-align:center;">${item.quantity}</span>
              <button type="button" class="qty-btn" data-action="inc">+</button>
              <button type="button" class="cart-remove" data-action="remove">Remove</button>
            </div>
          </div>
          <div class="cart-line-total">${moneyFromCents(item.priceCents * item.quantity)}</div>
        </div>
      `;
    }).join("");

    subtotalEl.textContent = moneyFromCents(computeSubtotal(items));
  }

  function setCart(items) {
    saveCart(items);
    renderDrawer();
  }

  function addItem(payload) {
    const { id, quantity, title, variantTitle, priceCents, image } = payload || {};
    if (!id) return;

    const items = loadCart();
    const existing = items.find(i => String(i.id) === String(id) && String(i.variantTitle || "") === String(variantTitle || ""));
    if (existing) {
      existing.quantity = (existing.quantity || 0) + (quantity || 1);
    } else {
      items.push({
        id: String(id),
        quantity: quantity || 1,
        title: title || "Item",
        variantTitle: variantTitle || "",
        priceCents: Number(priceCents || 0),
        image: image || ""
      });
    }
    setCart(items);
  }

  function changeQty(index, delta) {
    const items = loadCart();
    const item = items[index];
    if (!item) return;
    item.quantity = (item.quantity || 0) + delta;
    if (item.quantity <= 0) items.splice(index, 1);
    setCart(items);
  }

  function removeIndex(index) {
    const items = loadCart();
    items.splice(index, 1);
    setCart(items);
  }

  // Events: drawer open/close
  if (cartBtn) {
    cartBtn.addEventListener("click", function (e) {
      e.preventDefault?.();
      renderDrawer();
      openDrawer();
    });
  }
  overlay?.addEventListener("click", closeDrawer);
  closeBtn?.addEventListener("click", closeDrawer);
  contBtn?.addEventListener("click", closeDrawer);

  // Drawer buttons
  itemsEl?.addEventListener("click", function (e) {
    const line = e.target.closest(".cart-line");
    if (!line) return;
    const idx = Number(line.getAttribute("data-index"));
    const action = e.target.getAttribute("data-action");
    if (action === "inc") return changeQty(idx, 1);
    if (action === "dec") return changeQty(idx, -1);
    if (action === "remove") return removeIndex(idx);
  });

  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", function () {
      const items = loadCart();
      const url = buildCheckoutUrl(items);
      window.location.href = url;
    });
  }

  // Product page: size buttons + add-to-cart
  function activeSizeBtn(container) {
    return container?.querySelector(".size-option.active") || container?.querySelector(".size-option");
  }

  document.addEventListener("click", function (e) {
    const sizeBtn = e.target.closest(".size-option");
    if (sizeBtn) {
      const parent = sizeBtn.closest(".size-options");
      parent?.querySelectorAll(".size-option").forEach(b => b.classList.remove("active"));
      sizeBtn.classList.add("active");

      // update UI if present
      const priceText = $("priceText");
      const sizeText  = $("sizeText");
      const p = sizeBtn.dataset.price;
      const size = sizeBtn.dataset.size;
      const grams = sizeBtn.dataset.grams;
      if (priceText && p) priceText.textContent = "$" + Number(p).toFixed(2);
      if (sizeText && size) sizeText.textContent = grams ? `Net Wt. ${size} / ${grams} g` : size;
    }
  });

  const addBtn = $("addToCartBtn");
  if (addBtn) {
    addBtn.addEventListener("click", function () {
      const container = $("sizeOptions");
      const active = activeSizeBtn(container);

      // allow single-variant pages: variant stored on button
      const variantId = (active && active.dataset.variant) || addBtn.dataset.variant;
      const title = addBtn.dataset.title || document.querySelector("h1")?.textContent?.trim() || "Item";

      const variantTitle = (active && active.dataset.size) ? active.dataset.size : (addBtn.dataset.variantTitle || "");
      const priceStr = (active && active.dataset.price) ? active.dataset.price : addBtn.dataset.price;
      const img = addBtn.dataset.image || document.querySelector(".product-image img")?.getAttribute("src") || "";

      if (!variantId) {
        alert("Select a size first.");
        return;
      }

      addBtn.disabled = true;
      const original = addBtn.textContent;
      addBtn.textContent = "Adding...";

      addItem({
        id: variantId,
        quantity: 1,
        title: title,
        variantTitle: variantTitle,
        priceCents: priceToCents(priceStr || 0),
        image: img
      });

      renderDrawer();
      openDrawer();

      setTimeout(() => {
        addBtn.disabled = false;
        addBtn.textContent = original;
      }, 250);
    });
  }

  // initial render for count badge
  renderDrawer();

  // expose small API if needed
  window.DNB_CART = { addItem, openDrawer, closeDrawer, renderDrawer };
})();
