// popup.js - Powered by Scrapling v0.5.1 (Python Server + Service Worker Iframe Deep Scraper)
// Extracts REAL Seller Description from eBay's isolated iframe + ALL Item Specifics (20+ fields) + HD Photos

let currentProduct = null;
let activeMarkupPercent = 0;

const CREATE_URLS = {
  ebay: "https://www.ebay.com/sl/prelist/suggest",
  vinted: "https://www.vinted.fr/items/new",
  etsy: "https://www.etsy.com/your/shops/me/tools/listings/create",
  depop: "https://www.depop.com/products/create/",
  wallapop: "https://es.wallapop.com/app/catalog/upload",
  amazon: "https://sellercentral.amazon.com/product-search/search"
};

/**
 * Injected directly into the active product tab to harvest:
 *   1. Title & Locale-accurate Price (USD514,52 -> 514.52)
 *   2. ALL Item Specifics (eBay modern dl.ux-labels-values, .ux-layout-section-evo__col, Vinted, Amazon, Etsy)
 *   3. eBay's isolated Description Iframe URL (iframe#desc_ifr / ebaydesc.com)
 *   4. Up to 12 Full-HD Photos (s-l1600.jpg)
 */
function harvestRawPageDataInTab() {
function parsePrice(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(?:[A-Za-z]{3}|[$€£])?\s*(\d[\d.,\s]*)(?:\s*(?:[A-Za-z]{3}|[$€£]))?$/);
  if (!match) return null;
  const digits = match[1].replace(/\s/g, "");
  if (/^\d+$/.test(digits)) return Number(digits);
  const european = /^\d{1,3}(?:\.\d{3})+,\d{1,2}$/;
  const american = /^\d{1,3}(?:,\d{3})+\.\d{1,2}$/;
  if (european.test(digits)) return Number(digits.replace(/\./g, "").replace(",", "."));
  if (american.test(digits)) return Number(digits.replace(/,/g, ""));
  if (/^\d+[,.]\d{1,2}$/.test(digits)) return Number(digits.replace(",", "."));
  return null;
}

  const host = window.location.hostname;
  let platform = "WEB";
  if (/ebay\./i.test(host)) platform = "EBAY";
  else if (/vinted\./i.test(host)) platform = "VINTED";
  else if (/etsy\./i.test(host)) platform = "ETSY";
  else if (/depop\./i.test(host)) platform = "DEPOP";
  else if (/wallapop\./i.test(host)) platform = "WALLAPOP";
  else if (/amazon\./i.test(host)) platform = "AMAZON";
  else if (/zalando\./i.test(host)) platform = "ZALANDO";

  // 1. Title
  const titleEl =
    document.querySelector('h1.x-item-title__mainTitle span') ||
    document.querySelector('[data-testid="item-title"]') ||
    document.querySelector('#productTitle') ||
    document.querySelector('h1[data-buy-box-listing-title]') ||
    document.querySelector('h1');
  const rawTitle = titleEl ? titleEl.textContent.trim() : document.title;
  const title = rawTitle.replace(/^Details about\s+/i, "").trim();

  // 2. Price
  const priceEl =
    document.querySelector('.x-price-primary span') ||
    document.querySelector('#prcIsum') ||
    document.querySelector('[data-testid="item-price"]') ||
    document.querySelector('.a-price .a-offscreen') ||
    document.querySelector('[data-buy-box-region="price"] p') ||
    document.querySelector('.card-product-detail-price') ||
    document.querySelector('[itemprop="price"]');
  let price = priceEl ? parsePrice(priceEl.getAttribute("content") || priceEl.textContent) : null;

  // 3. Extract ALL Item Specifics across eBay's modern & classic DOM structures!
  const specifics = {};

  // 3A. Modern eBay <dl class="ux-labels-values"> & <div class="ux-labels-values">
  document.querySelectorAll('dl.ux-labels-values, div.ux-labels-values, .ux-layout-section-evo__col').forEach((row) => {
    const labelEl =
      row.querySelector('.ux-labels-values__labels-content') ||
      row.querySelector('.ux-labels-values__labels') ||
      row.querySelector('dt');
    const valEl =
      row.querySelector('.ux-labels-values__values-content') ||
      row.querySelector('.ux-labels-values__values') ||
      row.querySelector('dd');

    if (labelEl && valEl) {
      const k = labelEl.innerText.replace(/[:\n]/g, "").trim();
      const v = valEl.innerText.replace(/\s+/g, " ").trim();
      if (k && v && k.length < 55 && v.length < 180 && !v.includes("Read more") && !v.includes("Leer más")) {
        specifics[k] = v;
      }
    }
  });

  // 3B. Vinted / Amazon / Generic Attribute Tables
  document.querySelectorAll('.details-list__item, #productDetails_techSpec_section_1 tr, #detailBullets_feature_div li').forEach((row) => {
    const parts = row.innerText.split(":");
    if (parts.length >= 2) {
      const k = parts[0].trim();
      const v = parts.slice(1).join(":").trim();
      if (k && v && k.length < 50 && v.length < 180) specifics[k] = v;
    }
  });

  // 4. Find eBay's Isolated Description Iframe URL (`iframe#desc_ifr` / `ebaydesc.com`)
  const descIframe =
    document.querySelector('iframe#desc_ifr') ||
    document.querySelector('iframe[src*="ebaydesc.com"]') ||
    document.querySelector('iframe[title*="description" i]') ||
    document.querySelector('iframe[title*="descripción" i]');
  const iframeDescUrl = descIframe ? descIframe.getAttribute("src") || "" : "";

  // Also check on-page description containers (for Vinted, Etsy, Depop, Amazon)
  const pageDescEl =
    document.querySelector('[data-product-details-description-text-content]') ||
    document.querySelector('[data-testid="product__description"]') ||
    document.querySelector('#feature-bullets') ||
    document.querySelector('.card-product-detail-description') ||
    document.querySelector('#d-item-description');
  const pageDescription = pageDescEl ? pageDescEl.innerText.trim() : "";

  // 5. High-Res Images
  const domImages = [];
  document.querySelectorAll('.ux-image-carousel-item img, .ux-image-filmstrip-carousel-item img, .item-photos img, #altImages img, picture img').forEach((img) => {
    let src = img.getAttribute("data-zoom-src") || img.getAttribute("data-src") || img.getAttribute("src") || "";
    if (src.includes("ebayimg.com")) src = src.replace(/s-l\d+\.(jpg|png|webp)/i, "s-l1600.jpg");
    if (src.startsWith("http") && !src.includes("1x1")) domImages.push(src);
  });

  const allImages = Array.from(new Set(domImages)).slice(0, 12);

  const urlMatch = window.location.pathname.match(/\/itm\/(?:.*\/)?(\d+)/) || window.location.pathname.match(/\/items\/(\d+)/);
  const itemId = urlMatch ? urlMatch[1] : String(Date.now()).slice(-6);

  const brand =
    specifics["Marca"] ||
    specifics["Brand"] ||
    specifics["Marque"] ||
    "";

  const condition =
    specifics["Estado"] ||
    specifics["Condition"] ||
    specifics["État"] ||
    "";

  return {
    id: "prod_" + itemId,
    sku: `${platform}-${itemId}`,
    sourcePlatform: platform,
    sourceUrl: window.location.href.split("?")[0],
    title,
    price,
    quantity: 1, // Strictly 1 per variant
    brand,
    condition,
    specifics,
    iframeDescUrl,
    pageDescription,
    images: allImages,
    fullHtml: document.documentElement.outerHTML.slice(0, 250000),
    savedAt: new Date().toISOString()
  };
}

function updateFinalPriceFromMarkup() {
  const basePriceInput = document.getElementById("basePriceInput");
  const finalPriceInput = document.getElementById("finalPriceInput");
  const label = document.getElementById("markupDisplayLabel");

  const base = Review.amount(basePriceInput.value);
  if (base === null) {
    finalPriceInput.value = "";
    label.textContent = "Enter a base price";
    return;
  }
  const added = base * (activeMarkupPercent / 100);
  const finalPrice = +(base + added).toFixed(2);

  finalPriceInput.value = finalPrice.toFixed(2);
  label.textContent = `+${activeMarkupPercent}% (+${added.toFixed(2)})`;
}

function refreshSavedCount() {
  chrome.storage.local.get(["savedCatalog"], ({ savedCatalog = [] }) => {
    const span = document.getElementById("dbCountSpan");
    if (span) span.textContent = String(savedCatalog.length);
  });
}

function buildEditedProductPayload() {
  const title = document.getElementById("productTitleInput").value.trim();
  const basePrice = Review.amount(document.getElementById("basePriceInput").value);
  const enteredPrice = parseFloat(document.getElementById("finalPriceInput").value);
  const finalPrice = Review.amount(enteredPrice);

  return {
    ...(currentProduct || {
      id: "prod_" + Date.now(),
      sku: "ITEM-" + Date.now().toString().slice(-5),
      sourcePlatform: "MANUAL",
      specifics: {},
      images: []
    }),
    title,
    brand: document.getElementById("brandInput").value.trim(),
    basePrice,
    price: finalPrice,
    quantity: 1, // Always 1 per variant
    markupPercent: activeMarkupPercent,
    updatedAt: new Date().toISOString()
  };
}

document.addEventListener("DOMContentLoaded", async () => {
  refreshSavedCount();

  const statusEl = document.getElementById("statusText");
  const badgeEl = document.getElementById("detectedPlatformBadge");
  const titleInput = document.getElementById("productTitleInput");
  const basePriceInput = document.getElementById("basePriceInput");
  const finalPriceInput = document.getElementById("finalPriceInput");

  for (const field of [titleInput, finalPriceInput, document.getElementById("brandInput")]) {
    field.addEventListener("input", () => { statusEl.textContent = Review.message(buildEditedProductPayload()); });
  }

  // 1. Markup Percentage Buttons
  document.querySelectorAll(".markup-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeMarkupPercent = parseFloat(btn.getAttribute("data-pct") || "0");
      document.querySelectorAll(".markup-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      updateFinalPriceFromMarkup();
    });
  });

  basePriceInput.addEventListener("input", () => {
    updateFinalPriceFromMarkup();
  });

  // 2. Harvest Page + Send to Scrapling Deep Extractor (Fetches cross-origin Description Iframe + All Specifics!)
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id && tab.url && tab.url.startsWith("http")) {
      statusEl.textContent = "🕷️ Scrapling extracting iframe description & specs...";
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: harvestRawPageDataInTab
      });

      const rawPageData = results?.[0]?.result;
      if (rawPageData && rawPageData.title) {
        // Delete huge fullHtml before storing in local storage after background processes it
        chrome.runtime.sendMessage(
          {
            action: "DEEP_SCRAPLING_EXTRACT",
            rawPageData
          },
          (resp) => {
            const enriched = resp?.product || rawPageData;
            delete enriched.fullHtml;
            currentProduct = enriched;

            badgeEl.textContent = `${ resp?.engine === "Scrapling-Python-0.5.1" ? "Python Scrapling" : enriched.sourcePlatform + " Scrapling" }`;
            titleInput.value = enriched.title;
            document.getElementById("brandInput").value = enriched.brand || "";
            basePriceInput.value = Review.display(enriched.price);
            finalPriceInput.value = Review.display(enriched.price);

            statusEl.textContent = Review.message(enriched);
          }
        );
      }
    }
  } catch (err) {
    statusEl.textContent = "Ready";
  }

  // 3. Save to DB
  document.getElementById("saveToDbBtn").addEventListener("click", () => {
    const prod = buildEditedProductPayload();
    chrome.storage.local.get(["savedCatalog"], ({ savedCatalog = [] }) => {
      const existingIdx = savedCatalog.findIndex((x) => x.sku === prod.sku);
      if (existingIdx >= 0) savedCatalog[existingIdx] = prod;
      else savedCatalog.unshift(prod);

      chrome.storage.local.set({ savedCatalog }, () => {
        refreshSavedCount();
        statusEl.textContent = `✓ Saved ${prod.sku} (${Object.keys(prod.specifics || {}).length} specs) to DB!`;
        chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html"), active: true });
      });
    });
  });

  // 4. Post to Target
  document.getElementById("scrapeAndPostBtn").addEventListener("click", () => {
    const prod = buildEditedProductPayload();
    if (Review.missing(prod).length) {
      statusEl.textContent = Review.message(prod);
      return;
    }
    const target = document.getElementById("targetPlatform").value;
    statusEl.textContent = `🚀 Launching ${target.toUpperCase()}...`;

    chrome.storage.local.set(
      {
        pendingProduct: prod,
        targetPlatform: target,
        autoFillTimestamp: Date.now()
      },
      () => {
        const destUrl = CREATE_URLS[target] || CREATE_URLS.ebay;
        chrome.tabs.create({ url: destUrl, active: true });
      }
    );
  });

  // 5. Cross-Post to ALL
  document.getElementById("postToAllBtn").addEventListener("click", () => {
    const prod = buildEditedProductPayload();
    if (Review.missing(prod).length) {
      statusEl.textContent = Review.message(prod);
      return;
    }
    chrome.storage.local.get(["savedCatalog"], ({ savedCatalog = [] }) => {
      if (!savedCatalog.some((x) => x.sku === prod.sku)) savedCatalog.unshift(prod);
      chrome.storage.local.set(
        {
          savedCatalog,
          pendingProduct: prod,
          targetPlatform: "multi",
          autoFillTimestamp: Date.now()
        },
        () => {
          chrome.tabs.create({ url: CREATE_URLS.ebay, active: true });
          chrome.tabs.create({ url: CREATE_URLS.vinted, active: false });
          chrome.tabs.create({ url: CREATE_URLS.etsy, active: false });
        }
      );
    });
  });

  // 6. Open DB Manager
  document.getElementById("openDashboardBtn").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html"), active: true });
  });
});
