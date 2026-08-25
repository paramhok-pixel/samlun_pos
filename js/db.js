/* =========================================================
   db.js — IndexedDB wrapper (100% local storage, no network)
   ========================================================= */
(function () {
  const DB_NAME = 'posOfflineDB';
  const DB_VERSION = 1;
  let dbInstance = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (dbInstance) return resolve(dbInstance);
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains('products')) {
          const store = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
          store.createIndex('barcode', 'barcode', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('name', 'name', { unique: false });
        }

        if (!db.objectStoreNames.contains('sales')) {
          const store = db.createObjectStore('sales', { keyPath: 'id', autoIncrement: true });
          store.createIndex('datetime', 'datetime', { unique: false });
          store.createIndex('voided', 'voided', { unique: false });
        }

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      req.onsuccess = (e) => { dbInstance = e.target.result; resolve(dbInstance); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function tx(storeName, mode) {
    return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const DB = {
    init: openDB,

    // ---------------- PRODUCTS ----------------
    async addProduct(p) {
      p.createdAt = new Date().toISOString();
      p.updatedAt = p.createdAt;
      const store = await tx('products', 'readwrite');
      return reqToPromise(store.add(p));
    },
    async updateProduct(p) {
      p.updatedAt = new Date().toISOString();
      const store = await tx('products', 'readwrite');
      return reqToPromise(store.put(p));
    },
    async deleteProduct(id) {
      const store = await tx('products', 'readwrite');
      return reqToPromise(store.delete(id));
    },
    async getProduct(id) {
      const store = await tx('products', 'readonly');
      return reqToPromise(store.get(id));
    },
    async getAllProducts() {
      const store = await tx('products', 'readonly');
      const all = await reqToPromise(store.getAll());
      return all.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));
    },
    async getProductByBarcode(code) {
      if (!code) return null;
      const all = await this.getAllProducts();
      return all.find(p => (p.barcode || '').trim() === String(code).trim()) || null;
    },
    async adjustStock(id, delta) {
      const store = await tx('products', 'readwrite');
      const p = await reqToPromise(store.get(id));
      if (!p) return;
      p.stock = Math.max(0, (Number(p.stock) || 0) + delta);
      p.updatedAt = new Date().toISOString();
      return reqToPromise(store.put(p));
    },

    // ---------------- SALES ----------------
    async addSale(sale) {
      sale.datetime = sale.datetime || new Date().toISOString();
      sale.voided = false;
      const store = await tx('sales', 'readwrite');
      return reqToPromise(store.add(sale));
    },
    async updateSale(sale) {
      const store = await tx('sales', 'readwrite');
      return reqToPromise(store.put(sale));
    },
    async getSale(id) {
      const store = await tx('sales', 'readonly');
      return reqToPromise(store.get(id));
    },
    async getAllSales() {
      const store = await tx('sales', 'readonly');
      const all = await reqToPromise(store.getAll());
      return all.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
    },
    async getSalesInRange(fromISO, toISO) {
      const all = await this.getAllSales();
      const from = fromISO ? new Date(fromISO).getTime() : -Infinity;
      const to = toISO ? new Date(toISO).getTime() : Infinity;
      return all.filter(s => {
        const t = new Date(s.datetime).getTime();
        return t >= from && t <= to;
      });
    },

    // ---------------- SETTINGS ----------------
    async getSetting(key, fallback) {
      const store = await tx('settings', 'readonly');
      const row = await reqToPromise(store.get(key));
      return row ? row.value : fallback;
    },
    async setSetting(key, value) {
      const store = await tx('settings', 'readwrite');
      return reqToPromise(store.put({ key, value }));
    },

    // ---------------- BACKUP / RESTORE ----------------
    async exportProducts() {
      const products = await this.getAllProducts();
      return { _meta: { app: 'posOfflineDB', type: 'products-only', exportedAt: new Date().toISOString(), version: DB_VERSION }, products };
    },
    async importProducts(data) {
      if (!data || !Array.isArray(data.products)) throw new Error('ไฟล์ไม่ถูกต้อง');
      const db = await openDB();
      const store = db.transaction('products', 'readwrite').objectStore('products');
      let count = 0;
      for (const p of data.products) {
        const clone = Object.assign({}, p);
        delete clone.id; // always add as new products to avoid id collisions across devices
        await reqToPromise(store.add(clone));
        count++;
      }
      return count;
    },
    async exportAll() {
      const [products, sales] = await Promise.all([this.getAllProducts(), this.getAllSales()]);
      const settingsStore = await tx('settings', 'readonly');
      const settings = await reqToPromise(settingsStore.getAll());
      return {
        _meta: { app: 'posOfflineDB', exportedAt: new Date().toISOString(), version: DB_VERSION },
        products, sales, settings
      };
    },
    async importAll(data, mode) {
      // mode: 'replace' | 'merge'
      if (!data || !Array.isArray(data.products) || !Array.isArray(data.sales)) {
        throw new Error('ไฟล์สำรองข้อมูลไม่ถูกต้อง');
      }
      const db = await openDB();
      if (mode === 'replace') {
        await this.clearAll(true);
      }
      const pStore = db.transaction('products', 'readwrite').objectStore('products');
      for (const p of data.products) {
        const clone = Object.assign({}, p);
        if (mode === 'merge') delete clone.id;
        await reqToPromise(clone.id !== undefined ? pStore.put(clone) : pStore.add(clone));
      }
      const sStore = db.transaction('sales', 'readwrite').objectStore('sales');
      for (const s of data.sales) {
        const clone = Object.assign({}, s);
        if (mode === 'merge') delete clone.id;
        await reqToPromise(clone.id !== undefined ? sStore.put(clone) : sStore.add(clone));
      }
      if (Array.isArray(data.settings)) {
        const stStore = db.transaction('settings', 'readwrite').objectStore('settings');
        for (const s of data.settings) await reqToPromise(stStore.put(s));
      }
    },
    async clearSalesOnly() {
      const db = await openDB();
      await reqToPromise(db.transaction('sales', 'readwrite').objectStore('sales').clear());
    },
    async clearAll(keepSettings) {
      const db = await openDB();
      await reqToPromise(db.transaction('products', 'readwrite').objectStore('products').clear());
      await reqToPromise(db.transaction('sales', 'readwrite').objectStore('sales').clear());
      if (!keepSettings) {
        await reqToPromise(db.transaction('settings', 'readwrite').objectStore('settings').clear());
      }
    }
  };

  window.DB = DB;
})();
