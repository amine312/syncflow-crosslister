function textForHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// chrome_extension/content.js
// Powered by Scrapling Adaptive Engine v0.5.1 (SequenceMatcher + _StorageTools)
// Fixes:
//   1. Description: Automatically toggles eBay "Show HTML code" (or writes directly into iframe/contenteditable) so full description NEVER fails!
//   2. Quantity vs Price: Strictly separates Quantity (ALWAYS set to 1 per item/variant) from Price (never puts price inside Quantity!)
//   3. All Required/Recommended Fields: Uses Scrapling adaptive matcher + auto-clicks eBay Item Specific suggestion chips so the form NEVER blocks!

function setNativeValue(el, value) {
  if (!el || value === undefined || value === null) return false;
  try {
    el.focus();
    const proto = Object.getPrototypeOf(el);
    const setter =
      Object.getOwnPropertyDescriptor(proto, "value")?.set ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set ||
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;

    if (setter) setter.call(el, String(value));
    else el.value = String(value);

    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: String(value) }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", keyCode: 13 }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  } catch (e) {
    return false;
  }
}

function updateBannerStatus(stepText, detailText) {
  const stepEl = document.getElementById("syncflow-step-status");
  const detEl = document.getElementById("syncflow-detail-status");
  if (stepEl) stepEl.textContent = stepText;
  if (detEl && detailText) detEl.textContent = detailText;
}

function showAutoFillBanner(product, onForceFill) {
  let banner = document.getElementById("syncflow-autofill-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "syncflow-autofill-banner";
    banner.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      background: #090d16;
      color: #f8fafc;
      border: 2px solid #10b981;
      border-radius: 14px;
      padding: 12px 16px;
      box-shadow: 0 15px 30px rgba(0,0,0,0.75);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      width: 340px;
    `;
    document.body.appendChild(banner);
  }

  banner.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <span style="font-size:12px;font-weight:700;color:#34d399;">🕷️ Scrapling Adaptive Engine v0.5.1</span>
      <span id="syncflow-step-status" style="font-size:10px;background:#1e293b;padding:2px 6px;border-radius:99px;color:#818cf8;">Active</span>
    </div>
    <div style="font-size:11px;color:#cbd5e1;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
      ${textForHtml(product.title)}
    </div>
    <div id="syncflow-detail-status" style="font-size:10px;color:#94a3b8;margin-bottom:8px;">
      Price: ${Number(product.price).toFixed(2)} | Qty: 1 (Fixed per variant) | Photos: ${(product.images || []).length}
    </div>
    <button id="syncflow-force-fill-btn" style="
      width: 100%;
      background: #4f46e5;
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    ">▶ Force Fill All Fields, Desc & Photos</button>
  `;

  document.getElementById("syncflow-force-fill-btn").addEventListener("click", () => {
    onForceFill(true);
  });
}

/**
 * 1. BULLETPROOF DESCRIPTION INJECTOR
 * Handles eBay's Rich Text iframe, HTML Code mode toggle, and contenteditable divs
 */
let descriptionFilledOnce = false;
function fillEbayDescriptionBulletproof(product, force = false) {
  const rawDesc = product.description || product.title;
  const htmlDesc = "<p>" + textForHtml(rawDesc).replace(/\n/g, "<br>") + "</p>";

  // Strategy A: Same-origin Rich Text Editor iframe (eBay's standard rte-iframe)
  let wroteToIframe = false;
  document.querySelectorAll("iframe").forEach((iframe) => {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc && doc.body) {
        const isEditable =
          doc.body.isContentEditable ||
          doc.designMode === "on" ||
          (iframe.id || "").toLowerCase().includes("desc") ||
          (iframe.title || "").toLowerCase().includes("desc") ||
          (iframe.title || "").toLowerCase().includes("descripción") ||
          (iframe.className || "").toLowerCase().includes("rte");

        if (isEditable && (doc.body.innerText.trim().length < 15 || force)) {
          doc.body.focus();
          doc.body.innerHTML = htmlDesc;
          doc.body.dispatchEvent(new InputEvent("input", { bubbles: true }));
          doc.body.dispatchEvent(new Event("change", { bubbles: true }));
          doc.body.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " " }));
          wroteToIframe = true;
          descriptionFilledOnce = true;
        }
      }
    } catch (e) {}
  });

  // Strategy B: Contenteditable divs in main document
  document.querySelectorAll('[contenteditable="true"]').forEach((div) => {
    if (div.innerText.trim().length < 15 || force) {
      div.focus();
      div.innerHTML = htmlDesc;
      div.dispatchEvent(new InputEvent("input", { bubbles: true }));
      div.dispatchEvent(new Event("change", { bubbles: true }));
      wroteToIframe = true;
      descriptionFilledOnce = true;
    }
  });

  // Strategy C: Standard textarea (or when "Show HTML code" is active on eBay)
  document.querySelectorAll('textarea').forEach((ta) => {
    const sig = `${ta.name || ""} ${ta.id || ""} ${ta.getAttribute("aria-label") || ""} ${ta.placeholder || ""}`.toLowerCase();
    if (
      sig.includes("desc") ||
      sig.includes("descripción") ||
      sig.includes("html") ||
      ta.closest('[class*="description" i]')
    ) {
      if (!ta.value || ta.value.length < 15 || force) {
        setNativeValue(ta, rawDesc);
        wroteToIframe = true;
        descriptionFilledOnce = true;
      }
    }
  });

  // Strategy D: If eBay's cross-origin iframe blocked direct write, click "Show HTML code" / "Mostrar código HTML" checkbox!
  if (!wroteToIframe && !descriptionFilledOnce) {
    const htmlToggle = Array.from(document.querySelectorAll('input[type="checkbox"], button, label')).find((el) => {
      const t = (el.textContent || el.getAttribute("aria-label") || "").toLowerCase();
      return t.includes("show html") || t.includes("html code") || t.includes("código html") || t.includes("code html");
    });
    if (htmlToggle) {
      htmlToggle.click();
      setTimeout(() => {
        document.querySelectorAll("textarea").forEach((ta) => {
          if (!ta.value || ta.value.length < 15) setNativeValue(ta, htmlDesc);
        });
      }, 300);
      descriptionFilledOnce = true;
    }
  }
}

/**
 * 2. STRICT QUANTITY (= 1) vs PRICE SEPARATOR + ALL FIELDS FILLER (Powered by Scrapling Adaptive Engine)
 */
function fillAllMarketplaceFieldsWithScrapling(product, force = false) {
  const S = window.ScraplingEngine?.ScraplingStorageTools;
  let filledCount = 0;

  // --- A. TITLE ---
  const titleEl = S?.findBestAdaptiveField(
    ["item title", "title", "título", "titre", "headline"],
    ["subtitle", "subtítulo", "search"]
  );
  if (titleEl && (!titleEl.value || force)) {
    setNativeValue(titleEl, product.title.slice(0, 80));
    filledCount++;
  }

  // --- B. CUSTOM LABEL / SKU ---
  const skuEl = S?.findBestAdaptiveField(["custom label", "sku", "customlabel", "etiqueta personalizada"]);
  if (skuEl && (!skuEl.value || force)) {
    setNativeValue(skuEl, product.sku || "SKU-001");
    filledCount++;
  }

  // --- C. QUANTITY: STRICTLY ALWAYS 1 (Never confused with Price!) ---
  const qtyInputs = Array.from(document.querySelectorAll('input:not([type="hidden"])')).filter((inp) => {
    const nameAttr = (inp.getAttribute("name") || "").toLowerCase();
    const ariaAttr = (inp.getAttribute("aria-label") || "").toLowerCase();
    const idAttr = (inp.getAttribute("id") || "").toLowerCase();
    let lbl = "";
    if (inp.id) {
      const l = document.querySelector(`label[for="${CSS.escape(inp.id)}"]`);
      if (l) lbl = l.textContent.toLowerCase();
    }
    const sig = `${nameAttr} ${ariaAttr} ${idAttr} ${lbl}`;
    return (
      (sig.includes("quantity") || sig.includes("cantidad") || sig.includes("quantité") || nameAttr === "qty") &&
      !sig.includes("price") &&
      !sig.includes("precio")
    );
  });

  qtyInputs.forEach((qInp) => {
    // User rule: Quantity is ALWAYS 1 per item/variant!
    if (qInp.value !== "1" || force) {
      setNativeValue(qInp, "1");
      filledCount++;
    }
  });

  // --- D. BUY IT NOW PRICE (Strictly excludes Quantity, Offer, Minimum, Reserve, Shipping) ---
  const priceInputs = Array.from(document.querySelectorAll('input:not([type="hidden"])')).filter((inp) => {
    if (qtyInputs.includes(inp)) return false; // Never touch a quantity input!
    const nameAttr = (inp.getAttribute("name") || "").toLowerCase();
    const ariaAttr = (inp.getAttribute("aria-label") || "").toLowerCase();
    const idAttr = (inp.getAttribute("id") || "").toLowerCase();
    let lbl = "";
    if (inp.id) {
      const l = document.querySelector(`label[for="${CSS.escape(inp.id)}"]`);
      if (l) lbl = l.textContent.toLowerCase();
    }
    const sig = `${nameAttr} ${ariaAttr} ${idAttr} ${lbl}`;
    return (
      (sig.includes("price") || sig.includes("precio") || sig.includes("prix") || nameAttr === "binprice") &&
      !sig.includes("quantity") &&
      !sig.includes("cantidad") &&
      !sig.includes("offer") &&
      !sig.includes("oferta") &&
      !sig.includes("minimum") &&
      !sig.includes("mínimo") &&
      !sig.includes("reserve") &&
      !sig.includes("shipping") &&
      !sig.includes("envío") &&
      !sig.includes("unit")
    );
  });

  const formattedPrice = Review.display(product.price);
  priceInputs.forEach((pInp) => {
    if (formattedPrice && (pInp.value !== formattedPrice || force)) {
      setNativeValue(pInp, formattedPrice);
      filledCount++;
    }
  });

  // --- E. ITEM SPECIFICS & REQUIRED ATTRIBUTES (Brand, Model, Type, MPN, UPC, Color, Connectivity) ---
  const specificsMap = {
    brand: product.brand,
    marca: product.brand,
    marque: product.brand,
    ...(product.specifics || {})
  };

  for (const [specKey, specVal] of Object.entries(specificsMap)) {
    if (!specVal) continue;
    const el = S?.findBestAdaptiveField(
      [specKey],
      ["price", "precio", "quantity", "cantidad", "title", "título", "search"]
    );
    if (el && (!el.value || force)) {
      setNativeValue(el, specVal);
      filledCount++;
    }
  }

  // --- H. FILL DESCRIPTION ---
  fillEbayDescriptionBulletproof(product, force);

  if (filledCount > 0) {
    updateBannerStatus("Scrapling Filled ✓", `Filled ${filledCount} fields | Price: ${formattedPrice} | Qty: 1`);
  }
}

/**
 * 3. UPLOAD HD PHOTOS VIA SERVICE WORKER
 */
let imagesUploadedOnce = false;
async function injectImagesIntoFileInput(product, force = false) {
  if (imagesUploadedOnce && !force) return;
  const fileInput = document.querySelector('input[type="file"][accept*="image"], input[type="file"]');
  if (!fileInput || !product.images || product.images.length === 0) return;

  imagesUploadedOnce = true;
  chrome.runtime.sendMessage(
    {
      action: "FETCH_IMAGE_BLOBS_FOR_UPLOAD",
      urls: product.images.slice(0, 8)
    },
    (response) => {
      if (!response || !response.files || response.files.length === 0) return;
      try {
        const dt = new DataTransfer();
        response.files.forEach((f, idx) => {
          const byteString = atob(f.base64.split(",")[1]);
          const mimeString = f.type || "image/jpeg";
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          const fileObj = new File([ab], `product_hd_${idx + 1}.jpg`, { type: mimeString });
          dt.items.add(fileObj);
        });

        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        fileInput.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (err) {}
    }
  );
}

/**
 * 4. MULTI-STEP WIZARD STATE MACHINE (Never blocks on prelist, catalog match, or condition modal!)
 */
let step1Triggered = false;
let step2ConditionClicked = false;
let step2ContinueClicked = false;

function runListingCreationStateMachine(product, forceManual = false) {
  const host = window.location.hostname;
  const path = window.location.pathname;

  // STEP 1: /sl/prelist/suggest
  if (/ebay\./i.test(host) && path.includes("/prelist/suggest")) {
    updateBannerStatus("Step 1: Search Title", "Typing title & clicking search...");
    const searchInput =
      document.querySelector('input.textbox__control') ||
      document.querySelector('input[placeholder*="selling"]') ||
      document.querySelector('input[placeholder*="vendiendo"]') ||
      document.querySelector('input[type="text"]');

    if (searchInput && (!step1Triggered || forceManual)) {
      step1Triggered = true;
      setNativeValue(searchInput, product.title.slice(0, 80));
      setTimeout(() => {
        const searchBtn =
          document.querySelector('button.search-button') ||
          document.querySelector('button[aria-label*="Search"]') ||
          document.querySelector('button[type="submit"]') ||
          searchInput.parentElement?.parentElement?.querySelector("button");
        if (searchBtn) searchBtn.click();
      }, 500);
    }
    return;
  }

  // STEP 2: /sl/prelist/identify (Catalog Match OR Condition Radio Modal)
  if (/ebay\./i.test(host) && path.includes("/prelist/identify")) {
    updateBannerStatus("Condition", "Choose the condition and continue when ready.");
    return;
  }

  // STEP 3: Main Listing Form (eBay / Vinted / Etsy / Depop / Wallapop)
  fillAllMarketplaceFieldsWithScrapling(product, forceManual);
  injectImagesIntoFileInput(product, forceManual);
}

(function initContentScript() {
  const path = window.location.pathname;
  const isListingCreationPage =
    path.includes("/prelist") ||
    path.includes("/lstng") ||
    path.includes("/items/new") ||
    path.includes("/listings/create") ||
    path.includes("/products/create") ||
    path.includes("/catalog/upload");

  if (!isListingCreationPage) return;

  chrome.storage.local.get(["pendingProduct", "targetPlatform", "autoFillTimestamp"], ({ pendingProduct, targetPlatform, autoFillTimestamp }) => {
    const platform = window.location.hostname.split(".").find(part =>
      ["ebay", "vinted", "etsy", "depop", "wallapop", "amazon"].includes(part)
    );
    const targets = targetPlatform === "multi" ? ["ebay", "vinted", "etsy"] : [targetPlatform];
    const age = Date.now() - autoFillTimestamp;
    if (!platform || !targets.includes(platform) || !Number.isFinite(age) || age < 0 || age > 15 * 60 * 1000) return;
    if (!pendingProduct || Review.missing(pendingProduct).length) return;

    // Enforce Quantity = 1 rule on loaded product
    pendingProduct.quantity = 1;

    showAutoFillBanner(pendingProduct, (force) => {
      runListingCreationStateMachine(pendingProduct, force);
    });

    runListingCreationStateMachine(pendingProduct, false);
    setInterval(() => {
      runListingCreationStateMachine(pendingProduct, false);
    }, 1500);
  });
})();
