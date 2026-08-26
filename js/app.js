/* =========================================================
   app.js — Navigation + bootstrap
   ========================================================= */
(function () {
  const SCREEN_TITLES = {
    pos: 'ขายสินค้า',
    inventory: 'คลังสินค้า',
    history: 'ประวัติการขาย',
    reports: 'รายงาน',
    settings: 'ตั้งค่า'
  };

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + name).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-screen') === name));
    updateTopbarTitle(name);
    document.getElementById('cart-bar').style.display = (name === 'pos' && POS.getCart().length > 0) ? 'flex' : 'none';

    if (name === 'history') History.refresh();
    if (name === 'reports') Reports.refresh();
    window.scrollTo(0, 0);
  }

  function updateTopbarTitle(name) {
    const el = document.getElementById('screen-title-text');
    if (name === 'pos') {
      el.textContent = POS.getPriceModeLabel();
      el.classList.add('mode-label');
    } else {
      el.textContent = SCREEN_TITLES[name] || '';
      el.classList.remove('mode-label');
    }
  }

  function bindNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => showScreen(btn.getAttribute('data-screen')));
    });
  }

  function bindProductFab() {
    // FAB for adding a product, shown only on the inventory screen
    const fab = document.createElement('button');
    fab.className = 'fab';
    fab.id = 'fab-add-product';
    fab.setAttribute('aria-label', 'เพิ่มสินค้า');
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>';
    fab.addEventListener('click', () => Products.openForm(null));
    document.getElementById('app').appendChild(fab);

    function syncFabVisibility() {
      fab.style.display = document.getElementById('screen-inventory').classList.contains('active') ? 'flex' : 'none';
    }
    document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', syncFabVisibility));
    syncFabVisibility();
  }

  async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('service-worker.js');
      } catch (e) {
        console.warn('Service worker registration failed', e);
      }
    }
  }

  async function bootstrap() {
    Utils.showLoading();
    try {
      await DB.init();
      await Products.refresh();
      POS.refresh();
      POS.renderCartBar();
    } catch (err) {
      console.error(err);
      Utils.toast('เกิดข้อผิดพลาดในการเริ่มต้นแอป: ' + err.message, 'danger');
    } finally {
      Utils.hideLoading();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindNav();
    bindProductFab();
    updateTopbarTitle('pos');
    bootstrap();
    registerServiceWorker();
  });
})();
