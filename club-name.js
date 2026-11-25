// Nombre único del Club Campestre: cada juego usa el nombre de la cuenta y no se puede cambiar dentro del juego.
// Uso en un juego:  <script src="../club-name.js"></script>
//                   ClubName.lock(['idDelInput'], nombre => { /* guardar en la clave del juego */ });
// - Pone el nombre de la cuenta en esos campos y los deja solo lectura (también si el juego los vuelve a dibujar).
// - Sin cuenta (invitados, donde el juego lo permite) no toca nada: el campo sigue editable.
(function () {
  if (window.ClubName) return;
  var name = '', ids = [], hooks = [], lastHooked = '';

  function accName(u) {
    return u ? String(u.displayName || (u.email || '').split('@')[0] || '').trim() : '';
  }

  function apply() {
    if (!name) return;
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var max = el.maxLength > 0 ? el.maxLength : 20, v = name.slice(0, max);
      if (el.value !== v) {
        el.value = v;
        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
      }
      if (!el.readOnly) {
        el.readOnly = true;
        el.classList.add('cc-name-locked');
        el.title = 'Es el nombre de tu cuenta del Club Campestre';
        el.setAttribute('aria-readonly', 'true');
      }
    });
    if (lastHooked !== name) {
      lastHooked = name;
      hooks.forEach(function (f) { try { f(name); } catch (e) {} });
    }
  }

  // El juego puede volver a dibujar el campo o cargar un nombre viejo de su propio guardado: se corrige solo.
  function watchDom() {
    var pending = false;
    try {
      new MutationObserver(function () {
        if (pending) return; pending = true;
        (window.requestAnimationFrame || setTimeout)(function () { pending = false; apply(); });
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
    setInterval(apply, 1500);
  }

  // Espera a que el juego tenga Firebase Auth (algunos lo cargan tarde) y escucha la sesión.
  function hookAuth(tries) {
    try {
      if (window.firebase && firebase.auth && firebase.apps && firebase.apps.length) {
        firebase.auth().onAuthStateChanged(function (u) {
          var n = accName(u);
          if (n) { name = n; try { localStorage.setItem('cc_name', n); } catch (e) {} }
          apply();
        });
        return;
      }
    } catch (e) {}
    if (tries > 0) setTimeout(function () { hookAuth(tries - 1); }, 300);
  }

  var css = document.createElement('style');
  css.textContent = '.cc-name-locked{opacity:.8;cursor:not-allowed}';
  (document.head || document.documentElement).appendChild(css);

  window.ClubName = {
    // Bloquea esos campos con el nombre de la cuenta; onName(nombre) se llama para guardarlo donde el juego lo lea.
    lock: function (idList, onName) {
      (idList || []).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
      if (onName) hooks.push(onName);
      lastHooked = '';
      apply();
    },
    get: function () { return name; }
  };

  watchDom();
  hookAuth(100);
})();
