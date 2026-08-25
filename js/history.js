/* =========================================================
   history.js — Sales history screen
   ========================================================= */
(function () {
  let currentSales = [];
  let openSaleId = null;
  let openSale = null;
  let openSaleComposite = null;

  function computeRange(mode) {
    const today = Utils.todayISO();
    if (mode === 'today') return { from: today, to: today };
    if (mode === 'week') {
      const d = new Date(); d.setDate(d.getDate() - 6);
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    if (mode === 'month') {
      const d = new Date(); const first = new Date(d.getFullYear(), d.getMonth(), 1);
      return { from: first.toISOString().slice(0, 10), to: today };
    }
    return { from: '2000-01-01', to: '2100-01-01' };
  }

  async function loadAndRender() {
    const from = document.getElementById('hist-date-from').value;
    const to = document.getElementById('hist-date-to').value;
    const sales = await DB.getSalesInRange(Utils.startOfDayISO(from), Utils.endOfDayISO(to));
    currentSales = sales;
    renderSummary(sales);
    renderList(sales);
  }

  function renderSummary(sales) {
    const valid = sales.filter(s => !s.voided);
    const total = valid.reduce((s, x) => s + x.totalAmount, 0);
    document.getElementById('hist-sum-total').textContent = Utils.money(total);
    document.getElementById('hist-sum-count').textContent = valid.length;
  }

  function renderList(sales) {
    const host = document.getElementById('hist-list');
    document.getElementById('hist-empty').style.display = sales.length === 0 ? 'block' : 'none';
    if (sales.length === 0) { host.innerHTML = ''; return; }

    // group by date
    const groups = {};
    for (const s of sales) {
      const key = s.datetime.slice(0, 10);
      (groups[key] = groups[key] || []).push(s);
    }
    const dateKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    host.innerHTML = dateKeys.map(dk => {
      const rows = groups[dk].map(s => {
        const itemCount = s.items.reduce((a, i) => a + i.qty, 0);
        const payIcon = s.paymentMethod === 'cash'
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3l4 4-4 4M21 7H9M7 21l-4-4 4-4M3 17h12"/></svg>';
        return `
        <div class="list-row" data-id="${s.id}" style="${s.voided ? 'opacity:.5;' : ''}">
          <div class="avatar">${payIcon}</div>
          <div class="main">
            <div class="title">${Utils.formatTime(s.datetime)} น. · ${itemCount} รายการ ${s.voided ? '<span class=\"badge badge-void\">ยกเลิกแล้ว</span>' : ''}</div>
            <div class="sub">${s.paymentMethod === 'cash' ? 'เงินสด' : 'โอนเงิน'}${s.note ? ' · ' + Utils.escapeHtml(s.note) : ''}</div>
          </div>
          <div class="trail">${Utils.money(s.totalAmount)}</div>
        </div>`;
      }).join('');
      return `<div class="date-group-label">${Utils.formatDateThai(dk + 'T00:00:00')}</div>${rows}`;
    }).join('');

    host.querySelectorAll('.list-row').forEach(row => {
      row.addEventListener('click', () => openDetail(Number(row.getAttribute('data-id'))));
    });
  }

  async function openDetail(id) {
    const sale = await DB.getSale(id);
    if (!sale) return;
    openSaleId = id;
    openSale = sale;
    openSaleComposite = null;
    const body = document.getElementById('sale-detail-body');

    const itemsHtml = sale.items.map(it => `
      <div class="cart-line">
        <div class="info">
          <div class="name">${Utils.escapeHtml(it.name)}</div>
          <div class="meta">${it.qty} ${Utils.escapeHtml(it.unit || '')} × ${Utils.money(it.unitPrice)}
            <span class="badge ${it.priceType === 'staff' ? 'badge-staff' : 'badge-tourist'}">${it.priceType === 'staff' ? 'จนท.' : 'นทท.'}</span>
          </div>
        </div>
        <div class="linetotal">${Utils.money(it.subtotal)}</div>
      </div>`).join('');

    const payBlock = sale.paymentMethod === 'cash'
      ? `<div class="summary-row"><span>รับเงินมา</span><span>${Utils.money(sale.received)}</span></div>
         <div class="summary-row"><span>เงินทอน</span><span>${Utils.money(sale.change)}</span></div>`
      : `<div class="summary-row"><span>ชำระโดย</span><span>โอนเงิน / พร้อมเพย์</span></div>
         <div id="slip-detail-area" class="mt-8"><p class="hint">กำลังโหลดภาพ...</p></div>
         <label class="btn btn-ghost btn-block btn-sm mt-8">แนบ/เปลี่ยนรูปสลิป
           <input type="file" accept="image/*" id="sale-detail-slip-file" style="display:none;">
         </label>`;

    body.innerHTML = `
      <div class="hint mt-8">${Utils.formatDateTimeThai(sale.datetime)}${sale.voided ? ' <span class="badge badge-void">ยกเลิกแล้ว</span>' : ''}</div>
      <div class="divider"></div>
      ${itemsHtml}
      <div class="divider"></div>
      <div class="summary-row total"><span>ยอดรวม</span><span>${Utils.money(sale.totalAmount)}</span></div>
      ${payBlock}
      ${sale.note ? `<div class="hint mt-8">หมายเหตุ: ${Utils.escapeHtml(sale.note)}</div>` : ''}
    `;

    if (sale.paymentMethod === 'transfer') {
      const fileInput = document.getElementById('sale-detail-slip-file');
      if (fileInput) fileInput.addEventListener('change', (e) => handleRetroSlip(e.target.files[0]));
      const area = document.getElementById('slip-detail-area');
      if (sale.slipPhoto) {
        try {
          openSaleComposite = await Reports.buildSlipComposite(sale);
          area.innerHTML = `<img src="${openSaleComposite}" style="width:100%;border-radius:12px;" alt="สลิปพร้อมรายละเอียดบิล"><p class="hint text-center mt-8">กดค้างที่รูปเพื่อบันทึกลงอัลบั้ม</p>`;
        } catch (e) {
          area.innerHTML = `<img src="${sale.slipPhoto}" style="width:100%;border-radius:12px;" alt="สลิป">`;
        }
      } else {
        area.innerHTML = `<p class="hint">ยังไม่มีภาพสลิปแนบ — แนบย้อนหลังได้ที่ปุ่มด้านล่าง</p>`;
      }
    }

    const voidBtn = document.getElementById('btn-void-sale');
    voidBtn.style.display = sale.voided ? 'none' : 'block';
    document.getElementById('btn-download-slip').style.display =
      (sale.paymentMethod === 'transfer' && sale.slipPhoto) ? 'block' : 'none';
    Utils.openSheet('sale-detail-overlay');
  }

  async function handleRetroSlip(file) {
    if (!file || !openSale) return;
    Utils.showLoading();
    try {
      const dataUrl = await Utils.compressImageFile(file, 1000, 0.7);
      openSale.slipPhoto = dataUrl;
      await DB.updateSale(openSale);
      Utils.toast('แนบรูปสลิปแล้ว', 'success');
      await openDetail(openSale.id);
    } catch (e) {
      Utils.toast('แนบรูปไม่สำเร็จ: ' + e.message, 'danger');
    } finally {
      Utils.hideLoading();
    }
  }

  async function voidSale() {
    if (!openSaleId) return;
    const ok = await Utils.confirmDialog('ยกเลิกรายการขายนี้?', 'สต๊อกสินค้าในรายการนี้จะถูกคืนกลับเข้าคลังทั้งหมด', 'ยกเลิกรายการ');
    if (!ok) return;
    Utils.showLoading();
    try {
      const sale = await DB.getSale(openSaleId);
      sale.voided = true;
      await DB.updateSale(sale);
      for (const it of sale.items) {
        if (!it.unlimitedStock) await DB.adjustStock(it.productId, it.qty);
      }
      Utils.toast('ยกเลิกรายการขายแล้ว คืนสต๊อกเรียบร้อย', 'success');
      Utils.closeSheet('sale-detail-overlay');
      await Products.refresh();
      document.dispatchEvent(new CustomEvent('products:changed'));
      await loadAndRender();
    } finally {
      Utils.hideLoading();
    }
  }

  function setRangeChip(mode) {
    document.querySelectorAll('#screen-history .chip[data-range]').forEach(c => c.classList.toggle('active', c.getAttribute('data-range') === mode));
    const { from, to } = computeRange(mode);
    document.getElementById('hist-date-from').value = from;
    document.getElementById('hist-date-to').value = to;
    loadAndRender();
  }

  function bindEvents() {
    document.querySelectorAll('#screen-history .chip[data-range]').forEach(chip => {
      chip.addEventListener('click', () => setRangeChip(chip.getAttribute('data-range')));
    });
    document.getElementById('hist-date-from').addEventListener('change', () => {
      document.querySelectorAll('#screen-history .chip[data-range]').forEach(c => c.classList.remove('active'));
      loadAndRender();
    });
    document.getElementById('hist-date-to').addEventListener('change', () => {
      document.querySelectorAll('#screen-history .chip[data-range]').forEach(c => c.classList.remove('active'));
      loadAndRender();
    });
    document.getElementById('btn-void-sale').addEventListener('click', voidSale);
    document.getElementById('btn-download-slip').addEventListener('click', async () => {
      if (!openSale) return;
      if (openSaleComposite) {
        Utils.saveImageToDevice(openSaleComposite, `สลิป-บิล${openSale.id}.png`);
        return;
      }
      Utils.showLoading();
      try {
        const dataUrl = await Reports.buildSlipComposite(openSale);
        Utils.saveImageToDevice(dataUrl, `สลิป-บิล${openSale.id}.png`);
      } catch (e) {
        Utils.toast('สร้างภาพไม่สำเร็จ: ' + e.message, 'danger');
      } finally {
        Utils.hideLoading();
      }
    });
    document.addEventListener('sales:changed', () => { if (isVisible()) loadAndRender(); });
  }

  function isVisible() {
    return document.getElementById('screen-history').classList.contains('active');
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    setRangeChip('today');
  });

  window.History = { refresh: loadAndRender };
})();
