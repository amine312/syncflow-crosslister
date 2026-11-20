#!/usr/bin/env python3
"""Local HTML parser for the SyncFlow extension."""
import re
import json
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from scrapling.parser import Selector

app = FastAPI(title="SyncFlow Real Scrapling v0.5.1 Server")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"chrome-extension://[a-p]{32}",
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScrapePayload(BaseModel):
    url: str
    html: str = ""
    iframe_url: str = ""



def parse_locale_price(raw):
    match = re.fullmatch(r"(?:[A-Za-z]{3}|[$€£])?\s*(\d[\d.,\s]*)(?:\s*(?:[A-Za-z]{3}|[$€£]))?", str(raw or "").strip())
    if not match:
        return None
    digits = re.sub(r"\s", "", match[1])
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+,\d{1,2}", digits):
        digits = digits.replace(".", "")
    elif re.fullmatch(r"\d{1,3}(?:,\d{3})+\.\d{1,2}", digits):
        digits = digits.replace(",", "")
    if re.fullmatch(r"\d+(?:[.,]\d{1,2})?", digits):
        return float(digits.replace(",", "."))
    return None


@app.get("/health")
def health_check():
    return {"status": "ok", "engine": "Scrapling-0.5.1-Python"}


@app.post("/api/scrapling/scrape")
def scrape_marketplace_product(req: ScrapePayload):
    if not req.html:
        raise HTTPException(422, "Captured HTML is required")
    sel = Selector(req.html, url=req.url)

    # 2. Extract Title
    title = (
        sel.css("h1.x-item-title__mainTitle span::text").get()
        or sel.css('[data-testid="item-title"]::text').get()
        or sel.css("#productTitle::text").get()
        or sel.css("h1[data-buy-box-listing-title]::text").get()
        or sel.css("h1::text").get()
        or ""
    ).strip()
    title = re.sub(r"^Details about\s+", "", title, flags=re.I).strip()

    # 3. Extract Price
    price_raw = (
        sel.css(".x-price-primary span::text").get()
        or sel.css("#prcIsum::text").get()
        or sel.css('[data-testid="item-price"]::text').get()
        or sel.css(".a-price .a-offscreen::text").get()
        or sel.css('[data-buy-box-region="price"] p::text').get()
        or sel.css(".card-product-detail-price::text").get()
        or ""
    )
    price = parse_locale_price(price_raw)

    # 4. Extract ALL Item Specifics (eBay modern evo layout + classic layout + Vinted + Amazon)
    specifics = {}

    # 4A. Modern eBay dl/dt/dd and ux-labels-values
    for dl in sel.css("dl.ux-labels-values, div.ux-labels-values, .ux-layout-section-evo__col"):
        label_nodes = dl.css(".ux-labels-values__labels .ux-textspans::text, dt .ux-textspans::text, .ux-labels-values__labels::text").getall()
        val_nodes = dl.css(".ux-labels-values__values .ux-textspans::text, dd .ux-textspans::text, .ux-labels-values__values::text").getall()
        lbl = " ".join([x.strip() for x in label_nodes if x.strip()]).replace(":", "").strip()
        val = " ".join([x.strip() for x in val_nodes if x.strip()]).strip()
        if lbl and val and len(lbl) < 55 and len(val) < 180:
            specifics[lbl] = val

    # 4B. Vinted & Generic Table rows
    for row in sel.css(".details-list__item, #productDetails_techSpec_section_1 tr, #detailBullets_feature_div li"):
        texts = [t.strip() for t in row.css("*::text").getall() if t.strip() and t.strip() != ":"]
        if len(texts) >= 2:
            k = texts[0].replace(":", "").strip()
            v = " ".join(texts[1:]).strip()
            if k and v and len(k) < 50 and len(v) < 180:
                specifics[k] = v

    # 5. Extract REAL Full Description!
    # On eBay, the real seller description is inside <iframe id="desc_ifr" src="https://vi.vipr.ebaydesc.com/...">
    full_description = ""
    if not full_description:
        # Try page description containers (Vinted, Etsy, Depop, Amazon)
        desc_nodes = sel.css(
            '[data-product-details-description-text-content] *::text, '
            '[data-testid="product__description"] *::text, '
            '#feature-bullets ul li span.a-list-item::text, '
            '.card-product-detail-description *::text, '
            '[itemprop="description"] *::text'
        ).getall()
        full_description = "\n".join([d.strip() for d in desc_nodes if d.strip()])

    # Append formatted Item Specifics table to description so nothing is ever lost
    if specifics:
        spec_lines = "\n".join([f"• {k}: {v}" for k, v in specifics.items()])
        if full_description:
            full_description = f"{full_description}\n\n--- Specifications / Características ---\n{spec_lines}"
        else:
            full_description = f"{title}\n\n--- Specifications / Características ---\n{spec_lines}"

    # 6. Extract High-Res Photos (Upgrades eBay s-l500 -> s-l1600.jpg)
    images = []
    for img in sel.css(".ux-image-carousel-item img, .ux-image-filmstrip-carousel-item img, .item-photos img, #altImages img, [data-carousel-pane-list] img"):
        src = img.attrib.get("data-zoom-src") or img.attrib.get("src") or ""
        if "ebayimg.com" in src:
            src = re.sub(r"s-l\d+\.(jpg|png|webp)", "s-l1600.jpg", src, flags=re.I)
        if src.startswith("http") and src not in images:
            images.append(src)

    brand = (
        specifics.get("Marca")
        or specifics.get("Brand")
        or specifics.get("Marque")
        or ""
    )
    condition = (
        specifics.get("Estado")
        or specifics.get("Condition")
        or specifics.get("État")
        or ""
    )

    return {
        "engine": "Scrapling-0.5.1-Python",
        "title": title,
        "price": price,
        "quantity": 1,  # Always 1 per variant
        "brand": brand,
        "condition": condition,
        "specifics": specifics,
        "specificsCount": len(specifics),
        "description": full_description or title,
        "images": images[:12],
    }


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765)
