// Optional character-name editor. Uses the engine's existing character state.
// The name is included in normal campaign JSON exports; no gameplay rules are changed.
(() => {
  const root = document.getElementById('app');
  if (!root) return;
  const css = document.createElement('style');
  css.textContent = `
    .poly-name-heading { display:flex; align-items:center; gap:8px; }
    .poly-name-edit { display:inline-grid;place-items:center;width:30px;height:30px;padding:0;border:1px solid rgba(200,165,112,.5);border-radius:6px;background:transparent;color:inherit;font-size:18px;cursor:pointer; }
    .poly-character-name { margin:4px 0 10px;color:#d6b987;font-size:14px;overflow-wrap:anywhere; }
    .poly-name-form { display:flex;flex-wrap:wrap;gap:7px;margin:7px 0 12px; }
    .poly-name-form input { flex:1 1 135px;min-width:0;padding:9px;border:1px solid #806a4e;border-radius:6px;background:#14161c;color:#fff;font:16px system-ui; }
    .poly-name-form button { padding:8px 10px;border:1px solid #806a4e;border-radius:6px;background:#30271f;color:#fff;cursor:pointer; }
  `;
  document.head.appendChild(css);

  const character = () => {
    try { return typeof state !== 'undefined' ? state.character : null; }
    catch (_) { return null; }
  };

  function enhance() {
    const heading = root.querySelector('.sheet-title h3');
    const c = character();
    if (!heading || !c || heading.dataset.nameEditor === 'ready') return;
    heading.dataset.nameEditor = 'ready';
    heading.classList.add('poly-name-heading');
    const holder = heading.parentElement;
    const display = document.createElement('div');
    display.className = 'poly-character-name';
    const updateDisplay = () => {
      display.textContent = String(character()?.name || '').trim();
      display.hidden = !display.textContent;
    };
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'poly-name-edit';
    edit.textContent = '✎';
    edit.setAttribute('aria-label', 'Edit character name');
    edit.title = 'Edit character name';
    heading.appendChild(edit);
    heading.insertAdjacentElement('afterend', display);
    updateDisplay();

    edit.addEventListener('click', () => {
      const previous = holder.querySelector('.poly-name-form');
      if (previous) { previous.remove(); return; }
      const form = document.createElement('form');
      form.className = 'poly-name-form';
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 60;
      input.placeholder = 'Character name';
      input.setAttribute('aria-label', 'Character name');
      input.value = String(character()?.name || '');
      const saveButton = document.createElement('button');
      saveButton.type = 'submit';
      saveButton.textContent = 'Save';
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.textContent = 'Cancel';
      cancelButton.addEventListener('click', () => form.remove());
      form.addEventListener('submit', event => {
        event.preventDefault();
        const target = character();
        if (!target) return;
        const name = input.value.trim().slice(0, 60);
        if (name) target.name = name;
        else delete target.name;
        if (typeof save === 'function') save();
        updateDisplay();
        form.remove();
      });
      form.append(input, saveButton, cancelButton);
      display.insertAdjacentElement('afterend', form);
      input.focus();
    });
  }
  const observer = new MutationObserver(enhance);
  observer.observe(root, {childList:true,subtree:true});
  enhance();
})();
