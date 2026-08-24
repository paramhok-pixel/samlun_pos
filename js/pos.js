/* =========================================================
   pos.js — Sell screen: product grid + shopping cart
   ========================================================= */
(function () {
  const CART_KEY = 'pos_cart_v1';
  let cart = [];               // [{productId, name, unit, photo, priceType, unitPrice, qty, maxStock}]
  let priceMode = 'staff';     // default price type applied to newly-added items
  let activeCategory = 'all';
  let searchTerm = '';

  function loadCart() {
    try {
      const raw = sessionStorage.getItem(CART_KEY);
      cart = raw ? JSON.parse(raw) : [];
    } catch (e) { cart = []; }
  }
  function persistCart() {
    try { sessionStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
  }

  function priceFor(product, type) {
    return type === 'tourist' ? Number(product.priceTourist) : Number(product.priceStaff);
  }

  // ---------------- Product grid ----------------
  function renderCategoryChips() {
    const cats = Products.getCategories();
    const host = document.getElementById('pos-category-chips');
    const chips = ['<button class="chip' + (activeCategory === 'all' ? ' active' : '') + '" data-cat="all">ทั้งหมด</button>']
      .concat(cats.map(c => `<button class="chip${activeCategory === c ? ' active' : ''}" data-cat="${Utils.escapeHtml(c)}">${Utils.escapeHtml(c)}</button>`));
    host.innerHTML = chips.join('');
    host.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.getAttribute('data-cat');
        renderCategoryChips();
        renderGrid();
      });
    });
  }

  function renderGrid() {
    const all = Products.getAll();
    let list = all.filter(p => {
      if (activeCategory !== 'all' && (p.category || '') !== activeCategory) return false;
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        const hay = ((p.name || '') + ' ' + (p.barcode || '')).toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });

    const grid = document.getElementById('pos-product-grid');
    document.getElementById('pos-empty').style.display = (list.length === 0) ? 'block' : 'none';

    grid.innerHTML = list.map(p => {
      const price = priceFor(p, priceMode);
      const oos = Number(p.stock) <= 0;
      const low = !oos && Number(p.stock) <= Products.getLowStockThreshold();
      const thumb = p.photo
        ? `<img class="product-thumb" src="${p.photo}" alt="">`
        : `<div class="product-thumb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/></svg></div>`;
      return `
      <button class="product-card${oos ? ' oos' : ''}" data-id="${p.id}">
        ${thumb}
        <div class="product-info">
          <div class="product-name">${Utils.escapeHtml(p.name)}</div>
          <div class="product-price">${Utils.money(price)}</div>
          <div class="product-stock${low ? ' low' : ''}">${oos ? 'สินค้าหมด' : 'คงเหลือ ' + p.stock + ' ' + Utils.escapeHtml(p.unit || '')}</div>
        </div>
      </button>`;
    }).join('');

    grid.querySelectorAll('.product-card').forEach(card => {
      card.addEventListener('click', () => {
        const p = all.find(x => x.id === Number(card.getAttribute('data-id')));
        if (p) addToCart(p);
      });
    });
  }

  function refreshProductArea() {
    renderCategoryChips();
    renderGrid();
  }

  // ---------------- Cart ops ----------------
  function addToCart(product, qtyDelta) {
    qtyDelta = qtyDelta || 1;
    const existing = cart.find(l => l.productId === product.id && l.priceType === priceMode);
    const currentQty = existing ? existing.qty : 0;
    if (currentQty + qtyDelta > Number(product.stock)) {
      Utils.toast('สินค้าคงเหลือไม่พอ (คงเหลือ ' + product.stock + ')', 'danger');
      return;
    }
    if (existing) {
      existing.qty += qtyDelta;
    } else {
      cart.push({
        productId: product.id,
        name: product.name,
        unit: product.unit || 'ชิ้น',
        photo: product.photo || null,
        priceType: priceMode,
        unitPrice: priceFor(product, priceMode),
        qty: qtyDelta,
        maxStock: Number(product.stock)
      });
    }
    persistCart();
    renderCartBar();
    renderCartSheetIfOpen();
    renderScannerCartMiniIfOpen();
    Utils.toast(product.name + ' ถูกเพิ่มลงตะกร้า');
  }

  function setLineQty(idx, qty) {
    const line = cart[idx];
    if (!line) return;
    if (qty <= 0) { cart.splice(idx, 1); }
    else if (qty > line.maxStock) { Utils.toast('สินค้าคงเหลือไม่พอ', 'danger'); return; }
    else { line.qty = qty; }
    persistCart();
    renderCartBar();
    renderCartSheet();
    renderScannerCartMiniIfOpen();
  }

  function toggleLinePriceType(idx) {
    const line = cart[idx];
    if (!line) return;
    const product = Products.getAll().find(p => p.id === line.productId);
    if (!product) return;
    line.priceType = line.priceType === 'staff' ? 'tourist' : 'staff';
    line.unitPrice = priceFor(product, line.priceType);
    persistCart();
    renderCartSheet();
    renderCartBar();
    renderScannerCartMiniIfOpen();
  }

  function removeLine(idx) {
    cart.splice(idx, 1);
    persistCart();
    renderCartBar();
    renderCartSheet();
    renderScannerCartMiniIfOpen();
  }

  function clearCart() {
    cart = [];
    persistCart();
    renderCartBar();
    renderCartSheet();
    renderScannerCartMiniIfOpen();
  }

  function cartTotal() {
    return cart.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  }
  function cartCount() {
    return cart.reduce((sum, l) => sum + l.qty, 0);
  }

  // ---------------- Rendering: cart bar + sheet ----------------
  function renderCartBar() {
    const bar = document.getElementById('cart-bar');
    if (cart.length === 0) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    document.getElementById('cart-bar-count').textContent = cartCount();
    document.getElementById('cart-bar-total').textContent = Utils.money(cartTotal());
  }

  function renderCartSheetIfOpen() {
    if (document.getElementById('cart-sheet-overlay').classList.contains('open')) renderCartSheet();
  }
  function renderScannerCartMiniIfOpen() {
    if (document.getElementById('scanner-modal').classList.contains('open')) renderScannerCartMini();
  }

  function cartLineHtml(l, idx) {
    return `
      <div class="cart-line">
        <img src="${l.photo || Utils.placeholderImg}" alt="">
        <div class="info">
          <div class="name">${Utils.escapeHtml(l.name)}</div>
          <div class="meta">
            <span class="badge ${l.priceType === 'staff' ? 'badge-staff' : 'badge-tourist'}" data-toggle-price="${idx}" style="cursor:pointer;">
              ${l.priceType === 'staff' ? 'เจ้าหน้าที่' : 'นักท่องเที่ยว'} · ${Utils.money(l.unitPrice)}
            </span>
          </div>
          <div class="qty-ctrl mt-8">
            <button data-dec="${idx}">−</button>
            <span class="n">${l.qty}</span>
            <button data-inc="${idx}">+</button>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
          <div class="linetotal">${Utils.money(l.unitPrice * l.qty)}</div>
          <button class="remove-x" data-remove="${idx}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>
        </div>
      </div>`;
  }

  function bindCartLineEvents(host) {
    host.querySelectorAll('[data-inc]').forEach(b => b.addEventListener('click', () => setLineQty(Number(b.getAttribute('data-inc')), cart[Number(b.getAttribute('data-inc'))].qty + 1)));
    host.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => setLineQty(Number(b.getAttribute('data-dec')), cart[Number(b.getAttribute('data-dec'))].qty - 1)));
    host.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => removeLine(Number(b.getAttribute('data-remove')))));
    host.querySelectorAll('[data-toggle-price]').forEach(b => b.addEventListener('click', () => toggleLinePriceType(Number(b.getAttribute('data-toggle-price')))));
  }

  function renderCartSheet() {
    const host = document.getElementById('cart-lines');
    if (cart.length === 0) {
      host.innerHTML = `<div class="empty-state"><div class="t">ตะกร้าว่างเปล่า</div><div>แตะสินค้าจากหน้าขายเพื่อเพิ่มลงตะกร้า</div></div>`;
    } else {
      host.innerHTML = cart.map(cartLineHtml).join('');
      bindCartLineEvents(host);
    }
    document.getElementById('cart-total-items').textContent = cartCount();
    document.getElementById('cart-total-amount').textContent = Utils.money(cartTotal());
  }

  // Live cart preview shown inside the scanner modal during continuous scanning
  function renderScannerCartMini() {
    const wrap = document.getElementById('scanner-cart-mini');
    if (cart.length === 0) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    const host = document.getElementById('scanner-cart-lines');
    host.innerHTML = cart.map(cartLineHtml).join('');
    bindCartLineEvents(host);
    document.getElementById('scanner-cart-count').textContent = cartCount();
    document.getElementById('scanner-cart-total').textContent = Utils.money(cartTotal());
  }

  // ---------------- Events ----------------
  function bindEvents() {
    document.getElementById('pos-search').addEventListener('input', Utils.debounce((e) => {
      searchTerm = e.target.value.trim();
      renderGrid();
    }, 180));

    document.getElementById('price-mode-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      priceMode = btn.getAttribute('data-mode');
      document.querySelectorAll('#price-mode-toggle button').forEach(b => b.classList.toggle('active', b === btn));
      renderGrid();
    });

    document.getElementById('btn-open-scanner').addEventListener('click', () => {
      renderScannerCartMini();
      Scanner.open(async (code) => {
        const p = await DB.getProductByBarcode(code);
        if (p) { addToCart(p); }
        else { Utils.toast('ไม่พบสินค้าที่มีบาร์โค้ดนี้: ' + code, 'danger'); }
      }, { continuous: true });
    });

    document.getElementById('cart-bar').addEventListener('click', () => {
      renderCartSheet();
      Utils.openSheet('cart-sheet-overlay');
    });

    document.getElementById('btn-clear-cart').addEventListener('click', async () => {
      if (cart.length === 0) return;
      const ok = await Utils.confirmDialog('ล้างตะกร้า?', 'สินค้าทั้งหมดในตะกร้าจะถูกลบ', 'ล้างตะกร้า');
      if (ok) clearCart();
    });

    document.getElementById('btn-go-checkout').addEventListener('click', () => {
      if (cart.length === 0) { Utils.toast('ตะกร้าว่างเปล่า', 'danger'); return; }
      Utils.closeSheet('cart-sheet-overlay');
      Checkout.open(cart, cartTotal());
    });

    document.addEventListener('products:changed', refreshProductArea);
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadCart();
    bindEvents();
    renderCartBar();
  });

  window.POS = {
    refresh: refreshProductArea,
    getCart: () => cart,
    getCartTotal: cartTotal,
    getCartCount: cartCount,
    clearCartAfterSale: clearCart,
    renderCartBar
  };
})();
