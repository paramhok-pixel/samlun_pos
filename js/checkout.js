/* =========================================================
   checkout.js — Payment, change calculator, sale confirmation
   ========================================================= */
(function () {
  let cartRef = [];
  let total = 0;
  let paymentMethod = 'cash';
  let denomCounts = {};
  let exactMode = false;
  let slipPhoto = null;
  let lastSale = null;

  function open(cart, cartTotal) {
    cartRef = cart;
    total = cartTotal;
    paymentMethod = 'cash';
    denomCounts = {};
    exactMode = false;
    slipPhoto = null;

    document.getElementById('checkout-total-amt').textContent = Utils.money(total);
    document.getElementById('checkout-note').value = '';
    document.getElementById('slip-preview').src = Utils.placeholderImg;
    document.querySelectorAll('#pay-method-toggle button').forEach(b => b.classList.toggle('active', b.getAttribute('data-pay') === 'cash'));
    document.getElementById('cash-pay-block').style.display = 'block';
    document.getElementById('transfer-pay-block').style.display = 'none';

    renderDenomGrid();
    updateChangeDisplay();
    Utils.openSheet('checkout-sheet-overlay');
  }

  function renderDenomGrid() {
    const host = document.getElementById('denom-grid');
    host.innerHTML = Utils.DENOMS.map(d => {
      const isCoin = d <= 10;
      const count = denomCounts[d] || 0;
      return `
      <div class="denom-btn d-${d}" data-denom="${d}">
        ${count > 0 ? `<span class="cnt-badge">×${count}</span>` : ''}
        <div class="v">${d}</div>
        <div class="c">${isCoin ? 'เหรียญ' : 'แบงก์'}</div>
      </div>`;
    }).join('');
    host.querySelectorAll('.denom-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = Number(btn.getAttribute('data-denom'));
        exactMode = false;
        denomCounts[d] = (denomCounts[d] || 0) + 1;
        renderDenomGrid();
        updateChangeDisplay();
      });
      // long-press / double-click to decrement one unit
      let pressTimer;
      btn.addEventListener('touchstart', () => { pressTimer = setTimeout(() => decDenom(Number(btn.getAttribute('data-denom'))), 500); });
      btn.addEventListener('touchend', () => clearTimeout(pressTimer));
      btn.addEventListener('contextmenu', (e) => { e.preventDefault(); decDenom(Number(btn.getAttribute('data-denom'))); });
    });
  }

  function decDenom(d) {
    if (!denomCounts[d]) return;
    denomCounts[d] -= 1;
    if (denomCounts[d] <= 0) delete denomCounts[d];
    renderDenomGrid();
    updateChangeDisplay();
  }

  function receivedAmount() {
    if (exactMode) return total;
    return Object.entries(denomCounts).reduce((sum, [d, c]) => sum + Number(d) * c, 0);
  }

  function updateChangeDisplay() {
    const received = receivedAmount();
    const change = received - total;
    const disp = document.getElementById('change-display');
    const amtEl = document.getElementById('change-amt');
    const lblEl = disp.querySelector('.lbl');
    const breakdownEl = document.getElementById('change-breakdown');

    if (received < total) {
      disp.classList.add('insufficient');
      lblEl.textContent = 'รับเงินไม่พอ ขาดอีก';
      amtEl.textContent = Utils.money(total - received);
      breakdownEl.textContent = '';
    } else {
      disp.classList.remove('insufficient');
      lblEl.textContent = 'เงินทอน';
      amtEl.textContent = Utils.money(change);
      if (change > 0) {
        const parts = Utils.breakdownChange(change);
        breakdownEl.textContent = 'แนะนำทอน: ' + parts.map(p => `${p.denom}×${p.count}`).join('  ');
      } else {
        breakdownEl.textContent = 'รับเงินพอดี ไม่ต้องทอน';
      }
    }
    updateConfirmState();
  }

  function updateConfirmState() {
    const btn = document.getElementById('btn-confirm-sale');
    if (paymentMethod === 'cash') {
      btn.disabled = receivedAmount() < total;
    } else {
      btn.disabled = false;
    }
  }

  async function handleSlipFile(file) {
    if (!file) return;
    try {
      const dataUrl = await Utils.compressImageFile(file, 1000, 0.7);
      slipPhoto = dataUrl;
      document.getElementById('slip-preview').src = dataUrl;
    } catch (e) {
      Utils.toast('ไม่สามารถอ่านรูปสลิปได้', 'danger');
    }
  }

  async function confirmSale() {
    if (cartRef.length === 0) { Utils.toast('ตะกร้าว่างเปล่า', 'danger'); return; }
    const received = paymentMethod === 'cash' ? receivedAmount() : total;
    if (paymentMethod === 'cash' && received < total) { Utils.toast('รับเงินไม่พอ', 'danger'); return; }

    Utils.showLoading();
    try {
      const items = cartRef.map(l => ({
        productId: l.productId, name: l.name, unit: l.unit, qty: l.qty,
        priceType: l.priceType, unitPrice: l.unitPrice, subtotal: l.unitPrice * l.qty
      }));
      const sale = {
        datetime: new Date().toISOString(),
        items,
        totalAmount: total,
        paymentMethod,
        received: paymentMethod === 'cash' ? received : total,
        change: paymentMethod === 'cash' ? (received - total) : 0,
        changeBreakdown: paymentMethod === 'cash' ? Object.assign({}, denomCounts) : null,
        slipPhoto: paymentMethod === 'transfer' ? slipPhoto : null,
        note: document.getElementById('checkout-note').value.trim()
      };
      const id = await DB.addSale(sale);
      sale.id = id;

      for (const it of items) {
        await DB.adjustStock(it.productId, -it.qty);
      }

      lastSale = sale;
      POS.clearCartAfterSale();
      Utils.closeSheet('checkout-sheet-overlay');
      await Products.refresh();
      document.dispatchEvent(new CustomEvent('products:changed'));
      document.dispatchEvent(new CustomEvent('sales:changed'));

      const itemCount = items.reduce((s, i) => s + i.qty, 0);
      document.getElementById('sale-done-summary').textContent =
        `${itemCount} รายการ · ยอดรวม ${Utils.money(total)}` +
        (paymentMethod === 'cash' ? ` · ทอน ${Utils.money(sale.change)}` : ' · ชำระโดยการโอน');
      Utils.openModal('sale-done-modal');
    } catch (err) {
      console.error(err);
      Utils.toast('บันทึกการขายไม่สำเร็จ: ' + err.message, 'danger');
    } finally {
      Utils.hideLoading();
    }
  }

  function printReceipt() {
    if (!lastSale) return;
    Reports.printReceipt(lastSale);
  }

  function bindEvents() {
    document.getElementById('pay-method-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-pay]');
      if (!btn) return;
      paymentMethod = btn.getAttribute('data-pay');
      document.querySelectorAll('#pay-method-toggle button').forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('cash-pay-block').style.display = paymentMethod === 'cash' ? 'block' : 'none';
      document.getElementById('transfer-pay-block').style.display = paymentMethod === 'transfer' ? 'block' : 'none';
      updateConfirmState();
    });

    document.getElementById('btn-exact-pay').addEventListener('click', () => {
      exactMode = true;
      denomCounts = {};
      renderDenomGrid();
      updateChangeDisplay();
    });
    document.getElementById('btn-clear-denom').addEventListener('click', () => {
      exactMode = false;
      denomCounts = {};
      renderDenomGrid();
      updateChangeDisplay();
    });

    document.getElementById('slip-file').addEventListener('change', (e) => handleSlipFile(e.target.files[0]));
    document.getElementById('slip-clear').addEventListener('click', () => {
      slipPhoto = null;
      document.getElementById('slip-preview').src = Utils.placeholderImg;
    });
    document.getElementById('slip-save-gallery').addEventListener('click', () => {
      if (!slipPhoto) { Utils.toast('ยังไม่มีรูปสลิป', 'danger'); return; }
      Utils.saveImageToDevice(slipPhoto, 'สลิป-' + Date.now() + '.jpg');
    });

    document.getElementById('btn-confirm-sale').addEventListener('click', confirmSale);
    document.getElementById('btn-sale-done-close').addEventListener('click', () => Utils.closeModal('sale-done-modal'));
    document.getElementById('btn-print-receipt').addEventListener('click', printReceipt);
  }

  document.addEventListener('DOMContentLoaded', bindEvents);

  window.Checkout = { open };
})();
