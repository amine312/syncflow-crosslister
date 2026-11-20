const Review = {
  amount(value) {
    if (value == null || String(value).trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  },
  display(value) {
    return this.amount(value)?.toFixed(2) ?? "";
  },
  missing(product) {
    const fields = [];
    if (!product.title?.trim()) fields.push("title");
    if (this.amount(product.price) === null) fields.push("selling price");
    if (!product.brand?.trim()) fields.push("brand (enter Unbranded if applicable)");
    return fields;
  },
  message(product) {
    const fields = this.missing(product);
    return fields.length ? "Review " + fields.join(", ") : "Ready for draft";
  }
};
