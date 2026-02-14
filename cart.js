// cart.js – front-end cart with qty controls + localStorage

(function () {
  const CART_KEY = 'dnbCart';

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

  // Main cart page containers
  const cartItemsMain    = document.getElementById('cartItems');
  const cartSubtotalMain = document.getElementById('cartSubtotal');

  // Drawer containers (used on cart.html and can be absent elsewhere)
  const cartItemsDrawer    = document.getElementById('cartItemsDrawer');
  const cartSubtotalDrawer = document.getElementById('cartSubtotalDrawer');

  function formatMoney(amount) {
    return '$' + amount.toFixed(2);
  }

  function updateBadge() {
    if (!cartCountEl) return;
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    cartCountEl.textContent = count;
    cartCountEl.style.display = count > 0 ? 'inline-block' : 'none';
  }

  function renderCart() {
    const hasAnyItemsContainer = cartItemsMain || cartItemsDrawer;
    const hasAnySubtotal       = cartSubtotalMain || cartSubtotalDrawer;

    if (!hasAnyItemsContainer || !hasAnySubtotal) {
      updateBadge();
      return;
    }

    if (cart.length === 0) {
      const emptyHtml = '<p class="cart-empty">Your cart is empty.</p>';
      if (cartItemsMain)   cartItemsMain.innerHTML = emptyHtml;
      if (cartItemsDrawer) cartItemsDrawer.innerHTML = emptyHtml;
      if (cartSubtotalMain)   cartSubtotalMain.textContent = '$0.00';
      if (cartSubtotalDrawer) cartSubtotalDrawer.textContent = '$0.00';
      updateBadge();
      return;
    }

    let html = '';
    let subtotal = 0;

    cart.forEach((item, index) => {
      const lineTotal = item.price * item.qty;
      subtotal += lineTotal;

      html += `
        <div class="cart-line">
          <div class="cart-line-img">
            ${item.image ? `<img src="${item.image}" alt="${item.name}">` : ''}
          </div>

          <div class="cart-line-main">
            <div class="cart-line-name">${item.name}</div>
            <div class="cart-line-meta">
              ${formatMoney(item.price)}${item.size ? ` • ${item.size}` : ''} 
            </div>

            <div class="cart-line-qty">
              <button class="cart-qty-btn" data-index="${index}" data-action="minus">-</button>
              <input
                type="number"
                min="1"
                value="${item.qty}"
                class="cart-qty-input"
                data-index="${index}"
              >
              <button class="cart-qty-btn" data-index="${index}" data-action="plus">+</button>
            </div>

            <button class="cart-remove" data-index="${index}">Remove</button>
          </div>

          <div class="cart-line-total">${formatMoney(lineTotal)}</div>
        </div>
      `;
    });

    if (cartItemsMain)   cartItemsMain.innerHTML = html;
    if (cartItemsDrawer) cartItemsDrawer.innerHTML = html;

    if (cartSubtotalMain)   cartSubtotalMain.textContent = formatMoney(subtotal);
    if (cartSubtotalDrawer) cartSubtotalDrawer.textContent = formatMoney(subtotal);

    updateBadge();
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
  window.addToCart = function (item) {
    if (!item) return;

    const id    = item.id || '';
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

    let existing = cart.find(p => p.id === id);
    if (existing) {
      existing.qty   += qty;
      existing.price  = price;
      if (size)  existing.size  = size;
      if (image) existing.image = image;
    } else {
      cart.push({
        id,
        name,
        price,
        image,
        size,
        qty
      });
    }

    saveCart(cart);
    renderCart();
    openCart();
  };

  // ---- Generic add-to-cart buttons (with data- attributes) ----
  document.addEventListener('click', (event) => {
    const addBtn = event.target.closest('.add-to-cart');
    if (addBtn) {
      event.preventDefault();

      const id    = addBtn.dataset.id || '';
      const name  = addBtn.dataset.name || 'Product';
      const price = parseFloat(addBtn.dataset.price || '0');

      let image = addBtn.dataset.image || '';
      if (image) {
        try {
          image = new URL(image, window.location.href).href;
        } catch (e) { /* ignore */ }
      }

      const size = addBtn.dataset.size || '';

      window.addToCart({ id, name, price, image, size });
      return;
    }

    // Remove line
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

    // Qty +/- buttons
    const qtyBtn = event.target.closest('.cart-qty-btn');
    if (qtyBtn) {
      const index = parseInt(qtyBtn.dataset.index, 10);
      const action = qtyBtn.dataset.action;
      if (!isNaN(index) && cart[index]) {
        if (action === 'plus') {
          cart[index].qty += 1;
        } else if (action === 'minus') {
          cart[index].qty -= 1;
          if (cart[index].qty <= 0) {
            cart.splice(index, 1);
          }
        }
        saveCart(cart);
        renderCart();
      }
      return;
    }
  });

  // Qty input manual change
  document.addEventListener('change', (event) => {
    const input = event.target.closest('.cart-qty-input');
    if (!input) return;

    const index = parseInt(input.dataset.index, 10);
    if (isNaN(index) || !cart[index]) return;

    let value = parseInt(input.value, 10);
    if (isNaN(value) || value <= 0) {
      // treat 0/blank as remove
      cart.splice(index, 1);
    } else {
      cart[index].qty = value;
    }

    saveCart(cart);
    renderCart();
  });

  // Cart open/close
  if (cartButton) {
    cartButton.addEventListener('click', () => {
      renderCart();
      openCart();
    });
  }

  if (cartOverlay)      cartOverlay.addEventListener('click', closeCart);
  if (closeCartBtn)     closeCartBtn.addEventListener('click', closeCart);
  if (cartContinueBtn)  cartContinueBtn.addEventListener('click', closeCart);

  // Checkout – go to cart.html or ../cart.html if in a subfolder
  checkoutButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const path = window.location.pathname;
      let target = 'cart.html';

      if (path.includes('/body-butters') ||
          path.includes('/body-scrubs') ||
          path.includes('/body-yogurts')) {
        target = '../cart.html';
      }

      window.location.href = target;
    });
  });

  // Initial render on load
  renderCart();
})();
