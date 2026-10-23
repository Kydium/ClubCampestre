/* =====================================================================
   CLUB CAMPESTRE · Experiencia compartida (club-xp.js)
   Una sola barra de nivel para todos los juegos. Se guarda en Firebase:
     usuarios/<cuenta>/xp = { total, por:{juego:xp}, mig:{juego:true}, ult:{juego:clave} }

   USO EN UN JUEGO (Firebase "compat" ya cargado):
     <script src="../club-xp.js"></script>
     ClubXP.init({ db: db, uid: cuentaUid, game: 'bingo', legacy: 0 });
     ClubXP.add(100, 'bingo', { key: 'idDeLaPartida' });   // suma y muestra la barra
   ===================================================================== */
(function (global) {
  'use strict';

  /* ---------- Niveles (los mismos que usaba UNO) ---------- */
  function need(l) { return 500 + l * 60; }
  function levelOf(total) {
    var l = 1, x = Math.max(0, +total || 0);
    while (x >= need(l)) { x -= need(l); l++; }
    return { l: l, xp: x, need: need(l) };
  }

  /* ---------- Estilos (prefijo ccxp- para no chocar con los juegos) ---------- */
  var CSS = ''
    + '.ccxp-pop{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 10px);width:min(92vw,440px);z-index:2147483000;'
    + 'transform:translate(-50%,-160%);padding:12px 14px 8px;border-radius:18px;background:rgba(10,6,30,.94);'
    + 'border:1px solid rgba(255,255,255,.18);box-shadow:0 10px 30px rgba(0,0,0,.5);transition:transform .45s cubic-bezier(.2,1,.3,1);'
    + 'pointer-events:none;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}'
    + '.ccxp-pop.on{transform:translate(-50%,0)}'
    + '.ccxp-row{display:flex;align-items:center}'
    + '.ccxp-lv{width:40px;height:40px;flex:0 0 auto;border-radius:50%;display:flex;align-items:center;justify-content:center;'
    + 'font-weight:900;font-size:17px;font-style:italic;color:#fff;background:radial-gradient(circle at 35% 30%,#2a2f3a,#0b0d12);'
    + 'box-shadow:0 0 0 3px #3fa9ff,0 0 14px rgba(63,169,255,.55);position:relative;z-index:2;text-shadow:0 2px 0 #000}'
    + '.ccxp-lv.nx{box-shadow:0 0 0 3px rgba(255,255,255,.35)}'
    + '.ccxp-lv.up{animation:ccxpUp .9s ease-out}'
    + '@keyframes ccxpUp{0%{transform:scale(1)}40%{transform:scale(1.35);box-shadow:0 0 0 4px #ffd54a,0 0 30px #ffd54a}100%{transform:scale(1)}}'
    + '.ccxp-track{flex:1;height:11px;margin:0 -4px;position:relative;background:rgba(0,0,0,.6);'
    + 'border-top:1px solid rgba(255,255,255,.15);border-bottom:1px solid rgba(255,255,255,.15);overflow:hidden}'
    + '.ccxp-fill{position:absolute;top:0;bottom:0;left:0;width:0;z-index:1;background:linear-gradient(180deg,#7cc8ff,#2f8be6);box-shadow:0 0 10px rgba(63,169,255,.8)}'
    + '.ccxp-gain{position:absolute;top:0;bottom:0;left:0;width:0;background:linear-gradient(180deg,#fff,#cfe9ff);opacity:0}'
    + '.ccxp-seg{position:absolute;inset:0;z-index:2;background:repeating-linear-gradient(90deg,transparent 0 calc(10% - 2px),rgba(0,0,0,.6) calc(10% - 2px) 10%)}'
    + '.ccxp-info{display:flex;justify-content:space-between;align-items:center;margin-top:5px;padding:0 44px;font-size:12px;color:#b9b4d6}'
    + '.ccxp-info b{font-style:italic;color:#7cc8ff;font-size:15px;font-weight:900}'
    + '.ccxp-bar{display:flex;flex-direction:column;gap:4px;width:100%;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}'
    + '.ccxp-bar .ccxp-txt{text-align:center;font-size:12px;color:#b9b4d6}'
    + '@media (prefers-reduced-motion:reduce){.ccxp-pop{transition:none}.ccxp-lv.up{animation:none}}';

  function addStyle() {
    if (document.getElementById('ccxp-style')) return;
    var st = document.createElement('style');
    st.id = 'ccxp-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------- Estado ---------- */
  var S = { db: null, uid: '', total: 0, por: {}, ready: false, ref: null, cb: null, cbs: [],
            inflight: {}, levelUp: null, queue: Promise.resolve(), pending: [] };

  /* ---------- Copia local: la barra aparece al instante y la nube la corrige ---------- */
  var LS = 'cc_xp_';
  function cacheGet(uid) {
    try { var v = JSON.parse(localStorage.getItem(LS + uid) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
  }
  function cacheSet(uid, v) {
    if (!uid) return;
    try { localStorage.setItem(LS + uid, JSON.stringify(v || {})); } catch (e) {}
  }
  function preload(uid) {                    // carga lo último guardado en este dispositivo
    var c = uid && cacheGet(uid);
    if (!c) return false;
    S.total = Math.max(0, +c.total || 0); S.por = c.por || {}; S.mig = c.mig || {}; S.ready = true;
    return true;
  }

  function notify() {
    var info = levelOf(S.total);
    S.cbs.slice().forEach(function (f) { try { f(S.total, S.por, info); } catch (e) {} });
  }
  function applySnap(v) {
    v = v || {};
    if (S.uid && (v.total != null)) cacheSet(S.uid, v);   // guarda copia local de lo que dice la nube
    S.total = Math.max(0, +v.total || 0);
    S.por = v.por || {};
    S.mig = v.mig || {};
    S.ready = true;
    notify();
  }

  /* ---------- Ventana que baja desde arriba (la de UNO) ---------- */
  function popEl() {
    var p = document.getElementById('ccxp-pop');
    if (p) return p;
    addStyle();
    p = document.createElement('div');
    p.id = 'ccxp-pop';
    p.className = 'ccxp-pop';
    p.setAttribute('aria-live', 'polite');
    p.innerHTML = '<div class="ccxp-row"><div class="ccxp-lv" id="ccxp-cur">1</div>'
      + '<div class="ccxp-track"><div class="ccxp-fill" id="ccxp-fill"></div><div class="ccxp-gain" id="ccxp-g"></div><div class="ccxp-seg"></div></div>'
      + '<div class="ccxp-lv nx" id="ccxp-nxt">2</div></div>'
      + '<div class="ccxp-info"><span id="ccxp-txt"></span><b id="ccxp-plus">+0 XP</b></div>';
    document.body.appendChild(p);
    return p;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var $ = function (id) { return document.getElementById(id); };

  function run(oldTotal, gain) {
    var pop = popEl(), fill = $('ccxp-fill'), g = $('ccxp-g');
    var lv = levelOf(oldTotal), left = gain;
    function draw() {
      $('ccxp-cur').textContent = lv.l; $('ccxp-nxt').textContent = lv.l + 1;
      $('ccxp-txt').textContent = lv.xp + ' / ' + lv.need + ' XP';
    }
    fill.style.transition = 'none'; fill.style.width = (lv.xp / lv.need * 100) + '%'; g.style.opacity = '0';
    $('ccxp-plus').textContent = '+' + gain + ' XP';
    draw();
    void pop.offsetWidth;
    pop.classList.add('on');
    return wait(600).then(function loop() {
      if (left <= 0) return null;
      var step = Math.min(left, lv.need - lv.xp);
      var from = lv.xp / lv.need * 100, to = (lv.xp + step) / lv.need * 100;
      g.style.transition = 'none'; g.style.left = from + '%'; g.style.width = (to - from) + '%'; g.style.opacity = '1';
      return wait(350).then(function () {
        fill.style.transition = 'width .8s cubic-bezier(.4,0,.6,1)'; fill.style.width = to + '%';
        return wait(850);
      }).then(function () {
        g.style.transition = 'opacity .2s'; g.style.opacity = '0';
        lv.xp += step; left -= step; draw();
        if (lv.xp >= lv.need) {
          lv = { l: lv.l + 1, xp: 0, need: need(lv.l + 1) };
          var c = $('ccxp-cur'); c.classList.remove('up'); void c.offsetWidth; c.classList.add('up');
          try { if (S.levelUp) S.levelUp(lv.l); } catch (e) {}
          return wait(450).then(function () {
            fill.style.transition = 'none'; fill.style.width = '0%';
            draw(); $('ccxp-txt').textContent = '¡Nivel ' + lv.l + '!';
            return wait(400);
          }).then(loop);
        }
        return loop();
      });
    }).then(function () { return wait(1300); })
      .then(function () { pop.classList.remove('on'); return wait(500); });
  }

  function show(oldTotal, gain) {
    if (!gain || gain <= 0) return S.queue;
    S.queue = S.queue.then(function () { return run(+oldTotal || 0, gain); }).catch(function () {});
    return S.queue;
  }

  /* ---------- Firebase ---------- */
  function ensureShape(cur) {
    cur = cur || {};
    cur.total = +cur.total || 0;
    cur.por = cur.por || {};
    cur.mig = cur.mig || {};
    cur.ult = cur.ult || {};
    return cur;
  }

  function migrate(game, legacy) {
    if (!S.ref) return Promise.resolve();
    if (S.mig && S.mig[game]) return Promise.resolve();       // ya se sumó antes
    return Promise.resolve(typeof legacy === 'function' ? legacy() : legacy).then(function (n) {
      n = Math.max(0, Math.round(+n || 0));
      return S.ref.transaction(function (cur) {
        cur = ensureShape(cur);
        if (cur.mig[game]) return;                            // otra pestaña ya lo hizo
        cur.total += n;
        cur.por[game] = (+cur.por[game] || 0) + n;
        cur.mig[game] = true;
        cur.t = Date.now();
        return cur;
      });
    }).catch(function () {});
  }

  /** Conecta el juego con la cuenta. Devuelve una promesa que termina cuando ya cargó tu XP. */
  function init(o) {
    o = o || {};
    addStyle();
    var db = o.db || (global.firebase && global.firebase.database && global.firebase.database());
    var uid = o.uid || (function () { try { return localStorage.getItem('cc_uid') || ''; } catch (e) { return ''; } })();
    if (!db || !uid) return Promise.resolve(false);
    if (S.ref && S.cb) { try { S.ref.off('value', S.cb); } catch (e) {} }
    S.db = db; S.uid = uid;
    preload(uid); notify();                                   // muestra YA lo guardado en este dispositivo
    S.ref = db.ref('usuarios/' + uid + '/xp');
    if (o.levelUp) S.levelUp = o.levelUp;
    var game = o.game || '';
    return new Promise(function (resolve) {
      var first = true;
      S.cb = S.ref.on('value', function (snap) {
        var v = snap.val();
        if (v == null) {                                      // la nube no tiene nada: si hay copia local, se restaura
          var c = cacheGet(uid);
          if (c && +c.total > 0) {
            S.ref.transaction(function (cur) { return cur && +cur.total > 0 ? undefined : c; }).catch(function () {});
            return;                                           // el listener volverá a disparar con lo restaurado
          }
        }
        applySnap(v);
        if (first) { first = false; resolve(true); }
      }, function () { if (first) { first = false; resolve(false); } });
    }).then(function (ok) {
      if (ok && game) return migrate(game, o.legacy).then(function () { return true; });
      return ok;
    }).then(function (ok) {
      var q = S.pending; S.pending = [];
      q.forEach(function (a) { add(a[0], a[1], a[2]).then(a[3]); });
      return ok;
    });
  }

  /**
   * Suma experiencia a la cuenta.
   *  key   : identificador de la partida/ronda (evita sumar dos veces lo mismo)
   *  popup : mostrar la barra (por defecto sí)
   */
  function add(gain, game, opts) {
    opts = opts || {};
    gain = Math.max(0, Math.round(+gain || 0));
    if (!gain || !game) return Promise.resolve(null);
    if (!S.ref) {                                             // aún no conectó: se suma en cuanto conecte
      return new Promise(function (resolve) { S.pending.push([gain, game, opts, resolve]); });
    }
    var key = opts.key == null ? '' : String(opts.key);
    var tag = game + '|' + key;
    if (key && S.inflight[tag]) return S.inflight[tag];
    var before = 0, applied = false;
    var p = S.ref.transaction(function (cur) {
      applied = false;
      cur = ensureShape(cur);
      if (key && cur.ult[game] === key) return;               // esta partida ya se sumó
      before = cur.total;
      cur.total += gain;
      cur.por[game] = (+cur.por[game] || 0) + gain;
      if (key) cur.ult[game] = key;
      cur.t = Date.now();
      applied = true;
      return cur;
    }).then(function (res) {
      if (res && res.committed && applied) {
        if (opts.popup !== false) show(before, gain);
        return { before: before, after: before + gain, gain: gain };
      }
      return null;
    }).catch(function () { return null; });
    if (key) S.inflight[tag] = p;
    return p;
  }

  /* ---------- Barra fija (menú, perfiles) ---------- */
  function mountBar(el) {
    if (!el) return function () {};
    addStyle();
    el.classList.add('ccxp-bar');
    el.innerHTML = '<div class="ccxp-row"><div class="ccxp-lv" data-r="cur">1</div>'
      + '<div class="ccxp-track"><div class="ccxp-fill" data-r="fill"></div><div class="ccxp-seg"></div></div>'
      + '<div class="ccxp-lv nx" data-r="nxt">2</div></div><div class="ccxp-txt" data-r="txt">0 / ' + need(1) + ' XP</div>';
    var q = function (r) { return el.querySelector('[data-r="' + r + '"]'); };
    function paint(total) {
      var L = levelOf(total);
      q('cur').textContent = L.l; q('nxt').textContent = L.l + 1;
      q('fill').style.width = Math.round(L.xp / L.need * 100) + '%';
      q('txt').textContent = L.xp + ' / ' + L.need + ' XP';
    }
    paint(S.total);
    return onChange(function (t) { paint(t); });
  }

  function onChange(cb) {
    S.cbs.push(cb);
    if (S.ready) { try { cb(S.total, S.por, levelOf(S.total)); } catch (e) {} }
    return function () { S.cbs = S.cbs.filter(function (f) { return f !== cb; }); };
  }

  /** Desconecta la cuenta (al cerrar sesión). */
  function reset() {
    if (S.ref && S.cb) { try { S.ref.off('value', S.cb); } catch (e) {} }
    S.ref = null; S.cb = null; S.uid = ''; S.total = 0; S.por = {}; S.mig = {}; S.ready = false; S.inflight = {};
    notify();
  }

  /** Para páginas que leen Firebase con otro SDK (el menú): les entregan el total aquí. */
  function setExternal(v, uid) {
    if (uid) S.uid = uid;
    else if (!S.uid) { try { S.uid = localStorage.getItem('cc_uid') || ''; } catch (e) {} }
    applySnap(v);
  }

  try { preload(localStorage.getItem('cc_uid') || ''); } catch (e) {}   // arranque instantáneo

  global.ClubXP = {
    need: need, levelOf: levelOf,
    init: init, add: add, show: show, reset: reset, mountBar: mountBar, onChange: onChange, setExternal: setExternal,
    uid: function () { return S.uid; },
    total: function () { return S.total; },
    por: function () { return S.por; },
    ready: function () { return S.ready; },
    config: function (c) { if (c && c.levelUp) S.levelUp = c.levelUp; }
  };
})(window);
