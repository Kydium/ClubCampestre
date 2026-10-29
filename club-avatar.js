/* =====================================================================
   CLUB CAMPESTRE · Avatar compartido (club-avatar.js)
   La foto de perfil de cada cuenta, la misma en todos los juegos.
   Se guarda reducida (128x128, ~8 KB) en:  usuarios/<cuenta>/avatar = { d:'data:image/jpeg;base64,...', t:fecha }
   Cada dispositivo guarda una copia local para no volver a descargarla.

   USO EN UN JUEGO (Firebase "compat" ya cargado):
     <script src="../club-avatar.js"></script>
     ClubAvatar.init({ db: firebase.database() });             // una vez, tras confirmar la cuenta
     ClubAvatar.render(uidDelJugador, elemento, { name: 'Michael', size: 36 });
       -> pinta la foto en ese elemento (o un círculo de color con su inicial si no tiene foto)
     ClubAvatar.pick();                                        // abre el selector para cambiar MI foto
   ===================================================================== */
(function (global) {
  'use strict';

  var LS = 'cc_av_';
  var TTL = 10 * 60 * 1000;      // cada cuánto se vuelve a consultar la nube (la copia local se muestra siempre primero)
  var MAXCHARS = 30000;          // tope del texto de la imagen (~22 KB)
  var SIDE = 128;

  var io = null, myUid = '', subs = {}, inflight = {};

  var CSS = '.ccav{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;flex:0 0 auto;overflow:hidden;'
    + 'background-size:cover;background-position:center;background-repeat:no-repeat;color:#fff;font-weight:800;'
    + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;user-select:none;line-height:1;'
    + 'box-shadow:0 0 0 2px rgba(255,255,255,.35)}';
  function addStyle() {
    if (document.getElementById('ccav-style')) return;
    var st = document.createElement('style');
    st.id = 'ccav-style'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------- copia local ---------- */
  function cget(uid) { try { var v = JSON.parse(localStorage.getItem(LS + uid) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } }
  function cset(uid, o) { try { localStorage.setItem(LS + uid, JSON.stringify(o)); } catch (e) {} }

  /* ---------- conexión con la base de datos ---------- */
  function init(o) {
    o = o || {};
    try { myUid = o.uid || localStorage.getItem('cc_uid') || myUid; } catch (e) { myUid = o.uid || myUid; }
    if (o.io) { io = o.io; return; }                       // el menú entrega sus propias funciones (SDK modular)
    var db = o.db || (global.firebase && global.firebase.database && global.firebase.database());
    if (!db) return;
    io = {
      get: function (uid) { return db.ref('usuarios/' + uid + '/avatar').once('value').then(function (s) { return s.val(); }); },
      put: function (uid, v) { return db.ref('usuarios/' + uid + '/avatar').set(v); }
    };
  }

  /* ---------- carga (copia local primero, nube después) ---------- */
  function notify(uid, d) {
    (subs[uid] || []).slice().forEach(function (f) { try { f(d); } catch (e) {} });
  }
  function load(uid, force) {
    var c = cget(uid);
    if (c && !force && Date.now() - (c.f || 0) < TTL) return Promise.resolve(c.d || '');
    if (!io) return Promise.resolve(c ? c.d || '' : '');
    if (inflight[uid]) return inflight[uid];
    inflight[uid] = io.get(uid).then(function (v) {
      var d = (v && typeof v.d === 'string') ? v.d : '';
      cset(uid, { d: d, f: Date.now() });
      if (!c || c.d !== d) notify(uid, d);
      return d;
    }).catch(function () { return c ? c.d || '' : ''; })
      .then(function (d) { delete inflight[uid]; return d; });
    return inflight[uid];
  }

  /* ---------- pintar ---------- */
  function colorOf(s) {
    var h = 0; s = String(s || '?');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return 'hsl(' + h + ',62%,42%)';
  }
  function paint(el, uid, name, d, size) {
    el.classList.add('ccav');
    if (size) { el.style.width = el.style.height = size + 'px'; el.style.fontSize = Math.round(size * 0.46) + 'px'; }
    if (d) { el.style.backgroundImage = 'url("' + d + '")'; el.style.backgroundColor = '#222'; el.textContent = ''; }
    else {
      el.style.backgroundImage = 'none';
      el.style.backgroundColor = colorOf(uid || name);
      el.textContent = (String(name || '?').trim().charAt(0) || '?').toUpperCase();
    }
  }

  /** Pinta el avatar de `uid` dentro de `el`. Se actualiza solo si la foto cambia. */
  function render(uid, el, opts) {
    if (!el) return;
    opts = opts || {};
    addStyle();
    var name = opts.name || '', size = opts.size || 0;
    var c = cget(uid);
    paint(el, uid, name, c ? c.d || '' : '', size);        // al instante, con lo que haya en este dispositivo
    var f = function (d) { paint(el, uid, name, d, size); };
    f.el = el;
    (subs[uid] = (subs[uid] || []).filter(function (x) { return !x.el || document.body.contains(x.el); })).push(f);
    load(uid).then(function (d) { paint(el, uid, name, d, size); });
  }

  /* ---------- reducir la foto ---------- */
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || '')) return reject(new Error('No es una imagen'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h);
          var cv = document.createElement('canvas'); cv.width = cv.height = SIDE;
          var cx = cv.getContext('2d');
          cx.fillStyle = '#000'; cx.fillRect(0, 0, SIDE, SIDE);
          cx.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, SIDE, SIDE);   // recorte cuadrado centrado
          var q = 0.85, d = cv.toDataURL('image/jpeg', q);
          while (d.length > MAXCHARS && q > 0.3) { q -= 0.1; d = cv.toDataURL('image/jpeg', q); }
          URL.revokeObjectURL(url);
          if (d.length > MAXCHARS) return reject(new Error('La imagen es demasiado pesada'));
          resolve(d);
        } catch (e) { reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  }

  /* ---------- cambiar / quitar MI foto ---------- */
  function set(file, uid) {
    uid = uid || myUid;
    if (!uid) return Promise.reject(new Error('Sin cuenta'));
    if (!io) return Promise.reject(new Error('Sin conexión con la base de datos'));
    return shrink(file).then(function (d) {
      return io.put(uid, { d: d, t: Date.now() }).then(function () {
        cset(uid, { d: d, f: Date.now() }); notify(uid, d); return d;
      });
    });
  }
  function remove(uid) {
    uid = uid || myUid;
    if (!uid || !io) return Promise.reject(new Error('Sin cuenta'));
    return io.put(uid, null).then(function () { cset(uid, { d: '', f: Date.now() }); notify(uid, ''); return ''; });
  }
  /** Abre el selector de fotos y guarda la elegida como MI avatar. */
  function pick(uid) {
    return new Promise(function (resolve, reject) {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0];
        if (inp.parentNode) inp.parentNode.removeChild(inp);
        if (!f) return resolve(null);
        set(f, uid).then(resolve, reject);
      });
      document.body.appendChild(inp);
      inp.click();
    });
  }

  global.ClubAvatar = {
    init: init, render: render, load: load, pick: pick, set: set, remove: remove,
    get: function (uid) { var c = cget(uid); return c ? c.d || '' : ''; },
    onChange: function (uid, cb) { (subs[uid] = subs[uid] || []).push(cb); }
  };
})(window);
