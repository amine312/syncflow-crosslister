// chrome_extension/background.js
// Service Worker for SyncFlow + Scrapling v0.5.1
// 1. Fetches cross-origin eBay Description iframes (vi.vipr.ebaydesc.com) cleanly so Description is 100% real!
// 2. Calls local Python Scrapling Server (http://127.0.0.1:8765/api/scrapling/scrape) if running, with seamless JS fallback
// 3. Fetches remote HD product photos and converts them to Base64 blobs for DataTransfer upload

const SCRAPLING_SERVER_URL = "http://127.0.0.1:8765/api/scrapling/scrape";

function cleanHtmlToFormattedText(htmlString) {
  if (!htmlString) return "";
  // Remove <script>, <style>, <head>, and comments
  let s = htmlString
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Convert block tags and <br> to newlines
  s = s
    .replace(/<(br|p|div|li|tr|h[1-6])[^>]*>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  // Decode basic HTML entities
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

  // Clean consecutive spaces and blank lines
  const lines = s
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 1);

  const deduped = [];
  for (const line of lines) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== line) {
      deduped.push(line);
    }
  }
  return deduped.join("\n");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. Deep Scrape via Python Scrapling Server OR Service Worker Iframe Fetcher
  if (message.action === "DEEP_SCRAPLING_EXTRACT") {
    const { rawPageData } = message;

    (async () => {
      // First: Try local Python Scrapling Server (127.0.0.1:8765) if the user started START_SCRAPLING_SERVER.bat
      try {
        const pyRes = await fetch(SCRAPLING_SERVER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: rawPageData.sourceUrl,
            html: rawPageData.fullHtml || "",
            iframe_url: rawPageData.iframeDescUrl || ""
          })
        });
        if (pyRes.ok) {
          const pyData = await pyRes.json();
          sendResponse({
            success: true,
            engine: "Scrapling-Python-0.5.1",
            product: {
              ...rawPageData,
              ...pyData,
              title: rawPageData.title || pyData.title,
              brand: rawPageData.brand || pyData.brand || "",
              price: rawPageData.price ?? pyData.price ?? null,
              specifics: { ...rawPageData.specifics, ...pyData.specifics },
              images: [...new Set([...(rawPageData.images || []), ...(pyData.images || [])])],
              quantity: 1
            }
          });
          return;
        }
      } catch (e) {
        // Python server not running locally; fall back to Service Worker cross-origin iframe fetch
      }

      // Second: Fetch cross-origin eBay Description Iframe (`iframe#desc_ifr` / `ebaydesc.com`) from Service Worker!
      let realIframeDesc = "";
      if (/^https:\/\/(?:[a-z0-9-]+\.)*ebaydesc\.com\//i.test(rawPageData.iframeDescUrl || "")) {
        try {
          const iframeResp = await fetch(rawPageData.iframeDescUrl, { redirect: "error", credentials: "omit" });
          const iframeHtml = await iframeResp.text();
          realIframeDesc = cleanHtmlToFormattedText(iframeHtml);
        } catch (err) {}
      }

      // Build comprehensive description combining real seller description + all extracted Item Specifics
      const specsEntries = Object.entries(rawPageData.specifics || {});
      const specsBlock =
        specsEntries.length > 0
          ? "\n\n--- Item Specifics / Características ---\n" +
            specsEntries.map(([k, v]) => `• ${k}: ${v}`).join("\n")
          : "";

      const finalDescription =
        (realIframeDesc || rawPageData.pageDescription || rawPageData.title) + specsBlock;

      sendResponse({
        success: true,
        engine: "Scrapling-JS-Adaptive",
        product: {
          ...rawPageData,
          description: finalDescription.trim(),
          specificsCount: specsEntries.length,
          quantity: 1
        }
      });
    })();

    return true; // Keep async channel open
  }

  // 2. Fetch remote HD product photos as Base64 blobs for <input type="file"> upload
  if (message.action === "FETCH_IMAGE_BLOBS_FOR_UPLOAD") {
    const urls = message.urls || [];
    Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = "data:" + (blob.type || "image/jpeg") + ";base64," + btoa(binary);
          return { base64, type: blob.type || "image/jpeg" };
        } catch (e) {
          return null;
        }
      })
    ).then((results) => {
      sendResponse({ files: results.filter(Boolean) });
    });
    return true;
  }
});
