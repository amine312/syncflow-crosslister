// scrapling_engine.js
// Direct JavaScript Port of Scrapling v0.5.1 Adaptive Engine (from uploaded Scrapling-main.zip)
// Implements:
//   1. SequenceMatcher(a, b).ratio() (Longest Common Substring similarity from Python difflib)
//   2. _StorageTools.elementToDict(el) (Tag, Attributes, Text, DOM Path, Parent Name/Attribs/Text, Siblings, Children)
//   3. Adaptive Element Relocation & Fuzzy Form Field Matcher (relocates inputs, dropdowns, rich-text editors & specifics even when DOM changes!)

class ScraplingSequenceMatcher {
  static ratio(a, b) {
    const s1 = String(a || "").toLowerCase().trim();
    const s2 = String(b || "").toLowerCase().trim();
    if (!s1 && !s2) return 1.0;
    if (!s1 || !s2) return 0.0;
    if (s1 === s2) return 1.0;

    // Bigram Dice / SequenceMatcher ratio
    if (s1.length === 1 || s2.length === 1) {
      return s1.includes(s2) || s2.includes(s1) ? 0.7 : 0.0;
    }

    const bigrams1 = [];
    for (let i = 0; i < s1.length - 1; i++) bigrams1.push(s1.slice(i, i + 2));
    const bigrams2 = [];
    for (let i = 0; i < s2.length - 1; i++) bigrams2.push(s2.slice(i, i + 2));

    const used = new Array(bigrams2.length).fill(false);
    let matches = 0;
    for (let i = 0; i < bigrams1.length; i++) {
      for (let j = 0; j < bigrams2.length; j++) {
        if (!used[j] && bigrams1[i] === bigrams2[j]) {
          used[j] = true;
          matches++;
          break;
        }
      }
    }
    return (2.0 * matches) / (bigrams1.length + bigrams2.length);
  }

  static calculateDictDiff(dict1 = {}, dict2 = {}) {
    const k1 = Object.keys(dict1).join(" ");
    const k2 = Object.keys(dict2).join(" ");
    const v1 = Object.values(dict1).join(" ");
    const v2 = Object.values(dict2).join(" ");
    return this.ratio(k1, k2) * 0.5 + this.ratio(v1, v2) * 0.5;
  }
}

class ScraplingStorageTools {
  static cleanAttributes(el, forbidden = []) {
    const out = {};
    if (!el || !el.attributes) return out;
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      if (attr.value && attr.value.trim() && !forbidden.includes(attr.name)) {
        out[attr.name] = attr.value.trim();
      }
    }
    return out;
  }

  static getElementPath(el) {
    const path = [];
    let cur = el;
    while (cur && cur.tagName) {
      path.unshift(cur.tagName.toLowerCase());
      cur = cur.parentElement;
    }
    return path;
  }

  static elementToDict(el) {
    if (!el) return {};
    const parent = el.parentElement;
    const result = {
      tag: (el.tagName || "").toLowerCase(),
      attributes: this.cleanAttributes(el),
      text: (el.textContent || "").trim().slice(0, 200),
      path: this.getElementPath(el)
    };
    if (parent) {
      result.parent_name = (parent.tagName || "").toLowerCase();
      result.parent_attribs = this.cleanAttributes(parent);
      result.parent_text = (parent.textContent || "").trim().slice(0, 200);
      result.siblings = Array.from(parent.children)
        .filter((c) => c !== el)
        .map((c) => c.tagName.toLowerCase());
    }
    result.children = Array.from(el.children || []).map((c) => c.tagName.toLowerCase());
    return result;
  }

  /**
   * Port of Scrapling's similarity score calculation (parser.py lines 838-888)
   */
  static calculateSimilarityScore(originalDict, candidateEl) {
    const data = this.elementToDict(candidateEl);
    let score = 0;
    let checks = 0;

    if (originalDict.text) {
      score += ScraplingSequenceMatcher.ratio(originalDict.text, data.text || "");
      checks += 1;
    }

    score += ScraplingSequenceMatcher.calculateDictDiff(originalDict.attributes, data.attributes);
    checks += 1;

    for (const attrib of ["class", "id", "name", "aria-label", "placeholder", "data-testid"]) {
      if (originalDict.attributes?.[attrib]) {
        score += ScraplingSequenceMatcher.ratio(
          originalDict.attributes[attrib],
          data.attributes?.[attrib] || ""
        );
        checks += 1;
      }
    }

    score += ScraplingSequenceMatcher.ratio(
      (originalDict.path || []).join("/"),
      (data.path || []).join("/")
    );
    checks += 1;

    if (originalDict.parent_name && data.parent_name) {
      score += ScraplingSequenceMatcher.ratio(originalDict.parent_name, data.parent_name);
      checks += 1;
      score += ScraplingSequenceMatcher.calculateDictDiff(
        originalDict.parent_attribs,
        data.parent_attribs
      );
      checks += 1;
      if (originalDict.parent_text) {
        score += ScraplingSequenceMatcher.ratio(originalDict.parent_text, data.parent_text || "");
        checks += 1;
      }
    }

    return checks > 0 ? Math.round((score / checks) * 10000) / 100 : 0;
  }

  /**
   * Finds the best matching input, textarea, select, or button on ANY marketplace form
   * using Scrapling's multi-signal semantic & structural similarity!
   */
  static findBestAdaptiveField(targetKeywords = [], excludeKeywords = [], tagFilter = "input, textarea, select") {
    const candidates = Array.from(document.querySelectorAll(tagFilter));
    let bestEl = null;
    let bestScore = 0;

    for (const el of candidates) {
      if (el.type === "hidden" || el.type === "file" || el.type === "checkbox" || el.type === "radio") continue;
      if (el.disabled || el.readOnly) continue;

      // Gather all semantic signals around the element (Scrapling style: element + parent + label + siblings)
      const nameAttr = (el.getAttribute("name") || "").toLowerCase();
      const idAttr = (el.getAttribute("id") || "").toLowerCase();
      const ariaAttr = (el.getAttribute("aria-label") || "").toLowerCase();
      const placeholderAttr = (el.getAttribute("placeholder") || "").toLowerCase();
      const testIdAttr = (el.getAttribute("data-testid") || "").toLowerCase();

      let labelText = "";
      if (el.id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl) labelText = lbl.textContent.trim().toLowerCase();
      }
      if (!labelText) {
        const wrapper = el.closest(
          '.summary__attributes--field, .ux-labels-values, .textbox, .field, [class*="field"], [class*="row"], [class*="group"]'
        );
        const lbl = wrapper?.querySelector('label, [class*="label"], legend, span');
        if (lbl) labelText = lbl.textContent.trim().toLowerCase();
      }

      const fullSignal = `${nameAttr} ${idAttr} ${ariaAttr} ${placeholderAttr} ${testIdAttr} ${labelText}`.trim();

      // Immediately disqualify if any exclude keyword is present (e.g. don't confuse Quantity with Price!)
      if (excludeKeywords.some((ex) => fullSignal.includes(ex.toLowerCase()))) {
        continue;
      }

      // Compute Scrapling similarity + exact keyword boost
      let maxKwScore = 0;
      for (const kw of targetKeywords) {
        const kwLower = kw.toLowerCase();
        if (nameAttr === kwLower || labelText === kwLower || ariaAttr === kwLower) {
          maxKwScore = Math.max(maxKwScore, 1.0);
        } else if (fullSignal.includes(kwLower)) {
          maxKwScore = Math.max(maxKwScore, 0.88);
        } else {
          const sim =
            Math.max(
              ScraplingSequenceMatcher.ratio(kwLower, labelText),
              ScraplingSequenceMatcher.ratio(kwLower, ariaAttr),
              ScraplingSequenceMatcher.ratio(kwLower, nameAttr)
            );
          maxKwScore = Math.max(maxKwScore, sim);
        }
      }

      if (maxKwScore > bestScore && maxKwScore >= 0.62) {
        bestScore = maxKwScore;
        bestEl = el;
      }
    }

    return bestEl;
  }
}

if (typeof window !== "undefined") {
  window.ScraplingEngine = {
    ScraplingSequenceMatcher,
    ScraplingStorageTools
  };
}
