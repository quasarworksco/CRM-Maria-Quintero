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
    if (u.photoUrl) return `<span class="avatar ${size} has-photo" style="background-image:url('${U.esc(thumb(u.photoUrl, size === 'lg' || size === 'xl' ? 240 : 96))}')" title="${U.esc(u.name)}" role="img" aria-label="${U.esc(u.name)}"></span>`;
    return `<span class="avatar ${size}" style="background:${u.color || '#7b8391'}" title="${U.esc(u.name)}">${U.esc(U.initials(u.name))}</span>`;
  };
  // Foto grande de una persona (cliente o candidato) con color de respaldo
  const personPhoto = (p, color) => (p.photoUrl
    ? `<span class="avatar lg has-photo" style="background-image:url('${U.esc(thumb(p.photoUrl, 240))}')" role="img" aria-label="Foto de ${U.esc(p.name)}"></span>`
    : `<span class="avatar lg" style="background:${color}">${U.esc(U.initials(p.name))}</span>`);
  // Miniatura recortada a la cara (Cloudinary); otras URL se usan tal cual
  function thumb(url, size = 96) {
    const m = String(url || '').match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/);
    return m ? `${m[1]}c_fill,g_face,w_${size},h_${size},q_auto,f_auto/${m[2]}` : url;
  }
  const userName = (id) => { const u = Store.get('users', id); return u ? u.name : 'Sin asignar'; };
  const stageBadge = (s) => { const x = stageById(s); return `<span class="badge stage-badge" style="background:${x.soft};color:${x.ink};border-color:${x.color}33"><span class="dot" style="background:${x.color}"></span>${x.name}</span>`; };
  // Contador de intentos de contacto: "3/12"
  const attempts = (c) => { const n = c.callCount || 0, max = Store.maxAttempts(); const cls = n >= max ? 'bad' : n >= max * 0.75 ? 'warn' : ''; return `<span class="badge attempts ${cls}" title="Intentos de contacto">${icon('phone', 'sm')}${n}/${max}</span>`; };
  const outcomeBadge = (id) => { const o = outcomeById(id); return o ? `<span class="badge" style="background:${o.color}1f;color:${o.color}">${o.name}</span>` : ''; };
  const orderStatusBadge = (s) => { const x = orderStatusById(s); return `<span class="badge ${x.cls}">${x.name}</span>`; };
  const payBadge = (o) => { const x = Store.orderPayStatus(o); return `<span class="badge ${x.cls}">${x.name}</span>`; };
  const apptBadge = (c) => { const a = Store.activeAppointment(c); return a ? `<span class="badge ${a.status === 'confirmada' ? 'good' : 'warn'}" title="Cita ${Store.APPT_STATUS[a.status]}">${icon('calendar', 'sm')}${U.date(a.at, { day: 'numeric', month: 'short' })} ${U.time(a.at)}</span>` : ''; };
  const empty = (text, ic = 'info') => `<div class="empty">${icon(ic)}<div>${text}</div></div>`;
  const options = (list, selected, { value = (x) => x.id, label = (x) => x.name, blank } = {}) =>
    (blank !== undefined ? `<option value="">${U.esc(blank)}</option>` : '') +
    list.map((x) => { const v = typeof x === 'string' ? x : value(x); const l = typeof x === 'string' ? x : label(x); return `<option value="${U.esc(v)}" ${String(v) === String(selected ?? '') ? 'selected' : ''}>${U.esc(l)}</option>`; }).join('');
  // Por defecto: personas que trabajan prospectos (no aparece quien solo hace Reclutamiento)
  const userOptions = (selected, { blank, all = false, any = false } = {}) => options(all ? Store.all('users') : Store.activeUsers().filter((u) => any || u.role === 'admin' || Store.permsOf(u).prospects || u.id === selected), selected, { blank });
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

  // Elegir una foto (cámara o galería), subirla a Cloudinary y devolver la URL
  function pickPhoto(subfolder) {
    return new Promise((resolve, reject) => {
      if (!cloudinaryReady()) { toast('Configura Cloudinary en js/config.js para subir fotos', 'bad'); resolve(null); return; }
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.onchange = async () => {
        const f = inp.files[0]; inp.remove();
        if (!f) return resolve(null);
        if (!/^image\//.test(f.type)) { toast('Elige una imagen (JPG, PNG…)', 'bad'); return resolve(null); }
        if (f.size > 10 * 1024 * 1024) { toast('La foto pesa más de 10 MB', 'bad'); return resolve(null); }
        toast('Subiendo foto…');
        try { const r = await uploadToCloudinary(f, subfolder); resolve(r.url); }
        catch (e) { toast(e.message, 'bad'); reject(e); }
      };
      inp.click();
    });
  }

  // Ya hay foto: preguntar si se cambia o se quita. Devuelve 'change', 'remove' o null
  function photoMenu(photoUrl, name) {
    return new Promise((resolve) => {
      let out = null;
      const m = modal({
        title: 'Foto de ' + U.esc(name || ''), size: 'sm',
        body: `<div style="text-align:center"><img src="${U.esc(thumb(photoUrl, 320))}" alt="" style="width:160px;height:160px;border-radius:50%;object-fit:cover"></div>`,
        footer: `<button type="button" class="btn danger" data-act="remove" style="margin-right:auto">${icon('trash', 'sm')} Quitar</button><button type="button" class="btn" data-close>Cancelar</button><button type="button" class="btn primary" data-act="change">${icon('camera', 'sm')} Cambiar foto</button>`,
        onOpen: (form, close) => form.closest('.modal').querySelectorAll('[data-act]').forEach((b) => b.onclick = () => { out = b.dataset.act; close(); })
      });
      const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); resolve(out); } });
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }
  // Flujo completo: cambiar / quitar / subir. Devuelve la URL nueva, '' si se quitó, o null si no cambió
  async function editPhoto(current, name, subfolder) {
    if (current) {
      const act = await photoMenu(current, name);
      if (act === 'remove') return '';
      if (act !== 'change') return null;
    }
    return (await pickPhoto(subfolder).catch(() => null)) || null;
  }

  return {
    personPhoto, thumb, pickPhoto, editPhoto,
    toast, modal, confirm, formData, avatar, userName, stageBadge, attempts, outcomeBadge, orderStatusBadge, payBadge, apptBadge,
    empty, options, userOptions, followLabel, barChart, hbars, initTooltips, cloudinaryReady, uploadToCloudinary
  };
})();
