/* =========================================================
   products.js — Inventory screen (CRUD + photos + barcode)
   ========================================================= */
(function () {
  let allProducts = [];
  let activeCategory = 'all';
  let searchTerm = '';
  let lowOnly = false;
  let pendingPhoto = null; // dataURL staged before save
  let editingId = null;

  const LOW_STOCK_DEFAULT = 5;
  let lowStockThreshold = LOW_STOCK_DEFAULT;

  async function refresh() {
    allProducts = await DB.getAllProducts();
    lowStockThreshold = await DB.getSetting('lowStockThreshold', LOW_STOCK_DEFAULT);
    renderCategoryChips();
    renderList();
    updateCategoryDatalist();
  }

  function getCategories() {
    const set = new Set(allProducts.map(p => (p.category || '').trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
  }

  function updateCategoryDatalist() {
    const dl = document.getElementById('category-list');
    dl.innerHTML = getCategories().map(c => `<option value="${Utils.escapeHtml(c)}">`).join('');
  }

  function renderCategoryChips() {
    const cats = getCategories();
    const host = document.getElementById('inv-category-chips');
    const chips = ['<button class="chip' + (activeCategory === 'all' ? ' active' : '') + '" data-cat="all">ทั้งหมด</button>']
      .concat(cats.map(c => `<button class="chip${activeCategory === c ? ' active' : ''}" data-cat="${Utils.escapeHtml(c)}">${Utils.escapeHtml(c)}</button>`));
    host.innerHTML = chips.join('');
    host.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.getAttribute('data-cat');
        renderCategoryChips();
        renderList();
      });
    });
  }

  function filteredProducts() {
    return allProducts.filter(p => {
      if (activeCategory !== 'all' && (p.category || '') !== activeCategory) return false;
      if (lowOnly && Number(p.stock) > lowStockThreshold) return false;
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        const hay = ((p.name || '') + ' ' + (p.barcode || '') + ' ' + (p.category || '')).toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }

  function renderList() {
    const list = filteredProducts();
    const host = document.getElementById('inv-list');
    document.getElementById('inv-count-label').textContent = `สินค้าทั้งหมด ${allProducts.length} รายการ`;
    document.getElementById('inv-empty').style.display = (allProducts.length === 0) ? 'block' : 'none';

    if (list.length === 0 && allProducts.length > 0) {
      host.innerHTML = `<div class="empty-state"><div class="t">ไม่พบสินค้าที่ค้นหา</div></div>`;
      return;
    }

    host.innerHTML = list.map(p => {
      const low = Number(p.stock) <= lowStockThreshold;
      const img = p.photo || Utils.placeholderImg;
      return `
      <div class="list-row" data-id="${p.id}">
        <img class="avatar" src="${img}" alt="">
        <div class="main">
          <div class="title">${Utils.escapeHtml(p.name)}</div>
          <div class="sub">${Utils.escapeHtml(p.category || 'ไม่มีหมวดหมู่')} · จ.น.ท ${Utils.money(p.priceStaff)} / นทท ${Utils.money(p.priceTourist)}</div>
        </div>
        <div class="trail">
          ${p.stock} ${Utils.escapeHtml(p.unit || 'ชิ้น')}
          <small>${low ? '<span class="badge badge-low">ใกล้หมด</span>' : 'คงเหลือ'}</small>
        </div>
      </div>`;
    }).join('');

    host.querySelectorAll('.list-row').forEach(row => {
      row.addEventListener('click', () => openForm(Number(row.getAttribute('data-id'))));
    });
  }

  // ---------------- Form ----------------
  function resetForm() {
    editingId = null;
    pendingPhoto = null;
    document.getElementById('pf-id').value = '';
    document.getElementById('pf-name').value = '';
    document.getElementById('pf-category').value = '';
    document.getElementById('pf-unit').value = 'ชิ้น';
    document.getElementById('pf-barcode').value = '';
    document.getElementById('pf-price-staff').value = '';
    document.getElementById('pf-price-tourist').value = '';
    document.getElementById('pf-stock').value = '0';
    document.getElementById('pf-photo-preview').src = Utils.placeholderImg;
    document.getElementById('pf-delete').style.display = 'none';
  }

  async function openForm(id) {
    resetForm();
    if (id) {
      const p = await DB.getProduct(id);
      if (!p) { Utils.toast('ไม่พบสินค้า', 'danger'); return; }
      editingId = id;
      document.getElementById('product-form-title').textContent = 'แก้ไขสินค้า';
      document.getElementById('pf-id').value = p.id;
      document.getElementById('pf-name').value = p.name || '';
      document.getElementById('pf-category').value = p.category || '';
      document.getElementById('pf-unit').value = p.unit || 'ชิ้น';
      document.getElementById('pf-barcode').value = p.barcode || '';
      document.getElementById('pf-price-staff').value = p.priceStaff ?? '';
      document.getElementById('pf-price-tourist').value = p.priceTourist ?? '';
      document.getElementById('pf-stock').value = p.stock ?? 0;
      document.getElementById('pf-photo-preview').src = p.photo || Utils.placeholderImg;
      pendingPhoto = p.photo || null;
      document.getElementById('pf-delete').style.display = 'block';
    } else {
      document.getElementById('product-form-title').textContent = 'เพิ่มสินค้า';
    }
    Utils.openModal('product-form-modal');
  }

  async function saveForm() {
    const name = document.getElementById('pf-name').value.trim();
    const priceStaff = parseFloat(document.getElementById('pf-price-staff').value);
    const priceTourist = parseFloat(document.getElementById('pf-price-tourist').value);
    const stock = parseInt(document.getElementById('pf-stock').value, 10) || 0;

    if (!name) { Utils.toast('กรุณากรอกชื่อสินค้า', 'danger'); return; }
    if (isNaN(priceStaff) || isNaN(priceTourist) || priceStaff < 0 || priceTourist < 0) {
      Utils.toast('กรุณากรอกราคาให้ถูกต้อง', 'danger'); return;
    }

    const payload = {
      name,
      category: document.getElementById('pf-category').value.trim(),
      unit: document.getElementById('pf-unit').value.trim() || 'ชิ้น',
      barcode: document.getElementById('pf-barcode').value.trim(),
      priceStaff, priceTourist, stock,
      photo: pendingPhoto || null
    };

    Utils.showLoading();
    try {
      if (editingId) {
        payload.id = editingId;
        await DB.updateProduct(payload);
        Utils.toast('บันทึกการแก้ไขแล้ว', 'success');
      } else {
        await DB.addProduct(payload);
        Utils.toast('เพิ่มสินค้าแล้ว', 'success');
      }
      Utils.closeModal('product-form-modal');
      await refresh();
      document.dispatchEvent(new CustomEvent('products:changed'));
    } catch (err) {
      console.error(err);
      Utils.toast('เกิดข้อผิดพลาด: ' + err.message, 'danger');
    } finally {
      Utils.hideLoading();
    }
  }

  async function deleteCurrent() {
    if (!editingId) return;
    const ok = await Utils.confirmDialog('ลบสินค้านี้?', 'ข้อมูลสินค้าจะถูกลบถาวร แต่ประวัติการขายเดิมจะยังอยู่', 'ลบสินค้า');
    if (!ok) return;
    Utils.showLoading();
    try {
      await DB.deleteProduct(editingId);
      Utils.toast('ลบสินค้าแล้ว', 'success');
      Utils.closeModal('product-form-modal');
      await refresh();
      document.dispatchEvent(new CustomEvent('products:changed'));
    } finally {
      Utils.hideLoading();
    }
  }

  async function handlePhotoFile(file) {
    if (!file) return;
    try {
      const dataUrl = await Utils.compressImageFile(file, 800, 0.72);
      pendingPhoto = dataUrl;
      document.getElementById('pf-photo-preview').src = dataUrl;
    } catch (e) {
      Utils.toast('ไม่สามารถอ่านรูปภาพได้', 'danger');
    }
  }

  function bindEvents() {
    document.getElementById('inv-search').addEventListener('input', Utils.debounce((e) => {
      searchTerm = e.target.value.trim();
      renderList();
    }, 200));
    document.getElementById('inv-low-only').addEventListener('change', (e) => {
      lowOnly = e.target.checked;
      renderList();
    });

    document.getElementById('pf-photo-file').addEventListener('change', (e) => handlePhotoFile(e.target.files[0]));
    document.getElementById('pf-photo-clear').addEventListener('click', () => {
      pendingPhoto = null;
      document.getElementById('pf-photo-preview').src = Utils.placeholderImg;
    });
    document.getElementById('pf-scan-barcode').addEventListener('click', () => {
      Scanner.open((code) => {
        document.getElementById('pf-barcode').value = code;
        Utils.toast('สแกนสำเร็จ: ' + code, 'success');
      });
    });
    document.getElementById('pf-cancel').addEventListener('click', () => Utils.closeModal('product-form-modal'));
    document.getElementById('pf-save').addEventListener('click', saveForm);
    document.getElementById('pf-delete').addEventListener('click', deleteCurrent);
  }

  document.addEventListener('DOMContentLoaded', bindEvents);

  window.Products = {
    refresh,
    openForm,
    getAll: () => allProducts,
    getCategories,
    getLowStockThreshold: () => lowStockThreshold
  };
})();
