/* =========================================================
   UI — componentes reutilizables
   ========================================================= */
const UI = (() => {
  /* ---------- Toast ---------- */
  function toast(msg, type = '') {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = (type === 'good' ? icon('check', 'sm') : type === 'bad' ? icon('alert', 'sm') : '') + `<span>${U.esc(msg)}</span>`;
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2800);
  }

  /* ---------- Modal ---------- */
  function modal({ title, body, size = '', submitLabel = 'Guardar', cancelLabel = 'Cancelar', onSubmit, onOpen, danger = false, footer, hideFooter = false, locked = false }) {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `
      <form class="modal ${size}" novalidate>
        <div class="modal-head"><h2>${title}</h2><button type="button" class="btn ghost sm icon" data-close aria-label="Cerrar">${icon('x')}</button></div>
        <div class="modal-body">${body}</div>
        ${hideFooter ? '' : `<div class="modal-foot">${footer || `<button type="button" class="btn" data-close>${cancelLabel}</button>${onSubmit ? `<button type="submit" class="btn ${danger ? 'danger solid' : 'primary'}">${submitLabel}</button>` : ''}`}</div>`}
      </form>`;
    document.body.appendChild(back);
    const form = back.querySelector('form');
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    // locked: la ventana solo se cierra al completar el formulario (p. ej. primer ingreso)
    const onKey = (e) => { if (e.key === 'Escape' && !locked) close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back && !locked) close(); });
    if (locked) back.querySelectorAll('[data-close]').forEach((b) => b.remove());
    back.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!onSubmit) return close();
      // Validación nativa de campos required
      const invalid = [...form.querySelectorAll('[required]')].find((el) => !String(el.value).trim());
      if (invalid) { invalid.focus(); toast('Completa los campos obligatorios', 'bad'); return; }
      const res = await onSubmit(formData(form), form, close);
      if (res !== false) close();
    });
    if (onOpen) onOpen(form, close);
    const first = form.querySelector('.modal-body input:not([type=hidden]):not([type=checkbox]), .modal-body select, .modal-body textarea');
    if (first) setTimeout(() => first.focus(), 30);
    return { el: back, form, close };
  }

  function confirm(message, { title = 'Confirmar', okLabel = 'Sí, continuar', danger = true } = {}) {
    return new Promise((resolve) => {
      let ok = false;
      const m = modal({ title, size: 'sm', body: `<p style="margin:0">${message}</p>`, submitLabel: okLabel, danger, onSubmit: () => { ok = true; } });
      const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); resolve(ok); } });
      obs.observe(document.body, { childList: true });
    });
  }

  function formData(form) {
    const out = {};
    form.querySelectorAll('[name]').forEach((el) => {
      const k = el.name;
      if (el.type === 'checkbox') {
        if (el.dataset.multi !== undefined) { out[k] = out[k] || []; if (el.checked) out[k].push(el.value); }
        else out[k] = el.checked;
      } else if (el.type === 'radio') { if (el.checked) out[k] = el.value; }
      else if (el.multiple) out[k] = [...el.selectedOptions].map((o) => o.value);
      else if (el.type === 'number') out[k] = el.value === '' ? null : Number(el.value);
      else out[k] = el.value.trim();
    });
    return out;
  }

  /* ---------- Fragmentos ---------- */
  const avatar = (u, size = '') => {
    if (!u) return `<span class="avatar ${size}" style="background:#9aa2ae">?</span>`;
    return `<span class="avatar ${size}" style="background:${u.color || '#7b8391'}" title="${U.esc(u.name)}">${U.esc(U.initials(u.name))}</span>`;
  };
  const userName = (id) => { const u = Store.get('users', id); return u ? u.name : 'Sin asignar'; };
  const tempBadge = (t) => { const x = tempById(t); return `<span class="badge ${x.cls}">${icon(x.icon, 'sm')}${x.name}</span>`; };
  const stageBadge = (s) => { const x = stageById(s); return `<span class="badge" style="background:${x.color}1f;color:${x.color}"><span class="dot"></span>${x.name}</span>`; };
  const outcomeBadge = (id) => { const o = outcomeById(id); return o ? `<span class="badge" style="background:${o.color}1f;color:${o.color}">${o.name}</span>` : ''; };
  const orderStatusBadge = (s) => { const x = orderStatusById(s); return `<span class="badge ${x.cls}">${x.name}</span>`; };
  const payBadge = (o) => { const x = Store.orderPayStatus(o); return `<span class="badge ${x.cls}">${x.name}</span>`; };
  const scoreBadge = (n) => `<span class="badge ${n >= 60 ? 'hot' : n >= 30 ? 'warm' : 'cold'}" title="Puntaje del prospecto">${icon('star', 'sm')}${n}</span>`;
  const empty = (text, ic = 'info') => `<div class="empty">${icon(ic)}<div>${text}</div></div>`;
  const options = (list, selected, { value = (x) => x.id, label = (x) => x.name, blank } = {}) =>
    (blank !== undefined ? `<option value="">${U.esc(blank)}</option>` : '') +
    list.map((x) => { const v = typeof x === 'string' ? x : value(x); const l = typeof x === 'string' ? x : label(x); return `<option value="${U.esc(v)}" ${String(v) === String(selected ?? '') ? 'selected' : ''}>${U.esc(l)}</option>`; }).join('');
  const userOptions = (selected, { blank, all = false } = {}) => options(all ? Store.all('users') : Store.activeUsers(), selected, { blank });
  const followLabel = (d) => {
    if (!d) return '<span class="muted">Sin programar</span>';
    const t = new Date(d).getTime();
    if (t < U.startOfDay().getTime()) return `<span class="overdue">${icon('alert', 'sm')} Vencido · ${U.dateTime(d)}</span>`;
    if (U.isToday(d)) return `<span style="color:var(--warn);font-weight:600">Hoy ${U.time(d)}</span>`;
    return U.dateTime(d);
  };

  /* ---------- Gráfico de barras vertical (SVG, una serie) ---------- */
  function barChart(data, { height = 220, format = U.money, labelEvery = 1 } = {}) {
    const W = 720, H = height, padL = 52, padB = 26, padT = 10, padR = 8;
    const max = Math.max(format === U.money ? 100 : 4, ...data.map((d) => d.value));
    const nice = niceMax(max);
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const bw = innerW / data.length;
    const barW = Math.max(3, Math.min(34, bw - 4));
    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const y = padT + innerH - (innerH * i) / 4;
      grid += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}"/><text class="axis-label" x="${padL - 8}" y="${y + 4}" text-anchor="end">${U.esc(shortFmt(nice * i / 4, format))}</text>`;
    }
    let bars = '';
    data.forEach((d, i) => {
      const h = (d.value / nice) * innerH;
      const x = padL + i * bw + (bw - barW) / 2;
      const y = padT + innerH - h;
      const r = Math.min(4, barW / 2, h);
      bars += `<g data-tip="${U.esc(d.label)}: ${U.esc(format(d.value))}">
        <rect class="hit" x="${padL + i * bw}" y="${padT}" width="${bw}" height="${innerH}"/>
        ${h > 0 ? `<path class="bar" d="${roundedTop(x, y, barW, h, r)}"/>` : ''}
      </g>`;
      if (i % labelEvery === 0) bars += `<text class="axis-label" x="${x + barW / 2}" y="${H - 8}" text-anchor="middle">${U.esc(d.short || d.label)}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">${grid}${bars}</svg>`;
  }
  function roundedTop(x, y, w, h, r) {
    return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
  }
  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function shortFmt(v, format) {
    if (format === U.money) return U.moneyShort(v);
    return U.num(Math.round(v));
  }

  /* Barras horizontales (ranking/embudo) */
  function hbars(rows, { format = U.num, ramp = false } = {}) {
    const max = Math.max(1, ...rows.map((r) => r.value));
    const rampColors = ['var(--ramp-2)', 'var(--ramp-3)', 'var(--ramp-3)', 'var(--ramp-4)', 'var(--ramp-4)', 'var(--ramp-5)'];
    return `<div class="hbars">${rows.map((r, i) => `
      <div class="hbar" data-tip="${U.esc(r.label)}: ${U.esc(format(r.value))}${r.extra ? ' · ' + U.esc(r.extra) : ''}">
        <div class="nowrap" style="overflow:hidden;text-overflow:ellipsis">${U.esc(r.label)}</div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${(r.value / max) * 100}%;${r.color ? 'background:' + r.color : ramp ? 'background:' + rampColors[Math.min(i, 5)] : ''}"></div></div>
        <div class="hbar-val">${U.esc(format(r.value))}</div>
      </div>`).join('')}</div>`;
  }

  /* Tooltip global para elementos con data-tip */
  function initTooltips() {
    let tip = null;
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest('[data-tip]');
      if (!el) { if (tip) { tip.remove(); tip = null; } return; }
      if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; document.body.appendChild(tip); }
      tip.textContent = el.dataset.tip;
    });
    document.addEventListener('mousemove', (e) => {
      if (!tip) return;
      const x = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 12);
      tip.style.left = x + 'px';
      tip.style.top = (e.clientY - 34) + 'px';
    });
  }

  /* ---------- Cloudinary ---------- */
  const cloudinaryReady = () => { const c = (window.CRM_CONFIG || {}).cloudinary || {}; return !!(c.cloudName && c.uploadPreset); };
  async function uploadToCloudinary(file, subfolder = '') {
    const c = window.CRM_CONFIG.cloudinary;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', c.uploadPreset);
    if (c.folder) fd.append('folder', c.folder + (subfolder ? '/' + subfolder : ''));
    const res = await fetch(`https://api.cloudinary.com/v1_1/${c.cloudName}/auto/upload`, { method: 'POST', body: fd });
    if (!res.ok) {
      let msg = 'Error al subir el archivo';
      try { const j = await res.json(); if (j.error && j.error.message) msg += ': ' + j.error.message; } catch (e) {}
      throw new Error(msg);
    }
    const j = await res.json();
    return { url: j.secure_url, publicId: j.public_id, name: file.name, type: j.resource_type, format: j.format, bytes: j.bytes };
  }

  return {
    toast, modal, confirm, formData, avatar, userName, tempBadge, stageBadge, outcomeBadge, orderStatusBadge, payBadge, scoreBadge,
    empty, options, userOptions, followLabel, barChart, hbars, initTooltips, cloudinaryReady, uploadToCloudinary
  };
})();
