/* =========================================================
   Tienda MQ Store — administración desde el CRM
   ---------------------------------------------------------
   La dueña maneja aquí el catálogo de mqstore.dgp-link.com:
   - Varias fotos por producto (Cloudinary), orden y foto principal.
   - Video, textos en español e inglés, beneficios, botón principal.
   - Destacar, ocultar u ordenar productos; crear productos nuevos.
   - Datos de contacto de la tienda (WhatsApp, teléfono, correo, redes).
   Todo se guarda en Firestore (colección catalog) y la tienda lo lee.
   El contenido base viene del archivo js/data.js de la tienda.
   ========================================================= */
Views.tienda = (() => {
  const state = { base: null, over: null, error: '', loading: false, cat: '' };
  const LOCAL_KEY = 'crm_mq_catalog_local';

  /* ---------- Datos ---------- */
  const adapter = () => (Store.auth ? Store.auth() : null);
  const storeUrl = () => (typeof WebLeads !== 'undefined' ? WebLeads.storeUrl() : 'https://mqstore.dgp-link.com');
  async function getOver() {
    const a = adapter();
    if (a && a.getCatalog) return a.getCatalog();
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {}; } catch (e) { return {}; }
  }
  async function putOver(id, data) {
    const a = adapter();
    if (a && a.putCatalog) await a.putCatalog(id, data);
    else { const all = await getOver(); all[id] = JSON.parse(JSON.stringify(data)); localStorage.setItem(LOCAL_KEY, JSON.stringify(all)); }
    state.over[id] = data;
  }
  async function delOver(id) {
    const a = adapter();
    if (a && a.deleteCatalog) await a.deleteCatalog(id);
    else { const all = await getOver(); delete all[id]; localStorage.setItem(LOCAL_KEY, JSON.stringify(all)); }
    delete state.over[id];
  }
  // El contenido base (categorías y productos) se toma de la propia tienda
  function loadBase() {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${storeUrl()}/js/data.js?t=${Date.now()}`;
      s.onload = () => (window.MQ_DATA ? resolve(window.MQ_DATA) : reject(new Error('sin datos')));
      s.onerror = () => reject(new Error('No se pudo abrir la tienda'));
      document.head.appendChild(s);
    });
  }
  async function load(el) {
    if (state.loading) return;
    state.loading = true; state.error = '';
    try {
      const [base, over] = await Promise.all([loadBase(), getOver()]);
      state.base = base; state.over = over || {};
    } catch (e) {
      state.error = e.code === 'permission-denied' ? 'Falta publicar las reglas nuevas de Firestore (colección catalog).' : (e.message || 'Error');
    }
    state.loading = false;
    render(el);
  }

  const has = (v) => v != null && v !== '' && !(Array.isArray(v) && !v.length);
  const catOf = (id) => (state.base.categories || []).find((c) => c.id === id) || { id, name: { es: id }, color: '#64748b' };
  // Producto tal como lo ve la tienda (base + cambios guardados)
  function merged(slug) {
    const b = (state.base.products || []).find((p) => p.slug === slug);
    const o = state.over[slug] || {};
    if (!b) return Object.assign({ subtitle: {}, desc: {}, benefits: { es: [], en: [] }, images: [] }, o, { custom: true, slug });
    const m = Object.assign({}, b, { images: [b.image, ...(b.gallery || [])].filter(Boolean) });
    ['name', 'nameEn', 'brand', 'video', 'cta', 'cat'].forEach((k) => { if (has(o[k])) m[k] = o[k]; });
    ['subtitle', 'desc', 'benefits'].forEach((k) => { if (o[k]) m[k] = { es: has(o[k].es) ? o[k].es : b[k].es, en: has(o[k].en) ? o[k].en : b[k].en }; });
    if (has(o.images)) m.images = o.images;
    if (typeof o.featured === 'boolean') m.featured = o.featured;
    if (typeof o.order === 'number') m.order = o.order;
    m.hidden = !!o.hidden;
    m.edited = !!state.over[slug];
    return m;
  }
  function allProducts() {
    const base = (state.base.products || []).map((p, i) => Object.assign(merged(p.slug), { _i: i }));
    const custom = Object.keys(state.over).filter((k) => k !== '_config' && state.over[k] && state.over[k].custom).map((k) => Object.assign(merged(k), { _i: 1000 }));
    return base.concat(custom).sort((a, b) => (typeof a.order === 'number' ? a.order : a._i) - (typeof b.order === 'number' ? b.order : b._i));
  }
  const thumb = (url, size = 300) => { const m = String(url || '').match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/); return m ? `${m[1]}c_fill,w_${size},h_${size},q_auto,f_auto/${m[2]}` : url; };
  const ph = (p) => { const c = catOf(p.cat); return `<div class="st-ph" style="--c:${c.color}">${U.esc((p.brand || p.name || '?').slice(0, 2).toUpperCase())}</div>`; };

  /* ---------- Pantalla ---------- */
  function render(el) {
    if (!state.base && !state.error) {
      el.innerHTML = `<div class="page-head"><div><h1>Tienda MQ Store</h1><p>Cargando el catálogo…</p></div></div>`;
      load(el);
      return;
    }
    if (state.error) {
      el.innerHTML = `<div class="page-head"><div><h1>Tienda MQ Store</h1></div></div>
        <div class="card"><div class="card-body">${UI.empty('No se pudo cargar el catálogo: ' + U.esc(state.error), 'alert')}<div style="text-align:center"><button class="btn" id="retry">${icon('refresh', 'sm')} Reintentar</button></div></div></div>`;
      el.querySelector('#retry').onclick = () => { state.error = ''; state.base = null; render(el); };
      return;
    }
    const cats = state.base.categories || [];
    const list = allProducts().filter((p) => !state.cat || p.cat === state.cat);
    const total = allProducts();
    const noPhotos = total.filter((p) => !p.images.length && !p.hidden).length;
    el.innerHTML = `
      <div class="page-head">
        <div><h1>Tienda MQ Store</h1><p>Fotos, videos, textos y productos de <a href="${U.esc(storeUrl())}" target="_blank" rel="noopener">${U.esc(storeUrl().replace(/^https?:\/\//, ''))}</a>. Los cambios se ven en la tienda al recargarla.</p></div>
        <div class="page-actions">
          <a class="btn" href="${U.esc(storeUrl())}" target="_blank" rel="noopener">${icon('eye', 'sm')} Ver la tienda</a>
          <button class="btn" id="contactBtn">${icon('phone', 'sm')} Datos de contacto</button>
          <button class="btn primary" id="newBtn">${icon('plus', 'sm')} Nuevo producto</button>
        </div>
      </div>
      <div class="kpis" style="margin-bottom:16px">
        <div class="card kpi"><div class="kpi-label">Productos en la tienda</div><div class="kpi-value">${total.filter((p) => !p.hidden).length}</div><div class="kpi-sub">${total.filter((p) => p.hidden).length} ocultos</div></div>
        <div class="card kpi"><div class="kpi-label">Sin fotos</div><div class="kpi-value" style="color:${noPhotos ? 'var(--warn)' : 'inherit'}">${noPhotos}</div><div class="kpi-sub">Muestran una imagen provisional</div></div>
        <div class="card kpi"><div class="kpi-label">Fotos subidas</div><div class="kpi-value">${U.sum(total, (p) => p.images.length)}</div><div class="kpi-sub">${total.filter((p) => p.video).length} productos con video</div></div>
      </div>
      <div class="seg" style="margin-bottom:16px;flex-wrap:wrap" id="catSeg">
        <button data-c="" class="${!state.cat ? 'active' : ''}">Todas</button>
        ${cats.map((c) => `<button data-c="${c.id}" class="${state.cat === c.id ? 'active' : ''}">${U.esc(c.name.es)}</button>`).join('')}
      </div>
      <div class="st-grid">${list.map((p) => {
        const c = catOf(p.cat);
        return `<div class="card st-card ${p.hidden ? 'is-hidden' : ''}" data-edit="${p.slug}" tabindex="0" role="button" aria-label="Editar ${U.esc(p.name)}">
          <div class="st-media">${p.images[0] ? `<img src="${U.esc(thumb(p.images[0]))}" alt="" loading="lazy">` : ph(p)}
            <div class="st-badges">${p.images.length ? `<span class="badge">${icon('image', 'sm')} ${p.images.length}</span>` : '<span class="badge warn">Sin fotos</span>'}${p.video ? `<span class="badge info">${icon('play', 'sm')} Video</span>` : ''}</div>
          </div>
          <div class="st-body">
            <div class="small" style="color:${c.color};font-weight:700">${U.esc(c.name.es)}</div>
            <strong>${U.esc(p.name)}</strong>
            <div class="small muted">${U.esc((p.subtitle && p.subtitle.es) || '')}</div>
            <div class="row wrap" style="gap:4px;margin-top:6px">${p.hidden ? '<span class="badge bad">Oculto</span>' : ''}${p.featured ? '<span class="badge good">Destacado</span>' : ''}${p.custom ? '<span class="badge info">Nuevo</span>' : ''}${p.edited && !p.custom ? '<span class="badge">Editado</span>' : ''}</div>
          </div>
        </div>`;
      }).join('') || UI.empty('No hay productos en esta categoría.', 'box')}</div>`;
    el.querySelectorAll('#catSeg button').forEach((b) => b.onclick = () => { state.cat = b.dataset.c; render(el); });
    el.querySelectorAll('[data-edit]').forEach((x) => {
      x.onclick = () => openEditor(x.dataset.edit, el);
      x.onkeydown = (e) => { if (e.key === 'Enter') openEditor(x.dataset.edit, el); };
    });
    el.querySelector('#newBtn').onclick = () => openEditor(null, el);
    el.querySelector('#contactBtn').onclick = () => openContact(el);
  }

  /* ---------- Editor de producto ---------- */
  const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
  function slugify(s) {
    let b = U.normalize(String(s || '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'producto';
    let out = b, n = 2;
    const taken = new Set((state.base.products || []).map((p) => p.slug).concat(Object.keys(state.over)));
    while (taken.has(out)) out = `${b}-${n++}`;
    return out;
  }

  function openEditor(slug, el) {
    const isNew = !slug;
    const p = isNew ? { custom: true, cat: state.cat || state.base.categories[0].id, name: '', brand: '', subtitle: {}, desc: {}, benefits: { es: [], en: [] }, images: [], video: '', cta: '', featured: false, hidden: false } : merged(slug);
    const base = isNew ? null : (state.base.products || []).find((x) => x.slug === slug);
    let images = (p.images || []).slice();
    let busy = false;
    const cats = state.base.categories;
    const L = (o, k) => U.esc((o && o[k]) || '');
    const B = (k) => U.esc(((p.benefits && p.benefits[k]) || []).join('\n'));
    UI.modal({
      title: isNew ? 'Nuevo producto de la tienda' : `Editar · ${U.esc(p.name)}`,
      size: 'lg',
      footer: `
        ${!isNew ? (p.custom ? `<button type="button" class="btn danger" id="stDel" style="margin-right:auto">${icon('trash', 'sm')} Eliminar</button>` : (p.edited ? `<button type="button" class="btn" id="stReset" style="margin-right:auto">Volver al original</button>` : '')) : ''}
        <button type="button" class="btn" data-close>Cancelar</button>
        <button type="submit" class="btn primary">${isNew ? 'Crear producto' : 'Guardar cambios'}</button>`,
      body: `
        <div class="st-editor">
          <div>
            <div class="small" style="font-weight:700;margin-bottom:6px">Fotos <span class="muted" style="font-weight:500">· la primera es la principal</span></div>
            <div class="st-photos" id="stPhotos"></div>
            <div class="row wrap" style="gap:6px;margin-top:10px">
              <button type="button" class="btn sm primary" id="stUp">${icon('upload', 'sm')} Subir fotos</button>
              <input type="file" id="stFile" accept="image/*" multiple hidden>
              <span class="small muted" id="stUpMsg">${UI.cloudinaryReady() ? 'Puedes elegir varias a la vez (JPG, PNG o WEBP).' : 'Configura Cloudinary para subir fotos.'}</span>
            </div>
            <div class="row" style="gap:6px;margin-top:8px"><input id="stUrl" placeholder="O pega el enlace de una foto (https://…)" style="flex:1"><button type="button" class="btn sm" id="stAddUrl">Agregar</button></div>
            <label class="field" style="margin-top:14px">Video <span class="hint">(YouTube, Vimeo o enlace .mp4)</span><input name="video" value="${U.esc(p.video || '')}" placeholder="https://youtu.be/…"></label>
            <div class="form-grid" style="margin-top:6px">
              <label class="field">Botón principal<select name="cta"><option value="" ${p.cta !== 'demo' ? 'selected' : ''}>Solicitar información o demostración</option><option value="demo" ${p.cta === 'demo' ? 'selected' : ''}>Solicitar una demostración</option></select></label>
              <label class="field">Orden <span class="hint">(menor = primero)</span><input name="order" type="number" step="1" value="${typeof p.order === 'number' ? p.order : ''}" placeholder="Automático"></label>
            </div>
            <label class="check" style="margin-top:8px"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> Destacado (aparece en recomendados)</label>
            <label class="check"><input type="checkbox" name="hidden" ${p.hidden ? 'checked' : ''}> Ocultar de la tienda</label>
          </div>
          <div class="form-grid">
            <label class="field">Categoría<select name="cat">${cats.map((c) => `<option value="${c.id}" ${p.cat === c.id ? 'selected' : ''}>${U.esc(c.name.es)}</option>`).join('')}</select></label>
            <label class="field">Marca<input name="brand" value="${U.esc(p.brand || '')}" placeholder="Ej.: Puronics"></label>
            <label class="field full">Nombre *<input name="name" required value="${U.esc(p.name || '')}"></label>
            <label class="field full">Subtítulo <span class="hint">(qué es, en una línea)</span><input name="subtitle_es" value="${L(p.subtitle, 'es')}"></label>
            <label class="field full">Descripción <span class="hint">(qué es y para qué sirve)</span><textarea name="desc_es" rows="4">${L(p.desc, 'es')}</textarea></label>
            <label class="field full">Beneficios principales <span class="hint">(uno por línea)</span><textarea name="ben_es" rows="5">${B('es')}</textarea></label>
            <details class="full"><summary class="small" style="cursor:pointer;font-weight:700">English version (opcional)</summary>
              <div class="form-grid" style="margin-top:10px">
                <label class="field full">Name<input name="nameEn" value="${U.esc(p.nameEn || '')}" placeholder="Si se deja vacío se usa el nombre en español"></label>
                <label class="field full">Subtitle<input name="subtitle_en" value="${L(p.subtitle, 'en')}"></label>
                <label class="field full">Description<textarea name="desc_en" rows="3">${L(p.desc, 'en')}</textarea></label>
                <label class="field full">Benefits <span class="hint">(one per line)</span><textarea name="ben_en" rows="4">${B('en')}</textarea></label>
              </div>
            </details>
          </div>
        </div>`,
      onOpen: (form, close) => {
        const $ = (x) => form.querySelector(x);
        const paint = () => {
          $('#stPhotos').innerHTML = images.length ? images.map((u, i) => `
            <div class="st-photo ${i ? '' : 'main'}">
              <img src="${U.esc(thumb(u, 240))}" alt="">
              ${i ? '' : '<span class="st-main">Principal</span>'}
              <div class="st-ph-tools">
                <button type="button" class="btn xs icon" data-mv="${i}" data-d="-1" title="Mover a la izquierda" ${i ? '' : 'disabled'}>${icon('chevronLeft', 'sm')}</button>
                ${i ? `<button type="button" class="btn xs" data-first="${i}" title="Usar como principal">★</button>` : ''}
                <button type="button" class="btn xs icon" data-mv="${i}" data-d="1" title="Mover a la derecha" ${i < images.length - 1 ? '' : 'disabled'}>${icon('chevronRight', 'sm')}</button>
                <button type="button" class="btn xs icon danger" data-rm="${i}" title="Quitar">${icon('trash', 'sm')}</button>
              </div>
            </div>`).join('') : `<div class="st-empty">${icon('image')}<div class="small"><strong>Aún no hay fotos</strong><br><span class="muted">Sube varias fotos profesionales del producto</span></div></div>`;
          form.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => { const i = Number(b.dataset.mv), j = i + Number(b.dataset.d); [images[i], images[j]] = [images[j], images[i]]; paint(); });
          form.querySelectorAll('[data-first]').forEach((b) => b.onclick = () => { const i = Number(b.dataset.first); images.unshift(images.splice(i, 1)[0]); paint(); });
          form.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { images.splice(Number(b.dataset.rm), 1); paint(); });
        };
        paint();
        $('#stUp').onclick = () => { if (!UI.cloudinaryReady()) return UI.toast('Configura Cloudinary para subir fotos', 'bad'); $('#stFile').click(); };
        $('#stFile').onchange = async (e) => {
          const files = [...e.target.files].filter((f) => /^image\//.test(f.type));
          e.target.value = '';
          if (!files.length) return;
          busy = true;
          const msg = $('#stUpMsg');
          for (let i = 0; i < files.length; i++) {
            if (files[i].size > 10 * 1024 * 1024) { UI.toast(`${files[i].name}: pesa más de 10 MB`, 'bad'); continue; }
            msg.textContent = `Subiendo ${i + 1} de ${files.length}…`;
            try { const r = await UI.uploadToCloudinary(files[i], 'tienda'); images.push(r.url); paint(); }
            catch (err) { UI.toast(err.message || 'No se pudo subir la foto', 'bad'); }
          }
          msg.textContent = 'Listo. Recuerda guardar los cambios.';
          busy = false;
        };
        $('#stAddUrl').onclick = () => {
          const u = $('#stUrl').value.trim();
          if (!/^https:\/\/.+/.test(u)) return UI.toast('Pega un enlace que empiece con https://', 'bad');
          images.push(u); $('#stUrl').value = ''; paint();
        };
        const del = $('#stDel'), reset = $('#stReset');
        if (del) del.onclick = async () => { if (!(await UI.confirm(`¿Eliminar "${U.esc(p.name)}" de la tienda?`))) return; await delOver(slug); close(); UI.toast('Producto eliminado', 'good'); render(el); };
        if (reset) reset.onclick = async () => { if (!(await UI.confirm('¿Volver a las fotos y textos originales de este producto?', { danger: false }))) return; await delOver(slug); close(); UI.toast('Producto restaurado', 'good'); render(el); };
      },
      onSubmit: async (d, form) => {
        const orderRaw = form.querySelector('[name=order]').value.trim();
        if (busy) { UI.toast('Espera a que terminen de subir las fotos', 'bad'); return false; }
        if (!d.name.trim()) { UI.toast('Escribe el nombre del producto', 'bad'); return false; }
        const doc = {
          images, video: d.video.trim(), cta: d.cta, featured: !!d.featured, hidden: !!d.hidden,
          order: orderRaw === '' ? null : Number(orderRaw),
          updatedAt: new Date().toISOString(), updatedBy: Store.realUser().id
        };
        const texts = {
          name: d.name.trim(), nameEn: d.nameEn.trim(), brand: d.brand.trim(), cat: d.cat,
          subtitle: { es: d.subtitle_es.trim(), en: d.subtitle_en.trim() },
          desc: { es: d.desc_es.trim(), en: d.desc_en.trim() },
          benefits: { es: lines(d.ben_es), en: lines(d.ben_en) }
        };
        if (isNew || p.custom) Object.assign(doc, texts, { custom: true });
        else {
          // Del producto base solo se guarda lo que cambió (así las mejoras del archivo base siguen llegando)
          ['name', 'nameEn', 'brand', 'cat'].forEach((k) => { if (texts[k] !== (base[k] || '')) doc[k] = texts[k]; });
          ['subtitle', 'desc'].forEach((k) => { const o = {}; ['es', 'en'].forEach((l) => { if (texts[k][l] !== (base[k][l] || '')) o[l] = texts[k][l]; }); if (Object.keys(o).length) doc[k] = o; });
          const ob = {}; ['es', 'en'].forEach((l) => { if (texts.benefits[l].join('\n') !== (base.benefits[l] || []).join('\n')) ob[l] = texts.benefits[l]; }); if (Object.keys(ob).length) doc.benefits = ob;
          const baseImgs = [base.image, ...(base.gallery || [])].filter(Boolean);
          if (images.join('|') === baseImgs.join('|')) delete doc.images;
          if (doc.video === (base.video || '')) delete doc.video;
          if (doc.cta === (base.cta || '')) delete doc.cta;
          if (doc.featured === !!base.featured) delete doc.featured;
        }
        if (doc.order === null || Number.isNaN(doc.order)) delete doc.order;
        try {
          await putOver(isNew ? slugify(d.name) : slug, doc);
          UI.toast(isNew ? 'Producto creado en la tienda' : 'Cambios guardados en la tienda', 'good');
          render(el);
        } catch (e) {
          UI.toast('No se pudo guardar: ' + (e.code === 'permission-denied' ? 'faltan las reglas nuevas de Firestore' : (e.code || e.message)), 'bad');
          return false;
        }
      }
    });
  }

  /* ---------- Datos de contacto de la tienda ---------- */
  function openContact(el) {
    const c = state.over._config || {};
    UI.modal({
      title: 'Datos de contacto de la tienda',
      body: `<div class="form-grid">
        <label class="field">WhatsApp <span class="hint">(número con WhatsApp)</span><input name="whatsapp" value="${U.esc(c.whatsapp || '')}" placeholder="(407) 555-0123"></label>
        <label class="field">Teléfono para llamar<input name="phone" value="${U.esc(c.phone || '')}" placeholder="Por defecto: (321) 496-7088"></label>
        <label class="field full">Correo electrónico<input name="email" type="email" value="${U.esc(c.email || '')}"></label>
        <label class="field">Instagram <span class="hint">(enlace)</span><input name="instagram" value="${U.esc(c.instagram || '')}" placeholder="https://instagram.com/…"></label>
        <label class="field">Facebook <span class="hint">(enlace)</span><input name="facebook" value="${U.esc(c.facebook || '')}" placeholder="https://facebook.com/…"></label>
        <p class="small muted full" style="margin:0">Ubicación: The Florida Mall, 8001 S Orange Blossom Trail, Orlando, FL 32809. Lo que dejes vacío no se muestra (o usa el valor por defecto).</p>
      </div>`,
      onSubmit: async (d) => {
        const digits = (v) => String(v || '').replace(/\D/g, '');
        const wa = digits(d.whatsapp), ph = digits(d.phone);
        const url = (v) => (v.trim() && !/^https?:\/\//.test(v.trim()) ? 'https://' + v.trim() : v.trim());
        const doc = {
          whatsapp: wa ? (wa.length === 10 ? '1' + wa : wa) : '',
          phone: ph ? '+' + (ph.length === 10 ? '1' + ph : ph) : '',
          email: d.email.trim(), instagram: url(d.instagram), facebook: url(d.facebook),
          updatedAt: new Date().toISOString(), updatedBy: Store.realUser().id
        };
        try { await putOver('_config', doc); UI.toast('Datos de contacto guardados', 'good'); render(el); }
        catch (e) { UI.toast('No se pudo guardar: ' + (e.code || e.message), 'bad'); return false; }
      }
    });
  }

  return { title: 'Tienda MQ Store', perm: 'manageUsers', render };
})();
