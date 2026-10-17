// Preview local pentru tema Kaladi (Shopify OS 2.0), fără store.
// Randează layout/, sections/, snippets/ și templates/*.json cu liquidjs + date din dev/mock.json.
// Când există un dev store, se înlocuiește cu `shopify theme dev` — tema rămâne aceeași.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Liquid } from 'liquidjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 9292);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readJSON = (p) => JSON.parse(read(p).replace(/^\s*\/\*[\s\S]*?\*\//, ''));

const engine = new Liquid({ root: [path.join(ROOT, 'snippets')], extname: '.liquid', cache: false, strictFilters: false, strictVariables: false });

// ---------- helpers ----------
const kw = (args) => Object.fromEntries(args.filter(Array.isArray));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const assetUrl = (name) => `/assets/${name}`;

engine.registerFilter('asset_url', (name) => assetUrl(name));
engine.registerFilter('stylesheet_tag', (url) => `<link rel="stylesheet" href="${url}">`);
engine.registerFilter('script_tag', (url) => `<script src="${url}" defer></script>`);
engine.registerFilter('image_url', (img) => (img && typeof img === 'object' ? img.src : img ? assetUrl(img) : ''));
engine.registerFilter('image_tag', (url, ...args) => {
  const o = kw(args);
  const attrs = Object.entries(o).filter(([k]) => !['width', 'height', 'sizes', 'widths', 'preload'].includes(k)).map(([k, v]) => `${k}="${esc(v)}"`).join(' ');
  return `<img src="${url}" ${attrs}>`;
});
engine.registerFilter('money', (cents) => {
  const n = Number(cents);
  if (cents == null || !n) return '[preț] lei';
  return (n / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
});
engine.registerFilter('t', (key) => key);
engine.registerFilter('handleize', (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
engine.registerFilter('default_errors', (e) => (e ? `<p>${esc(String(e))}</p>` : ''));

// {% form 'product', product, class: 'x', data-foo: '' %} ... {% endform %}
engine.registerTag('form', {
  parse(token, remain) {
    this.args = token.args;
    this.tpls = [];
    const stream = this.liquid.parser.parseStream(remain)
      .on('tag:endform', () => stream.stop())
      .on('template', (t) => this.tpls.push(t))
      .on('end', () => { throw new Error('form not closed'); });
    stream.start();
  },
  * render(ctx, emitter) {
    const type = (this.args.match(/^\s*['"]([\w-]+)['"]/) || [])[1];
    const attrs = [...this.args.matchAll(/([\w-]+):\s*['"]([^'"]*)['"]/g)].map(([, k, v]) => (v === '' ? k : `${k}="${esc(v)}"`)).join(' ');
    const action = type === 'product' ? '/cart/add' : '/contact';
    const posted = ctx.getAll().contact_posted;
    emitter.write(`<form method="post" action="${action}" accept-charset="UTF-8" ${attrs}><input type="hidden" name="form_type" value="${type}">`);
    ctx.push({ form: { 'posted_successfully?': !!posted, posted_successfully: !!posted, errors: null } });
    yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
    ctx.pop();
    emitter.write('</form>');
  }
});

// {% paginate x by n %} ... {% endpaginate %} — în preview: o singură pagină
engine.registerTag('paginate', {
  parse(token, remain) {
    this.tpls = [];
    const stream = this.liquid.parser.parseStream(remain)
      .on('tag:endpaginate', () => stream.stop())
      .on('template', (t) => this.tpls.push(t))
      .on('end', () => { throw new Error('paginate not closed'); });
    stream.start();
  },
  * render(ctx, emitter) {
    ctx.push({ paginate: { pages: 1, current_page: 1 } });
    yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
    ctx.pop();
  }
});
engine.registerFilter('default_pagination', () => '');

// {% sections 'header-group' %}
engine.registerTag('sections', {
  parse(token) { this.name = token.args.trim().replace(/['"]/g, ''); },
  * render(ctx, emitter) {
    const group = readJSON(`sections/${this.name}.json`);
    const html = yield renderSections(group, ctx.getAll());
    emitter.write(html);
  }
});

// ---------- data ----------
const mock = () => readJSON('dev/mock.json');
const cart = { items: [] };
const cartJSON = () => {
  const products = mock().products;
  const items = cart.items.map((it) => {
    const p = Object.values(products).find((x) => x.variants.some((v) => v.id === it.id));
    const v = p ? p.variants.find((x) => x.id === it.id) : null;
    const plan = p && it.selling_plan ? (p.selling_plan_groups[0]?.selling_plans || []).find((x) => x.id === it.selling_plan) : null;
    const price = v?.price || 0;
    return {
      ...it, key: `${it.id}:${it.selling_plan || 0}`, title: p ? `${p.title} — ${v.title}` : 'Produs',
      product_title: p?.title || 'Produs', variant_title: v?.title, url: p ? `/products/${p.handle}` : '/',
      image: p ? assetUrl(p.media[0].src) : '', price, final_price: price, line_price: price * it.quantity, final_line_price: price * it.quantity,
      selling_plan_allocation: plan ? { selling_plan: { id: plan.id, name: plan.name } } : null
    };
  });
  return { item_count: items.reduce((s, i) => s + i.quantity, 0), total_price: items.reduce((s, i) => s + i.line_price, 0), items };
};

const productDrop = (handle) => {
  const p = mock().products[handle];
  if (!p) return null;
  const media = p.media.map((m) => ({ ...m, src: assetUrl(m.src) }));
  const variants = p.variants;
  const selected = variants.find((v) => v.id === p.selected_variant) || variants.find((v) => v.available) || variants[0];
  const prices = variants.map((v) => v.price).filter((x) => x != null);
  return {
    ...p,
    url: `/products/${p.handle}`,
    media,
    images: media,
    featured_image: media[0],
    selected_or_first_available_variant: selected,
    first_available_variant: selected,
    has_only_default_variant: variants.length === 1 && variants[0].title === 'Default Title',
    price: prices.length ? Math.min(...prices) : null,
    available: variants.some((v) => v.available)
  };
};

const settings = () => {
  const schema = readJSON('config/settings_schema.json');
  const defaults = {};
  schema.forEach((g) => (g.settings || []).forEach((s) => { if (s.id) defaults[s.id] = s.default; }));
  const out = { ...defaults, ...readJSON('config/settings_data.json').current };
  schema.forEach((g) => (g.settings || []).forEach((st) => { if (st.type === 'product' && typeof out[st.id] === 'string') out[st.id] = productDrop(out[st.id]); }));
  return out;
};

const SCHEMA_RE = /{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/;
const resolveSettings = (defs = [], values = {}) => {
  const out = {};
  defs.forEach((d) => { if (d.id) out[d.id] = d.default ?? (d.type === 'checkbox' ? false : ''); });
  Object.assign(out, values);
  defs.forEach((d) => {
    if (d.type === 'product' && typeof out[d.id] === 'string') out[d.id] = productDrop(out[d.id]);
    if (d.type === 'image_picker' && typeof out[d.id] !== 'object') out[d.id] = '';
  });
  return out;
};

async function renderSection(id, data, scope) {
  const src = read(`sections/${data.type}.liquid`);
  const m = src.match(SCHEMA_RE);
  const schema = m ? JSON.parse(m[1]) : {};
  const body = src.replace(SCHEMA_RE, '');
  const blockDefs = Object.fromEntries((schema.blocks || []).map((b) => [b.type, b]));
  const order = data.block_order || Object.keys(data.blocks || {});
  const blocks = order.map((bid) => {
    const b = data.blocks[bid];
    return { id: bid, type: b.type, settings: resolveSettings(blockDefs[b.type]?.settings, b.settings), shopify_attributes: '' };
  });
  const section = { id, settings: resolveSettings(schema.settings, data.settings), blocks };
  const html = await engine.parseAndRender(body, { ...scope, section }, { globals: scope });
  return `<div id="shopify-section-${id}" class="shopify-section">${html}</div>`;
}

async function renderSections(tpl, scope) {
  let out = '';
  for (const id of tpl.order) {
    if (tpl.sections[id].disabled) continue;
    out += await renderSection(id, tpl.sections[id], scope);
  }
  return out;
}

async function renderPage(template, extra = {}) {
  if (renderPage.posted) extra = { contact_posted: true, ...extra };
  const scope = {
    shop: mock().shop,
    settings: settings(),
    routes: { root_url: '/', cart_url: '/cart', cart_add_url: '/cart/add', cart_change_url: '/cart/change' },
    request: { locale: { iso_code: 'ro' } },
    cart: cartJSON(),
    content_for_header: '<!-- dev preview -->',
    contact_posted: false,
    page_title: extra.page_title || 'Kaladi — Ulei de măsline extravirgin din Kalamata',
    ...extra
  };
  if (renderPage.font) scope.settings = { ...scope.settings, font_pairing: renderPage.font };
  const content = await renderSections(readJSON(`templates/${template}.json`), scope);
  const html = await engine.parseAndRender(read('layout/theme.liquid'), { ...scope, content_for_layout: content }, { globals: scope });
  return html.replace('</body>', devToolbar(scope.settings.font_pairing) + '</body>');
}

// Bară doar pentru preview local: schimbă perechea de fonturi fără să edităm setările.
function devToolbar(current) {
  const opts = readJSON('config/settings_schema.json').flatMap((g) => g.settings || []).find((x) => x.id === 'font_pairing')?.options || [];
  const o = opts.map((x) => `<option value="${x.value}"${x.value === current ? ' selected' : ''}>${esc(x.label)}</option>`).join('');
  return `<div style="position:fixed;left:12px;bottom:12px;z-index:200;background:#111;color:#fff;border-radius:999px;padding:6px 6px 6px 14px;font:600 12px/1 system-ui;display:flex;gap:8px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.25)">
  <label for="dev-font">Fonturi (dev)</label>
  <select id="dev-font" style="font:500 12px system-ui;color:#111;background:#fff;border-radius:999px;border:0;padding:6px 10px" onchange="const u=new URL(location.href);u.searchParams.set('font',this.value);location.href=u">${o}</select></div>`;
}

// ---------- server ----------
const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const send = (res, code, body, type = 'text/html; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
const body = (req) => new Promise((ok) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => ok(d)); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = decodeURIComponent(url.pathname);
  renderPage.posted = url.searchParams.get('contact_posted') === 'true';
  const fontQ = url.searchParams.get('font');
  const fontCookie = (req.headers.cookie || '').match(/kfont=([\w-]+)/)?.[1];
  renderPage.font = fontQ || fontCookie || null;
  if (fontQ) res.setHeader('Set-Cookie', `kfont=${fontQ}; Path=/; SameSite=Lax`);
  try {
    if (p.startsWith('/assets/')) {
      const file = path.join(ROOT, 'assets', path.basename(p));
      if (!fs.existsSync(file)) return send(res, 404, 'Not found', 'text/plain');
      return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
    }
    if (p === '/cart.js') return send(res, 200, JSON.stringify(cartJSON()), 'application/json');
    if (p === '/cart/add.js' && req.method === 'POST') {
      const data = JSON.parse((await body(req)) || '{}');
      (data.items || [data]).forEach((it) => {
        const id = Number(it.id); const q = Number(it.quantity || 1);
        const line = cart.items.find((x) => x.id === id && x.selling_plan === it.selling_plan);
        if (line) line.quantity += q; else cart.items.push({ id, quantity: q, selling_plan: it.selling_plan });
      });
      return send(res, 200, JSON.stringify(cartJSON()), 'application/json');
    }
    if (p === '/cart/change.js' && req.method === 'POST') {
      const data = JSON.parse((await body(req)) || '{}');
      const idx = cartJSON().items.findIndex((x) => x.key === String(data.id) || x.id === Number(data.id));
      if (idx > -1) { if (Number(data.quantity) <= 0) cart.items.splice(idx, 1); else cart.items[idx].quantity = Number(data.quantity); }
      return send(res, 200, JSON.stringify(cartJSON()), 'application/json');
    }
    if (p === '/contact' && req.method === 'POST') {
      const ref = new URL(req.headers.referer || '/', `http://${req.headers.host}`);
      const form = new URLSearchParams(await body(req));
      console.log('[contact]', Object.fromEntries(form));
      ref.searchParams.set('contact_posted', 'true');
      res.writeHead(303, { Location: ref.pathname + ref.search }); return res.end();
    }
    if (req.method === 'POST') { res.writeHead(303, { Location: p.startsWith('/cart') ? '/cart' : '/?customer_posted=true' }); return res.end(); }
    if (p === '/cart') return send(res, 200, await renderPage('cart', { page_title: 'Coș' }));
    if (p === '/checkout') return send(res, 200, `<div style="font:18px/1.6 system-ui;padding:48px;max-width:640px">Checkout-ul e găzduit de Shopify și nu există în preview-ul local. În store, butonul duce la checkout-ul nativ (card, ramburs, adresă, livrare).<br><br><a href="/">← Înapoi la site</a></div>`);
    const col = p.match(/^\/collections\/([\w-]+)/);
    if (col) {
      const all = Object.keys(mock().products).map(productDrop);
      const sortBy = url.searchParams.get('sort_by') || 'manual';
      const products = sortBy === 'title-ascending' ? [...all].sort((a, b) => a.title.localeCompare(b.title, 'ro')) : sortBy === 'title-descending' ? [...all].sort((a, b) => b.title.localeCompare(a.title, 'ro')) : all;
      const collection = {
        handle: col[1], title: col[1] === 'all' ? 'Toate uleiurile' : col[1], description: '<p>Un singur ulei, de la o singură familie. Alegi doar formatul.</p>',
        products, products_count: products.length, sort_by: sortBy, default_sort_by: 'manual',
        sort_options: [{ value: 'manual', name: 'Recomandate' }, { value: 'best-selling', name: 'Cele mai vândute' }, { value: 'title-ascending', name: 'A–Z' }, { value: 'price-ascending', name: 'Preț crescător' }]
      };
      return send(res, 200, await renderPage('collection', { collection, page_title: collection.title }));
    }
    const bl = p.match(/^\/blogs\/([\w-]+)(?:\/tagged\/([\w-]+)|\/([\w-]+))?\/?$/);
    if (bl) {
      const raw = mock().blogs?.[bl[1]];
      if (!raw) return send(res, 404, 'Blog inexistent în dev/mock.json', 'text/plain');
      const handleize = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const toArticle = (a) => ({ ...a, url: `/blogs/${raw.handle}/${a.handle}`, image: { src: assetUrl(a.image), alt: a.title }, excerpt_or_content: a.content });
      let articles = raw.articles.map(toArticle);
      const allTags = [...new Set(raw.articles.flatMap((a) => a.tags))];
      const tag = bl[2] ? allTags.find((t) => handleize(t) === bl[2]) : null;
      if (tag) articles = articles.filter((a) => a.tags.includes(tag));
      const blog = { handle: raw.handle, title: raw.title, url: `/blogs/${raw.handle}`, all_tags: allTags, articles, articles_count: articles.length };
      if (bl[3]) {
        const article = articles.find((a) => a.handle === bl[3]);
        if (!article) return send(res, 404, 'Articol inexistent', 'text/plain');
        return send(res, 200, await renderPage('article', { blog, article, page_title: article.title }));
      }
      return send(res, 200, await renderPage('blog', { blog, current_tags: tag ? [tag] : null, page_title: tag ? `${raw.title} · ${tag}` : raw.title }));
    }
    const pg = p.match(/^\/pages\/([\w-]+)/);
    if (pg) {
      const tpl = fs.existsSync(path.join(ROOT, `templates/page.${pg[1]}.json`)) ? `page.${pg[1]}` : 'page';
      const page = { handle: pg[1], title: pg[1].replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()), content: '' };
      return send(res, 200, await renderPage(tpl, { page, page_title: page.title }));
    }
    const prod = p.match(/^\/products\/([\w-]+)/);
    if (prod) {
      const product = productDrop(prod[1]);
      if (!product) return send(res, 404, 'Produs inexistent în dev/mock.json', 'text/plain');
      return send(res, 200, await renderPage('product', { product, page_title: product.title }));
    }
    if (p === '/' || p === '/index.html') return send(res, 200, await renderPage('index'));
    return send(res, 404, `<p style="font:16px system-ui;padding:24px">Pagina ${esc(p)} nu există încă în preview-ul local. <a href="/">Acasă</a></p>`);
  } catch (err) {
    console.error(err);
    return send(res, 500, `<pre style="padding:24px;white-space:pre-wrap">${esc(err.stack || err)}</pre>`);
  }
}).listen(PORT, () => console.log(`Kaladi preview: http://localhost:${PORT}`));
