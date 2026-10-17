/* Doar pentru prezentarea statică (Netlify): imită Shopify Ajax Cart API în localStorage
   și formularele de contact, ca site-ul să se poată folosi fără server. Nu intră în tema Shopify. */
(function () {
  const KEY = 'kaladi_demo_cart';
  const data = window.KALADI_STATIC || { variants: {} };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const save = (items) => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {} };
  const keyOf = (it) => `${it.id}:${it.selling_plan || 0}`;

  const cartJSON = () => {
    const items = load().map((it) => {
      const v = data.variants[it.id] || { product_title: 'Produs', price: 0, url: '/', image: '', plans: {} };
      const planName = it.selling_plan && v.plans[it.selling_plan];
      const line = v.price * it.quantity;
      return {
        ...it, key: keyOf(it), title: v.product_title, product_title: v.product_title, variant_title: v.variant_title, url: v.url, image: v.image,
        price: v.price, final_price: v.price, line_price: line, final_line_price: line,
        selling_plan_allocation: planName ? { selling_plan: { id: it.selling_plan, name: planName } } : null
      };
    });
    return { item_count: items.reduce((s, i) => s + i.quantity, 0), total_price: items.reduce((s, i) => s + i.line_price, 0), items };
  };
  const ok = (body, url) => {
    const r = new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url) Object.defineProperty(r, 'url', { value: url });
    return Promise.resolve(r);
  };

  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin) return realFetch(input, init);
    const p = url.pathname.replace(/\/$/, '');
    const body = () => { try { return JSON.parse(init.body || '{}'); } catch (e) { return {}; } };
    if (p === '/cart.js') return ok(cartJSON());
    if (p === '/cart/add.js') {
      const items = load();
      const d = body();
      (d.items || [d]).forEach((it) => {
        const id = Number(it.id); const q = Number(it.quantity || 1); const sp = it.selling_plan ? Number(it.selling_plan) : undefined;
        const line = items.find((x) => x.id === id && (x.selling_plan || 0) === (sp || 0));
        if (line) line.quantity += q; else items.push({ id, quantity: q, selling_plan: sp });
      });
      save(items);
      return ok(cartJSON());
    }
    if (p === '/cart/change.js') {
      const d = body(); const items = load();
      const idx = items.findIndex((x) => keyOf(x) === String(d.id) || x.id === Number(d.id));
      if (idx > -1) { if (Number(d.quantity) <= 0) items.splice(idx, 1); else items[idx].quantity = Number(d.quantity); }
      save(items);
      return ok(cartJSON());
    }
    if (p === '/contact') return ok('<!doctype html>', location.origin + '/');
    return realFetch(input, init);
  };

  // Formulare de contact / ofertă: în demo nu se trimit nicăieri, arătăm direct starea „trimis”.
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (e.defaultPrevented || !f.action || new URL(f.action).pathname !== '/contact') return;
    e.preventDefault();
    location.href = location.pathname.replace(/\/$/, '') + '/trimis/';
  });

  // Pagina /cart nu are server: deschidem coșul ca drawer pe pagina principală.
  if (/^\/cart\/?$/.test(location.pathname)) location.replace('/#cos');
  document.addEventListener('DOMContentLoaded', () => {
    if (location.hash === '#cos') { const b = document.querySelector('[data-cart-open]'); if (b) b.click(); }
  });
})();
