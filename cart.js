/* D'NATURAL BODY — Cart (Netlify Functions -> Shopify)
   - Adds items via /.netlify/functions/cart-add
   - Reads cart via /.netlify/functions/cart-get
   - Drawer open/close
   - Updates cart count everywhere
*/

(function () {
  const SHOPIFY_CART_URL = "https://shop.dnaturalbody.com/cart";

  // Elements (may not exist on every page)
  const overlay = document.getElementById("cartOverlay");
  const drawer = document.getElementById("cartDrawer");
  const closeBtn = document.getElementById("closeCart");
  const contBtn = document.getElementById("cartContinue");

  const cartButton = document.getElementById("cartButton"); // can be <button> or <a>
  const cartCountEl = document.getElementById("cartCount");

  // Drawer content containers (different pages use different IDs)
  const itemsEl =
    document.getElementById("cartItemsDrawer") ||
    document.getElementById("cartItems");

  const subtotalEl =
    document.getElementById("cartSubtotalDrawer") ||
    document.getElementById("cartSubtotal");

  // Checkout button (in drawer)
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

  overlay?.addEventListener("click", closeCart);
  closeBtn?.addEventListener("click", closeCart);
  contBtn?.addEventListener("click", closeCart);

  async function fetchCart() {
    const res = await fetch("/.netlify/functions/cart-get", { cache: "no-store" });
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
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: Number(qty) || 1 }] })
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error("cart-add failed: " + res.status + " " + t);
    }

    // Some implementations return the updated cart. If yours doesn't, we just fetch next.
    try {
      return await res.json();
    } catch {
      return null;
    }
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

  // Clicking the cart icon opens drawer
  cartButton?.addEventListener("click", async (e) => {
    // If it's an <a>, stop navigation so drawer can open
    if (cartButton.tagName === "A") e.preventDefault();

    try {
      const cart = await fetchCart();
      renderCart(cart);
      updateCartCount(cart);
      openCart();
    } catch (err) {
      console.error(err);
      // fallback: go to Shopify cart page
      window.location.href = SHOPIFY_CART_URL;
    }
  });

  // Checkout button: go to Shopify cart page (your preference)
  drawerCheckoutBtn?.addEventListener("click", () => {
    window.location.href = SHOPIFY_CART_URL;
  });

  // ---------
  // ADD TO CART BINDING (works across all product pages)
  // ---------

  function getVariantFromPage(clickedEl) {
    // 1) If the clicked button has data-variant
    const direct = clickedEl?.dataset?.variant;
    if (direct) return direct;

    // 2) If there's a size option group, use the active one
    const activeSize = document.querySelector(".size-option.active[data-variant]");
    if (activeSize?.dataset?.variant) return activeSize.dataset.variant;

    // 3) Otherwise first size option
    const firstSize = document.querySelector(".size-option[data-variant]");
    if (firstSize?.dataset?.variant) return firstSize.dataset.variant;

    return null;
  }

  async function handleAddToCart(btn) {
    const variantId = getVariantFromPage(btn);
    if (!variantId) {
      alert("Missing variant ID on this page.");
      return;
    }

    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Adding...";

    try {
      await addToCart(variantId, 1);
      const cart = await fetchCart();
      renderCart(cart);
      updateCartCount(cart);
      openCart();
    } catch (err) {
      console.error(err);
      alert("Couldn’t add to cart. Please confirm your Netlify functions are deployed.");
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  // 1) Classic id="addToCartBtn"
  const singleAddBtn = document.getElementById("addToCartBtn");
  if (singleAddBtn) {
    singleAddBtn.addEventListener("click", () => handleAddToCart(singleAddBtn));
  }

  // 2) Any buttons/links with class .add-to-cart
  document.querySelectorAll(".add-to-cart").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      handleAddToCart(btn);
    });
  });

  // Initial load: update cart badge
  fetchCart().then(updateCartCount).catch(() => {});
})();
