// dashboard.js - Displays & Edits Scraped Products including Full Iframe Description + ALL Item Specifics (JSON / Key-Value)

const CREATE_URLS = {
  ebay: "https://www.ebay.com/sl/prelist/suggest",
  vinted: "https://www.vinted.fr/items/new",
  etsy: "https://www.etsy.com/your/shops/me/tools/listings/create",
  depop: "https://www.depop.com/products/create/",
  wallapop: "https://es.wallapop.com/app/catalog/upload",
  amazon: "https://sellercentral.amazon.com/product-search/search"
};

let catalog = [];

function showToast(msg) {
  const t = document.getElementById("toastBox");
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => { t.style.display = "none"; }, 2600);
}

function escapeMarkup(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function thumbnailUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function renderCatalog() {
  const grid = document.getElementById("catalogGrid");
  if (!catalog || catalog.length === 0) {
    grid.innerHTML = `<div style="color:#94a3b8;font-size:14px;padding:20px;">No products saved yet. Open any product on eBay, Vinted, Etsy, or Amazon, click the SyncFlow extension icon, and click "💾 Save to DB"!</div>`;
    return;
  }

  grid.innerHTML = catalog.map((p, idx) => {
    const imgUrl = thumbnailUrl(Array.isArray(p.images) ? p.images[0] : "");
    const baseP = Review.display(Object.hasOwn(p, "basePrice") ? p.basePrice : p.price);
    const sellP = Review.display(p.price);
    const specsObj = p.specifics || {};
    const specsCount = Object.keys(specsObj).length;
    const specsFormatted = Object.entries(specsObj)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    return `
      <div class="card" data-idx="${idx}">
        <div class="card-top">
          ${imgUrl ? `<img src="${escapeMarkup(imgUrl)}" class="thumb" />` : `<div class="thumb"></div>`}
          <div>
            <div class="sku-tag">${escapeMarkup(p.sku || "ITEM")} • ${Array.isArray(p.images) ? p.images.length : 0} photo${p.images?.length === 1 ? "" : "s"} • ${specsCount} attributes</div>
            <div style="font-size:11px;color:#34d399;margin-top:2px;">Catalog item • Qty: 1 per variant</div>
          </div>
        </div>

        <div>
          <label>Title</label>
          <input type="text" class="inp-title" data-idx="${idx}" value="${escapeMarkup(p.title)}" />
        </div>

        <div class="row-2">
          <div>
            <label>Base Price (listing currency)</label>
            <input type="number" step="0.01" class="inp-base" data-idx="${idx}" value="${baseP}" />
          </div>
          <div>
            <label>Selling Price (listing currency)</label>
            <input type="number" step="0.01" class="inp-price" data-idx="${idx}" value="${sellP}" style="color:#34d399;font-weight:700;" />
          </div>
        </div>

        <div class="row-2">
          <div>
            <label>Brand</label>
            <input type="text" class="inp-brand" data-idx="${idx}" value="${escapeMarkup(p.brand)}" />
          </div>
          <div>
            <label>Destination</label>
            <select class="inp-target" data-idx="${idx}">
              <option value="ebay">eBay</option>
              <option value="vinted">Vinted</option>
              <option value="etsy">Etsy</option>
              <option value="depop">Depop</option>
              <option value="wallapop">Wallapop</option>
            </select>
          </div>
        </div>

        <div>
          <label>Product attributes (${specsCount})</label>
          <textarea rows="3" class="inp-specs" data-idx="${idx}" style="font-family:monospace;font-size:11px;color:#a5b4fc;">${escapeMarkup(specsFormatted)}</textarea>
        </div>

        <div>
          <label>Description</label>
          <textarea rows="3" class="inp-desc" data-idx="${idx}">${escapeMarkup(p.description)}</textarea>
        </div>

        <p class="review-status" data-ready="${Review.missing(p).length === 0}" aria-live="polite">${Review.message(p)}</p>
        <div class="btn-row">
          <button type="button" class="btn btn-save" data-action="save" data-idx="${idx}">Save changes</button>
          <button type="button" class="btn btn-post" data-action="post" data-idx="${idx}">Open draft</button>
          <button type="button" class="btn btn-all" data-action="post-all" data-idx="${idx}">Open 3 drafts</button>
        </div>
        <button type="button" class="btn btn-del" data-action="delete" data-idx="${idx}">Remove from catalog</button>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".card").forEach((card, idx) => {
    card.addEventListener("input", () => {
      const product = {
        title: card.querySelector(".inp-title").value,
        price: card.querySelector(".inp-price").value,
        brand: card.querySelector(".inp-brand").value
      };
      const status = card.querySelector(".review-status");
      status.textContent = Review.message(product);
      status.dataset.ready = String(Review.missing(product).length === 0);
    });
  });
  grid.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-idx"), 10);
      const action = btn.getAttribute("data-action");
      syncCardInputsToState(idx);

      if (action.startsWith("post") && Review.missing(catalog[idx]).length) {
        showToast(Review.message(catalog[idx]));
        return;
      }
      if (action === "save") {
        chrome.storage.local.set({ savedCatalog: catalog }, () => {
          showToast(`Saved changes & ${Object.keys(catalog[idx].specifics || {}).length} specifics for ${catalog[idx].sku}`);
        });
      } else if (action === "post") {
        const card = grid.querySelector(`.card[data-idx="${idx}"]`);
        const target = card.querySelector(".inp-target").value;
        const prod = catalog[idx];
        chrome.storage.local.set({ savedCatalog: catalog, pendingProduct: prod, targetPlatform: target, autoFillTimestamp: Date.now() }, () => {
          chrome.tabs.create({ url: CREATE_URLS[target] || CREATE_URLS.ebay, active: true });
        });
      } else if (action === "post-all") {
        const prod = catalog[idx];
        chrome.storage.local.set({ savedCatalog: catalog, pendingProduct: prod, targetPlatform: "multi", autoFillTimestamp: Date.now() }, () => {
          chrome.tabs.create({ url: CREATE_URLS.ebay, active: true });
          chrome.tabs.create({ url: CREATE_URLS.vinted, active: false });
          chrome.tabs.create({ url: CREATE_URLS.etsy, active: false });
        });
      } else if (action === "delete") {
        catalog.splice(idx, 1);
        chrome.storage.local.set({ savedCatalog: catalog }, () => {
          renderCatalog();
          showToast("Removed item from DB");
        });
      }
    });
  });
}

function syncCardInputsToState(idx) {
  const card = document.querySelector(`.card[data-idx="${idx}"]`);
  if (!card || !catalog[idx]) return;
  catalog[idx].title = card.querySelector(".inp-title").value;
  catalog[idx].basePrice = Review.amount(card.querySelector(".inp-base").value);
  catalog[idx].price = Review.amount(card.querySelector(".inp-price").value);
  catalog[idx].brand = card.querySelector(".inp-brand").value;
  catalog[idx].description = card.querySelector(".inp-desc").value;
  catalog[idx].quantity = 1;

  // Parse edited Key: Value specifics back into object
  const rawSpecs = card.querySelector(".inp-specs").value || "";
  const parsedSpecs = {};
  rawSpecs.split(/\r?\n/).forEach((line) => {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const k = line.slice(0, colonIdx).trim();
      const v = line.slice(colonIdx + 1).trim();
      if (k && v) parsedSpecs[k] = v;
    }
  });
  catalog[idx].specifics = parsedSpecs;
}

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["savedCatalog"], ({ savedCatalog = [] }) => {
    catalog = savedCatalog;
    renderCatalog();
  });

  document.querySelectorAll("button[data-bulk-pct]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pct = parseFloat(btn.getAttribute("data-bulk-pct") || "0");
      catalog.forEach((_, idx) => syncCardInputsToState(idx));
      catalog = catalog.map((p) => {
        const base = Review.amount(p.basePrice);
        if (base === null) return p;
        return {
          ...p,
          basePrice: base,
          price: +(base * (1 + pct / 100)).toFixed(2)
        };
      });
      chrome.storage.local.set({ savedCatalog: catalog }, () => {
        renderCatalog();
        showToast(`Applied +${pct}% markup to all ${catalog.length} products!`);
      });
    });
  });
});
