// chrome_extension/universal_poster.js
// Universal Multi-Marketplace Auto-Poster (Injects Standardized Master Product into ANY of the 7 Marketplaces)
// Supports: Etsy, eBay, Amazon, Vinted, Depop, Wallapop, and Zalando Partner Portal

function setInputVal(selectorList, value) {
  if (value === undefined || value === null || value === "") return false;
  const selectors = Array.isArray(selectorList) ? selectorList : [selectorList];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, String(value));
      else el.value = String(value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    }
  }
  return false;
}

const TARGET_POSTER_ADAPTERS = {
  // 1. VINTED (/items/new)
  vinted: async (product) => {
    setInputVal(['input[name="title"]', '[data-testid="title-input"]'], product.title.slice(0, 100));
    setInputVal(['textarea[name="description"]', '[data-testid="description-input"]'], product.description);
    setInputVal(['input[name="price"]', '[data-testid="price-input"]'], product.price);
    setInputVal(['input[name="brand"]', '[data-testid="brand-select-input"]'], product.brand);
    setInputVal(['input[name="size"]', '[data-testid="size-select-input"]'], product.size);
    setInputVal(['input[name="color"]', '[data-testid="color-select-input"]'], product.primaryColor);
  },

  // 2. DEPOP (/products/create)
  depop: async (product) => {
    // Depop combines description + hashtags (#tag1 #tag2) up to 1000 chars
    const hashtags = (product.tags || []).slice(0, 5).map((t) => `#${t.replace(/\s+/g, "")}`).join(" ");
    const depopCaption = `${product.title}\n\n${product.description}\n\n${hashtags}`.slice(0, 1000);

    setInputVal(['textarea[name="description"]', '[data-testid="description__input"]'], depopCaption);
    setInputVal(['input[name="priceAmount"]', '[data-testid="price__input"]'], product.price);
    setInputVal(['input[name="brand"]', '[data-testid="brand__input"]'], product.brand);
    setInputVal(['input[name="address"]', '[data-testid="location__input"]'], product.countryOfOrigin);
  },

  // 3. WALLAPOP (/app/catalog/upload)
  wallapop: async (product) => {
    setInputVal(['input[name="title"]', '#headline-input'], product.title.slice(0, 50));
    setInputVal(['textarea[name="description"]', '#description-textarea'], product.description.slice(0, 640));
    setInputVal(['input[name="sale_price"]', '#price-input'], product.price);
    setInputVal(['input[name="weight"]', '[formcontrolname="weight"]'], product.weightMajor);
  },

  // 4. ZALANDO PARTNER / ZDIRECT
  zalando: async (product) => {
    setInputVal(['input[name="article_name"]'], product.title);
    setInputVal(['input[name="partner_sku"]', 'input[name="ean"]'], product.upc !== "Does not apply" ? product.upc : product.sku);
    setInputVal(['input[name="brand_code"]'], product.brand);
    setInputVal(['input[name="supplier_color"]'], product.primaryColor);
    setInputVal(['input[name="outer_material"]'], product.materials?.[0]);
    setInputVal(['input[name="regular_price"]'], product.price);
  },

  // 5. ETSY (/your/shops/me/tools/listings/create)
  etsy: async (product) => {
    setInputVal(['input[name="title"]', '#listing-title-input'], product.title.slice(0, 140));
    setInputVal(['textarea[name="description"]', '#listing-description-textarea'], product.description);
    setInputVal(['input[name="price"]', '#listing-price-input'], product.price);
    setInputVal(['input[name="quantity"]', '#listing-quantity-input'], product.quantity);
    setInputVal(['input[name="sku"]', '#listing-sku-input'], product.sku);
    setInputVal(['select[name="who_made"]'], product.isHandmade === true ? "i_did" : undefined);
    setInputVal(['select[name="when_made"]'], product.whenMade);
  },

  // 6. EBAY (/sl/prelist/suggest)
  ebay: async (product) => {
    setInputVal(['input[name="title"]', 'input[aria-label*="Title"]'], product.title.slice(0, 80));
    setInputVal(['input[name="customLabel"]', 'input[aria-label*="Custom label"]'], product.sku);
    setInputVal(['input[name="price"]', 'input[aria-label*="Price"]'], product.price);
    setInputVal(['input[name="upc"]', 'input[aria-label*="UPC"]'], product.upc);
  },

  // 7. AMAZON SELLER CENTRAL
  amazon: async (product) => {
    setInputVal(['input[name="item_name"]'], product.title.slice(0, 200));
    setInputVal(['input[name="brand_name"]'], product.brand);
    setInputVal(['input[name="item_sku"]'], product.sku);
    setInputVal(['input[name="standard_price"]'], product.price);
    setInputVal(['input[name="quantity"]'], product.quantity);
  }
};

if (typeof window !== "undefined") {
  window.SyncFlowUniversalPoster = {
    TARGET_POSTER_ADAPTERS
  };
}
