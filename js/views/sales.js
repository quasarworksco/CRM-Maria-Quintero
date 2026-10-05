/* =========================================================
   Ventas y pedidos
   ========================================================= */
Views.ventas = (() => {
  const state = { q: '', status: '', pay: '', seller: '', channel: '', range: 'mes' };

  function render(el) {
    const manager = Store.can('viewAll');
    const fin = Store.can('finance');
    const showCom = fin || Store.canSeeOwnCommission();
    const range = Metrics.RANGES[state.range];
    const [from, to] = range ? range.get() : [new Date(0), U.endOfDay()];
    const q = U.normalize(state.q);
    const list = U.sortBy(Store.myOrders().filter((o) => {
      const c = Store.get('clients', o.clientId);
      return (!range || Metrics.inRange(o.createdAt, from, to)) && (!state.status || o.status === state.status) &&
        (!state.pay || !fin || Store.orderPayStatus(o).id === state.pay) && (!state.seller || o.userId === state.seller) && (!state.channel || (o.channel || '') === state.channel) &&
        (!q || U.normalize(`${o.number} ${c ? c.name + ' ' + c.phone : ''} ${o.items.map((i) => i.name).join(' ')}`).includes(q));
    }), (o) => o.createdAt, -1);
    const valid = list.filter((o) => o.status !== 'cancelada');
    const total = U.sum(valid, (o) => o.total);
    const paid = U.sum(valid, Store.orderPaid);

    el.innerHTML = `
      <div class="page-head">
        <div><h1>Ventas y pedidos</h1><p>${valid.length} ventas · ${range ? range.label.toLowerCase() : 'todo el historial'}</p></div>
        <div class="page-actions">
          ${Store.can('exportData') ? `<button class="btn" id="exportBtn">${icon('download', 'sm')} Exportar</button>` : ''}
          <button class="btn primary" id="newBtn">${icon('plus', 'sm')} Nueva venta</button>
        </div>
      </div>
      ${fin ? '' : `<div class="script-box small" style="margin-bottom:14px">${icon('lock', 'sm')} Los montos, pagos y saldos de las ventas solo los ve la administración.</div>`}
      <div class="kpis">${fin ? `
        <div class="card kpi"><div class="kpi-label">Total vendido</div><div class="kpi-value">${U.money(total)}</div><div class="kpi-sub">Ticket promedio ${U.money(valid.length ? total / valid.length : 0)}</div></div>
        <div class="card kpi"><div class="kpi-label">Cobrado de estas ventas</div><div class="kpi-value" style="color:var(--good)">${U.money(paid)}</div><div class="progress good"><span style="width:${total ? (paid / total) * 100 : 0}%"></span></div><div class="kpi-sub">${U.pct(total ? paid / total : 0)} recaudado</div></div>
        <div class="card kpi"><div class="kpi-label">Pendiente de cobro</div><div class="kpi-value" style="color:var(--bad)">${U.money(total - paid)}</div><div class="kpi-sub">${valid.filter((o) => Store.orderBalance(o) > 0).length} pedidos con saldo</div></div>
        ` : `
        <div class="card kpi"><div class="kpi-label">Ventas</div><div class="kpi-value">${valid.length}</div><div class="kpi-sub">${range ? range.label : 'Todo el historial'}</div></div>
        <div class="card kpi"><div class="kpi-label">Entregadas</div><div class="kpi-value">${valid.filter((o) => o.status === 'entregada').length}</div><div class="kpi-sub">Ya en manos del cliente</div></div>
        ${showCom ? `<div class="card kpi"><div class="kpi-label">Mis comisiones</div><div class="kpi-value" style="color:#b8860b">${U.money(U.sum(valid, Store.orderCommission))}</div><div class="kpi-sub">${range ? range.label : 'Todo el historial'}</div></div>` : ''}
        <div class="card kpi"><div class="kpi-label">Canal principal</div><div class="kpi-value" style="font-size:20px">${U.esc(topChannel(valid) || '—')}</div><div class="kpi-sub">De dónde vienen más ventas</div></div>`}
        <div class="card kpi"><div class="kpi-label">Por entregar</div><div class="kpi-value">${valid.filter((o) => ['pendiente', 'confirmada', 'enviada'].includes(o.status)).length}</div><div class="kpi-sub">Pendientes, confirmados o enviados</div></div>
        ${fin ? `<div class="card kpi"><div class="kpi-label">Comisiones</div><div class="kpi-value" style="color:#b8860b">${U.money(U.sum(valid, Store.orderCommission))}</div><div class="kpi-sub">A pagar a las agentes · ${range ? range.label.toLowerCase() : 'todo'}</div></div>` : ''}
      </div>
      <div class="card">
        <div class="toolbar">
          <input class="search" id="q" type="search" placeholder="Buscar # venta, cliente, producto…" value="${U.esc(state.q)}">
          <select id="fRange">${Object.entries(Metrics.RANGES).map(([k, r]) => `<option value="${k}" ${k === state.range ? 'selected' : ''}>${r.label}</option>`).join('')}<option value="todo" ${state.range === 'todo' ? 'selected' : ''}>Todo el historial</option></select>
          <select id="fStatus"><option value="">Todo estado de entrega</option>${UI.options(ORDER_STATUS, state.status)}</select>
          <select id="fChannel"><option value="">Todos los canales</option>${UI.options(channels(), state.channel)}</select>
          ${fin ? `<select id="fPay"><option value="">Todo estado de pago</option>${UI.options([{ id: 'pagada', name: 'Pagada' }, { id: 'parcial', name: 'Abono parcial' }, { id: 'sin_pago', name: 'Sin pago' }], state.pay)}</select>` : ''}
          ${manager ? `<select id="fSeller"><option value="">Todos los vendedores</option>${UI.userOptions(state.seller)}</select>` : ''}
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Venta</th><th>Cliente</th><th>Productos</th><th>Canal</th>${manager ? '<th>Vendedor</th>' : ''}${fin ? '<th class="right">Total</th><th class="right">Saldo</th><th>Pago</th>' : ''}${showCom ? `<th class="right">${fin ? 'Comisión' : 'Mi comisión'}</th>` : ''}<th>Entrega</th></tr></thead>
          <tbody>${list.length ? list.slice(0, 300).map((o) => {
            const c = Store.get('clients', o.clientId);
            return `<tr class="clickable" data-order="${o.id}">
              <td><div class="cell-main">${U.esc(o.number)}</div><div class="cell-sub">${U.date(o.createdAt)}</div></td>
              <td><div class="cell-main">${U.esc(c ? c.name : '(eliminado)')}</div><div class="cell-sub">${U.esc(c ? c.phone : '')}</div></td>
              <td class="small" style="max-width:260px">${o.items.map((i) => `${i.qty}× ${U.esc(i.name)}`).join('<br>')}</td>
              <td class="small">${U.esc(o.channel || '—')}</td>
              ${manager ? `<td class="small nowrap">${U.esc(UI.userName(o.userId))}</td>` : ''}
              ${fin ? `<td class="right num nowrap"><strong>${U.money(o.total)}</strong></td>
              <td class="right num nowrap" style="color:${Store.orderBalance(o) > 0 ? 'var(--bad)' : 'var(--text-3)'}">${U.money(Store.orderBalance(o))}</td>
              <td>${UI.payBadge(o)}</td>` : ''}
              ${showCom ? `<td class="right num nowrap" style="color:#b8860b">${Store.orderCommission(o) ? U.money(Store.orderCommission(o)) : '—'}</td>` : ''}
              <td>${UI.orderStatusBadge(o.status)}</td>
            </tr>`;
          }).join('') : `<tr><td colspan="10">${UI.empty('No hay ventas en este periodo.', 'cart')}</td></tr>`}</tbody>
        </table></div>
      </div>`;

    const $ = (s) => el.querySelector(s);
    const qi = $('#q');
    qi.oninput = U.debounce(() => { state.q = qi.value; render(el); const n = el.querySelector('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250);
    $('#fRange').onchange = (e) => { state.range = e.target.value; render(el); };
    $('#fStatus').onchange = (e) => { state.status = e.target.value; render(el); };
    if ($('#fPay')) $('#fPay').onchange = (e) => { state.pay = e.target.value; render(el); };
    $('#fChannel').onchange = (e) => { state.channel = e.target.value; render(el); };
    if ($('#fSeller')) $('#fSeller').onchange = (e) => { state.seller = e.target.value; render(el); };
    $('#newBtn').onclick = () => openOrderForm({});
    if ($('#exportBtn')) $('#exportBtn').onclick = () => exportCSV(list);
    el.querySelectorAll('[data-order]').forEach((tr) => tr.onclick = () => openOrderDetail(tr.dataset.order));
  }

  const channels = () => { const s = Store.settings().saleChannels; return s && s.length ? s : SALE_CHANNEL_DEFAULTS; };
  function topChannel(list) {
    const g = U.groupBy(list.filter((o) => o.channel), (o) => o.channel);
    return Object.keys(g).sort((a, b) => g[b].length - g[a].length)[0];
  }

  function exportCSV(list) {
    const fin = Store.can('finance');
    const csv = U.toCSV(list, [
      { label: 'Venta', value: 'number' }, { label: 'Fecha', value: (o) => U.date(o.createdAt) },
      { label: 'Cliente', value: (o) => (Store.get('clients', o.clientId) || {}).name || '' }, { label: 'Teléfono', value: (o) => (Store.get('clients', o.clientId) || {}).phone || '' },
      { label: 'Productos', value: (o) => o.items.map((i) => `${i.qty}x ${i.name}`).join(' | ') }, { label: 'Canal', value: (o) => o.channel || '' }, { label: 'Vendedor', value: (o) => UI.userName(o.userId) },
      ...(fin ? [{ label: 'Subtotal', value: 'subtotal' }, { label: 'Descuento', value: 'discount' }, { label: 'Total', value: 'total' },
        { label: 'Pagado', value: (o) => Store.orderPaid(o) }, { label: 'Saldo', value: (o) => Store.orderBalance(o) },
        { label: 'Estado pago', value: (o) => Store.orderPayStatus(o).name }, { label: 'Condición', value: 'paymentTerms' }] : []),
      ...(fin || Store.canSeeOwnCommission() ? [{ label: 'Comisión', value: (o) => Store.orderCommission(o) }] : []),
      { label: 'Entrega', value: (o) => orderStatusById(o.status).name }
    ]);
    U.download(`ventas-${U.toDateInput(new Date())}.csv`, csv, 'text/csv;charset=utf-8');
  }

  /* ---------- Formulario de venta ---------- */
  function openOrderForm({ clientId, id }) {
    const editing = id ? Store.get('orders', id) : null;
    const products = Store.all('products').filter((p) => p.active);
    const clients = U.sortBy(Store.myClients(), (c) => U.normalize(c.name));
    let items = editing ? editing.items.map((i) => Object.assign({}, i)) : [];
    if (!items.length) {
      const c = clientId && Store.get('clients', clientId);
      const pre = c && (c.interests || []).map((pid) => products.find((p) => p.id === pid)).filter(Boolean);
      items = pre && pre.length ? pre.map((p) => ({ productId: p.id, name: p.name, qty: 1, price: p.price })) : [{ productId: '', name: '', qty: 1, price: 0 }];
    }
    const o = editing || { clientId, discount: 0, shipping: 0, taxRate: 0, paymentTerms: 'Contado', status: 'pendiente', deliveryDate: U.addDays(new Date(), 2).toISOString(), dueDate: U.addDays(new Date(), 15).toISOString() };

    const itemRows = () => items.map((it, i) => `
      <tr>
        <td style="min-width:220px"><select data-i="${i}" data-k="productId"><option value="">— Producto —</option>${products.map((p) => `<option value="${p.id}" ${p.id === it.productId ? 'selected' : ''}>${U.esc(p.name)} · ${U.money(p.price)}${p.trackStock ? ` (stock ${p.stock})` : ''}</option>`).join('')}<option value="__custom" ${!it.productId && it.name ? 'selected' : ''}>Otro (escribir)…</option></select>
          ${!it.productId && it.name !== undefined && (it.custom || (!it.productId && it.name)) ? `<input data-i="${i}" data-k="name" value="${U.esc(it.name)}" placeholder="Descripción" style="margin-top:4px">` : ''}</td>
        <td style="width:80px"><input type="number" min="1" step="1" data-i="${i}" data-k="qty" value="${it.qty}"></td>
        <td style="width:120px"><input type="number" min="0" step="0.01" data-i="${i}" data-k="price" value="${it.price}"></td>
        <td class="right num nowrap" style="width:110px">${U.money((it.qty || 0) * (it.price || 0))}</td>
        <td style="width:36px"><button type="button" class="btn ghost sm icon" data-rm="${i}" ${items.length === 1 ? 'disabled' : ''}>${icon('x', 'sm')}</button></td>
      </tr>`).join('');

    const m = UI.modal({
      title: editing ? `Editar venta ${editing.number}` : 'Nueva venta',
      size: 'lg',
      submitLabel: editing ? 'Guardar cambios' : 'Registrar venta',
      body: `
        <div class="form-grid">
          <label class="field ${Store.can('reassign') ? '' : 'full'}">Cliente *<select name="clientId" required>${UI.options(clients, o.clientId, { blank: 'Seleccionar cliente…', label: (c) => `${c.name} · ${c.phone}` })}</select></label>
          ${Store.can('reassign') ? `<label class="field">Vendedor <span class="hint">(a quién se le acredita)</span><select name="userId">${UI.userOptions(o.userId || (Store.get('clients', o.clientId) || {}).ownerId || Store.currentUser().id)}</select></label>` : ''}
          <label class="field">Canal de la venta *<select name="channel" id="chSel" required>${UI.options(channels(), o.channel || (o.clientId ? channelFromSource((Store.get('clients', o.clientId) || {}).source) : ''), { blank: 'Seleccionar…' })}</select><span class="hint">Instagram, Facebook, WhatsApp, página web, tienda, referido…</span></label>
        </div>
        <div class="table-wrap"><table class="table items-table">
          <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th class="right">Importe</th><th></th></tr></thead>
          <tbody id="items">${itemRows()}</tbody>
        </table></div>
        <div><button type="button" class="btn sm" id="addItem">${icon('plus', 'sm')} Agregar producto</button></div>
        <div class="form-grid cols-3">
          <label class="field">Descuento ($)<input name="discount" type="number" min="0" step="0.01" value="${o.discount || 0}"></label>
          <label class="field">Envío / instalación ($)<input name="shipping" type="number" min="0" step="0.01" value="${o.shipping || 0}"></label>
          <label class="field">Impuesto (%)<input name="taxRate" type="number" min="0" step="0.01" value="${o.taxRate || 0}"></label>
        </div>
        <div class="totals" id="totals"></div>
        <div class="form-grid cols-3">
          <label class="field">Condición de pago<select name="paymentTerms">${UI.options(['Contado', '2 cuotas', '3 cuotas', '4 cuotas', 'Crédito 15 días', 'Crédito 30 días', 'Financiación'], o.paymentTerms)}</select></label>
          <label class="field">Fecha límite de pago<input name="dueDate" type="date" value="${U.toDateInput(o.dueDate)}"></label>
          <label class="field">Fecha de entrega<input name="deliveryDate" type="date" value="${U.toDateInput(o.deliveryDate)}"></label>
          <label class="field">Estado de entrega<select name="status">${UI.options(ORDER_STATUS, o.status)}</select></label>
          ${!editing ? `<label class="field">Pago inicial / abono ($)<input name="initialPayment" type="number" min="0" step="0.01" placeholder="0"></label>
          <label class="field">Método de pago<select name="method">${UI.options(PAY_METHODS, 'Efectivo')}</select></label>` : ''}
        </div>
        <label class="field">Notas del pedido<textarea name="notes" rows="2" placeholder="Dirección de entrega, medidas del filtro, instrucciones…">${U.esc(o.notes)}</textarea></label>`,
      onOpen: (form) => {
        const tbody = form.querySelector('#items');
        const refreshTotals = () => {
          const f = UI.formData(form);
          const t = Store.calcOrderTotal(items, f.discount, f.shipping, f.taxRate);
          form.querySelector('#totals').innerHTML = `<div>Subtotal: <strong class="num">${U.money(t.subtotal)}</strong></div>${f.discount ? `<div>Descuento: <span class="num">-${U.money(f.discount)}</span></div>` : ''}${t.tax ? `<div>Impuesto: <span class="num">${U.money(t.tax)}</span></div>` : ''}${f.shipping ? `<div>Envío: <span class="num">${U.money(f.shipping)}</span></div>` : ''}<div class="grand num">Total: ${U.money(t.total)}</div>`;
        };
        const redraw = () => { tbody.innerHTML = itemRows(); refreshTotals(); };
        tbody.addEventListener('change', (e) => {
          const i = e.target.dataset.i, k = e.target.dataset.k;
          if (i === undefined) return;
          if (k === 'productId') {
            if (e.target.value === '__custom') items[i] = { productId: '', name: '', qty: items[i].qty || 1, price: 0, custom: true };
            else { const p = products.find((x) => x.id === e.target.value); items[i] = { productId: p ? p.id : '', name: p ? p.name : '', qty: items[i].qty || 1, price: p ? p.price : 0 }; }
            redraw();
          }
        });
        tbody.addEventListener('input', (e) => {
          const i = e.target.dataset.i, k = e.target.dataset.k;
          if (i === undefined || k === 'productId') return;
          items[i][k] = k === 'name' ? e.target.value : Number(e.target.value);
          const cell = e.target.closest('tr').querySelector('td.right');
          if (cell) cell.textContent = U.money((items[i].qty || 0) * (items[i].price || 0));
          refreshTotals();
        });
        tbody.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { items.splice(Number(b.dataset.rm), 1); redraw(); } });
        form.querySelector('#addItem').onclick = () => { items.push({ productId: '', name: '', qty: 1, price: 0 }); redraw(); };
        const cSel = form.querySelector('[name=clientId]'), uSel = form.querySelector('[name=userId]');
        if (cSel && uSel && !editing) cSel.addEventListener('change', () => { const c = Store.get('clients', cSel.value); if (c && Store.get('users', c.ownerId)) uSel.value = c.ownerId; });
        const chSel = form.querySelector('#chSel');
        if (cSel && !editing) cSel.addEventListener('change', () => { const c = Store.get('clients', cSel.value); if (c) chSel.value = channelFromSource(c.source); });
        ['discount', 'shipping', 'taxRate'].forEach((n) => form.querySelector(`[name=${n}]`).addEventListener('input', refreshTotals));
        refreshTotals();
      },
      onSubmit: (d) => {
        const clean = Store.withCommission(items.filter((i) => (i.productId || i.name) && i.qty > 0).map((i) => Object.assign({ productId: i.productId || null, name: i.name || 'Producto', qty: Number(i.qty), price: Number(i.price) }, i.commission !== undefined ? { commission: Number(i.commission) || 0 } : {})));
        if (!clean.length) { UI.toast('Agrega al menos un producto', 'bad'); return false; }
        const data = { clientId: d.clientId, items: clean, discount: d.discount || 0, shipping: d.shipping || 0, taxRate: d.taxRate || 0, channel: d.channel, paymentTerms: d.paymentTerms, dueDate: d.dueDate ? new Date(d.dueDate + 'T12:00').toISOString() : null, deliveryDate: d.deliveryDate ? new Date(d.deliveryDate + 'T12:00').toISOString() : null, status: d.status, notes: d.notes };
        if (d.userId) data.userId = d.userId;
        if (editing) {
          const t = Store.calcOrderTotal(clean, data.discount, data.shipping, data.taxRate);
          Store.update('orders', editing.id, Object.assign(data, { subtotal: t.subtotal, tax: t.tax, total: t.total, commission: Store.itemsCommission(clean) }));
          UI.toast('Venta actualizada', 'good');
        } else {
          const order = Store.createOrder(data);
          if (d.initialPayment > 0) Store.registerPayment({ orderId: order.id, amount: Math.min(d.initialPayment, order.total), method: d.method });
          UI.toast(`Venta ${order.number} registrada 🎉`, 'good');
          setTimeout(() => openOrderDetail(order.id), 100);
        }
      }
    });
    return m;
  }

  /* ---------- Detalle de venta ---------- */
  function openOrderDetail(id) {
    const o = Store.get('orders', id);
    if (!o) return;
    const c = Store.get('clients', o.clientId) || {};
    const pays = U.sortBy(Store.where('payments', (p) => p.orderId === id), (p) => p.date);
    const paid = Store.orderPaid(o), bal = Store.orderBalance(o);
    const fin = Store.can('finance');
    UI.modal({
      title: `Venta ${U.esc(o.number)} ${fin ? UI.payBadge(o) : ''}`,
      size: 'lg',
      hideFooter: false,
      footer: `
        ${Store.can('deleteRecords') ? `<button type="button" class="btn danger" id="delOrder" style="margin-right:auto">${icon('trash', 'sm')} Eliminar</button>` : ''}
        ${fin ? `<button type="button" class="btn" id="printOrder">${icon('printer', 'sm')} Recibo</button>
        <button type="button" class="btn" id="editOrder">${icon('edit', 'sm')} Editar</button>` : ''}
        ${fin && bal > 0 ? `<button type="button" class="btn good" id="payOrder">${icon('dollar', 'sm')} Registrar pago</button>` : ''}
        <button type="button" class="btn primary" data-close>Cerrar</button>`,
      body: `
        <div class="grid cols-2" style="gap:12px">
          <div><div class="small muted">Cliente</div><a href="#/cliente/${c.id}" data-close-link><strong>${U.esc(c.name || '(eliminado)')}</strong></a><div class="small">${U.esc(c.phone || '')}</div><div class="small muted">${U.esc([c.address, c.city].filter(Boolean).join(', '))}</div></div>
          <div><div class="small muted">${Store.can('viewAll') ? 'Vendedor · ' : ''}Fecha</div>${Store.can('viewAll') ? `<strong>${U.esc(UI.userName(o.userId))}</strong>` : ''}<div class="small">${U.dateTime(o.createdAt)}${fin && o.paymentTerms ? ' · ' + U.esc(o.paymentTerms) : ''}</div>
            ${fin || Store.canSeeOwnCommission() ? `<div class="small">Comisión: <strong style="color:#b8860b">${U.money(Store.orderCommission(o))}</strong></div>` : ''}
            <div class="small">Canal: <strong>${U.esc(o.channel || 'Sin indicar')}</strong></div>
            <div class="row" style="margin-top:6px"><span class="small muted">Entrega:</span><select id="statusSel" style="width:auto;height:30px">${UI.options(ORDER_STATUS, o.status)}</select></div></div>
        </div>
        ${fin ? `        <table class="table"><thead><tr><th>Producto</th><th class="right">Cant.</th><th class="right">Precio</th><th class="right">Importe</th></tr></thead>
          <tbody>${o.items.map((i) => `<tr><td>${U.esc(i.name)}</td><td class="right num">${i.qty}</td><td class="right num">${U.money(i.price)}</td><td class="right num">${U.money(i.qty * i.price)}</td></tr>`).join('')}</tbody></table>
        <div class="totals">
          <div>Subtotal: <span class="num">${U.money(o.subtotal)}</span></div>
          ${o.discount ? `<div>Descuento: <span class="num">-${U.money(o.discount)}</span></div>` : ''}${o.tax ? `<div>Impuesto: <span class="num">${U.money(o.tax)}</span></div>` : ''}${o.shipping ? `<div>Envío: <span class="num">${U.money(o.shipping)}</span></div>` : ''}
          <div class="grand num">Total: ${U.money(o.total)}</div>
          <div style="color:var(--good)">Pagado: <strong class="num">${U.money(paid)}</strong></div>
          <div style="color:${bal > 0 ? 'var(--bad)' : 'var(--text-3)'}">Saldo: <strong class="num">${U.money(bal)}</strong>${bal > 0 && o.dueDate ? ` · vence ${U.date(o.dueDate)}` : ''}</div>
        </div>
        <div class="form-section">Pagos recibidos</div>
        ${pays.length ? `<table class="table"><thead><tr><th>Fecha</th><th>Método</th><th>Referencia</th><th>Recibió</th><th class="right">Monto</th><th></th></tr></thead><tbody>
          ${pays.map((p) => `<tr><td>${U.date(p.date)}</td><td>${U.esc(p.method)}</td><td class="small">${U.esc(p.reference || '')}</td><td class="small">${U.esc(UI.userName(p.userId))}</td><td class="right num">${U.money(p.amount)}</td><td>${Store.can('deleteRecords') ? `<button type="button" class="btn ghost xs icon" data-del-pay="${p.id}">${icon('trash', 'sm')}</button>` : ''}</td></tr>`).join('')}
        </tbody></table>` : '<div class="muted small">Aún no hay pagos registrados.</div>'}
` : `<table class="table"><thead><tr><th>Producto</th><th class="right">Cant.</th></tr></thead>
          <tbody>${o.items.map((i) => `<tr><td>${U.esc(i.name)}</td><td class="right num">${i.qty}</td></tr>`).join('')}</tbody></table>
          <div class="money-lock">${icon('lock', 'sm')} Montos, pagos y saldo visibles solo para la administración.</div>`}
        ${o.notes ? `<div class="script-box">${U.esc(o.notes)}</div>` : ''}`,
      onOpen: (form, close) => {
        const $ = (s) => form.querySelector(s);
        $('#statusSel').onchange = (e) => { Store.update('orders', id, { status: e.target.value }); Store.logActivity({ clientId: o.clientId, type: 'sistema', text: `Venta ${o.number}: ${orderStatusById(e.target.value).name}` }); UI.toast('Estado actualizado', 'good'); };
        if ($('#editOrder')) $('#editOrder').onclick = () => { close(); openOrderForm({ id }); };
        if ($('#printOrder')) $('#printOrder').onclick = () => printReceipt(id);
        if ($('#payOrder')) $('#payOrder').onclick = () => { close(); Views.recaudo.openPaymentForm(id); };
        if ($('#delOrder')) $('#delOrder').onclick = async () => {
          close();
          if (!(await UI.confirm(`¿Eliminar la venta ${o.number} y sus pagos?`))) return;
          Store.where('payments', (p) => p.orderId === id).forEach((p) => Store.remove('payments', p.id));
          Store.remove('orders', id); UI.toast('Venta eliminada');
        };
        form.querySelectorAll('[data-del-pay]').forEach((b) => b.onclick = async () => { close(); if (await UI.confirm('¿Eliminar este pago?')) { Store.remove('payments', b.dataset.delPay); openOrderDetail(id); } });
        form.querySelectorAll('[data-close-link]').forEach((a) => a.addEventListener('click', close));
      }
    });
  }

  function printReceipt(id) {
    const o = Store.get('orders', id);
    const c = Store.get('clients', o.clientId) || {};
    const s = Store.settings();
    const pays = Store.where('payments', (p) => p.orderId === id);
    const w = window.open('', '_blank');
    if (!w) return UI.toast('Permite ventanas emergentes para imprimir', 'bad');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Recibo ${U.esc(o.number)}</title>
      <style>body{font-family:system-ui,sans-serif;max-width:720px;margin:32px auto;color:#111;padding:0 16px}h1{margin:0}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}.muted{color:#666}.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a4fd6;padding-bottom:12px}</style></head><body>
      <div class="head"><div><h1>${U.esc(s.companyName)}</h1><div class="muted">${U.esc(s.companyTagline || '')}</div></div><div class="r"><strong>RECIBO ${U.esc(o.number)}</strong><br>${U.date(o.createdAt)}</div></div>
      <p><strong>Cliente:</strong> ${U.esc(c.name || '')}<br>${U.esc(c.phone || '')}<br>${U.esc([c.address, c.city, c.state].filter(Boolean).join(', '))}</p>
      <table><tr><th>Producto</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Importe</th></tr>
      ${o.items.map((i) => `<tr><td>${U.esc(i.name)}</td><td class="r">${i.qty}</td><td class="r">${U.money(i.price)}</td><td class="r">${U.money(i.qty * i.price)}</td></tr>`).join('')}
      <tr><td colspan="3" class="r">Subtotal</td><td class="r">${U.money(o.subtotal)}</td></tr>
      ${o.discount ? `<tr><td colspan="3" class="r">Descuento</td><td class="r">-${U.money(o.discount)}</td></tr>` : ''}
      ${o.tax ? `<tr><td colspan="3" class="r">Impuesto</td><td class="r">${U.money(o.tax)}</td></tr>` : ''}
      ${o.shipping ? `<tr><td colspan="3" class="r">Envío / instalación</td><td class="r">${U.money(o.shipping)}</td></tr>` : ''}
      <tr><td colspan="3" class="r"><strong>Total</strong></td><td class="r"><strong>${U.money(o.total)}</strong></td></tr>
      ${pays.map((p) => `<tr><td colspan="3" class="r muted">Pago ${U.date(p.date)} (${U.esc(p.method)})</td><td class="r muted">-${U.money(p.amount)}</td></tr>`).join('')}
      <tr><td colspan="3" class="r"><strong>Saldo pendiente</strong></td><td class="r"><strong>${U.money(Store.orderBalance(o))}</strong></td></tr></table>
      <p class="muted">Atendido por ${U.esc(UI.userName(o.userId))}. ¡Gracias por su compra!</p>
      <script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  return { title: 'Ventas', perm: 'sales', render, openOrderForm, openOrderDetail };
})();

/* =========================================================
   Recaudo / cartera
   ========================================================= */
Views.recaudo = (() => {
  const state = { tab: 'cartera', seller: '', range: 'mes' };

  function aging(o) {
    const ref = o.dueDate || o.createdAt;
    const days = Math.floor((U.startOfDay() - U.startOfDay(ref)) / U.DAY);
    if (days <= 0) return { id: 'corriente', name: 'Al día', cls: 'good', days };
    if (days <= 15) return { id: '1-15', name: `Vencido ${days} d`, cls: 'warn', days };
    if (days <= 30) return { id: '16-30', name: `Vencido ${days} d`, cls: 'warn', days };
    if (days <= 60) return { id: '31-60', name: `Vencido ${days} d`, cls: 'bad', days };
    return { id: '60+', name: `Vencido ${days} d`, cls: 'bad', days };
  }

  function render(el) {
    const manager = Store.can('viewAll');
    const orders = Store.myOrders().filter((o) => o.status !== 'cancelada' && (!state.seller || o.userId === state.seller));
    const open = U.sortBy(orders.filter((o) => Store.orderBalance(o) > 0), (o) => aging(o).days, -1);
    const totalDue = U.sum(open, Store.orderBalance);
    const buckets = ['corriente', '1-15', '16-30', '31-60', '60+'].map((b) => ({ id: b, list: open.filter((o) => aging(o).id === b) }));
    const range = Metrics.RANGES[state.range];
    const [from, to] = range.get();
    const myOrderIds = new Set(Store.myOrders().map((o) => o.id));
    const pays = U.sortBy(Store.all('payments').filter((p) => myOrderIds.has(p.orderId) && Metrics.inRange(p.date, from, to) && (!state.seller || p.userId === state.seller)), (p) => p.date, -1);
    const byMethod = U.groupBy(pays, (p) => p.method);

    el.innerHTML = `
      <div class="page-head">
        <div><h1>Recaudo y cartera</h1><p>Controla lo que te deben y lo que ya entró</p></div>
        <div class="page-actions">
          ${manager ? `<select id="fSeller" style="width:auto"><option value="">Todo el equipo</option>${UI.userOptions(state.seller)}</select>` : ''}
        </div>
      </div>
      <div class="kpis">
        <div class="card kpi"><div class="kpi-label">Total por cobrar</div><div class="kpi-value" style="color:var(--bad)">${U.money(totalDue)}</div><div class="kpi-sub">${open.length} pedidos · ${new Set(open.map((o) => o.clientId)).size} clientes</div></div>
        <div class="card kpi"><div class="kpi-label">Vencido</div><div class="kpi-value">${U.money(U.sum(open.filter((o) => aging(o).days > 0), Store.orderBalance))}</div><div class="kpi-sub">${open.filter((o) => aging(o).days > 0).length} pedidos fuera de fecha</div></div>
        <div class="card kpi"><div class="kpi-label">Recaudado · ${range.label.toLowerCase()}</div><div class="kpi-value" style="color:var(--good)">${U.money(U.sum(pays, (p) => p.amount))}</div><div class="kpi-sub">${pays.length} pagos recibidos</div></div>
      </div>
      <div class="tabs">
        <button data-tab="cartera" class="${state.tab === 'cartera' ? 'active' : ''}">Cartera pendiente (${open.length})</button>
        <button data-tab="pagos" class="${state.tab === 'pagos' ? 'active' : ''}">Pagos recibidos</button>
      </div>
      ${state.tab === 'cartera' ? `
        <div class="card" style="margin-bottom:16px"><div class="card-head"><h2>Antigüedad de la cartera</h2></div><div class="card-body">
          ${UI.hbars(buckets.map((b) => ({ label: b.id === 'corriente' ? 'Al día' : b.id + ' días', value: U.sum(b.list, Store.orderBalance), extra: b.list.length + ' pedidos', color: b.id === 'corriente' ? 'var(--good)' : b.id === '1-15' || b.id === '16-30' ? 'var(--warn)' : 'var(--bad)' })), { format: U.money })}
        </div></div>
        <div class="card"><div class="table-wrap"><table class="table">
          <thead><tr><th>Cliente</th><th>Venta</th>${manager ? '<th>Vendedor</th>' : ''}<th class="right">Total</th><th class="right">Pagado</th><th class="right">Saldo</th><th>Vencimiento</th><th></th></tr></thead>
          <tbody>${open.length ? open.map((o) => {
            const c = Store.get('clients', o.clientId) || {};
            const a = aging(o);
            return `<tr>
              <td><a href="#/cliente/${c.id}" class="cell-main">${U.esc(c.name || '(eliminado)')}</a><div class="cell-sub">${U.esc(c.phone || '')}</div></td>
              <td><a href="#" data-order="${o.id}">${U.esc(o.number)}</a><div class="cell-sub">${U.date(o.createdAt)} · ${U.esc(o.paymentTerms || '')}</div></td>
              ${manager ? `<td class="small">${U.esc(UI.userName(o.userId))}</td>` : ''}
              <td class="right num">${U.money(o.total)}</td>
              <td class="right num" style="color:var(--good)">${U.money(Store.orderPaid(o))}</td>
              <td class="right num"><strong style="color:var(--bad)">${U.money(Store.orderBalance(o))}</strong></td>
              <td><span class="badge ${a.cls}">${a.name}</span><div class="cell-sub">${U.date(o.dueDate)}</div></td>
              <td class="nowrap">
                <button class="btn sm good" data-pay="${o.id}">${icon('dollar', 'sm')} Abonar</button>
                ${c.phone ? `<a class="btn sm icon" target="_blank" rel="noopener" title="Recordatorio por WhatsApp" href="${U.waLink(c.phone, `Hola ${(c.name || '').split(' ')[0]}, le recordamos amablemente su saldo pendiente de ${U.money(Store.orderBalance(o))} por su compra ${o.number} en ${Store.settings().companyName}. ¡Gracias!`)}">${icon('message', 'sm')}</a>` : ''}
              </td>
            </tr>`;
          }).join('') : `<tr><td colspan="8">${UI.empty('¡No hay cartera pendiente! Todo está cobrado.', 'check')}</td></tr>`}</tbody>
        </table></div></div>` : `
        <div class="grid span-2-1">
          <div class="card">
            <div class="toolbar"><select id="fRange">${Object.entries(Metrics.RANGES).map(([k, r]) => `<option value="${k}" ${k === state.range ? 'selected' : ''}>${r.label}</option>`).join('')}</select></div>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Fecha</th><th>Cliente</th><th>Venta</th><th>Método</th><th>Recibió</th><th class="right">Monto</th></tr></thead>
              <tbody>${pays.length ? pays.map((p) => { const o = Store.get('orders', p.orderId) || {}; const c = Store.get('clients', p.clientId) || {}; return `<tr>
                <td class="nowrap">${U.date(p.date)}</td><td><a href="#/cliente/${c.id}">${U.esc(c.name || '—')}</a></td><td><a href="#" data-order="${o.id}">${U.esc(o.number || '—')}</a></td>
                <td>${U.esc(p.method)}${p.reference ? `<div class="cell-sub">${U.esc(p.reference)}</div>` : ''}</td><td class="small">${U.esc(UI.userName(p.userId))}</td><td class="right num"><strong>${U.money(p.amount)}</strong></td></tr>`; }).join('') : `<tr><td colspan="6">${UI.empty('Sin pagos en este periodo.')}</td></tr>`}</tbody>
            </table></div>
          </div>
          <div class="card"><div class="card-head"><h2>Por método de pago</h2></div><div class="card-body">
            ${Object.keys(byMethod).length ? UI.hbars(U.sortBy(Object.entries(byMethod).map(([k, v]) => ({ label: k, value: U.sum(v, (p) => p.amount), extra: v.length + ' pagos' })), (x) => x.value, -1), { format: U.money }) : UI.empty('Sin datos')}
          </div></div>
        </div>`}`;

    const $ = (s) => el.querySelector(s);
    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { state.tab = b.dataset.tab; render(el); });
    if ($('#fSeller')) $('#fSeller').onchange = (e) => { state.seller = e.target.value; render(el); };
    if ($('#fRange')) $('#fRange').onchange = (e) => { state.range = e.target.value; render(el); };
    el.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => openPaymentForm(b.dataset.pay));
    el.querySelectorAll('[data-order]').forEach((a) => a.onclick = (e) => { e.preventDefault(); Views.ventas.openOrderDetail(a.dataset.order); });
  }

  function openPaymentForm(orderId) {
    const o = Store.get('orders', orderId);
    const c = Store.get('clients', o.clientId) || {};
    const bal = Store.orderBalance(o);
    UI.modal({
      title: `Registrar pago · ${U.esc(o.number)}`,
      size: 'sm',
      submitLabel: 'Registrar pago',
      body: `
        <div class="script-box"><strong>${U.esc(c.name || '')}</strong><br>Total ${U.money(o.total)} · Pagado ${U.money(Store.orderPaid(o))} · <strong style="color:var(--bad)">Saldo ${U.money(bal)}</strong></div>
        <label class="field">Monto *<input name="amount" type="number" min="0.01" step="0.01" max="${bal}" required value="${bal}"></label>
        <div class="form-grid">
          <label class="field">Método<select name="method">${UI.options(PAY_METHODS, 'Efectivo')}</select></label>
          <label class="field">Fecha<input name="date" type="date" value="${U.toDateInput(new Date())}"></label>
        </div>
        <label class="field">Referencia / # comprobante<input name="reference" placeholder="Opcional"></label>`,
      onSubmit: (d) => {
        if (!(d.amount > 0)) { UI.toast('Monto inválido', 'bad'); return false; }
        if (d.amount > bal + 0.009) { UI.toast(`El monto supera el saldo (${U.money(bal)})`, 'bad'); return false; }
        const date = d.date ? new Date(d.date + 'T' + new Date().toTimeString().slice(0, 8)).toISOString() : new Date().toISOString();
        Store.registerPayment({ orderId, amount: d.amount, method: d.method, date, reference: d.reference });
        UI.toast(`Pago de ${U.money(d.amount)} registrado`, 'good');
      }
    });
  }

  return { title: 'Recaudo', perm: 'finance', render, openPaymentForm };
})();
