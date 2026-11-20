const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const load = (ctx, file) => vm.runInContext(readFileSync(file, "utf8"), ctx);
function fixture(price) {
  const location = new URL("https://www.ebay.com/itm/12345");
  const fields = {};
  const context = vm.createContext({
    window: { location }, URL,
    document: {
      title: "Studio print", documentElement: { outerHTML: "<html></html>" },
      querySelector: selector => selector === ".x-price-primary span" && price != null
        ? { textContent: price, getAttribute: () => null } : null,
      querySelectorAll: () => [], addEventListener() {},
      getElementById: id => fields[id] ??= { value: "" }
    }
  });
  load(context, "review.js");
  load(context, "popup.js");
  return { context, fields, product: context.harvestRawPageDataInTab() };
}
for (const [raw, expected] of [[null, null],["EUR 1.250,50",1250.5],["$0.00",0],["contact seller",null],["10 - 12",null],["1,000",null]]) {
  test("Capture amount " + raw, () => {
    const {product} = fixture(raw);
    assert.equal(product.price, expected);
    assert.equal(product.brand,"");
  });
}
test("Save incomplete, correct the fields, then prepare a zero-priced draft", () => {
  const {context,product} = fixture(null);
  context.sample = product;
  vm.runInContext("currentProduct = sample", context);
  const field = id => context.document.getElementById(id);
  field("productTitleInput").value = product.title;
  const draft = () => context.buildEditedProductPayload();
  assert.equal(draft().price,null);
  assert.equal(vm.runInContext("Review.missing(buildEditedProductPayload()).length",context),2);
  field("finalPriceInput").value = "0";
  field("brandInput").value = "Unbranded";
  assert.equal(draft().price,0);
  assert.equal(vm.runInContext("Review.message(buildEditedProductPayload())",context),"Ready for draft");
});
test("Catalog renders imported markup as text and leaves missing prices blank", () => {
  const grid = {querySelectorAll:()=>[]};
  const ctx = vm.createContext({URL,document:{getElementById:()=>grid,addEventListener(){}}});
  load(ctx,"review.js");load(ctx,"dashboard.js");
  vm.runInContext('catalog=[{title:"Print",sku:"A&B",description:"<b>Print</b>",price:null,brand:"",images:["file:///sample"]}];renderCatalog()',ctx);
  assert.match(grid.innerHTML,/&lt;b&gt;Print&lt;\/b&gt;/);
  assert.match(grid.innerHTML,/Review selling price, brand/);
  assert.doesNotMatch(grid.innerHTML,/value="0.00"|file:\/\/\/sample/);
});
