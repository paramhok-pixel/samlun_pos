/* =========================================================
   scanner.js — camera barcode scanning (wraps html5-qrcode)
   Supports "continuous" mode for scanning multiple items in a
   row (POS cart): after each hit it beeps/vibrates and pauses
   briefly so the same code isn't double-added by accident.
   ========================================================= */
(function () {
  const COOLDOWN_MS = 1250;
  let qrInstance = null;
  let active = false;      // camera stream running
  let paused = false;      // ignoring decodes during cooldown
  let resultCallback = null;
  let continuousMode = false;

  const SUPPORTED_FORMATS = (window.Html5QrcodeSupportedFormats) ? [
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.CODE_93,
    Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.QR_CODE
  ] : undefined;

  function open(onResult, opts) {
    resultCallback = onResult;
    continuousMode = !!(opts && opts.continuous);
    paused = false;
    Utils.openModal('scanner-modal');
    document.getElementById('scanner-hint').textContent = continuousMode
      ? 'สแกนต่อเนื่องได้เลย ระบบจะหน่วงเล็กน้อยหลังเพิ่มแต่ละชิ้นกันสแกนซ้ำ'
      : 'เล็งกล้องไปที่บาร์โค้ดสินค้าให้อยู่ในกรอบ';
    const el = document.getElementById('scanner-view');
    el.innerHTML = '';

    if (typeof Html5Qrcode === 'undefined') {
      Utils.toast('ไม่พบไลบรารีสแกนบาร์โค้ด', 'danger');
      return;
    }

    qrInstance = new Html5Qrcode('scanner-view', SUPPORTED_FORMATS ? { formatsToSupport: SUPPORTED_FORMATS, verbose: false } : { verbose: false });
    const config = { fps: 10, qrbox: (vw, vh) => {
      const size = Math.floor(Math.min(vw, vh) * 0.72);
      return { width: size, height: Math.floor(size * 0.6) };
    } };

    qrInstance.start(
      { facingMode: 'environment' },
      config,
      (decodedText) => { if (active && !paused) onDecoded(decodedText); },
      () => { /* per-frame decode noise — ignore */ }
    ).then(() => {
      active = true;
    }).catch((err) => {
      console.error(err);
      Utils.toast('เปิดกล้องไม่สำเร็จ กรุณาอนุญาตการใช้กล้อง', 'danger');
      close();
    });
  }

  function onDecoded(text) {
    Utils.scanFeedback();
    if (resultCallback) resultCallback(text);
    if (!continuousMode) { close(); return; }
    paused = true;
    setTimeout(() => { paused = false; }, COOLDOWN_MS);
  }

  function close() {
    active = false; paused = false;
    Utils.closeModal('scanner-modal');
    const mini = document.getElementById('scanner-cart-mini');
    if (mini) mini.style.display = 'none';
    if (qrInstance) {
      qrInstance.stop().then(() => {
        try { qrInstance.clear(); } catch (e) {}
        qrInstance = null;
      }).catch(() => { qrInstance = null; });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('scanner-close').addEventListener('click', close);
  });

  window.Scanner = { open, close };
})();
