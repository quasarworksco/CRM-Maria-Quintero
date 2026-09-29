/* =========================================================
   Productos — catálogo e inventario
   ========================================================= */
Views.productos = (() => {
  const state = { q: '', cat: '', showInactive: false };

  function render(el) {
    const canEdit = Store.can('manageProducts');
    const s = Store.settings();
    const q = U.normalize(state.q);
    const sold = {};
    Store.all('orders').filter((o) => o.status !== 'cancelada' && Metrics.inRange(o.createdAt, U.startOfDay(U.addDays(new Date(), -29)), U.endOfDay()))
      .forEach((o) => o.items.forEach((i) => { if (!i.productId) return; sold[i.productId] = sold[i.productId] || { qty: 0, amount: 0 }; sold[i.productId].qty += i.qty; sold[i.productId].amount += i.qty * i.price; }));
    const list = U.sortBy(Store.all('products').filter((p) => (state.showInactive || p.active) && (!state.cat || p.category === state.cat) && (!q || U.normalize(p.name + ' ' + p.sku).includes(q))), (p) => p.category + p.name);
    const low = Store.all('products').filter((p) => p.active && p.trackStock && p.stock <= (p.minStock || 0));

    el.innerHTML = `
      <div class="page-head">
        <div><h1>Productos</h1><p>${Store.all('products').filter((p) => p.active).length} productos activos${low.length ? ` · <span style="color:var(--bad)">${low.length} con stock bajo</span>` : ''}</p></div>
        <div class="page-actions">${canEdit ? `<button class="btn primary" id="newBtn">${icon('plus', 'sm')} Nuevo producto</button>` : ''}</div>
      </div>
      <div class="card">
        <div class="toolbar">
          <input class="search" id="q" type="search" placeholder="Buscar producto o SKU…" value="${U.esc(state.q)}">
          <select id="fCat"><option value="">Todas las categorías</option>${UI.options(s.categories, state.cat)}</select>
          <label class="check small"><input type="checkbox" id="inactive" ${state.showInactive ? 'checked' : ''}> Mostrar inactivos</label>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th style="width:56px"></th><th>Producto</th><th>Categoría</th><th class="right">Precio</th>${canEdit ? '<th class="right">Margen</th>' : ''}<th class="right">Stock</th><th class="right">Vendidos 30d</th><th></th></tr></thead>
          <tbody>${list.length ? list.map((p) => {
            const sd = sold[p.id] || { qty: 0, amount: 0 };
            const lowStock = p.trackStock && p.stock <= (p.minStock || 0);
            return `<tr class="${canEdit ? 'clickable' : ''}" data-id="${p.id}" style="${p.active ? '' : 'opacity:.55'}">
              <td>${p.imageUrl ? `<img src="${U.esc(p.imageUrl)}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:8px">` : `<div class="tl-icon" style="width:44px;height:44px;border-radius:8px">${icon('box', 'sm')}</div>`}</td>
              <td><div class="cell-main">${U.esc(p.name)}</div><div class="cell-sub">${U.esc(p.sku || '')}${p.active ? '' : ' · Inactivo'}</div></td>
              <td class="small">${U.esc(p.category)}</td>
              <td class="right num"><strong>${U.money(p.price)}</strong></td>
              ${canEdit ? `<td class="right num small">${p.cost ? U.pct((p.price - p.cost) / p.price) : '—'}</td>` : ''}
              <td class="right num">${p.trackStock ? `<span class="${lowStock ? 'badge bad' : ''}">${p.stock}</span>` : '<span class="muted small">N/A</span>'}</td>
              <td class="right num small">${sd.qty} · ${U.money(sd.amount)}</td>
              <td>${canEdit && p.trackStock ? `<button class="btn xs" data-stock="${p.id}">Ajustar stock</button>` : ''}</td>
            </tr>`;
          }).join('') : `<tr><td colspan="8">${UI.empty('Sin productos.', 'box')}</td></tr>`}</tbody>
        </table></div>
      </div>`;

    const $ = (x) => el.querySelector(x);
    const qi = $('#q');
    qi.oninput = U.debounce(() => { state.q = qi.value; render(el); const n = el.querySelector('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250);
    $('#fCat').onchange = (e) => { state.cat = e.target.value; render(el); };
    $('#inactive').onchange = (e) => { state.showInactive = e.target.checked; render(el); };
    if ($('#newBtn')) $('#newBtn').onclick = () => openForm();
    if (canEdit) el.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = (e) => { if (e.target.closest('[data-stock]')) return; openForm(tr.dataset.id); });
    el.querySelectorAll('[data-stock]').forEach((b) => b.onclick = () => adjustStock(b.dataset.stock));
  }

  function openForm(id) {
    const p = id ? Store.get('products', id) : { active: true, trackStock: true, stock: 0, minStock: 5, category: Store.settings().categories[0] };
    let imageUrl = p.imageUrl || '';
    UI.modal({
      title: id ? 'Editar producto' : 'Nuevo producto',
      body: `
        <div class="row" style="gap:14px;align-items:flex-start">
          <div id="imgBox" style="width:96px;height:96px;border-radius:10px;background:var(--surface-3);display:grid;place-items:center;overflow:hidden;flex:none">${imageUrl ? `<img src="${U.esc(imageUrl)}" style="width:100%;height:100%;object-fit:cover">` : icon('image')}</div>
          <div class="stack" style="gap:8px;flex:1">
            <label class="btn sm" style="align-self:flex-start">${icon('upload', 'sm')} Subir imagen<input type="file" id="img" accept="image/*" hidden></label>
            <input id="imgUrl" placeholder="…o pega la URL de la imagen" value="${U.esc(imageUrl)}">
            ${UI.cloudinaryReady() ? '' : '<div class="small muted">Para subir imágenes configura Cloudinary en <code>js/config.js</code>.</div>'}
          </div>
        </div>
        <div class="form-grid">
          <label class="field full">Nombre *<input name="name" required value="${U.esc(p.name)}"></label>
          <label class="field">SKU / código<input name="sku" value="${U.esc(p.sku)}"></label>
          <label class="field">Categoría<select name="category">${UI.options(Store.settings().categories, p.category)}</select></label>
          <label class="field">Precio de venta *<input name="price" type="number" min="0" step="0.01" required value="${p.price ?? ''}"></label>
          <label class="field">Costo <span class="hint">(solo lo ve admin)</span><input name="cost" type="number" min="0" step="0.01" value="${p.cost ?? ''}"></label>
          <label class="field">Stock actual<input name="stock" type="number" step="1" value="${p.stock ?? 0}"></label>
          <label class="field">Alerta de stock mínimo<input name="minStock" type="number" min="0" step="1" value="${p.minStock ?? 0}"></label>
          <label class="field full">Descripción / argumentos de venta<textarea name="description" rows="2">${U.esc(p.description)}</textarea></label>
          <label class="check"><input type="checkbox" name="trackStock" ${p.trackStock ? 'checked' : ''}> Controlar inventario</label>
          <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Activo (disponible para vender)</label>
        </div>`,
      onOpen: (form) => {
        const box = form.querySelector('#imgBox');
        const urlIn = form.querySelector('#imgUrl');
        const show = () => { box.innerHTML = imageUrl ? `<img src="${U.esc(imageUrl)}" style="width:100%;height:100%;object-fit:cover">` : icon('image'); };
        urlIn.oninput = () => { imageUrl = urlIn.value.trim(); show(); };
        form.querySelector('#img').onchange = async (e) => {
          const f = e.target.files[0]; if (!f) return;
          if (!UI.cloudinaryReady()) return UI.toast('Configura Cloudinary en js/config.js', 'bad');
          box.innerHTML = '<span class="small muted">Subiendo…</span>';
          try { imageUrl = (await UI.uploadToCloudinary(f, 'productos')).url; urlIn.value = imageUrl; show(); }
          catch (err) { UI.toast(err.message, 'bad'); show(); }
        };
      },
      onSubmit: (d) => {
        const data = Object.assign(d, { imageUrl, price: d.price || 0, cost: d.cost || 0, stock: d.stock || 0, minStock: d.minStock || 0 });
        if (id) Store.update('products', id, data); else Store.insert('products', data);
        UI.toast(id ? 'Producto actualizado' : 'Producto creado', 'good');
      }
    });
  }

  function adjustStock(id) {
    const p = Store.get('products', id);
    UI.modal({
      title: `Ajustar stock · ${U.esc(p.name)}`, size: 'sm', submitLabel: 'Aplicar',
      body: `<p class="muted" style="margin:0">Stock actual: <strong>${p.stock}</strong></p>
        <div class="form-grid">
          <label class="field">Movimiento<select name="mode"><option value="in">Entrada (+)</option><option value="out">Salida (−)</option><option value="set">Fijar cantidad exacta</option></select></label>
          <label class="field">Cantidad<input name="qty" type="number" min="0" step="1" required></label>
        </div>`,
      onSubmit: (d) => {
        const q = Number(d.qty) || 0;
        const stock = d.mode === 'in' ? p.stock + q : d.mode === 'out' ? p.stock - q : q;
        Store.update('products', id, { stock });
        UI.toast('Stock actualizado: ' + stock, 'good');
      }
    });
  }

  return { title: 'Productos', render };
})();
