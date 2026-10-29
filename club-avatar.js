/* =====================================================================
   CLUB CAMPESTRE \u00b7 Avatar compartido (club-avatar.js)
   La foto de perfil de cada cuenta, la misma en todos los juegos.
   Se guarda reducida (128x128, ~8 KB) en:  usuarios/<cuenta>/avatar = { d:'data:image/jpeg;base64,...', t:fecha }
   Cada dispositivo guarda una copia local para no volver a descargarla.

   USO EN UN JUEGO (Firebase "compat" ya cargado):
     <script src="../club-avatar.js"></script>
     ClubAvatar.init({ db: firebase.database() });             // una vez, tras confirmar la cuenta
     ClubAvatar.render(uidDelJugador, elemento, { name: 'Michael', size: 36, shape: 'circle' });
       -> pinta la foto en ese elemento (o un color con su inicial si no tiene foto)
          shape: 'circle' (por defecto) | 'square' | 'rounded'   -> cada juego elige la forma
       La foto se guarda SIEMPRE cuadrada; el encuadre lo elige el jugador en el men\u00fa.
     ClubAvatar.pick();                                        // abre el selector para cambiar MI foto
   ===================================================================== */
(function (global) {
  'use strict';

  var LS = 'cc_av_';
  var TTL = 10 * 60 * 1000;      // cada cu\u00e1nto se vuelve a consultar la nube (la copia local se muestra siempre primero)
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
    if (o.io) { io = o.io; return; }                       // el men\u00fa entrega sus propias funciones (SDK modular)
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
  function paint(el, uid, name, d, size, shape) {
    el.classList.add('ccav');
    el.style.borderRadius = shape === 'square' ? '0' : shape === 'rounded' ? '22%' : '50%';
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
    var name = opts.name || '', size = opts.size || 0, shape = opts.shape || 'circle';
    var c = cget(uid);
    paint(el, uid, name, c ? c.d || '' : '', size, shape);        // al instante, con lo que haya en este dispositivo
    var f = function (d) { paint(el, uid, name, d, size, shape); };
    f.el = el;
    (subs[uid] = (subs[uid] || []).filter(function (x) { return !x.el || document.body.contains(x.el); })).push(f);
    load(uid).then(function (d) { paint(el, uid, name, d, size, shape); });
  }

  /* ---------- encuadre: zoom + punto de enfoque ---------- */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function srcRect(img, v) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    v = v || {};
    var z = clamp(+v.zoom || 1, 1, 5), s = Math.min(w, h) / z;
    var fx = v.fx == null ? 0.5 : +v.fx, fy = v.fy == null ? 0.5 : +v.fy;
    return { sx: clamp(fx * w - s / 2, 0, w - s), sy: clamp(fy * h - s / 2, 0, h - s), s: s, w: w, h: h };
  }
  function drawView(cx, img, side, v) {
    var r = srcRect(img, v);
    cx.drawImage(img, r.sx, r.sy, r.s, r.s, 0, 0, side, side);
  }

  /* ---------- reducir la foto ---------- */
  function shrink(file, view) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || '')) return reject(new Error('No es una imagen'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var cv = document.createElement('canvas'); cv.width = cv.height = SIDE;
          var cx = cv.getContext('2d');
          cx.fillStyle = '#000'; cx.fillRect(0, 0, SIDE, SIDE);
          drawView(cx, img, SIDE, view);                                          // recorte cuadrado con el encuadre elegido
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
  function set(file, uid, view) {
    uid = uid || myUid;
    if (!uid) return Promise.reject(new Error('Sin cuenta'));
    if (!io) return Promise.reject(new Error('Sin conexi\u00f3n con la base de datos'));
    return shrink(file, view).then(function (d) {
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
  /* ---------- ventana para encuadrar ---------- */
  var ECSS = '.ccavE{position:fixed;inset:0;z-index:2147483200;background:rgba(5,3,18,.88);display:flex;align-items:center;justify-content:center;padding:16px;'
    + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#fff}'
    + '.ccavE .bx{width:min(100%,340px);background:#120a2c;border:1px solid rgba(255,255,255,.2);border-radius:16px;padding:16px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.6)}'
    + '.ccavE h3{margin:0 0 4px;font-size:1.05rem}.ccavE p{margin:0 0 12px;font-size:.82rem;color:#b9b4d6}'
    + '.ccavE .st{position:relative;width:260px;height:260px;max-width:100%;margin:0 auto 12px;touch-action:none;cursor:grab;border-radius:6px;overflow:hidden;background:#000}'
    + '.ccavE canvas{display:block;width:100%;height:100%}'
    + '.ccavE .guide{position:absolute;inset:0;border-radius:50%;box-shadow:0 0 0 999px rgba(0,0,0,.45);border:2px dashed rgba(255,255,255,.8);pointer-events:none}'
    + '.ccavE input[type=range]{width:100%;margin:0 0 14px}'
    + '.ccavE .row{display:flex;gap:10px}.ccavE button{flex:1;padding:11px 8px;border-radius:8px;border:2px solid #ff2e97;background:transparent;color:#fff;font-weight:700;cursor:pointer;font-size:.95rem}'
    + '.ccavE button.ok{background:#ff2e97;color:#fff}';
  function editor(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || '')) return reject(new Error('No es una imagen'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
      img.onload = function () {
        if (!document.getElementById('ccavE-style')) {
          var st = document.createElement('style'); st.id = 'ccavE-style'; st.textContent = ECSS; document.head.appendChild(st);
        }
        var P = 260, view = { zoom: 1, fx: 0.5, fy: 0.5 };
        var ov = document.createElement('div'); ov.className = 'ccavE';
        ov.innerHTML = '<div class="bx"><h3>Encuadra tu foto</h3><p>Arrastra para mover y usa el control para acercar. '
          + 'La l\u00ednea punteada es c\u00f3mo se ver\u00e1 en los juegos con foto redonda.</p>'
          + '<div class="st"><canvas width="' + P + '" height="' + P + '"></canvas><div class="guide"></div></div>'
          + '<input type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom">'
          + '<div class="row"><button type="button" class="no">Cancelar</button><button type="button" class="ok">Guardar</button></div></div>';
        document.body.appendChild(ov);
        var cv = ov.querySelector('canvas'), cx = cv.getContext('2d'), st = ov.querySelector('.st'), rg = ov.querySelector('input');
        function draw() { cx.fillStyle = '#000'; cx.fillRect(0, 0, P, P); drawView(cx, img, P, view); }
        function close(val, err) {
          URL.revokeObjectURL(url);
          if (ov.parentNode) ov.parentNode.removeChild(ov);
          if (err) reject(err); else resolve(val);
        }
        var drag = null;
        st.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, fx: view.fx, fy: view.fy }; try { st.setPointerCapture(e.pointerId); } catch (x) {} st.style.cursor = 'grabbing'; });
        st.addEventListener('pointermove', function (e) {
          if (!drag) return;
          var r = srcRect(img, view), k = st.getBoundingClientRect().width || P;
          view.fx = clamp(drag.fx - (e.clientX - drag.x) / k * r.s / r.w, 0, 1);
          view.fy = clamp(drag.fy - (e.clientY - drag.y) / k * r.s / r.h, 0, 1);
          draw();
        });
        function up() { drag = null; st.style.cursor = 'grab'; }
        st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
        st.addEventListener('wheel', function (e) { e.preventDefault(); view.zoom = clamp(view.zoom * (e.deltaY < 0 ? 1.08 : 0.93), 1, 4); rg.value = view.zoom; draw(); }, { passive: false });
        rg.addEventListener('input', function () { view.zoom = +rg.value; draw(); });
        ov.querySelector('.no').addEventListener('click', function () { close(null); });
        ov.querySelector('.ok').addEventListener('click', function () { close({ view: view }); });
        draw();
      };
      img.src = url;
    });
  }

  /** Abre el selector de fotos, deja encuadrar y guarda la elegida como MI avatar. */
  function pick(uid) {
    return new Promise(function (resolve, reject) {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0];
        if (inp.parentNode) inp.parentNode.removeChild(inp);
        if (!f) return resolve(null);
        editor(f).then(function (r) { return r ? set(f, uid, r.view) : null; }).then(resolve, reject);
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
