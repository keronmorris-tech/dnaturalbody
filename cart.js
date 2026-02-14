// cart.js – Drawer cart (localStorage) + Checkout sends to Shopify with variant IDs

(function () {
  const CART_KEY = 'dnbCart';
  const SHOPIFY_DOMAIN = 'https://shop.dnaturalbody.com';

  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  let cart = loadCart();

  // Elements (some may not exist on every page)
  const cartButton       = document.getElementById('cartButton');
  const cartOverlay      = document.getElementById('cartOverlay');
  const cartDrawer       = document.getElementById('cartDrawer');
  const closeCartBtn     = document.getElementById('closeCart');
  const cartCountEl      = document.getElementById('cartCount');
  const cartContinueBtn  = document.getElementById('cartContinue');
  const checkoutButtons  = document.querySelectorAll('.cart-checkout');

  // Main cart page containers (cart.html)
  const cartItemsMain    = document.getElementById('cartItems');
  const cartSubtotalMain = document.getElementById('cartSubtotal');

  // Drawer containers
  const cartItemsDrawer    = document.getElementById('cartItemsDrawer');
  const cartSubtotalDrawer = document.getElementById('cartSubtotalDrawer');

  function formatMoney(amount) {
    return '$' + amount.toFixed(2);
  }

  function updateBadge() {
    if (!cartCountEl) return;
    const count = cart.reduce((sum, item) => sum + (item.qty || 0), 0);
    cartCountEl.textContent = count;
    cartCountEl.style.display = count > 0 ? 'inline-block' : 'none';
  }

  function renderCart() {
    const hasAnyItemsContainer = cartItemsMain || cartItemsDrawer;
    const hasAnySubtotal       = cartSubtotalMain || cartSubtotalDrawer;

    updateBadge();

    if (!hasAnyItemsContainer || !hasAnySubtotal) return;

    if (!cart || cart.length === 0) {
      const emptyHtml = '<p class="cart-empty">Your cart is empty.</p>';
      if (cartItemsMain)   cartItemsMain.innerHTML = emptyHtml;
      if (cartItemsDrawer) cartItemsDrawer.innerHTML = emptyHtml;
      if (cartSubtotalMain)   cartSubtotalMain.textContent = '$0.00';
      if (cartSubtotalDrawer) cartSubtotalDrawer.textContent = '$0.00';
      return;
    }

    let html = '';
    let subtotal = 0;

    cart.forEach((item, index) => {
      const price = Number(item.price || 0);
      const qty = Number(item.qty || 0);
      const lineTotal = price * qty;
      subtotal += lineTotal;

      html += `
        <div class="cart-line">
          <div class="cart-line-img">
            ${item.image ? `<img src="${item.image}" alt="${item.name || 'Product'}">` : ''}
          </div>

          <div class="cart-line-main">
            <div class="cart-line-name">${item.name || 'Product'}</div>
            <div class="cart-line-meta">
              ${formatMoney(price)}${item.size ? ` • ${item.size}` : ''} 
            </div>

            <div class="cart-line-qty">
              <button class="cart-qty-btn" data-index="${index}" data-action="minus" type="button">-</button>
              <input
                type="number"
                min="1"
                value="${qty}"
                class="cart-qty-input"
                data-index="${index}"
              >
              <button class="cart-qty-btn" data-index="${index}" data-action="plus" type="button">+</button>
            </div>

            <button class="cart-remove" data-index="${index}" type="button">Remove</button>
          </div>

          <div class="cart-line-total">${formatMoney(lineTotal)}</div>
        </div>
      `;
    });

    if (cartItemsMain)   cartItemsMain.innerHTML = html;
    if (cartItemsDrawer) cartItemsDrawer.innerHTML = html;

    if (cartSubtotalMain)   cartSubtotalMain.textContent = formatMoney(subtotal);
    if (cartSubtotalDrawer) cartSubtotalDrawer.textContent = formatMoney(subtotal);
  }

  function openCart() {
    if (cartOverlay) cartOverlay.classList.add('is-open');
    if (cartDrawer)  cartDrawer.classList.add('is-open');
  }

  function closeCart() {
    if (cartOverlay) cartOverlay.classList.remove('is-open');
    if (cartDrawer)  cartDrawer.classList.remove('is-open');
  }

  // ---- PUBLIC addToCart helper (used by detail pages) ----
  // IMPORTANT: item.id MUST be Shopify VARIANT ID as a string/number.
  window.addToCart = function (item) {
    if (!item) return;

    const id = String(item.id || '').trim(); // Shopify variant id
    const name  = item.name || 'Product';
    const price = typeof item.price === 'number'
      ? item.price
      : parseFloat(item.price || '0');

    if (!id || isNaN(price) || price <= 0) return;

    let image = item.image || '';
    if (image) {
      try {
        image = new URL(image, window.location.href).href;
      } catch (e) { /* leave as-is */ }
    }

    const size = item.size || '';
    const qty  = item.qty && item.qty > 0 ? item.qty : 1;

    const existing = cart.find(p => String(p.id) === id);
    if (existing) {
      existing.qty   += qty;
      existing.price  = price;
      if (size)  existing.size  = size;
      if (image) existing.image = image;
      if (name)  existing.name  = name;
    } else {
      cart.push({ id, name, price, image, size, qty });
    }

    saveCart(cart);
    renderCart();
    openCart();
  };

  // Remove / qty controls
  document.addEventListener('click', (event) => {
    const removeBtn = event.target.closest('.cart-remove');
    if (removeBtn) {
      const index = parseInt(removeBtn.dataset.index, 10);
      if (!isNaN(index)) {
        cart.splice(index, 1);
        saveCart(cart);
        renderCart();
      }
      return;
    }

    const qtyBtn = event.target.closest('.cart-qty-btn');
    if (qtyBtn) {
      const index = parseInt(qtyBtn.dataset.index, 10);
      const action = qtyBtn.dataset.action;
      if (!isNaN(index) && cart[index]) {
        if (action === 'plus') cart[index].qty += 1;
        if (action === 'minus') cart[index].qty -= 1;

        if (cart[index].qty <= 0) cart.splice(index, 1);

        saveCart(cart);
        renderCart();
      }
      return;
    }
  });

  document.addEventListener('change', (event) => {
    const input = event.target.closest('.cart-qty-input');
    if (!input) return;

    const index = parseInt(input.dataset.index, 10);
    if (isNaN(index) || !cart[index]) return;

    const value = parseInt(input.value, 10);
    if (isNaN(value) || value <= 0) cart.splice(index, 1);
    else cart[index].qty = value;

    saveCart(cart);
    renderCart();
  });

  // Open/close drawer
  if (cartButton) cartButton.addEventListener('click', () => { renderCart(); openCart(); });
  if (cartOverlay) cartOverlay.addEventListener('click', closeCart);
  if (closeCartBtn) closeCartBtn.addEventListener('click', closeCart);
  if (cartContinueBtn) cartContinueBtn.addEventListener('click', closeCart);

  // ✅ CHECKOUT: send ALL items to Shopify cart, then they proceed to checkout there.
  checkoutButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();

      if (!cart || cart.length === 0) {
        alert("Your cart is empty.");
        return;
      }

      // Build /cart/<variantId>:<qty>,<variantId>:<qty>
      // Inventory is enforced by Shopify when they land there.
      const lineItems = cart
        .map(item => `${encodeURIComponent(String(item.id))}:${encodeURIComponent(String(item.qty || 1))}`)
        .join(',');

      window.location.href = `${SHOPIFY_DOMAIN}/cart/${lineItems}`;
    });
  });

  // Initial render
  renderCart();
})();
