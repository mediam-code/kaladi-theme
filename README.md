# Kaladi — temă Shopify (OS 2.0)

Tema e scrisă direct pentru Shopify (Liquid, sections, JSON templates), ca să nu fie nevoie de rescriere la lansare.

## Preview local (fără store)

```bash
npm install
npm run dev
```

Pagini disponibile local:
- http://localhost:9292 — homepage
- http://localhost:9292/products/olivi-sticla — pagina de produs
- http://localhost:9292/collections/all — Magazin
- http://localhost:9292/pages/povestea — Povestea
- http://localhost:9292/pages/cadouri-corporate — Cadouri corporate (formular ofertă)
- http://localhost:9292/pages/livrare-retur — Livrare și retur
- http://localhost:9292/pages/contact — Contact
- http://localhost:9292/blogs/jurnal — Jurnal (blog) și articolele lui
- http://localhost:9292/cart — coșul complet. Coșul lateral se deschide din header sau după „Adaugă în coș”.

Preview-ul local (`dev/server.mjs`) randează aceleași fișiere Liquid cu date de test din `dev/mock.json`. Coșul local imită API-ul Ajax al Shopify (`/cart/add.js`, `/cart.js`), deci același JS merge și în Shopify.

## Prezentare pe Netlify (pentru client)

`npm run build:static` pornește preview-ul local, parcurge toate paginile și scrie un site static în `dist/`.
Coșul și formularele funcționează în browser prin `dev/static-shim.js`, cu localStorage și fără trimitere reală.
Netlify rulează build-ul singur la fiecare push pe `main` (vezi `netlify.toml`).
Pentru test local: `npm run build:static`, apoi `python3 -m http.server 9400 --directory dist`.

## Trecerea în Shopify

1. Creați un dev store gratuit din Shopify Partners.
2. Instalați Shopify CLI: `npm install -g @shopify/cli`
3. Rulați `shopify theme dev --store <store>.myshopify.com`. Tema rulează pe store-ul real, cu hot reload.
4. Validați tema cu `shopify theme check`.
5. Publicați cu `shopify theme push`.

### De configurat în admin

- **Produse** cu handle-urile `olivi-sticla`, `rezerva-familiei`, `olivi-cutie-rotunda`, `set-cadou-kaladi`. Variantele sunt mărimile.
- **Metafields de produs** (namespace `custom`): `use_case`, `harvest`, `taste_fruity`, `taste_bitter`, `taste_pungent` (1–5), `lot_code`, `pressed_on`, `acidity`, `polyphenols`, `lab_report` (fișier/URL).
- **Abonament**: aplicația Shopify Subscriptions creează selling plans (la 1, 2 sau 3 luni, −10%). Secțiunea de produs le citește automat.
- **Recenzii**: Judge.me se adaugă ca app block în secțiunile Recenzii și Produs.
- **Precomandă recoltă**: formularul salvează clientul cu tag-ul `precomanda-recolta`. Se poate conecta la Klaviyo.
- **România**: facturare SmartBill, curier Sameday/FAN (easybox), ramburs.

## Structură

- `layout/theme.liquid`: culorile vin din setările temei (Theme settings › Culori).
- `snippets/cart-drawer.liquid`: coșul lateral, folosește `/cart.js`, `/cart/add.js` și `/cart/change.js`. Produsul recomandat se alege în Theme settings › Coș și livrare.
- Pagini cu template propriu: `page.povestea`, `page.cadouri-corporate`, `page.livrare-retur`, `page.contact`. În admin creați paginile cu aceste handle-uri și alegeți template-ul potrivit.
- Formularele (ofertă B2B, contact) sunt formulare de contact Shopify native: mesajele ajung pe emailul magazinului, iar câmpurile se editează din customizer, ca blocuri.
- Blogul: creați blogul „Jurnal” (handle `jurnal`). Articolele din `dev/mock.json` sunt texte de pornire, de copiat în admin.
- `sections/`: page-hero, rich-text, history-timeline, cta-band, main-collection, main-cart, hero, product-trio, steps, story, lot-proof, preorder, subscription, reviews, gifts-b2b, journal, main-product, origin-band, related-products, header, footer, announcement-bar.
- `templates/index.json`, `templates/product.json`: ordinea secțiunilor și conținutul implicit.
- `assets/`: CSS, JS și imagini. Fișierele `ai-*.jpg` sunt generate cu AI (Seedream 5 Pro / Soul Cinema). **Textul mic de pe etichete e inventat de AI**: sunt bune pentru mockup, dar la lansare trebuie înlocuite cu fotografii reale.
- `dev/`: doar pentru preview local, nu se urcă în Shopify (vezi `.shopifyignore`).

Tot ce e scris între `[ ]` e conținut de primit de la client: prețuri, citate, analizele lotului, recenzii.
