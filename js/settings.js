/* =========================================================
   settings.js — Shop info, backup/restore, danger zone
   ========================================================= */
(function () {

  async function load() {
    document.getElementById('set-shop-name').value = await DB.getSetting('shopName', 'ร้านสวัสดิการอุทยานแห่งชาติ');
    document.getElementById('set-shop-address').value = await DB.getSetting('shopAddress', '');
    document.getElementById('set-low-stock').value = await DB.getSetting('lowStockThreshold', 5);
    const logo = await DB.getSetting('shopLogo', null);
    document.getElementById('set-logo-preview').src = logo || Utils.placeholderImg;
  }

  async function saveShopName() {
    await DB.setSetting('shopName', document.getElementById('set-shop-name').value.trim() || 'ร้านสวัสดิการอุทยานแห่งชาติ');
    Utils.toast('บันทึกแล้ว', 'success');
  }
  async function saveShopAddress() {
    await DB.setSetting('shopAddress', document.getElementById('set-shop-address').value.trim());
    Utils.toast('บันทึกแล้ว', 'success');
  }
  async function saveLowStock() {
    const v = Math.max(0, parseInt(document.getElementById('set-low-stock').value, 10) || 0);
    document.getElementById('set-low-stock').value = v;
    await DB.setSetting('lowStockThreshold', v);
    Utils.toast('บันทึกแล้ว', 'success');
    await Products.refresh();
    document.dispatchEvent(new CustomEvent('products:changed'));
  }

  async function handleLogoFile(file) {
    if (!file) return;
    try {
      const dataUrl = await Utils.compressImageFile(file, 300, 0.85);
      await DB.setSetting('shopLogo', dataUrl);
      document.getElementById('set-logo-preview').src = dataUrl;
      Utils.toast('บันทึกโลโก้แล้ว', 'success');
    } catch (e) {
      Utils.toast('ไม่สามารถอ่านรูปภาพได้', 'danger');
    }
  }
  async function clearLogo() {
    await DB.setSetting('shopLogo', null);
    document.getElementById('set-logo-preview').src = Utils.placeholderImg;
    Utils.toast('ลบโลโก้แล้ว', 'success');
  }

  async function backup() {
    Utils.showLoading();
    try {
      const data = await DB.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `pos-backup-${stamp}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      Utils.toast('ดาวน์โหลดไฟล์สำรองข้อมูลแล้ว', 'success');
    } catch (err) {
      Utils.toast('สำรองข้อมูลไม่สำเร็จ: ' + err.message, 'danger');
    } finally {
      Utils.hideLoading();
    }
  }

  async function restore(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const replace = await Utils.confirmDialog(
        'นำเข้าข้อมูลแบบใด?',
        'เลือก "แทนที่ทั้งหมด" เพื่อล้างข้อมูลปัจจุบันแล้วใช้ไฟล์นี้แทน หรือ "ยกเลิก" เพื่อไม่นำเข้า (การนำเข้าจะรวมข้อมูลเป็นค่าเริ่มต้น หากต้องการรวมข้อมูลแทนการแทนที่ กรุณาติดต่อผู้พัฒนา)',
        'แทนที่ทั้งหมด'
      );
      if (!replace) return;
      Utils.showLoading();
      await DB.importAll(data, 'replace');
      Utils.toast('นำเข้าข้อมูลสำเร็จ', 'success');
      await load();
      await Products.refresh();
      document.dispatchEvent(new CustomEvent('products:changed'));
      document.dispatchEvent(new CustomEvent('sales:changed'));
    } catch (err) {
      console.error(err);
      Utils.toast('นำเข้าข้อมูลไม่สำเร็จ: ไฟล์ไม่ถูกต้อง', 'danger');
    } finally {
      Utils.hideLoading();
      document.getElementById('restore-file').value = '';
    }
  }

  async function clearAll() {
    const ok = await Utils.confirmDialog(
      'ล้างข้อมูลทั้งหมด?',
      'สินค้าในคลังและประวัติการขายทั้งหมดจะถูกลบถาวรและกู้คืนไม่ได้ (ยกเว้นมีไฟล์สำรองข้อมูล) ต้องการดำเนินการต่อหรือไม่?',
      'ล้างข้อมูลทั้งหมด'
    );
    if (!ok) return;
    Utils.showLoading();
    try {
      await DB.clearAll(true);
      Utils.toast('ล้างข้อมูลเรียบร้อยแล้ว', 'success');
      await Products.refresh();
      document.dispatchEvent(new CustomEvent('products:changed'));
      document.dispatchEvent(new CustomEvent('sales:changed'));
    } finally {
      Utils.hideLoading();
    }
  }

  function bindEvents() {
    document.getElementById('set-shop-name').addEventListener('change', saveShopName);
    document.getElementById('set-shop-address').addEventListener('change', saveShopAddress);
    document.getElementById('set-low-stock').addEventListener('change', saveLowStock);
    document.getElementById('set-logo-file').addEventListener('change', (e) => handleLogoFile(e.target.files[0]));
    document.getElementById('set-logo-clear').addEventListener('click', clearLogo);
    document.getElementById('btn-backup').addEventListener('click', backup);
    document.getElementById('restore-file').addEventListener('change', (e) => restore(e.target.files[0]));
    document.getElementById('btn-clear-all').addEventListener('click', clearAll);
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    load();
  });

  window.SettingsScreen = { refresh: load };
})();
