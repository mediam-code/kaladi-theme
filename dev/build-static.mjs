// Export static al preview-ului (pentru Netlify): pornește dev/server.mjs, parcurge toate linkurile interne
// și scrie dist/<cale>/index.html + assets. Coșul și formularele merg în browser prin dev/static-shim.js.
// Nu face parte din tema Shopify — e doar pentru prezentarea către client.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = 9311;
const BASE = `http://localhost:${PORT}`;
const mock = JSON.parse(fs.readFileSync(path.join(ROOT, 'dev/mock.json'), 'utf8'));

const server = spawn(process.execPath, [path.join(ROOT, 'dev/server.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok) => server.stdout.on('data', (d) => String(d).includes('preview') && ok()));

const TOOLBAR_RE = /<div style="position:fixed;left:12px;bottom:12px;z-index:200[\s\S]*?<\/select><\/div>/;
const SHIM = '<script src="/static-shim.js"></script>';

// Datele de care are nevoie coșul din browser: variantă → produs.
const variants = {};
for (const p of Object.values(mock.products)) {
  const plans = p.selling_plan_groups?.[0]?.selling_plans || [];
  for (const v of p.variants) {
    variants[v.id] = { product_title: p.title, variant_title: v.title, url: `/products/${p.handle}`, image: `/assets/${p.media[0].src}`, price: v.price || 0, plans: Object.fromEntries(plans.map((x) => [x.id, x.name])) };
  }
}

const out = (route) => path.join(DIST, route.replace(/^\//, ''), 'index.html');
const write = (file, html) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, html); };
const finalize = (html) => html.replace(TOOLBAR_RE, '').replace('</head>', `<script>window.KALADI_STATIC=${JSON.stringify({ variants })};</script>${SHIM}</head>`);

fs.rmSync(DIST, { recursive: true, force: true });
const seen = new Set();
const queue = ['/', '/cart', '/checkout', '/collections/all', '/blogs/jurnal'];
const withForms = [];
while (queue.length) {
  const route = queue.shift();
  if (seen.has(route)) continue;
  seen.add(route);
  const res = await fetch(BASE + route);
  if (!res.ok) { console.warn(`  skip ${route} (${res.status})`); continue; }
  const html = await res.text();
  write(out(route), finalize(html));
  if (html.includes('action="/contact"')) withForms.push(route);
  for (const [, href] of html.matchAll(/href="(\/[^"#?]*)/g)) {
    if (href.startsWith('/assets/') || href.startsWith('/discount/') || href.startsWith('/policies/') || href.startsWith('/account')) continue;
    const clean = href.replace(/\/$/, '') || '/';
    if (!seen.has(clean)) queue.push(clean);
  }
}

// Variante „mesaj trimis” pentru paginile cu formulare (newsletter în footer, contact, ofertă corporate).
for (const route of withForms) {
  const html = await (await fetch(`${BASE}${route}?contact_posted=true`)).text();
  write(out(`${route === '/' ? '' : route}/trimis`), finalize(html));
}

fs.cpSync(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'dev/static-shim.js'), path.join(DIST, 'static-shim.js'));
fs.writeFileSync(path.join(DIST, '_redirects'), [
  '/discount/*  /collections/all  302',
  '/policies/*  /pages/livrare-retur  302',
  '/account*    /  302'
].join('\n') + '\n');
fs.writeFileSync(path.join(DIST, '404.html'), finalize(`<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagina nu există · Kaladi</title></head><body style="font:16px/1.6 system-ui;padding:48px;max-width:560px">Pagina aceasta nu există încă în prezentare. <a href="/">Înapoi acasă</a></body></html>`));

server.kill();
console.log(`dist/: ${seen.size} pagini, ${withForms.length} cu formular`);
