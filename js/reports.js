/* =========================================================
   reports.js — Stats, PDF/Excel export, LINE text, receipt print
   ========================================================= */
(function () {
  let rangeMode = 'today';
  let currentSales = [];
  let fontRegistered = false;

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
    return {
      from: document.getElementById('report-date-from').value || today,
      to: document.getElementById('report-date-to').value || today
    };
  }

  async function loadAndRender() {
    const { from, to } = computeRange(rangeMode);
    const sales = (await DB.getSalesInRange(Utils.startOfDayISO(from), Utils.endOfDayISO(to))).filter(s => !s.voided);
    currentSales = sales;
    renderStats(sales);
    renderTopProducts(sales);
  }

  function renderStats(sales) {
    const total = sales.reduce((s, x) => s + x.totalAmount, 0);
    let staffTotal = 0, touristTotal = 0;
    for (const s of sales) for (const it of s.items) {
      if (it.priceType === 'staff') staffTotal += it.subtotal; else touristTotal += it.subtotal;
    }
    document.getElementById('rep-total').textContent = Utils.money(total);
    document.getElementById('rep-count').textContent = sales.length;
    document.getElementById('rep-staff').textContent = Utils.money(staffTotal);
    document.getElementById('rep-tourist').textContent = Utils.money(touristTotal);
  }

  function aggregateProducts(sales) {
    const map = {};
    for (const s of sales) for (const it of s.items) {
      if (!map[it.name]) map[it.name] = { name: it.name, qty: 0, revenue: 0, unit: it.unit };
      map[it.name].qty += it.qty;
      map[it.name].revenue += it.subtotal;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }

  function renderTopProducts(sales) {
    const top = aggregateProducts(sales).slice(0, 5);
    const host = document.getElementById('rep-top-products');
    if (top.length === 0) {
      host.innerHTML = '<p class="hint">ยังไม่มีข้อมูลการขายในช่วงเวลานี้</p>';
      return;
    }
    host.innerHTML = top.map((p, i) => `
      <div class="list-row">
        <div class="avatar" style="background:var(--forest-700);color:#fff;font-family:var(--font-display);font-weight:700;">${i + 1}</div>
        <div class="main">
          <div class="title">${Utils.escapeHtml(p.name)}</div>
          <div class="sub">ขายแล้ว ${p.qty} ${Utils.escapeHtml(p.unit || '')}</div>
        </div>
        <div class="trail">${Utils.money(p.revenue)}</div>
      </div>`).join('');
  }

  // ---------------- Thai font registration for jsPDF ----------------
  function ensureThaiFont(doc) {
    if (!fontRegistered) {
      doc.addFileToVFS('Sarabun-Regular.ttf', window.__SARABUN_REGULAR_B64__);
      doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
      doc.addFileToVFS('Sarabun-Bold.ttf', window.__SARABUN_BOLD_B64__);
      doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');
      fontRegistered = true;
    } else {
      // font VFS persists on the jsPDF prototype across instances in this build,
      // but re-adding is cheap/safe if a fresh doc doesn't have it.
      try {
        doc.addFileToVFS('Sarabun-Regular.ttf', window.__SARABUN_REGULAR_B64__);
        doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
        doc.addFileToVFS('Sarabun-Bold.ttf', window.__SARABUN_BOLD_B64__);
        doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');
      } catch (e) {}
    }
    doc.setFont('Sarabun', 'normal');
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function getShopInfo() {
    const name = await DB.getSetting('shopName', 'ร้านสวัสดิการอุทยานแห่งชาติ');
    const address = await DB.getSetting('shopAddress', '');
    const logo = await DB.getSetting('shopLogo', null);
    return { name, address, logo };
  }

  // ---------------- Slip + bill-details composite image ----------------
  // Draws bill details on top and the transfer-slip photo below it into a
  // single tall PNG — useful for sending/keeping as one proof-of-payment image.
  async function buildSlipComposite(sale) {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const shop = await getShopInfo();
    const img = await loadImage(sale.slipPhoto);
    const W = 720, PAD = 28, ITEM_H = 26;
    const imgH = Math.round(img.height * ((W - PAD * 2) / img.width));

    const blocks = [];
    blocks.push({ h: 34, draw: (ctx, y) => { ctx.font = '700 22px Sarabun, sans-serif'; ctx.fillStyle = '#143D27'; ctx.fillText(shop.name, PAD, y + 22); } });
    blocks.push({ h: 26, draw: (ctx, y) => { ctx.font = '400 15px Sarabun, sans-serif'; ctx.fillStyle = '#3A473E'; ctx.fillText(`บิลเลขที่ ${sale.id} · ${Utils.formatDateTimeThai(sale.datetime)}`, PAD, y + 14); } });
    blocks.push({ h: 20, draw: (ctx, y) => { ctx.strokeStyle = '#E4DECE'; ctx.beginPath(); ctx.moveTo(PAD, y + 8); ctx.lineTo(W - PAD, y + 8); ctx.stroke(); } });
    for (const it of sale.items) {
      blocks.push({ h: ITEM_H, draw: (ctx, y) => {
        ctx.font = '400 16px Sarabun, sans-serif'; ctx.fillStyle = '#17211B';
        ctx.textAlign = 'left'; ctx.fillText(`${it.name} × ${it.qty}`, PAD, y + 18);
        ctx.textAlign = 'right'; ctx.fillText(Utils.moneyPlain(it.subtotal), W - PAD, y + 18);
        ctx.textAlign = 'left';
      }});
    }
    blocks.push({ h: 20, draw: (ctx, y) => { ctx.strokeStyle = '#E4DECE'; ctx.beginPath(); ctx.moveTo(PAD, y + 8); ctx.lineTo(W - PAD, y + 8); ctx.stroke(); } });
    blocks.push({ h: 36, draw: (ctx, y) => {
      ctx.font = '700 22px Sarabun, sans-serif'; ctx.fillStyle = '#143D27';
      ctx.textAlign = 'left'; ctx.fillText('ยอดรวม', PAD, y + 24);
      ctx.textAlign = 'right'; ctx.fillText(Utils.moneyPlain(sale.totalAmount) + ' บาท', W - PAD, y + 24);
      ctx.textAlign = 'left';
    }});
    if (sale.note) {
      blocks.push({ h: 24, draw: (ctx, y) => { ctx.font = '400 14px Sarabun, sans-serif'; ctx.fillStyle = '#6B7A70'; ctx.fillText('หมายเหตุ: ' + sale.note, PAD, y + 16); } });
    }
    blocks.push({ h: 30, draw: (ctx, y) => { ctx.font = '600 16px Sarabun, sans-serif'; ctx.fillStyle = '#143D27'; ctx.fillText('หลักฐานการโอนเงิน', PAD, y + 20); } });

    const headerH = blocks.reduce((s, b) => s + b.h, 0) + PAD;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = headerH + imgH + PAD;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FBF8F0'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let cy = PAD;
    for (const b of blocks) { b.draw(ctx, cy); cy += b.h; }
    ctx.drawImage(img, PAD, cy, W - PAD * 2, imgH);
    return canvas.toDataURL('image/png');
  }

  // ---------------- PDF export ----------------
  async function exportPDF() {
    if (currentSales.length === 0) {
      const ok = await Utils.confirmDialog('ไม่มีข้อมูลการขาย', 'ช่วงเวลาที่เลือกยังไม่มีรายการขาย ต้องการสร้าง PDF เปล่าหรือไม่?', 'สร้างต่อ');
      if (!ok) return;
    }
    Utils.showLoading();
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      ensureThaiFont(doc);

      const shop = await getShopInfo();
      const { from, to } = computeRange(rangeMode);
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 40;

      if (shop.logo) {
        try { doc.addImage(shop.logo, 'JPEG', 40, y - 10, 40, 40); } catch (e) {}
      }
      doc.setFont('Sarabun', 'bold'); doc.setFontSize(16);
      doc.text(shop.name, shop.logo ? 90 : 40, y + 10);
      doc.setFont('Sarabun', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
      if (shop.address) doc.text(shop.address, shop.logo ? 90 : 40, y + 26);
      doc.setTextColor(0);

      y += 55;
      doc.setFont('Sarabun', 'bold'); doc.setFontSize(13);
      doc.text('รายงานสรุปยอดขาย', 40, y);
      doc.setFont('Sarabun', 'normal'); doc.setFontSize(10);
      doc.text(`ช่วงวันที่ ${Utils.formatDateThai(from + 'T00:00:00')} — ${Utils.formatDateThai(to + 'T00:00:00')}`, 40, y + 16);
      doc.text(`สร้างรายงานเมื่อ ${Utils.formatDateTimeThai(new Date().toISOString())}`, 40, y + 30);

      y += 46;
      const total = currentSales.reduce((s, x) => s + x.totalAmount, 0);
      let staffTotal = 0, touristTotal = 0, cashTotal = 0, transferTotal = 0;
      for (const s of currentSales) {
        if (s.paymentMethod === 'cash') cashTotal += s.totalAmount; else transferTotal += s.totalAmount;
        for (const it of s.items) { if (it.priceType === 'staff') staffTotal += it.subtotal; else touristTotal += it.subtotal; }
      }

      doc.setFillColor(20, 61, 39);
      doc.roundedRect(40, y, pageWidth - 80, 54, 6, 6, 'F');
      doc.setTextColor(255); doc.setFont('Sarabun', 'bold'); doc.setFontSize(11);
      doc.text('ยอดขายรวมทั้งหมด', 54, y + 20);
      doc.setFontSize(18);
      doc.text(Utils.money(total), 54, y + 42);
      doc.setFont('Sarabun', 'normal'); doc.setFontSize(9);
      doc.text(`${currentSales.length} บิล`, pageWidth - 150, y + 20);
      doc.text(`เงินสด ${Utils.money(cashTotal)}  ·  โอน ${Utils.money(transferTotal)}`, pageWidth - 260, y + 42, { maxWidth: 210 });
      doc.setTextColor(0);

      y += 72;
      doc.setFont('Sarabun', 'normal'); doc.setFontSize(10);
      doc.text(`ราคาเจ้าหน้าที่: ${Utils.money(staffTotal)}    ราคานักท่องเที่ยว: ${Utils.money(touristTotal)}`, 40, y);
      y += 18;

      // Sales table
      const body = currentSales.map((s, i) => {
        const itemCount = s.items.reduce((a, it) => a + it.qty, 0);
        return [
          i + 1,
          Utils.formatDateThai(s.datetime) + '\n' + Utils.formatTime(s.datetime) + ' น.',
          itemCount,
          s.paymentMethod === 'cash' ? 'เงินสด' : 'โอนเงิน',
          Utils.moneyPlain(s.totalAmount)
        ];
      });

      doc.autoTable({
        startY: y,
        head: [['#', 'วันเวลา', 'จำนวนรายการ', 'ชำระโดย', 'ยอดรวม (บาท)']],
        body,
        styles: { font: 'Sarabun', fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [30, 86, 49], textColor: 255, font: 'Sarabun', fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 246, 236] },
        columnStyles: { 0: { cellWidth: 26 }, 4: { halign: 'right' } },
        margin: { left: 40, right: 40 }
      });

      // Top products on a new page (or continue)
      let afterTableY = doc.lastAutoTable.finalY + 24;
      const top = aggregateProducts(currentSales);
      if (top.length > 0) {
        if (afterTableY > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); afterTableY = 40; }
        doc.setFont('Sarabun', 'bold'); doc.setFontSize(12);
        doc.text('สินค้าขายดี', 40, afterTableY);
        doc.autoTable({
          startY: afterTableY + 10,
          head: [['สินค้า', 'จำนวนที่ขาย', 'ยอดขาย (บาท)']],
          body: top.slice(0, 15).map(p => [p.name, p.qty + ' ' + (p.unit || ''), Utils.moneyPlain(p.revenue)]),
          styles: { font: 'Sarabun', fontSize: 9, cellPadding: 5 },
          headStyles: { fillColor: [224, 158, 62], textColor: [23, 33, 27], font: 'Sarabun', fontStyle: 'bold' },
          columnStyles: { 2: { halign: 'right' } },
          margin: { left: 40, right: 40 }
        });
      }

      const slipSales = currentSales.filter(s => s.paymentMethod === 'transfer' && s.slipPhoto);
      for (const s of slipSales) {
        doc.addPage();
        let py = 40;
        doc.setFont('Sarabun', 'bold'); doc.setFontSize(13);
        doc.text(`หลักฐานการโอนเงิน — บิลเลขที่ ${s.id}`, 40, py);
        doc.setFont('Sarabun', 'normal'); doc.setFontSize(10);
        py += 18;
        doc.text(Utils.formatDateTimeThai(s.datetime), 40, py);
        py += 16;
        for (const it of s.items) {
          doc.text(`${it.name} × ${it.qty} = ${Utils.moneyPlain(it.subtotal)} บาท`, 40, py);
          py += 14;
        }
        doc.setFont('Sarabun', 'bold');
        doc.text(`ยอดรวม ${Utils.moneyPlain(s.totalAmount)} บาท`, 40, py + 4);
        py += 26;
        try {
          const img = await loadImage(s.slipPhoto);
          const maxW = pageWidth - 80;
          const maxH = doc.internal.pageSize.getHeight() - py - 40;
          let w = maxW, h = w * (img.height / img.width);
          if (h > maxH) { h = maxH; w = h * (img.width / img.height); }
          doc.addImage(s.slipPhoto, 'JPEG', 40, py, w, h);
        } catch (e) { /* skip image if it fails to load */ }
      }

      const filename = `รายงานยอดขาย_${from}_ถึง_${to}.pdf`;
      doc.save(filename);
      Utils.toast('สร้างรายงาน PDF สำเร็จ' + (slipSales.length ? ` (แนบสลิป ${slipSales.length} ใบ)` : ''), 'success');
    } catch (err) {
      console.error(err);
      Utils.toast('สร้าง PDF ไม่สำเร็จ: ' + err.message, 'danger');
    } finally {
      Utils.hideLoading();
    }
  }

  // ---------------- Excel export ----------------
  async function exportExcel() {
    if (currentSales.length === 0) {
      const ok = await Utils.confirmDialog('ไม่มีข้อมูลการขาย', 'ช่วงเวลาที่เลือกยังไม่มีรายการขาย ต้องการสร้างไฟล์เปล่าหรือไม่?', 'สร้างต่อ');
      if (!ok) return;
    }
    Utils.showLoading();
    try {
      const { from, to } = computeRange(rangeMode);
      const rows = [];
      for (const s of currentSales) {
        for (const it of s.items) {
          rows.push({
            'วันที่': s.datetime.slice(0, 10),
            'เวลา': Utils.formatTime(s.datetime),
            'เลขที่บิล': s.id,
            'ชื่อสินค้า': it.name,
            'จำนวน': it.qty,
            'หน่วย': it.unit || '',
            'ประเภทราคา': it.priceType === 'staff' ? 'เจ้าหน้าที่' : 'นักท่องเที่ยว',
            'ราคาต่อหน่วย': it.unitPrice,
            'ยอดรวมรายการ': it.subtotal,
            'ช่องทางชำระ': s.paymentMethod === 'cash' ? 'เงินสด' : 'โอนเงิน',
            'ยอดรวมทั้งบิล': s.totalAmount,
            'หมายเหตุ': s.note || ''
          });
        }
      }
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 11 }, { wch: 7 }, { wch: 9 }, { wch: 28 }, { wch: 7 }, { wch: 8 }, { wch: 13 }, { wch: 11 }, { wch: 13 }, { wch: 11 }, { wch: 13 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, ws, 'รายการขาย');

      // Summary sheet
      const total = currentSales.reduce((s, x) => s + x.totalAmount, 0);
      const summaryRows = [
        { 'รายการ': 'ช่วงวันที่', 'ค่า': `${from} ถึง ${to}` },
        { 'รายการ': 'จำนวนบิล', 'ค่า': currentSales.length },
        { 'รายการ': 'ยอดขายรวม', 'ค่า': total },
      ];
      const top = aggregateProducts(currentSales);
      const wsSum = XLSX.utils.json_to_sheet(summaryRows.concat([{}], top.map(p => ({ 'รายการ': p.name, 'ค่า': p.revenue, 'จำนวนที่ขาย': p.qty }))));
      wsSum['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsSum, 'สรุป');

      XLSX.writeFile(wb, `ตารางขาย_${from}_ถึง_${to}.xlsx`);
      Utils.toast('ส่งออกไฟล์ Excel สำเร็จ', 'success');
    } catch (err) {
      console.error(err);
      Utils.toast('ส่งออก Excel ไม่สำเร็จ: ' + err.message, 'danger');
    } finally {
      Utils.hideLoading();
    }
  }

  // ---------------- LINE text copy ----------------
  async function copyLineText() {
    const { from, to } = computeRange(rangeMode);
    const shop = await getShopInfo();
    const total = currentSales.reduce((s, x) => s + x.totalAmount, 0);
    let cashTotal = 0, transferTotal = 0;
    for (const s of currentSales) { if (s.paymentMethod === 'cash') cashTotal += s.totalAmount; else transferTotal += s.totalAmount; }
    const top = aggregateProducts(currentSales).slice(0, 5);

    let text = `📋 สรุปยอดขาย — ${shop.name}\n`;
    text += `🗓️ ${Utils.formatDateThai(from + 'T00:00:00')} - ${Utils.formatDateThai(to + 'T00:00:00')}\n`;
    text += `——————————\n`;
    text += `💰 ยอดขายรวม: ${Utils.money(total)}\n`;
    text += `🧾 จำนวนบิล: ${currentSales.length} บิล\n`;
    text += `💵 เงินสด: ${Utils.money(cashTotal)}\n`;
    text += `🔁 โอนเงิน: ${Utils.money(transferTotal)}\n`;
    if (top.length) {
      text += `——————————\n🏆 สินค้าขายดี\n`;
      top.forEach((p, i) => { text += `${i + 1}. ${p.name} — ${p.qty} ${p.unit || ''} (${Utils.money(p.revenue)})\n`; });
    }
    text += `——————————\nสร้างโดยระบบ POS ร้าน (ออฟไลน์)`;

    try {
      await navigator.clipboard.writeText(text);
      Utils.toast('คัดลอกสรุปยอดขายแล้ว วางในแชท LINE ได้เลย', 'success');
    } catch (e) {
      // fallback for browsers without Clipboard API permission
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); Utils.toast('คัดลอกสรุปยอดขายแล้ว', 'success'); }
      catch (e2) { Utils.toast('คัดลอกไม่สำเร็จ กรุณาลองใหม่', 'danger'); }
      document.body.removeChild(ta);
    }
  }

  // ---------------- Receipt printing (uses browser print, not PDF) ----------------
  async function printReceipt(sale) {
    const shop = await getShopInfo();
    const itemsHtml = sale.items.map(it =>
      `<div style="display:flex;justify-content:space-between;font-size:12px;margin:2px 0;">
        <span>${Utils.escapeHtml(it.name)} x${it.qty}</span>
        <span>${Utils.moneyPlain(it.subtotal)}</span>
      </div>`).join('');

    const payHtml = sale.paymentMethod === 'cash'
      ? `<div style="display:flex;justify-content:space-between;font-size:12px;"><span>รับเงิน</span><span>${Utils.moneyPlain(sale.received)}</span></div>
         <div style="display:flex;justify-content:space-between;font-size:12px;"><span>เงินทอน</span><span>${Utils.moneyPlain(sale.change)}</span></div>`
      : `<div style="font-size:12px;">ชำระโดยการโอนเงิน</div>`;

    document.getElementById('print-area').innerHTML = `
      <div style="width:280px;margin:0 auto;font-family:'Sarabun',sans-serif;padding:10px;">
        <div style="text-align:center;font-weight:700;font-size:15px;">${Utils.escapeHtml(shop.name)}</div>
        ${shop.address ? `<div style="text-align:center;font-size:11px;">${Utils.escapeHtml(shop.address)}</div>` : ''}
        <div style="text-align:center;font-size:11px;margin:4px 0 8px;">${Utils.formatDateTimeThai(sale.datetime)}</div>
        <div style="border-top:1px dashed #000;margin:6px 0;"></div>
        ${itemsHtml}
        <div style="border-top:1px dashed #000;margin:6px 0;"></div>
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:13px;"><span>ยอดรวม</span><span>${Utils.moneyPlain(sale.totalAmount)}</span></div>
        ${payHtml}
        <div style="text-align:center;font-size:11px;margin-top:10px;">ขอบคุณที่อุดหนุนครับ/ค่ะ</div>
      </div>`;
    window.print();
  }

  function bindEvents() {
    document.querySelectorAll('#screen-reports .chip[data-rrange]').forEach(chip => {
      chip.addEventListener('click', () => {
        rangeMode = chip.getAttribute('data-rrange');
        document.querySelectorAll('#screen-reports .chip[data-rrange]').forEach(c => c.classList.toggle('active', c === chip));
        document.getElementById('report-custom-range').style.display = rangeMode === 'custom' ? 'flex' : 'none';
        if (rangeMode === 'custom') {
          const today = Utils.todayISO();
          if (!document.getElementById('report-date-from').value) document.getElementById('report-date-from').value = today;
          if (!document.getElementById('report-date-to').value) document.getElementById('report-date-to').value = today;
        }
        loadAndRender();
      });
    });
    document.getElementById('report-date-from').addEventListener('change', loadAndRender);
    document.getElementById('report-date-to').addEventListener('change', loadAndRender);
    document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);
    document.getElementById('btn-export-excel').addEventListener('click', exportExcel);
    document.getElementById('btn-copy-line').addEventListener('click', copyLineText);
    document.addEventListener('sales:changed', () => { if (isVisible()) loadAndRender(); });
  }

  function isVisible() {
    return document.getElementById('screen-reports').classList.contains('active');
  }

  document.addEventListener('DOMContentLoaded', bindEvents);

  window.Reports = { refresh: loadAndRender, printReceipt, buildSlipComposite };
})();
