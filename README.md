# SyncFlow Cross-Lister

A Chrome extension for sellers who maintain the same product on several marketplaces. Capture a listing, correct its fields in a local catalog, and open a draft for the destination marketplace. **Version 2.6.0** introduces a review step for missing product information.

## Try the review workflow

1. Download and unpack the repository. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the folder containing `manifest.json`.
2. Open a product page you own or have permission to reuse and click SyncFlow. Check the title, brand, amount and currency against the source.
3. Choose **Save to DB** to keep a work in progress. In the catalog, clear the brand or selling price and read the review message on the card. A missing amount stays blank. An explicit zero stays zero.
4. Enter the confirmed values. For an item you have verified has no brand, enter **Unbranded**. Open a target draft and inspect the destination form before submitting it yourself.

The three-draft action opens eBay, Vinted and Etsy. Availability of fields depends on the marketplace, locale, account and category. Live seller workflows remain to be validated. Amounts are numeric and SyncFlow does not perform currency conversion. Records imported with an older version may already contain guesses. Recheck those values against their source before reuse.

## How the pieces fit

| Component | Responsibility |
| --- | --- |
| Popup and injected extractor | Read listing fields from the active page and allow edits before saving |
| Background service worker | Coordinate extraction, the optional loopback parser, and listing images |
| Catalog and review rules | Store drafts in Chrome local storage, edit attributes and apply markups |
| Marketplace content scripts | Assist form entry when the recently requested destination matches |

The extension requests broad host access for product media. Opening the popup on an HTTP(S) page can send up to 250,000 characters of its HTML to the optional local parser. Use it on product pages. The parser listens on `127.0.0.1:8765`; the extension can run without it.

## Optional Python parser

Using Python 3.12 in a virtual environment, run the following commands from the repository root.

```sh
python -m pip install -r scrapling_backend/requirements.txt
python scrapling_backend/scrapling_server.py
```

Scrapling is an external dependency. The included server parses the HTML supplied by the extension.

## Validation and project notes

Run the offline regression suite from the root with Node 20 or later.

```sh
node --test tests/catalog.test.cjs
```

- [Roadmap and acceptance criteria](ROADMAP.md)
- [Étude de cas · décisions et validation (PDF)](docs/etude-de-cas.pdf)
- [Charte graphique · couleurs, typographie et composants (PDF)](docs/charte-graphique.pdf)
