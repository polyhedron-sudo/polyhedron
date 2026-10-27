// Optional character-name editor for the Polyhedron campaign interface.
// The game engine remains on Render; state.character.name is exported with campaign JSON.
(() => {
  const main = document.getElementById('app');
  if (!main) return;

  const style = document.createElement('style');
  style.textContent = `
    .poly-name-heading { display:flex; align-items:center; gap:8px; }
    .poly-name-edit { border:1px solid rgba(200,165,112,.4); background:transparent; color:inherit; border-radius:6px; width:29px; height:29px; cursor:pointer; display:inline-grid; place-items:center; padding:0; font-size:16px; line-height:1; }
    .poly-name-edit:focus-visible { outline:2px solid #d6aa6c; outline-offset:3px; }
    .poly-character-name { margin:3px 0 10px; font-size:14px; color:#d6b987; overflow-wrap:anywhere; }
  `;
  document.head.appendChild(style);

  function getCharacter() {
    try { return typeof state !== 'undefined' && state && state.character ? state.character : null; }
    catch (_) { return null; }
  }
  function refresh() {
    const heading = main.querySelector('.sheet-title h3');
    const character = getCharacter();
    if (!heading || !character) return;

    if (!heading.classList.contains('poly-name-heading')) {
      heading.classList.add('poly-name-heading');
      const pencil = document.createElement('button');
      pencil.type = 'button';
      pencil.className = 'poly-name-edit';
      pencil.textContent = '✎';
      pencil.title = 'Edit character name';
      pencil.setAttribute('aria-label', 'Edit character name');
      pencil.addEventListener('click', () => {
        const current = String(getCharacter()?.name || '');
        const next = window.prompt('Character name', current);
        if (next === null) return;
        const cleaned = next.trim().replace(/[\\u0000-\\u001f\\u007f]/g, '').slice(0, 60);
        const target = getCharacter();
        if (!target) return;
        if (cleaned) target.name = cleaned;
        else delete target.name;
        refresh();
      });
      heading.appendChild(pencil);
    }
    const holder = heading.parentElement;
    let label = holder.querySelector('.poly-character-name');
    if (!label) {
      label = document.createElement('div');
      label.className = 'poly-character-name';
      heading.insertAdjacentElement('afterend', label);
    }
    const name = String(character.name || '').trim();
    if (label.textContent !== name) label.textContent = name;
    label.hidden = !name;
  }

  // Updates once per new character-panel render, without altering the game engine.
  const observer = new MutationObserver(refresh);
  observer.observe(main, {childList:true, subtree:true});
  refresh();
})();
