import http from "node:http";
import { readFile } from "node:fs/promises";

const catalog = [
  { sku: "PRINT-ATLAS-A3", title: "Atlas / limited edition print", brand: "Atlas Studio", basePrice: 24, price: 30,
    specifics: { Format: "A3", Paper: "300 gsm matte" }, description: "Two-colour geometric print on matte stock. Sold unframed.", image: "atlas.png" },
  { sku: "PRINT-TIDE-A4", title: "Tide / coastal study", brand: "", basePrice: 18, price: null,
    specifics: { Format: "A4", Paper: "250 gsm satin" }, description: "A study in blue, printed on satin paper. Brand and selling price await review.", image: "tide.png" }
];
const key = "syncflow-demo-v1";
const files = new Map([
  ["/dashboard.js", ["../dashboard.js", "text/javascript"]], ["/review.js", ["../review.js", "text/javascript"]],
  ["/atlas.png", ["atlas.png", "image/png"]], ["/tide.png", ["tide.png", "image/png"]]
]);
const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/") {
      let html = await readFile(new URL("../dashboard.html", import.meta.url), "utf8");
      html = html.replace('<div class="toolbar">', '<aside style="margin:12px 0;color:#cbd5e1;font-size:13px">Local demo with fictional products. Draft actions stay in this tab. <button id="reset-demo">Reset example</button></aside><div class="toolbar">');
      html = html.replace('<script src="review.js">','<script src="/demo-api.js"></script><script src="review.js">');
      res.writeHead(200, {"Content-Type":"text/html; charset=utf-8"}).end(html);
    } else if (path === "/demo-api.js") {
      const script = `
        const storageKey = ${JSON.stringify(key)};
        const sampleCatalog = ${JSON.stringify(catalog)}.map(p => ({...p, images:[location.origin + "/" + p.image]}));
        function state() { return JSON.parse(localStorage.getItem(storageKey) || "null") || { savedCatalog: sampleCatalog }; }
        window.chrome ??= {};
        chrome.storage = { local: {
          get(keys, cb) { cb(state()); },
          set(values, cb) { localStorage.setItem(storageKey, JSON.stringify({...state(), ...values})); cb?.(); }
        }};
        chrome.tabs = {create({url}) {
          const notice = document.querySelector("aside");
          let output = notice.querySelector("output");
          if (!output) { output = document.createElement("output"); notice.append(" ", output); }
          output.textContent = "Draft preview: " + state().pendingProduct.title + " → " + new URL(url).hostname;
        }};
        document.querySelector("#reset-demo").onclick = () => {localStorage.removeItem(storageKey);location.reload();};`;
      res.writeHead(200, {"Content-Type":"text/javascript; charset=utf-8"}).end(script);
    } else if (files.has(path)) {
      const [file, type] = files.get(path);
      const data = await readFile(new URL(file, import.meta.url));
      res.writeHead(200, {"Content-Type":type}).end(data);
    } else res.writeHead(404).end();
  } catch { res.writeHead(500).end("Demo file unavailable"); }
});
server.listen(Number(process.env.PORT || 4173), "127.0.0.1", () => {
  console.log("SyncFlow demo: http://127.0.0.1:" + server.address().port);
});
