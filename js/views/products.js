/* =========================================================
   Productos — catálogo e inventario
   ========================================================= */
Views.productos = (() => {
  const state = { q: '', cat: '', filter: 'activos', view: 'cards' };
  try { state.view = localStorage.getItem('crm_mq_products_view') || 'cards'; } catch (e) {}

  const MAX_MB = 10;
  const FILTERS = [
    { id: 'activos', label: 'Activos', fn: (p) => p.active },
    { id: 'bajo', label: 'Stock bajo', fn: (p) => p.active && p.trackStock && p.stock <= (p.minStock || 0) },
    { id: 'inactivos', label: 'Inactivos', fn: (p) => !p.active },
    { id: 'todos', label: 'Todos', fn: () => true }
  ];

  // Miniatura optimizada de Cloudinary (recorte cuadrado, formato y calidad automáticos)
  const thumb = (url, size = 400) => (url && url.includes('res.cloudinary.com') && url.includes('/upload/'))
    ? url.replace('/upload/', `/upload/c_fill,w_${size},h_${size},q_auto,f_auto/`) : url;

  function soldLast30() {
    const sold = {};
    const from = U.startOfDay(U.addDays(new Date(), -29)), to = U.endOfDay();
    Store.all('orders').filter((o) => o.status !== 'cancelada' && Metrics.inRange(o.createdAt, from, to)).forEach((o) => o.items.forEach((i) => {
      if (!i.productId) return;
      sold[i.productId] = sold[i.productId] || { qty: 0, amount: 0 };
      sold[i.productId].qty += Number(i.qty) || 0;
      sold[i.productId].amount += (Number(i.qty) || 0) * (Number(i.price) || 0);
    }));
    return sold;
  }

  function render(el) {
    const canEdit = Store.can('manageProducts');
    const s = Store.settings();
    const q = U.normalize(state.q);
    const all = Store.all('products');
    const filter = FILTERS.find((f) => f.id === state.filter) || FILTERS[0];
    const list = U.sortBy(all.filter((p) => filter.fn(p) && (!state.cat || p.category === state.cat) && (!q || U.normalize(`${p.name} ${p.sku} ${p.description}`).includes(q))), (p) => (p.category || '') + p.name);
    const sold = soldLast30();
    const low = all.filter(FILTERS[1].fn);
    const inventoryValue = U.sum(all.filter((p) => p.active && p.trackStock), (p) => Math.max(0, p.stock || 0) * (p.cost || 0));

    el.innerHTML = `
      <div class="page-head">
        <div><h1>Productos</h1><p>${all.filter((p) => p.active).length} productos activos${low.length ? ` · <span style="color:var(--bad)">${low.length} con stock bajo</span>` : ''}${canEdit && inventoryValue ? ` · inventario valorado en ${U.money(inventoryValue)} (costo)` : ''}</p></div>
        <div class="page-actions">
          ${canEdit ? `<button class="btn" id="importBtn">${icon('upload', 'sm')} Importar</button>` : ''}
          <button class="btn" id="exportBtn">${icon('download', 'sm')} Exportar</button>
          ${canEdit ? `<button class="btn primary" id="newBtn">${icon('plus', 'sm')} Nuevo producto</button>` : ''}
        </div>
      </div>
      <div class="row wrap" style="margin-bottom:12px;gap:6px">
        ${FILTERS.map((f) => `<button class="btn sm ${state.filter === f.id ? 'primary' : ''}" data-filter="${f.id}">${f.label} <span class="${state.filter === f.id ? '' : 'muted'}">${all.filter(f.fn).length}</span></button>`).join('')}
      </div>
      <div class="card">
        <div class="toolbar">
          <input class="search" id="q" type="search" placeholder="Buscar por nombre, SKU o descripción…" value="${U.esc(state.q)}">
          <select id="fCat"><option value="">Todas las categorías</option>${UI.options(s.categories, state.cat)}</select>
          <span class="spacer"></span>
          <span class="muted small">${list.length} productos</span>
          <div class="seg" id="viewSeg">
            <button data-view="cards" class="${state.view === 'cards' ? 'active' : ''}" title="Tarjetas">${icon('dashboard', 'sm')}</button>
            <button data-view="table" class="${state.view === 'table' ? 'active' : ''}" title="Tabla">${icon('menu', 'sm')}</button>
          </div>
        </div>
        ${!all.length ? `<div class="empty">${icon('box')}<div>Aún no hay productos en el catálogo.</div>${canEdit ? `<div class="row" style="justify-content:center;margin-top:12px"><button class="btn primary" id="firstBtn">${icon('plus', 'sm')} Agregar el primer producto</button><button class="btn" id="firstImport">${icon('upload', 'sm')} Importar desde Excel</button></div>` : ''}</div>`
          : !list.length ? UI.empty('No hay productos con estos filtros.', 'box')
          : state.view === 'cards' ? cards(list, sold, canEdit) : table(list, sold, canEdit)}
      </div>`;
    bind(el, canEdit);
  }

  function stockBadge(p) {
    if (!p.trackStock) return '<span class="badge">Servicio</span>';
    const low = p.stock <= (p.minStock || 0);
    return `<span class="badge ${p.stock <= 0 ? 'bad' : low ? 'warn' : ''}">${p.stock <= 0 ? 'Agotado' : `${p.stock} en stock`}</span>`;
  }

  function cards(list, sold, canEdit) {
    return `<div class="pgrid">${list.map((p) => {
      const sd = sold[p.id] || { qty: 0 };
      return `<div class="pcard ${p.active ? '' : 'inactive'} ${canEdit ? 'clickable' : ''}" data-id="${p.id}">
        <div class="pimg">${p.imageUrl ? `<img src="${U.esc(thumb(p.imageUrl))}" alt="${U.esc(p.name)}" loading="lazy">` : icon('image')}</div>
        <div class="pbody">
          <div class="small muted">${U.esc(p.category || 'Sin categoría')}${p.sku ? ' · ' + U.esc(p.sku) : ''}</div>
          <div class="ptitle">${U.esc(p.name)}</div>
          <div class="row between" style="margin-top:auto">
            <strong class="num" style="font-size:17px">${U.money(p.price)}</strong>
            ${stockBadge(p)}
          </div>
          <div class="small muted">${sd.qty ? `${sd.qty} vendidos en 30 días` : 'Sin ventas en 30 días'}${p.active ? '' : ' · Inactivo'}</div>
        </div>
        ${canEdit ? `<div class="pactions" data-stop>
          ${p.trackStock ? `<button class="btn xs" data-stock="${p.id}" title="Ajustar stock">${icon('box', 'sm')}</button>` : ''}
          <button class="btn xs" data-dup="${p.id}" title="Duplicar">${icon('plus', 'sm')}</button>
        </div>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  function table(list, sold, canEdit) {
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th style="width:56px"></th><th>Producto</th><th>Categoría</th><th class="right">Precio</th>${canEdit ? '<th class="right">Costo</th><th class="right">Margen</th>' : ''}<th class="right">Stock</th><th class="right">Vendidos 30d</th>${canEdit ? '<th></th>' : ''}</tr></thead>
      <tbody>${list.map((p) => {
        const sd = sold[p.id] || { qty: 0, amount: 0 };
        return `<tr class="${canEdit ? 'clickable' : ''}" data-id="${p.id}" style="${p.active ? '' : 'opacity:.55'}">
          <td>${p.imageUrl ? `<img src="${U.esc(thumb(p.imageUrl, 120))}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:8px">` : `<div class="tl-icon" style="width:44px;height:44px;border-radius:8px">${icon('box', 'sm')}</div>`}</td>
          <td><div class="cell-main">${U.esc(p.name)}</div><div class="cell-sub">${U.esc(p.sku || '')}${p.active ? '' : ' · Inactivo'}</div></td>
          <td class="small">${U.esc(p.category || '—')}</td>
          <td class="right num"><strong>${U.money(p.price)}</strong></td>
          ${canEdit ? `<td class="right num small">${p.cost ? U.money(p.cost) : '—'}</td><td class="right num small">${p.cost && p.price ? U.pct((p.price - p.cost) / p.price) : '—'}</td>` : ''}
          <td class="right">${stockBadge(p)}</td>
          <td class="right num small">${sd.qty} · ${U.money(sd.amount)}</td>
          ${canEdit ? `<td class="nowrap" data-stop>${p.trackStock ? `<button class="btn xs" data-stock="${p.id}">Stock</button> ` : ''}<button class="btn xs" data-dup="${p.id}">Duplicar</button></td>` : ''}
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }

  function bind(el, canEdit) {
    const $ = (x) => el.querySelector(x);
    const qi = $('#q');
    qi.oninput = U.debounce(() => { state.q = qi.value; render(el); const n = el.querySelector('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250);
    $('#fCat').onchange = (e) => { state.cat = e.target.value; render(el); };
    el.querySelectorAll('[data-filter]').forEach((b) => b.onclick = () => { state.filter = b.dataset.filter; render(el); });
    el.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => { state.view = b.dataset.view; try { localStorage.setItem('crm_mq_products_view', state.view); } catch (e) {} render(el); });
    $('#exportBtn').onclick = exportCSV;
    ['#newBtn', '#firstBtn'].forEach((s) => { if ($(s)) $(s).onclick = () => openForm(); });
    ['#importBtn', '#firstImport'].forEach((s) => { if ($(s)) $(s).onclick = openImport; });
    if (!canEdit) return;
    el.querySelectorAll('[data-id]').forEach((row) => row.addEventListener('click', (e) => { if (e.target.closest('[data-stop]')) return; openForm(row.dataset.id); }));
    el.querySelectorAll('[data-stock]').forEach((b) => b.onclick = () => adjustStock(b.dataset.stock));
    el.querySelectorAll('[data-dup]').forEach((b) => b.onclick = () => {
      const p = Store.get('products', b.dataset.dup);
      const { id, createdAt, updatedAt, ...rest } = p;
      openForm(null, Object.assign(rest, { name: p.name + ' (copia)', sku: p.sku ? p.sku + '-C' : '', stock: 0 }));
    });
  }

  /* ---------- Formulario ---------- */
  function openForm(id, preset) {
    const s = Store.settings();
    const p = id ? Store.get('products', id) : Object.assign({ active: true, trackStock: true, stock: 0, minStock: 5, category: state.cat || s.categories[0], unit: 'Unidad' }, preset || {});
    let imageUrl = p.imageUrl || '';
    let uploading = false;
    const usedIn = id ? Store.all('orders').filter((o) => o.items.some((i) => i.productId === id)).length : 0;

    UI.modal({
      title: id ? 'Editar producto' : 'Nuevo producto',
      size: 'lg',
      footer: `
        ${id ? `<button type="button" class="btn danger" id="delProd" style="margin-right:auto">${icon('trash', 'sm')} Eliminar</button>` : ''}
        <button type="button" class="btn" data-close>Cancelar</button>
        <button type="submit" class="btn primary">${id ? 'Guardar cambios' : 'Crear producto'}</button>`,
      body: `
        <div class="pform">
          <div>
            <div class="dropzone" id="drop" tabindex="0" role="button" aria-label="Subir imagen del producto">
              <div id="imgBox"></div>
              <input type="file" id="img" accept="image/*" hidden>
            </div>
            <div class="row" style="margin-top:8px;gap:6px">
              <button type="button" class="btn sm" id="pickImg" style="flex:1">${icon('upload', 'sm')} ${imageUrl ? 'Cambiar' : 'Subir'} imagen</button>
              <button type="button" class="btn sm icon" id="rmImg" title="Quitar imagen" ${imageUrl ? '' : 'hidden'}>${icon('trash', 'sm')}</button>
            </div>
            <details style="margin-top:8px" class="small"><summary class="muted" style="cursor:pointer">Pegar URL de imagen</summary>
              <input id="imgUrl" placeholder="https://…" value="${U.esc(imageUrl)}" style="margin-top:6px">
            </details>
            ${UI.cloudinaryReady() ? '<div class="small muted" style="margin-top:6px">JPG, PNG o WEBP hasta 10 MB. Se guarda en Cloudinary.</div>' : '<div class="small muted" style="margin-top:6px">Configura Cloudinary en <code>js/config.js</code> para subir imágenes.</div>'}
          </div>
          <div class="form-grid">
            <label class="field full">Nombre del producto *<input name="name" required value="${U.esc(p.name)}" placeholder="Ej.: Filtro de aire 20x25x1 MERV 11"></label>
            <label class="field">Categoría
              <select name="category" id="catSel">${UI.options(s.categories, p.category)}<option value="__new">+ Nueva categoría…</option></select>
            </label>
            <label class="field">SKU / código <span class="hint">(se genera si lo dejas vacío)</span><input name="sku" value="${U.esc(p.sku)}"></label>
            <label class="field">Precio de venta *<input name="price" type="number" min="0" step="0.01" required value="${p.price ?? ''}"></label>
            <label class="field">Costo <span class="hint">(solo lo ve la admin)</span><input name="cost" type="number" min="0" step="0.01" value="${p.cost ?? ''}"></label>
            <label class="field">Unidad de venta<select name="unit">${UI.options(['Unidad', 'Paquete', 'Caja', 'Kit', 'Servicio', 'Mes'], p.unit || 'Unidad')}</select></label>
            <div class="field"><span>Margen</span><div id="margin" class="num" style="height:36px;display:flex;align-items:center;font-weight:600;color:var(--text)"></div></div>
            <label class="check full"><input type="checkbox" name="trackStock" id="trackStock" ${p.trackStock ? 'checked' : ''}> Controlar inventario (desmárcalo para servicios)</label>
            <label class="field stock-f">Stock actual<input name="stock" type="number" step="1" value="${p.stock ?? 0}"></label>
            <label class="field stock-f">Avisar cuando queden<input name="minStock" type="number" min="0" step="1" value="${p.minStock ?? 0}"></label>
            <label class="field full">Descripción y argumentos de venta <span class="hint">(las agentes lo ven al vender)</span><textarea name="description" rows="3" placeholder="Beneficios, medidas, cada cuánto se cambia…">${U.esc(p.description)}</textarea></label>
            <label class="check full"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Activo (disponible para vender)</label>
          </div>
        </div>`,
      onOpen: (form, close) => {
        const $ = (x) => form.querySelector(x);
        const box = $('#imgBox'), urlIn = $('#imgUrl'), file = $('#img'), drop = $('#drop');
        const show = (msg) => {
          box.innerHTML = msg ? `<div class="small muted">${msg}</div>`
            : imageUrl ? `<img src="${U.esc(thumb(imageUrl, 600))}" alt="">`
            : `<div class="dz-empty">${icon('image')}<div class="small"><strong>Arrastra una foto aquí</strong><br><span class="muted">o haz clic para elegirla</span></div></div>`;
          $('#rmImg').hidden = !imageUrl;
          $('#pickImg').innerHTML = `${icon('upload', 'sm')} ${imageUrl ? 'Cambiar' : 'Subir'} imagen`;
        };
        show();
        const upload = async (f) => {
          if (!f) return;
          if (!/^image\//.test(f.type)) return UI.toast('El archivo debe ser una imagen', 'bad');
          if (f.size > MAX_MB * 1024 * 1024) return UI.toast(`La imagen supera ${MAX_MB} MB`, 'bad');
          if (!UI.cloudinaryReady()) return UI.toast('Configura Cloudinary en js/config.js', 'bad');
          uploading = true;
          show('Subiendo imagen…');
          try { imageUrl = (await UI.uploadToCloudinary(f, 'productos')).url; urlIn.value = imageUrl; UI.toast('Imagen subida', 'good'); }
          catch (err) { UI.toast(err.message, 'bad'); }
          uploading = false;
          show();
        };
        $('#pickImg').onclick = () => file.click();
        drop.onclick = () => file.click();
        drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
        file.onchange = () => upload(file.files[0]);
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('over'));
        drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); upload(e.dataTransfer.files[0]); });
        $('#rmImg').onclick = () => { imageUrl = ''; urlIn.value = ''; show(); };
        urlIn.oninput = () => { imageUrl = urlIn.value.trim(); show(); };

        // Nueva categoría sin salir del formulario
        const cat = $('#catSel');
        let lastCat = cat.value;
        cat.onchange = () => {
          if (cat.value !== '__new') { lastCat = cat.value; return; }
          const name = (window.prompt('Nombre de la nueva categoría') || '').trim();
          if (!name) { cat.value = lastCat; return; }
          const cats = Store.settings().categories;
          if (!cats.some((c) => U.normalize(c) === U.normalize(name))) Store.saveSettings({ categories: [...cats, name] });
          const opt = document.createElement('option');
          opt.value = opt.textContent = name;
          cat.insertBefore(opt, cat.querySelector('[value="__new"]'));
          cat.value = lastCat = name;
        };

        const price = form.querySelector('[name=price]'), cost = form.querySelector('[name=cost]');
        const margin = () => {
          const pr = Number(price.value), co = Number(cost.value);
          $('#margin').innerHTML = pr && co ? `${U.money(pr - co)} <span class="muted" style="font-weight:500;margin-left:6px">(${U.pct((pr - co) / pr)})</span>` : '<span class="muted" style="font-weight:400">—</span>';
        };
        price.oninput = cost.oninput = margin;
        margin();
        const track = $('#trackStock');
        const toggleStock = () => form.querySelectorAll('.stock-f').forEach((x) => { x.style.display = track.checked ? '' : 'none'; });
        track.onchange = toggleStock;
        toggleStock();

        const del = $('#delProd');
        if (del) del.onclick = async () => {
          close();
          const msg = usedIn
            ? `<strong>${U.esc(p.name)}</strong> aparece en ${usedIn} venta(s). Las ventas conservan el nombre y precio, pero el producto dejará de existir en el catálogo.<br><br>Si solo ya no lo vendes, es mejor <strong>desactivarlo</strong>.`
            : `¿Eliminar <strong>${U.esc(p.name)}</strong> del catálogo?`;
          if (!(await UI.confirm(msg, { okLabel: 'Sí, eliminar' }))) return;
          Store.remove('products', id);
          UI.toast('Producto eliminado');
        };
      },
      onSubmit: (d) => {
        if (uploading) { UI.toast('Espera a que termine de subir la imagen', 'bad'); return false; }
        if (d.category === '__new') d.category = '';
        const data = Object.assign(d, {
          imageUrl,
          price: d.price || 0,
          cost: d.cost || 0,
          stock: d.trackStock ? (d.stock || 0) : 0,
          minStock: d.trackStock ? (d.minStock || 0) : 0,
          sku: d.sku || autoSku(d.name)
        });
        const dup = Store.all('products').find((x) => x.id !== id && x.sku && U.normalize(x.sku) === U.normalize(data.sku));
        if (dup) { UI.toast(`El SKU ${data.sku} ya lo usa "${dup.name}"`, 'bad'); return false; }
        if (id) Store.update('products', id, data); else Store.insert('products', data);
        UI.toast(id ? 'Producto actualizado' : 'Producto creado', 'good');
      }
    });
  }

  function autoSku(name) {
    const base = U.normalize(name).replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.slice(0, 3)).join('-').toUpperCase() || 'PRD';
    let n = 1, sku;
    do { sku = `${base}-${String(n++).padStart(2, '0')}`; } while (Store.all('products').some((p) => p.sku === sku));
    return sku;
  }

  function adjustStock(id) {
    const p = Store.get('products', id);
    UI.modal({
      title: `Ajustar stock · ${U.esc(p.name)}`, size: 'sm', submitLabel: 'Aplicar',
      body: `<p class="muted" style="margin:0">Stock actual: <strong>${p.stock}</strong></p>
        <div class="form-grid">
          <label class="field">Movimiento<select name="mode"><option value="in">Entrada (+)</option><option value="out">Salida (−)</option><option value="set">Fijar cantidad exacta</option></select></label>
          <label class="field">Cantidad<input name="qty" type="number" min="0" step="1" required></label>
          <label class="field full">Motivo <span class="hint">(opcional)</span><input name="reason" placeholder="Llegó pedido del proveedor, conteo físico…"></label>
        </div>`,
      onSubmit: (d) => {
        const q = Number(d.qty) || 0;
        const stock = d.mode === 'in' ? p.stock + q : d.mode === 'out' ? p.stock - q : q;
        const log = [...(p.stockLog || []), { at: new Date().toISOString(), by: Store.currentUser().id, from: p.stock, to: stock, reason: d.reason || '' }].slice(-50);
        Store.update('products', id, { stock, stockLog: log });
        UI.toast('Stock actualizado: ' + stock, 'good');
      }
    });
  }

  /* ---------- Exportar / importar ---------- */
  function exportCSV() {
    const canEdit = Store.can('manageProducts');
    const cols = [
      { label: 'SKU', value: 'sku' }, { label: 'Nombre', value: 'name' }, { label: 'Categoría', value: 'category' },
      { label: 'Precio', value: 'price' }, ...(canEdit ? [{ label: 'Costo', value: 'cost' }] : []),
      { label: 'Unidad', value: 'unit' }, { label: 'Stock', value: (p) => (p.trackStock ? p.stock : '') }, { label: 'Stock mínimo', value: (p) => (p.trackStock ? p.minStock : '') },
      { label: 'Controla inventario', value: (p) => (p.trackStock ? 'Sí' : 'No') }, { label: 'Activo', value: (p) => (p.active ? 'Sí' : 'No') },
      { label: 'Descripción', value: 'description' }, { label: 'Imagen', value: 'imageUrl' }
    ];
    U.download(`productos-${U.toDateInput(new Date())}.csv`, U.toCSV(U.sortBy(Store.all('products'), (p) => p.category + p.name), cols), 'text/csv;charset=utf-8');
    UI.toast('Catálogo exportado', 'good');
  }

  function openImport() {
    UI.modal({
      title: 'Importar productos desde Excel / CSV',
      size: 'lg',
      submitLabel: 'Importar',
      body: `
        <p style="margin:0" class="muted">Guarda tu Excel como <strong>CSV</strong>. La primera fila debe tener los títulos. Se reconocen: <code>nombre, sku, categoria, precio, costo, stock, stock minimo, unidad, descripcion, imagen</code>. Solo <strong>nombre</strong> y <strong>precio</strong> son obligatorios.</p>
        <input type="file" id="csvFile" accept=".csv,text/csv">
        <label class="check"><input type="checkbox" name="update" checked> Si el SKU ya existe, actualizar el producto en vez de duplicarlo</label>
        <div id="csvPreview" class="small muted"></div>
        <button type="button" class="btn sm" id="tpl" style="align-self:flex-start">${icon('download', 'sm')} Descargar plantilla</button>`,
      onOpen: (form) => {
        form.querySelector('#tpl').onclick = () => U.download('plantilla-productos.csv', '﻿nombre,sku,categoria,precio,costo,stock,stock minimo,unidad,descripcion,imagen\nFiltro de aire 16x25x1 MERV 8,FA-1625,Filtros de aire,19.99,7.50,40,10,Unidad,Cambio cada 3 meses,\n', 'text/csv;charset=utf-8');
        form.querySelector('#csvFile').onchange = async (e) => {
          const f = e.target.files[0]; if (!f) return;
          const rows = U.parseCSV(await f.text());
          form._rows = rows;
          form.querySelector('#csvPreview').innerHTML = rows.length
            ? `<strong>${rows.length} filas detectadas.</strong> Columnas: ${Object.keys(rows[0]).map(U.esc).join(', ')}`
            : 'No se detectaron filas.';
        };
      },
      onSubmit: (d, form) => {
        const rows = form._rows || [];
        if (!rows.length) { UI.toast('Selecciona un archivo CSV', 'bad'); return false; }
        const pick = (r, ...keys) => { for (const k of keys) if (r[k] !== undefined && r[k] !== '') return r[k]; return ''; };
        const num = (v) => Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
        const cats = [...Store.settings().categories];
        let created = 0, updated = 0, skipped = 0;
        rows.forEach((r) => {
          const name = pick(r, 'nombre', 'name', 'producto');
          const priceRaw = pick(r, 'precio', 'price', 'precio venta');
          if (!name || priceRaw === '') { skipped++; return; }
          const category = pick(r, 'categoria', 'category');
          if (category && !cats.some((c) => U.normalize(c) === U.normalize(category))) cats.push(category);
          const stockRaw = pick(r, 'stock', 'inventario', 'existencias');
          const data = {
            name, price: num(priceRaw), cost: num(pick(r, 'costo', 'cost')),
            category: category || cats[0], unit: pick(r, 'unidad', 'unit') || 'Unidad',
            description: pick(r, 'descripcion', 'description'), imageUrl: pick(r, 'imagen', 'image', 'foto'),
            trackStock: stockRaw !== '', stock: num(stockRaw), minStock: num(pick(r, 'stock minimo', 'minimo', 'min stock')), active: true
          };
          const sku = pick(r, 'sku', 'codigo', 'code');
          const existing = sku && Store.all('products').find((p) => p.sku && U.normalize(p.sku) === U.normalize(sku));
          if (existing && d.update) { Store.update('products', existing.id, data); updated++; }
          else { Store.insert('products', Object.assign(data, { sku: sku || autoSku(name) })); created++; }
        });
        if (cats.length !== Store.settings().categories.length) Store.saveSettings({ categories: cats });
        UI.toast(`${created} creados · ${updated} actualizados${skipped ? ` · ${skipped} filas sin nombre o precio` : ''}`, 'good');
      }
    });
  }

  return { title: 'Productos', render, openForm };
})();
