// Preferencia de inicio por cuenta y dispositivo. No concede permisos de acceso.
(() => {
  'use strict';
  const ADMIN = 'pirqueporton@gmail.com';
  const prefix = 'smarthub:view:v1:';
  const key = user => prefix + user.uid;
  const page = () => window.location.pathname.split('/').pop();
  let mountedUser = null;
  let trigger = null;
  let dialog = null;
  function get(user) {
    if (!user?.uid) return 'tablet';
    try { return localStorage.getItem(key(user)) === 'celular' ? 'celular' : 'tablet'; }
    catch (_) { return 'tablet'; }
  }
  function save(user, value) {
    if (!user?.uid || !['celular', 'tablet'].includes(value)) return false;
    try {
      localStorage.setItem(key(user), value);
      return localStorage.getItem(key(user)) === value;
    } catch (_) { return false; }
  }
  function home(user) {
    if (user?.email !== ADMIN) return 'usuario.html';
    return get(user) === 'celular' ? 'admin_porton.html' : 'admin_inicio.html';
  }
  // Llamar solo después de que cada página haya validado la cuenta.
  function route(user) {
    if (!user?.uid || user.email !== ADMIN) return false;
    const mobile = get(user) === 'celular';
    if ((mobile && ['admin_inicio.html','admin_riego.html'].includes(page())) ||
        page() === 'usuario.html') {
      window.location.replace(home(user));
      return true;
    }
    return false;
  }
  const icon = (phone) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="${phone ? 6 : 3}" y="3" width="${phone ? 12 : 18}" height="18" rx="3"/><path d="M10 17h4"/></svg>`;
  function sync() {
    if (!mountedUser) return;
    const mode = get(mountedUser);
    document.body.classList.toggle('view-celular', mode === 'celular');
    if (trigger) {
      trigger.innerHTML = icon(mode === 'celular') + '<span>Cambiar vista</span>';
      trigger.setAttribute('aria-label', `Cambiar vista. Actual: ${mode === 'celular' ? 'Celular' : 'Tablet'}`);
    }
    dialog?.querySelectorAll('[data-view]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.view === mode));
    });
  }
  function mount(user, selector) {
    if (!user?.uid) return;
    mountedUser = user;
    if (route(user)) return;
    const host = document.querySelector(selector);
    if (!host) return;
    if (!trigger) {
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'view-mode-trigger';
      trigger.addEventListener('click', () => {
        if (!dialog) createDialog();
        sync();
        dialog.querySelector('[role="status"]').textContent = '';
        dialog.showModal();
      });
      host.appendChild(trigger);
    }
    sync();
  }
  function createDialog() {
    dialog = document.createElement('dialog');
    dialog.className = 'view-mode-dialog';
    dialog.setAttribute('aria-labelledby', 'view-mode-title');
    dialog.innerHTML = `<div class="view-mode-heading"><h2 id="view-mode-title">¿Cómo quieres abrir SmartHub?</h2><button type="button" class="view-mode-close" aria-label="Cerrar">×</button></div>
      <p class="view-mode-intro">Guardaremos tu elección para esta cuenta en este dispositivo.</p>
      <div class="view-mode-options">
        <button type="button" data-view="celular" aria-pressed="false">${icon(true)}<strong>Celular</strong><span>Entrar directo al botón de abrir portón.</span></button>
        <button type="button" data-view="tablet" aria-pressed="false">${icon(false)}<strong>Tablet</strong><span>Conservar el inicio y la navegación actuales.</span></button>
      </div><p class="view-mode-footnote">Puedes cambiar de vista cuando quieras. Se mantienen los permisos de tu cuenta.</p><p class="view-mode-error" role="status"></p>`;
    dialog.querySelector('.view-mode-close').addEventListener('click', () => dialog.close());
    dialog.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
      const previous = get(mountedUser);
      const next = button.dataset.view;
      if (!save(mountedUser, next)) {
        dialog.querySelector('[role="status"]').textContent = 'No se pudo guardar. Permite el almacenamiento del sitio y vuelve a intentarlo.';
        return;
      }
      sync();
      dialog.close();
      if (next !== previous) window.location.replace(home(mountedUser));
    }));
    document.body.appendChild(dialog);
  }
  function resume() {
    if (document.hidden || !mountedUser) return;
    const current = window.firebase?.auth?.().currentUser;
    if (current?.uid !== mountedUser.uid) return;
    if (!route(current)) sync();
  }
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pageshow', resume);
  window.addEventListener('storage', event => { if (mountedUser && (event.key === key(mountedUser) || event.key === null)) resume(); });
  window.SmartHubView = Object.freeze({ get, save, home, route, mount });
})();
