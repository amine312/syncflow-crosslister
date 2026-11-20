const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const assert = require("node:assert/strict");
const path = require("node:path");

async function verify() {
  const server = spawn(process.execPath, [path.join(__dirname, "server.mjs")], {env: {...process.env, PORT: "0"}});
  let browser;
  try {
    const [line] = await once(server.stdout, "data");
    const url = String(line).match(/http:\/\/127\.0\.0\.1:\d+/)[0];
    browser = await chromium.launch({channel: "chrome"});
    const page = await browser.newPage({viewport: {width: 1100, height: 940}, deviceScaleFactor: 1});
    const errors = [];
    page.on("pageerror", err => errors.push(err.message));
    await page.goto(url);
    const card = page.locator(".card").nth(1);
    const post = card.getByRole("button", {name: "Open draft", exact: true});
    await post.click();
    await page.waitForFunction(() => document.querySelector("#toastBox").innerText.includes("selling price"));
    assert.equal(await page.locator("aside output").count(), 0);
    await card.locator(".inp-brand").fill("Tide Editions");
    await card.locator(".inp-price").fill("0");
    await card.getByRole("button", {name: "Save changes"}).click();
    await page.reload();
    assert.equal(await card.locator(".inp-price").inputValue(), "0.00");
    assert.equal(await card.locator(".inp-brand").inputValue(), "Tide Editions");
    await page.locator('[data-bulk-pct="10"]').click();
    assert.equal(await card.locator(".inp-price").inputValue(), "19.80");
    await card.locator(".inp-target").selectOption("etsy");
    await post.click();
    assert.match(await page.locator("aside output").innerText(), /coastal study.*etsy\.com/);
    await page.getByRole("button", {name:"Reset example"}).click();
    await page.waitForFunction(() => Array.from(document.images).length === 2 && Array.from(document.images).every(image => image.complete && image.naturalWidth > 0));
    assert.equal(await card.locator(".inp-price").inputValue(), "");
    assert.deepEqual(errors, []);
    if (process.argv[2]) await page.screenshot({path: process.argv[2], fullPage: true});
    console.log("Chrome passed: incomplete draft, edit, save, reload, zero, markup, draft target and reset.");
  } finally {
    await browser?.close();
    server.kill();
  }
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
