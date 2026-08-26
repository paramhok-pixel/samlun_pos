/* =========================================================
   utils.js — shared helpers
   ========================================================= */
(function () {

  const Utils = {};

  // ---------- Currency / number formatting ----------
  Utils.money = function (n) {
    n = Number(n) || 0;
    return '฿' + n.toLocaleString('th-TH', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  };
  Utils.moneyPlain = function (n) {
    n = Number(n) || 0;
    return n.toLocaleString('th-TH', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  };

  // ---------- Date formatting ----------
  const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  Utils.formatDateThai = function (isoStr) {
    const d = new Date(isoStr);
    const be = d.getFullYear() + 543;
    return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${be}`;
  };
  Utils.formatDateTimeThai = function (isoStr) {
    const d = new Date(isoStr);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${Utils.formatDateThai(isoStr)} ${hh}:${mm} น.`;
  };
  Utils.formatTime = function (isoStr) {
    const d = new Date(isoStr);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  Utils.todayISO = function () {
    return new Date().toISOString().slice(0, 10);
  };
  Utils.startOfDayISO = function (dateStr) {
    return new Date(dateStr + 'T00:00:00').toISOString();
  };
  Utils.endOfDayISO = function (dateStr) {
    return new Date(dateStr + 'T23:59:59.999').toISOString();
  };

  // ---------- Toast ----------
  Utils.toast = function (msg, type) {
    const host = document.getElementById('toast-host');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 250);
    }, 2200);
  };

  // ---------- Loading veil ----------
  Utils.showLoading = function () { document.getElementById('loading-veil').classList.add('open'); };
  Utils.hideLoading = function () { document.getElementById('loading-veil').classList.remove('open'); };

  // ---------- Sheets / Modals ----------
  Utils.openSheet = function (id) { document.getElementById(id).classList.add('open'); };
  Utils.closeSheet = function (id) { document.getElementById(id).classList.remove('open'); };
  Utils.openModal = function (id) { document.getElementById(id).classList.add('open'); };
  Utils.closeModal = function (id) { document.getElementById(id).classList.remove('open'); };

  // Generic confirm dialog -> returns Promise<boolean>
  Utils.confirmDialog = function (title, message, okLabel) {
    return new Promise((resolve) => {
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-message').textContent = message;
      const okBtn = document.getElementById('confirm-ok');
      okBtn.textContent = okLabel || 'ยืนยัน';
      Utils.openModal('confirm-modal');
      function cleanup(result) {
        Utils.closeModal('confirm-modal');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        resolve(result);
      }
      const cancelBtn = document.getElementById('confirm-cancel');
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
    });
  };

  // Close any overlay when tapping the dark backdrop itself
  document.addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('sheet-overlay')) {
      e.target.classList.remove('open');
    }
    if (e.target.classList && e.target.classList.contains('modal-overlay')) {
      // modal backdrop click: only close non-critical modals
      if (e.target.id !== 'sale-done-modal') e.target.classList.remove('open');
    }
    const closeBtn = e.target.closest('[data-close-sheet]');
    if (closeBtn) {
      Utils.closeSheet(closeBtn.getAttribute('data-close-sheet'));
    }
  });

  // ---------- Image compression (camera / uploads -> small base64 JPEG) ----------
  // maxDim: max width/height in px, quality: 0-1
  Utils.compressImageFile = function (file, maxDim, quality) {
    maxDim = maxDim || 900;
    quality = quality || 0.72;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
          let { width, height } = img;
          if (width > height && width > maxDim) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else if (height >= width && height > maxDim) {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // ---------- Denomination helper (Thai Baht) ----------
  Utils.DENOMS = [1000, 500, 100, 50, 20, 10, 5, 1];

  // ---------- Misc ----------
  Utils.debounce = function (fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  };
  Utils.escapeHtml = function (str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };
  Utils.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };

  const PLACEHOLDER_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#F1F5F9"/><path d="M30 65l12-16 10 12 8-10 12 14z" fill="#CBD5E1"/><circle cx="36" cy="38" r="7" fill="#CBD5E1"/></svg>`
  );
  Utils.placeholderImg = PLACEHOLDER_SVG;

  // ---------- Scan feedback (beep + vibrate) ----------
  Utils.scanFeedback = function () {
    try {
      const ctx = Utils._audioCtx || (Utils._audioCtx = new (window.AudioContext || window.webkitAudioContext)());
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = 1046.5;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.12);
    } catch (e) {}
    if (navigator.vibrate) { try { navigator.vibrate(80); } catch (e) {} }
  };

  // ---------- Save/download an image (dataURL) to the device ----------
  Utils.saveImageToDevice = function (dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    Utils.toast('เริ่มดาวน์โหลดรูปภาพแล้ว', 'success');
  };

  // Opens an image full-screen in a new tab — the most reliable cross-browser
  // way to let a user save an image via long-press (works even where the
  // download attribute above is ignored, e.g. some iOS Safari versions).
  Utils.openImageForSave = function (dataUrl, filename) {
    const w = window.open();
    if (w) {
      w.document.write(`<title>${filename}</title><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${dataUrl}" style="max-width:100%;height:auto;" alt="${filename}"></body>`);
      Utils.toast('กดค้างที่รูปเพื่อบันทึกลงอัลบั้ม', 'success');
    } else {
      Utils.saveImageToDevice(dataUrl, filename);
    }
  };

  window.Utils = Utils;
})();
