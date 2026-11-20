// chrome_extension/universal_scraper.js
// Robust Multi-Locale Price Parser (USD514,52 -> 514.52 / $1,250.00 -> 1250.00) + 3-Layer Universal Scraper

/**
 * Parses ANY currency string from European or US locales:
 * "USD514,52" -> 514.52
 * "461,74 EUR" -> 461.74
 * "$1,450.00" -> 1450.00
 */
function parseLocalePriceNumber(value) {
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

const PLATFORM_DETECTORS = [
  { id: "vinted",   match: /vinted\./i,   label: "Vinted" },
  { id: "depop",    match: /depop\.com/i, label: "Depop" },
  { id: "wallapop", match: /wallapop\.com/i, label: "Wallapop" },
  { id: "zalando",  match: /zalando\./i,  label: "Zalando" },
  { id: "etsy",     match: /etsy\.com/i,  label: "Etsy" },
  { id: "ebay",     match: /ebay\./i,     label: "eBay" },
  { id: "amazon",   match: /amazon\./i,   label: "Amazon" }
];

function detectCurrentPlatform(hostname = window.location.hostname) {
  for (const p of PLATFORM_DETECTORS) {
    if (p.match.test(hostname)) return p.id;
  }
  return "generic";
}

function extractJsonLdProduct() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const raw = JSON.parse(script.textContent || "{}");
      const candidates = Array.isArray(raw) ? raw : raw["@graph"] ? raw["@graph"] : [raw];
      for (const item of candidates) {
        if (item["@type"] === "Product" || (Array.isArray(item["@type"]) && item["@type"].includes("Product"))) {
          const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers || {};
          const images = Array.isArray(item.image)
            ? item.image.map((img) => (typeof img === "string" ? img : img.url))
            : item.image
            ? [typeof item.image === "string" ? item.image : item.image.url]
            : [];

          return {
            title: item.name || "",
            description: item.description || "",
            sku: item.sku || item.mpn || item.productID || "",
            brand: typeof item.brand === "object" ? item.brand?.name : item.brand || "",
            price: parseLocalePriceNumber(offers.price ?? offers.lowPrice),
            currency: offers.priceCurrency || "USD",
            condition: offers.itemCondition || "",
            color: item.color || "",
            material: item.material || "",
            category: item.category || "",
            images: images.filter(Boolean)
          };
        }
      }
    } catch (e) {}
  }
  return {};
}

function upgradeImageUrlToHighRes(url, platform) {
  if (!url) return "";
  if (platform === "ebay") {
    return url.replace(/s-l\d+\.(jpg|png|webp)/i, "s-l1600.jpg");
  }
  if (platform === "etsy") {
    return url.replace(/il_\d+x\d+|il_\d+xN/i, "il_fullxfull");
  }
  if (platform === "amazon") {
    return url.replace(/\._[A-Z0-9,_]+_\.(jpg|png)/i, ".$1");
  }
  if (platform === "vinted") {
    return url.replace(/\/\d+x\d+\//, "/f800/");
  }
  return url;
}

const PLATFORM_SCRAPER_ADAPTERS = {
  ebay: () => {
    // Specifically targets eBay price box e.g. "USD514,52" or "Aproximadamente 461,74 EUR"
    const priceEl =
      document.querySelector('.x-price-primary span') ||
      document.querySelector('#prcIsum') ||
      document.querySelector('[itemprop="price"]');
    const rawPrice = priceEl ? priceEl.textContent.trim() : "";
    const parsedPrice = parseLocalePriceNumber(rawPrice);

    const titleEl = document.querySelector('h1.x-item-title__mainTitle span') || document.querySelector('h1');
    const rawTitle = titleEl ? titleEl.textContent.replace(/^Details about\s+/i, "").trim() : document.title;

    const imgs = Array.from(document.querySelectorAll('.ux-image-carousel-item img, #vi_main_img_fs img'))
      .map((img) => upgradeImageUrlToHighRes(img.getAttribute("data-zoom-src") || img.src, "ebay"));

    return {
      title: rawTitle,
      price: parsedPrice,
      images: imgs
    };
  },

  vinted: () => {
    const pEl = document.querySelector('[data-testid="item-price"]');
    return {
      title: document.querySelector('[data-testid="item-title"], h1')?.textContent?.trim(),
      price: parseLocalePriceNumber(pEl?.textContent || ""),
      images: Array.from(document.querySelectorAll('.item-photos img')).map((img) => upgradeImageUrlToHighRes(img.src, "vinted"))
    };
  },

  depop: () => {
    const pEl = document.querySelector('[aria-label*="Price"], [data-testid="product__price"]');
    return {
      title: document.querySelector('h1, [data-testid="product__title"]')?.textContent?.trim(),
      price: parseLocalePriceNumber(pEl?.textContent || ""),
      images: Array.from(document.querySelectorAll('picture img')).map((i) => i.src)
    };
  },

  wallapop: () => {
    const pEl = document.querySelector('.card-product-detail-price');
    return {
      title: document.querySelector('h1.card-product-detail-title')?.textContent?.trim(),
      price: parseLocalePriceNumber(pEl?.textContent || ""),
      images: Array.from(document.querySelectorAll('tsl-item-detail-picture img')).map((i) => i.src)
    };
  },

  amazon: () => {
    const pEl = document.querySelector('.a-price .a-offscreen');
    return {
      title: document.querySelector('#productTitle')?.textContent?.trim(),
      price: parseLocalePriceNumber(pEl?.textContent || ""),
      images: Array.from(document.querySelectorAll('#altImages img')).map((i) => upgradeImageUrlToHighRes(i.src, "amazon"))
    };
  },

  etsy: () => {
    const pEl = document.querySelector('[data-buy-box-region="price"] p');
    return {
      title: document.querySelector('h1[data-buy-box-listing-title]')?.textContent?.trim(),
      price: parseLocalePriceNumber(pEl?.textContent || ""),
      images: Array.from(document.querySelectorAll('[data-carousel-pane-list] img')).map((i) => upgradeImageUrlToHighRes(i.src, "etsy"))
    };
  }
};

function normalizeConditionEnum(raw = "") {
  const s = String(raw).toLowerCase();
  if (s.includes("new with tag") || s.includes("neuf avec") || s.includes("nuevo con") || s.includes("NewCond")) return "NEW_WITH_TAGS";
  if (s.includes("new without") || s.includes("neuf sans") || s.includes("open box")) return "NEW_WITHOUT_TAGS";
  if (s.includes("like new") || s.includes("très bon") || s.includes("como nuevo")) return "LIKE_NEW";
  if (s.includes("good") || s.includes("bon état") || s.includes("used")) return "VERY_GOOD";
  return "";
}

function scrapeUniversalProductPage() {
  const sourcePlatform = detectCurrentPlatform();
  const ldData = extractJsonLdProduct();
  const adapterFn = PLATFORM_SCRAPER_ADAPTERS[sourcePlatform];
  const domData = adapterFn ? adapterFn() : {};

  const title = domData.title || ldData.title || document.title;
  const price = domData.price ?? ldData.price ?? null;
  const mergedImages = Array.from(new Set([...(domData.images || []), ...(ldData.images || [])])).slice(0, 20);

  const urlMatch = window.location.pathname.match(/\/itm\/(?:.*\/)?(\d+)/) || window.location.pathname.match(/\/items\/(\d+)/);
  const itemId = urlMatch ? urlMatch[1] : Date.now().toString().slice(-6);
  const sku = `${sourcePlatform.toUpperCase().slice(0, 4)}-${itemId}`;

  return {
    sourcePlatform: sourcePlatform.toUpperCase(),
    sourceUrl: window.location.href.split("?")[0],
    sku,
    title: title.slice(0, 140),
    description: domData.description || ldData.description || title,
    price,
    quantity: 1,
    brand: domData.brand || ldData.brand || "",
    condition: normalizeConditionEnum(domData.conditionRaw || ldData.condition),
    images: mergedImages
  };
}

if (typeof window !== "undefined") {
  window.SyncFlowUniversalScraper = {
    detectCurrentPlatform,
    scrapeUniversalProductPage,
    parseLocalePriceNumber
  };
}
