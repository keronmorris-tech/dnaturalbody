/* D'NATURAL BODY — Cart
   Primary: Netlify Functions
   Fallback: Shopify /cart/add (works even if functions fail or when testing locally)
*/
(function () {
  const SHOP_DOMAIN = "https://shop.dnaturalbody.com";
  const SHOPIFY_CART_URL = `${SHOP_DOMAIN}/cart`;

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

  function money(cents) {
    return "$" + (Number(cents || 0) / 100).toFixed(2);
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

  overlay && overlay.addEventListener("click", closeCart);
  closeBtn && closeBtn.addEventListener("click", closeCart);
  contBtn && contBtn.addEventListener("click", closeCart);

  async function fetchCart() {
    const res = await fetch("/.netlify/functions/cart-get", { cache: "no-store" });
    if (!res.ok) throw new Error("cart-get failed");
    return res.json();
  }

  async function addToCartViaFunctions(variantId, qty = 1) {
    const res = await fetch("/.netlify/functions/cart-add", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: Number(qty) || 1 }] })
    });
    if (!res.ok) throw new Error("cart-add failed");
    // may or may not return cart json
    try { return await res.json(); } catch { return null; }
  }

  function addToCartFallbackRedirect(variantId, qty = 1) {
    // Shopify supports /cart/add?id=VARIANT&quantity=1
    const url = `${SHOP_DOMAIN}/cart/add?id=${encodeURIComponent(variantId)}&quantity=${encodeURIComponent(qty)}`;
    window.location.href = url;
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

  // Cart icon opens drawer
  cartButton && cartButton.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const cart = await fetchCart();
      renderCart(cart);
      updateCartCount(cart);
      openCart();
    } catch (err) {
      // fallback to Shopify cart page
      window.location.href = SHOPIFY_CART_URL;
    }
  });

  // Checkout button goes to Shopify cart page (your preference)
  drawerCheckoutBtn && drawerCheckoutBtn.addEventListener("click", () => {
    window.location.href = SHOPIFY_CART_URL;
  });

  // ---------
  // ADD TO CART — event delegation (works everywhere)
  // Looks for:
  //  - #addToCartBtn
  //  - .add-to-cart
  // Then reads:
  //  - data-variant OR data-variant-id OR active .size-option[data-variant]
  // ---------
  function getVariantId(btn) {
    const direct = btn?.dataset?.variant || btn?.dataset?.variantId;
    if (direct) return direct;

    const active = document.querySelector(".size-option.active[data-variant]");
    if (active?.dataset?.variant) return active.dataset.variant;

    const first = document.querySelector(".size-option[data-variant]");
    if (first?.dataset?.variant) return first.dataset.variant;

    return null;
  }

async function handleAdd(btn) {
  const variantId = getVariantId(btn);
  if (!variantId) {
    alert("Missing variant ID on this page.");
    return;
  }

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Adding...";

  try {
    // 1) Try your Netlify function
    await addToCartViaFunctions(variantId, 1);

    // 2) Read cart back
    const cart = await fetchCart();

    // If cart is STILL empty, your functions aren't persisting session properly.
    // Fallback: add via Shopify and go to Shopify cart page.
    const count = (cart?.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
    if (!count) {
      const url = `${SHOP_DOMAIN}/cart/add?id=${encodeURIComponent(variantId)}&quantity=1`;
      window.location.href = url; // Shopify will add + land on Shopify cart
      return;
    }

    // 3) Normal path: show drawer
    renderCart(cart);
    updateCartCount(cart);
    openCart();

  } catch (err) {
    // If functions fail, fallback to Shopify add
    const url = `${SHOP_DOMAIN}/cart/add?id=${encodeURIComponent(variantId)}&quantity=1`;
    window.location.href = url;
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("#addToCartBtn, .add-to-cart");
    if (!btn) return;
    e.preventDefault();
    handleAdd(btn);
  });

  // Initial cart badge
  fetchCart().then(updateCartCount).catch(() => {});
})();
