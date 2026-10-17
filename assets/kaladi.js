/* Kaladi theme JS — folosește Shopify Ajax Cart API (/cart.js, /cart/add.js, /cart/change.js). */
(function () {
  const fmt = (cents) => {
    if (cents == null || isNaN(cents) || cents === 0) return '[preț] lei';
    return (cents / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const json = { Accept: 'application/json', 'Content-Type': 'application/json' };

  /* ---------- Cart state ---------- */
  const setCartCount = (count) => document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = count; });

  const updateFreeShipping = (cart) => {
    if (!window.kaladi) return;
    const threshold = window.kaladi.freeShippingThreshold;
    const total = cart ? cart.total_price : 0;
    const left = Math.max(threshold - total, 0);
    document.querySelectorAll('[data-free-ship]').forEach((box) => {
      box.querySelector('[data-free-ship-text]').innerHTML = left > 0
        ? 'Încă <strong>' + fmt(left) + '</strong> până la livrare gratuită'
        : '<strong>Ai livrare gratuită</strong>';
      box.querySelector('[data-free-ship-bar]').style.width = Math.min(100, (total / threshold) * 100) + '%';
    });
  };

  const drawer = document.querySelector('[data-cart-drawer]');

  const renderDrawer = (cart) => {
    if (!drawer) return;
    const list = drawer.querySelector('[data-cart-items]');
    const total = drawer.querySelector('[data-cart-total]');
    const checkout = drawer.querySelector('[data-checkout]');
    if (total) total.textContent = fmt(cart.total_price);
    if (checkout) checkout.toggleAttribute('aria-disabled', cart.item_count === 0);
    if (!cart.items.length) {
      list.innerHTML = '<div class="drawer__empty"><p>Coșul e gol.</p><a href="/collections/all" class="btn btn--deep">Vezi uleiurile</a></div>';
      return;
    }
    list.innerHTML = cart.items.map((it) => {
      const variant = it.variant_title && it.variant_title !== 'Default Title' ? '<span>' + esc(it.variant_title) + '</span>' : '';
      const plan = it.selling_plan_allocation ? '<span class="chip chip--fresh">' + esc(it.selling_plan_allocation.selling_plan.name) + '</span>' : '';
      return '<div class="line" data-line="' + esc(it.key) + '">' +
        '<a href="' + esc(it.url) + '" class="line__img"><img src="' + esc(it.image) + '" alt=""></a>' +
        '<div class="line__info"><a href="' + esc(it.url) + '" class="line__title">' + esc(it.product_title) + '</a>' + variant + plan +
          '<div class="qty qty--sm"><button type="button" data-line-qty="-1" aria-label="Scade cantitatea">−</button>' +
          '<span aria-live="polite">' + it.quantity + '</span>' +
          '<button type="button" data-line-qty="1" aria-label="Crește cantitatea">+</button></div></div>' +
        '<div class="line__side"><strong>' + fmt(it.final_line_price) + '</strong>' +
          '<button type="button" class="line__remove" data-line-remove>Șterge</button></div>' +
      '</div>';
    }).join('');
  };

  const applyCart = (cart) => { setCartCount(cart.item_count); updateFreeShipping(cart); renderDrawer(cart); return cart; };

  const fetchCart = () => fetch(window.routes.cart_url + '.js', { headers: json }).then((r) => r.json()).then(applyCart).catch(() => null);

  const addToCart = (items) => fetch(window.routes.cart_add_url + '.js', { method: 'POST', headers: json, body: JSON.stringify({ items }) })
    .then((r) => { if (!r.ok) throw new Error('add failed'); return r.json(); })
    .then(fetchCart);

  const changeLine = (key, quantity) => fetch(window.routes.cart_change_url + '.js', { method: 'POST', headers: json, body: JSON.stringify({ id: key, quantity }) })
    .then((r) => r.json()).then(applyCart);

  /* ---------- Drawer open / close ---------- */
  let lastFocus = null;
  const openDrawer = () => {
    if (!drawer) return;
    lastFocus = document.activeElement;
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add('is-open'));
    document.documentElement.classList.add('no-scroll');
    drawer.querySelector('.drawer__close').focus();
  };
  const closeDrawer = () => {
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove('is-open');
    document.documentElement.classList.remove('no-scroll');
    setTimeout(() => { drawer.hidden = true; }, 250);
    if (lastFocus) lastFocus.focus();
  };

  document.querySelectorAll('[data-cart-open]').forEach((a) => a.addEventListener('click', (e) => { if (drawer) { e.preventDefault(); openDrawer(); } }));
  if (drawer) {
    drawer.querySelectorAll('[data-cart-close]').forEach((b) => b.addEventListener('click', closeDrawer));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
    drawer.addEventListener('click', (e) => {
      const line = e.target.closest('[data-line]');
      if (!line) return;
      const key = line.dataset.line;
      const qtyEl = line.querySelector('[aria-live]');
      const current = parseInt(qtyEl.textContent, 10);
      const step = e.target.closest('[data-line-qty]');
      if (step) changeLine(key, Math.max(0, current + parseInt(step.dataset.lineQty, 10)));
      if (e.target.closest('[data-line-remove]')) changeLine(key, 0);
    });
  }

  const press = (group, active) => group.forEach((el) => el.setAttribute('aria-pressed', el === active ? 'true' : 'false'));

  /* ---------- Product page ---------- */
  document.querySelectorAll('[data-product-section]').forEach((section) => {
    const form = section.querySelector('[data-product-form]') || section.querySelector('form');
    const idInput = section.querySelector('[data-variant-id]');
    const planInput = section.querySelector('[data-selling-plan]');
    const variants = [...section.querySelectorAll('[data-variant]')];
    const modes = [...section.querySelectorAll('[data-mode]')];
    const plansBox = section.querySelector('[data-plans]');
    const plans = [...section.querySelectorAll('[data-plan]')];
    const qtyInput = section.querySelector('[data-qty-input]');
    const addBtn = section.querySelector('[data-add]');
    const addLabel = section.querySelector('[data-add-label]');
    const priceOnce = section.querySelector('[data-price-once]');
    const priceSub = section.querySelector('[data-price-sub]');
    const mainImg = section.querySelector('[data-main-image]');
    const thumbs = [...section.querySelectorAll('[data-thumb]')];
    let mode = 'once';

    const resetAdded = () => { addBtn.classList.remove('is-added'); addLabel.textContent = mode === 'sub' ? 'Pornește abonamentul' : 'Adaugă în coș'; };

    thumbs.forEach((t) => t.addEventListener('click', () => { mainImg.src = t.dataset.thumb; mainImg.alt = t.dataset.alt; press(thumbs, t); }));

    variants.forEach((v) => v.addEventListener('click', () => {
      press(variants, v);
      idInput.value = v.dataset.id;
      const label = section.querySelector('[data-variant-label]');
      if (label) label.textContent = v.dataset.title;
      const price = parseInt(v.dataset.price, 10);
      if (priceOnce) priceOnce.textContent = fmt(price);
      if (priceSub) priceSub.textContent = fmt(Math.round(price * parseInt(priceSub.dataset.subPct || '90', 10) / 100));
      addBtn.disabled = v.dataset.available !== 'true';
      resetAdded();
    }));

    const activePlan = () => plans.find((p) => p.getAttribute('aria-pressed') === 'true') || plans[0];
    modes.forEach((m) => m.addEventListener('click', () => {
      mode = m.dataset.mode; press(modes, m);
      if (plansBox) plansBox.hidden = mode !== 'sub';
      planInput.value = mode === 'sub' && activePlan() ? activePlan().dataset.plan : '';
      resetAdded();
    }));
    plans.forEach((p) => p.addEventListener('click', () => { press(plans, p); planInput.value = p.dataset.plan; resetAdded(); }));

    section.querySelectorAll('[data-qty]').forEach((b) => b.addEventListener('click', () => {
      qtyInput.value = Math.min(20, Math.max(1, parseInt(qtyInput.value || '1', 10) + parseInt(b.dataset.qty, 10)));
      resetAdded();
    }));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const item = { id: parseInt(idInput.value, 10), quantity: parseInt(qtyInput.value || '1', 10) };
      if (planInput.value) item.selling_plan = parseInt(planInput.value, 10);
      addBtn.disabled = true;
      addToCart([item]).then(() => {
        addBtn.classList.add('is-added'); addLabel.textContent = 'Adăugat în coș ✓';
        openDrawer();
      }).catch(() => { addLabel.textContent = 'Eroare, încearcă din nou'; })
        .finally(() => { addBtn.disabled = false; });
    });
  });

  /* ---------- Quick add (carduri, cross-sell, upsell) ---------- */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-quick-add]');
    if (!b) return;
    e.preventDefault();
    const label = b.textContent;
    b.disabled = true;
    addToCart([{ id: parseInt(b.dataset.quickAdd, 10), quantity: 1 }])
      .then(() => { b.textContent = 'Adăugat ✓'; openDrawer(); setTimeout(() => { b.textContent = label; }, 2000); })
      .finally(() => { b.disabled = false; });
  });

  /* ---------- Colecție: sortare ---------- */
  document.querySelectorAll('[data-sort]').forEach((sel) => sel.addEventListener('change', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('sort_by', sel.value);
    window.location.href = url.toString();
  }));

  fetchCart();
})();

/* Drumul uleiului: picătura coboară cu scroll-ul, etapele apar pe rând. */
(function () {
  const sec = document.querySelector('[data-journey]');
  if (!sec) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const track = sec.querySelector('.journey__track');
  const drop = sec.querySelector('[data-journey-drop]');
  const fill = sec.querySelector('[data-journey-fill]');
  const steps = [...sec.querySelectorAll('[data-journey-step]')];
  if (reduce) { steps.forEach((s) => s.classList.add('is-in')); return; }
  sec.classList.add('js-journey');
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -18% 0px', threshold: 0.15 });
  steps.forEach((s) => io.observe(s));
  let ticking = false;
  const update = () => {
    ticking = false;
    const r = track.getBoundingClientRect();
    const vh = window.innerHeight;
    const travel = r.height - 60;
    const p = Math.min(1, Math.max(0, (vh * 0.55 - r.top) / travel));
    const y = p * travel;
    drop.style.transform = `translate(-50%, ${y}px) scale(${0.6 + p * 0.6})`;
    fill.style.height = `${y}px`;
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();

/* Abonament interactiv: calendar de livrări + economie pe an. */
(function () {
  document.querySelectorAll('[data-sub]').forEach((box) => {
    const price = parseInt(box.dataset.price || '0', 10);
    const pct = parseInt(box.dataset.pct || '10', 10);
    const months = [...box.querySelectorAll('.sub__m')];
    const pills = [...box.querySelectorAll('[data-freq]')];
    const names = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec'];
    const start = new Date().getMonth() + 1; // prima livrare luna viitoare
    months.forEach((m, i) => { m.querySelector('b').textContent = names[(start + i) % 12]; });
    const lei = (c) => (c / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
    const set = (freq) => {
      pills.forEach((p) => p.setAttribute('aria-pressed', p.dataset.freq === String(freq) ? 'true' : 'false'));
      months.forEach((m, i) => {
        const on = i % freq === 0;
        m.classList.toggle('is-on', on);
        m.querySelector('svg').style.transitionDelay = on ? (i * 40) + 'ms' : '0ms';
      });
      const n = Math.floor(12 / freq);
      box.querySelector('[data-deliveries]').textContent = n;
      box.querySelector('[data-save]').textContent = price ? lei(Math.round(price * pct / 100) * n) : '[preț] lei';
    };
    pills.forEach((p) => p.addEventListener('click', () => set(parseInt(p.dataset.freq, 10))));
    set(2);
  });
})();

/* Popup bun venit: email → cod de reducere. Apare după X sec / intenție de ieșire / 50% scroll. */
(function () {
  const pop = document.querySelector('[data-wpop]');
  if (!pop) return;
  const teaser = document.querySelector('[data-wpop-teaser]');
  const KEY = 'kaladi_wpop';
  const days = parseInt(pop.dataset.days || '14', 10);
  const delay = parseInt(pop.dataset.delay || '8', 10) * 1000;
  const forced = new URLSearchParams(location.search).has('popup');
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const write = (state) => { try { localStorage.setItem(KEY, JSON.stringify({ state, ts: Date.now() })); } catch (e) {} };
  const saved = read();
  if (saved && saved.state === 'subscribed' && !forced) return;
  const snoozed = saved && saved.state === 'dismissed' && Date.now() - saved.ts < days * 864e5;

  let shown = false; let lastFocus = null;
  const open = () => {
    if (shown && !pop.hidden) return;
    shown = true; lastFocus = document.activeElement;
    if (teaser) teaser.hidden = true;
    pop.hidden = false;
    void pop.offsetWidth; pop.classList.add('is-open');
    document.documentElement.classList.add('no-scroll');
    setTimeout(() => { const i = pop.querySelector('input[type=email]'); if (i && !pop.querySelector('[data-wpop-step="1"]').hidden) i.focus(); }, 350);
  };
  const close = (state) => {
    pop.classList.remove('is-open');
    document.documentElement.classList.remove('no-scroll');
    setTimeout(() => { pop.hidden = true; }, 300);
    if (state !== 'subscribed') { write('dismissed'); if (teaser) teaser.hidden = false; }
    if (lastFocus) lastFocus.focus();
  };

  pop.querySelectorAll('[data-wpop-close]').forEach((b) => b.addEventListener('click', () => close(pop.dataset.done ? 'subscribed' : 'dismissed')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) close(pop.dataset.done ? 'subscribed' : 'dismissed'); });
  if (teaser) teaser.addEventListener('click', open);

  // Declanșatori
  if (forced) { open(); } else if (snoozed) { if (teaser) teaser.hidden = false; } else {
    const t = setTimeout(open, delay);
    const onLeave = (e) => { if (e.clientY <= 0 && !shown) { clearTimeout(t); open(); } };
    document.addEventListener('mouseout', onLeave);
    const onScroll = () => {
      const p = window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      if (p > 0.5 && !shown && window.innerWidth < 760) { clearTimeout(t); open(); window.removeEventListener('scroll', onScroll); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Trimitere fără reîncărcarea paginii (formularul Shopify „customer”)
  const form = pop.querySelector('[data-wpop-form]') || pop.querySelector('form');
  const err = pop.querySelector('[data-wpop-error]');
  const btn = pop.querySelector('[data-wpop-submit]');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    err.hidden = true; btn.disabled = true;
    fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'text/html' } })
      .then((r) => {
        if (r.url && r.url.includes('/challenge')) { form.submit(); return; }
        if (!r.ok) throw new Error('failed');
        pop.dataset.done = '1';
        write('subscribed');
        pop.querySelector('[data-wpop-step="1"]').hidden = true;
        pop.querySelector('[data-wpop-step="2"]').hidden = false;
        if (window.dataLayer) window.dataLayer.push({ event: 'newsletter_signup', source: 'popup' });
      })
      .catch(() => { err.hidden = false; })
      .finally(() => { btn.disabled = false; });
  });

  const copy = pop.querySelector('[data-wpop-copy]');
  if (copy) copy.addEventListener('click', () => {
    const code = pop.querySelector('[data-wpop-code]').textContent.trim();
    (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => { copy.textContent = 'Copiat ✓'; }).catch(() => { copy.textContent = code; });
  });
})();
