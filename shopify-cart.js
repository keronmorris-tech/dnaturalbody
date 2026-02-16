// shopify-cart.js
// Uses Netlify Functions to talk to your Shopify cart so inventory stays synced.
// Required functions:
//  - /.netlify/functions/cart-get  (GET)  -> returns Shopify cart JSON
//  - /.netlify/functions/cart-add  (POST) -> { items: [{ id: <variantId>, quantity: <qty> }] }

(function () {
  const SHOP_CART_URL = "https://shop.dnaturalbody.com/cart";

  // Elements (may not exist on every page)
  const cartButton   = document.getElementById("cartButton");
  const cartCountEl  = document.getElementById("cartCount");

  const overlay      = document.getElementById("cartOverlay");
  const drawer       = document.getElementById("cartDrawer");
  const closeBtn     = document.getElementById("closeCart");
  const continueBtn  = document.getElementById("cartContinue");

  const itemsEl      = document.getElementById("cartItemsDrawer") || document.getElementById("cartItems");
  const subtotalEl   = document.getElementById("cartSubtotalDrawer") || document.getElementById("cartSubtotal");

  const checkoutBtns = document.querySelectorAll(".cart-checkout");

  // Product detail helpers (optional)
  const sizeOptionsWrap = document.getElementById("sizeOptions");
  const addBtn          = document.getElementById("addToCartBtn");
  const priceTextEl     = document.getElementById("priceText");
  const sizeTextEl      = document.getElementById("sizeText");

  function money(cents) {
    return "$" + (Number(cents || 0) / 100).toFixed(2);
  }

  function formatPrice(v) {
    const n = Number(v);
    return isNaN(n) ? "$0.00" : "$" + n.toFixed(2);
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

  async function fetchCart() {
    const res = await fetch("/.netlify/functions/cart-get", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load cart");
    return res.json();
  }

  async function addToCart(variantId, qty) {
    const res = await fetch("/.netlify/functions/cart-add", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: Number(qty || 1) }] })
    });
    if (!res.ok) throw new Error("Add to cart failed");
  }

  function updateCartCount(cart) {
    if (!cartCountEl) return;
    const count = (cart?.items || []).reduce((sum, i) => sum + (i.quantity || 0), 0);
    cartCountEl.textContent = count;
    cartCountEl.style.display = count > 0 ? "inline-block" : "none";
  }

  function renderCart(cart) {
    if (!itemsEl || !subtotalEl) return;

    if (!cart?.items?.length) {
      itemsEl.innerHTML = `<p class="cart-empty">Your cart is empty.</p>`;
      subtotalEl.textContent = "$0.00";
      return;
    }

    itemsEl.innerHTML = cart.items.map(item => {
      const img = item.image
        ? `<img src="${item.image}" alt="" style="width:54px;height:54px;object-fit:cover;border-radius:10px;">`
        : "";

      return `
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">
          ${img}
          <div style="flex:1;">
            <div style="font-weight:700;">${item.product_title}</div>
            <div style="opacity:.85;">${item.variant_title || ""}</div>
            <div style="opacity:.85;">Qty: ${item.quantity}</div>
          </div>
          <div style="font-weight:700;">${money(item.final_line_price)}</div>
        </div>
      `;
    }).join("");

    subtotalEl.textContent = money(cart.total_price);
  }

  // ---------- Product page: size switching (optional) ----------
  function getActiveSizeBtn() {
    if (!sizeOptionsWrap) return null;
    return sizeOptionsWrap.querySelector(".size-option.active") || sizeOptionsWrap.querySelector(".size-option");
  }

  function setActiveSize(btn) {
    if (!sizeOptionsWrap || !btn) return;
    sizeOptionsWrap.querySelectorAll(".size-option").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const price = btn.dataset.price;
    const size  = btn.dataset.size;
    const grams = btn.dataset.grams;

    if (priceTextEl && price) priceTextEl.textContent = formatPrice(price);
    if (sizeTextEl && size) {
      sizeTextEl.textContent = grams ? `Net Wt. ${size} / ${grams} g` : `Size: ${size}`;
    }
  }

  // ---------- Events ----------
  overlay?.addEventListener("click", closeCart);
  closeBtn?.addEventListener("click", closeCart);
  continueBtn?.addEventListener("click", closeCart);

  checkoutBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = SHOP_CART_URL;
    });
  });

  if (cartButton) {
    cartButton.addEventListener("click", async (e) => {
      // works if button or anchor
      e.preventDefault?.();
      try {
        const cart = await fetchCart();
        renderCart(cart);
        updateCartCount(cart);
        openCart();
      } catch (err) {
        // fallback: still allow going to checkout/cart if functions are down
        window.location.href = SHOP_CART_URL;
      }
    });
  }

  // Size button click
  sizeOptionsWrap?.addEventListener("click", (e) => {
    const btn = e.target.closest(".size-option");
    if (btn) setActiveSize(btn);
  });

  // Add to cart click
  addBtn?.addEventListener("click", async () => {
    const active = getActiveSizeBtn();
    const variantId = active?.dataset?.variant || addBtn.dataset.variant;

    if (!variantId) return alert("Missing variant id for this product.");

    const original = addBtn.textContent;
    addBtn.disabled = true;
    addBtn.textContent = "Adding...";

    try {
      await addToCart(variantId, 1);
      const cart = await fetchCart();
      renderCart(cart);
      updateCartCount(cart);
      openCart();
    } catch (err) {
      console.error(err);
      alert("Couldn’t add to cart. Make sure your Netlify functions are deployed.");
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = original;
    }
  });

  // Initial load (badge only)
  fetchCart().then(updateCartCount).catch(() => {});
  // Set default active size on product pages
  const firstActive = getActiveSizeBtn();
  if (firstActive) setActiveSize(firstActive);
})();
