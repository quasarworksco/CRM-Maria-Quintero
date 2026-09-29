/* =========================================================
   Embudo de ventas — tablero Kanban (de frío a caliente)
   ========================================================= */
Views.pipeline = (() => {
  const state = { owner: '', temp: '', q: '', showClosed: false };

  function render(el) {
    const manager = Store.can('viewAll');
    const q = U.normalize(state.q);
    const list = Store.myClients().filter((c) => !c.dnc &&
      (!state.owner || c.ownerId === state.owner) && (!state.temp || c.temperature === state.temp) &&
      (!q || U.normalize(c.name + ' ' + c.phone + ' ' + c.city).includes(q)) &&
      (state.showClosed || OPEN_STAGES.includes(c.stage) || (c.stage === 'ganado' && c.wonAt && Date.now() - new Date(c.wonAt).getTime() < 14 * U.DAY)));
    const stages = state.showClosed ? STAGES : STAGES.filter((s) => s.id !== 'perdido');
    const open = list.filter((c) => OPEN_STAGES.includes(c.stage));
    const weighted = U.sum(open, (c) => (c.estValue || 0) * stageById(c.stage).prob);

    el.innerHTML = `
      <div class="page-head">
        <div><h1>Embudo de ventas</h1><p>${open.length} oportunidades abiertas · ${U.money(U.sum(open, (c) => c.estValue))} en juego · <span data-tip="Valor × probabilidad de cierre de cada etapa">${U.money(weighted)} pronóstico</span></p></div>
        <div class="page-actions"><button class="btn primary" id="newBtn">${icon('userPlus', 'sm')} Nuevo prospecto</button></div>
      </div>
      <div class="card" style="margin-bottom:12px"><div class="toolbar" style="border:0">
        <input class="search" id="q" type="search" placeholder="Filtrar tarjetas…" value="${U.esc(state.q)}">
        ${manager ? `<select id="fOwner"><option value="">Todo el equipo</option>${UI.userOptions(state.owner)}</select>` : ''}
        <select id="fTemp"><option value="">Toda temperatura</option>${UI.options(TEMPS, state.temp)}</select>
        <label class="check small"><input type="checkbox" id="closed" ${state.showClosed ? 'checked' : ''}> Mostrar ganados antiguos y perdidos</label>
        <span class="spacer"></span><span class="small muted">Arrastra las tarjetas para cambiar de etapa</span>
      </div></div>
      <div class="kanban">
        ${stages.map((s) => {
          const cards = U.sortBy(list.filter((c) => c.stage === s.id), (c) => Store.leadScore(c), -1);
          return `<div class="kcol" data-stage="${s.id}">
            <div class="kcol-head" style="--stage-color:${s.color}">
              <div class="kcol-title"><span>${s.name}</span><span class="badge">${cards.length}</span></div>
              <div class="kcol-sum">${U.money(U.sum(cards, (c) => c.estValue))} · ${Math.round(s.prob * 100)}% prob.</div>
            </div>
            <div class="kcol-body">${cards.slice(0, 150).map(card).join('') || '<div class="muted small" style="text-align:center;padding:16px">Suelta aquí</div>'}</div>
          </div>`;
        }).join('')}
      </div>`;

    const $ = (s) => el.querySelector(s);
    const qi = $('#q');
    qi.oninput = U.debounce(() => { state.q = qi.value; render(el); const n = el.querySelector('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250);
    if ($('#fOwner')) $('#fOwner').onchange = (e) => { state.owner = e.target.value; render(el); };
    $('#fTemp').onchange = (e) => { state.temp = e.target.value; render(el); };
    $('#closed').onchange = (e) => { state.showClosed = e.target.checked; render(el); };
    $('#newBtn').onclick = () => Views.clientes.openForm();

    // Drag & drop
    el.querySelectorAll('.kcard').forEach((k) => {
      k.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', k.dataset.id); k.classList.add('dragging'); });
      k.addEventListener('dragend', () => k.classList.remove('dragging'));
      k.addEventListener('click', () => { location.hash = '#/cliente/' + k.dataset.id; });
    });
    el.querySelectorAll('.kcol').forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', (e) => {
        e.preventDefault(); col.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain');
        if (id) Views.cliente.setStage(id, col.dataset.stage);
      });
    });
  }

  function card(c) {
    const owner = Store.get('users', c.ownerId);
    const colors = { frio: 'var(--cold)', tibio: 'var(--warm)', caliente: 'var(--hot)' };
    const stale = Store.isStale(c);
    return `<div class="kcard" draggable="true" data-id="${c.id}" style="--temp-color:${colors[c.temperature]}">
      <div class="row between"><span class="kcard-title">${U.esc(c.name)}</span>${UI.avatar(owner)}</div>
      <div class="kcard-meta">${UI.tempBadge(c.temperature)} <strong class="num" style="color:var(--text)">${U.money(c.estValue)}</strong> ${UI.scoreBadge(Store.leadScore(c))}</div>
      <div class="kcard-meta">${OPEN_STAGES.includes(c.stage) ? UI.followLabel(c.nextFollowUp) : c.stage === 'ganado' ? 'Ganado ' + U.ago(c.wonAt) : U.esc(c.lostReason || '')}</div>
      ${stale ? `<div class="kcard-meta" style="color:var(--warn)">${icon('alert', 'sm')} Sin contacto ${c.lastContact ? U.ago(c.lastContact) : 'nunca'}</div>` : ''}
    </div>`;
  }

  return { title: 'Embudo', render };
})();
