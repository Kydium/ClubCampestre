// Cuenta única de Club Campestre (usuario + contraseña con Firebase Authentication).
// Los juegos pueden importar este mismo archivo:
//   import { watchUser, currentUsername, logoutUser } from "../auth.js";
import { initializeApp, getApps, getApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile, updatePassword, deleteUser,
  reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, onValue, get, set, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig, isConfigured } from "./firebase-config.js";

export { isConfigured };

const DOMINIO = "clubcampestre.app";          // correo "falso": usuario@clubcampestre.app
const REGLA_USUARIO = /^[a-z0-9_]{3,16}$/;

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Sin setPersistence: se usa el almacenamiento por defecto de Firebase (el mismo que usan
// los juegos), así la sesión es una sola y no se pierde al pasar del menú a un juego.

export function normalizarUsuario(texto) {
  return String(texto || "").trim().toLowerCase();
}

export function validarUsuario(texto) {
  const u = normalizarUsuario(texto);
  if (!REGLA_USUARIO.test(u)) {
    return "El usuario debe tener de 3 a 16 caracteres: letras, números o guion bajo (_).";
  }
  return "";
}

const aCorreo = u => `${normalizarUsuario(u)}@${DOMINIO}`;

// ---------------------------------------------------------------------------
// Directorio de nombres: cc_names/<usuario> = { uid, email }
// Permite cambiar el nombre de usuario sin cambiar la cuenta (la XP, el avatar y los datos de
// cada juego van por uid, así que se conservan). El correo de la cuenta no cambia nunca.
// ---------------------------------------------------------------------------
const db = () => getDatabase(app);
const nameRef = n => ref(db(), "cc_names/" + normalizarUsuario(n));
const recRef = uid => ref(db(), "cc_rec/" + uid);

async function correoDe(usuario) {
  const s = await get(nameRef(usuario)).catch(() => null);
  const v = s && s.val();
  return (v && v.email) || aCorreo(usuario);
}
async function anotarNombre(user) {
  const n = normalizarUsuario(user.displayName || (user.email || "").split("@")[0]);
  if (!n) return;
  const s = await get(nameRef(n)).catch(() => null);
  if (!s || !s.exists()) await set(nameRef(n), { uid: user.uid, email: user.email }).catch(() => {});
}
function errorCodigo(code) { const e = new Error(code); e.code = code; return e; }

export async function registerUser(usuario, clave) {
  const u = normalizarUsuario(usuario);
  const ocupado = await get(nameRef(u)).then(s => s.exists()).catch(() => false);
  if (ocupado) throw errorCodigo("auth/email-already-in-use");
  const cred = await createUserWithEmailAndPassword(auth, aCorreo(u), clave);
  await updateProfile(cred.user, { displayName: u });
  await set(nameRef(u), { uid: cred.user.uid, email: cred.user.email }).catch(() => {});
  return { user: cred.user, needWord: true };
}

// needWord = la cuenta todavía no tiene palabra de recuperación (el menú la pide una vez)
export async function loginUser(usuario, clave) {
  const cred = await signInWithEmailAndPassword(auth, await correoDe(usuario), clave);
  await anotarNombre(cred.user);
  const tiene = await get(recRef(cred.user.uid)).then(s => s.exists()).catch(() => true);
  return { user: cred.user, needWord: !tiene };
}

// ---------------------------------------------------------------------------
// Palabra de recuperación (sin correo): cada uno elige una palabra que recuerde.
// Se guarda la contraseña CIFRADA con esa palabra en cc_rec/<uid>; con usuario + palabra
// se pone una contraseña nueva. No importan mayúsculas, tildes ni espacios de más.
// ---------------------------------------------------------------------------
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
export const limpiarPalabra = w => String(w || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const limpiarCodigoViejo = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");   // cuentas con el código de antes

async function claveDesde(secreto, salt, vueltas = 150000) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: vueltas, hash: "SHA-256" }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function guardarCifrado(uid, palabra, clave) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await claveDesde(limpiarPalabra(palabra), salt), new TextEncoder().encode(clave));
  await set(recRef(uid), { v: 2, s: b64(salt), i: b64(iv), c: b64(ct), t: Date.now() });
}

// Guarda (o cambia) la palabra de recuperación. Pide la contraseña actual.
export async function saveRecoveryWord(palabra, clave) {
  const user = auth.currentUser; if (!user) throw errorCodigo("cc/no-user");
  if (limpiarPalabra(palabra).length < 3) throw errorCodigo("cc/short-word");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, clave));
  await guardarCifrado(user.uid, palabra, clave);
}

// «Olvidé mi contraseña»: usuario + palabra → contraseña nueva (y queda dentro de la cuenta)
export async function recoverPassword(usuario, palabra, nueva) {
  const dir = (await get(nameRef(usuario)).catch(() => null))?.val();
  const rec = dir && (await get(recRef(dir.uid)).catch(() => null))?.val();
  if (!dir || !rec) throw errorCodigo("cc/no-word");
  let vieja;
  try {
    const k = rec.v === 1 ? await claveDesde(limpiarCodigoViejo(palabra), unb64(rec.s), 250000) : await claveDesde(limpiarPalabra(palabra), unb64(rec.s));
    vieja = new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.i) }, k, unb64(rec.c)));
  } catch (e) { throw errorCodigo("cc/bad-word"); }
  const cred = await signInWithEmailAndPassword(auth, dir.email, vieja);
  await updatePassword(cred.user, nueva);
  await guardarCifrado(cred.user.uid, palabra, nueva);   // la misma palabra sigue sirviendo
  return cred.user;
}

// ---------------------------------------------------------------------------
// Cambiar el nombre de usuario (misma cuenta, mismo uid)
// ---------------------------------------------------------------------------
async function nombreLibre(n) {
  if (await get(nameRef(n)).then(s => s.exists()).catch(() => false)) return false;
  // ¿Ya existe una cuenta antigua con ese nombre? Se prueba creando una cuenta temporal en una
  // conexión aparte (no toca tu sesión) y se borra al instante.
  const tmp = initializeApp(firebaseConfig, "cc-probe-" + Date.now());
  try {
    const cred = await createUserWithEmailAndPassword(getAuth(tmp), aCorreo(n), crypto.randomUUID() + "Aa1!");
    await deleteUser(cred.user).catch(() => {});
    return true;
  } catch (e) {
    if (e && e.code === "auth/email-already-in-use") return false;
    throw e;
  } finally { deleteApp(tmp).catch(() => {}); }
}
export async function renameUser(nuevo) {
  const user = auth.currentUser; if (!user) throw errorCodigo("cc/no-user");
  const n = normalizarUsuario(nuevo), viejo = normalizarUsuario(user.displayName || (user.email || "").split("@")[0]);
  if (n === viejo) throw errorCodigo("cc/same-name");
  if (!(await nombreLibre(n))) throw errorCodigo("auth/email-already-in-use");
  await set(nameRef(n), { uid: user.uid, email: user.email });
  await updateProfile(user, { displayName: n });
  // el nombre anterior se libera, salvo el original de la cuenta (ese queda reservado para ti)
  if (aCorreo(viejo) !== user.email) await remove(nameRef(viejo)).catch(() => {});
  await user.reload().catch(() => {});
  return n;
}

export const logoutUser = () => signOut(auth);

// Experiencia compartida: usuarios/<cuenta>/xp (la escriben los juegos con club-xp.js).
export function watchXp(uid, callback) {
  return onValue(ref(getDatabase(app), "usuarios/" + uid + "/xp"), s => callback(s.val()), () => {});
}

// Avatar: usuarios/<cuenta>/avatar (lo usa club-avatar.js; el menú le pasa estas dos funciones).
export const avatarIO = {
  get: uid => get(ref(getDatabase(app), "usuarios/" + uid + "/avatar")).then(s => s.val()),
  put: (uid, v) => set(ref(getDatabase(app), "usuarios/" + uid + "/avatar"), v)
};

// Avisa cada vez que alguien entra o sale (y una vez al cargar la página).
export const watchUser = callback => onAuthStateChanged(auth, callback);

// Nombre de usuario de la sesión actual ("" si no hay sesión).
export function currentUsername() {
  const u = auth.currentUser;
  if (!u) return "";
  return u.displayName || (u.email ? u.email.split("@")[0] : "");
}

export function friendlyError(err) {
  switch (err && err.code) {
    case "auth/email-already-in-use": return "Ese usuario ya existe. Elige otro.";
    case "cc/no-word": return "Ese usuario no tiene palabra de recuperación.";
    case "cc/bad-word": return "La palabra no es correcta.";
    case "cc/short-word": return "La palabra debe tener al menos 3 letras.";
    case "cc/same-name": return "Ese ya es tu nombre de usuario.";
    case "auth/requires-recent-login": return "Por seguridad, sal y vuelve a entrar, y repite el cambio.";
    case "PERMISSION_DENIED":
    case "permission-denied": return "Firebase no dejó guardar los datos. Revisa las reglas de la base de datos.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials": return "Usuario o contraseña incorrectos.";
    case "auth/weak-password": return "La contraseña debe tener al menos 6 caracteres.";
    case "auth/network-request-failed": return "No hay conexión a internet. Inténtalo de nuevo.";
    case "auth/too-many-requests": return "Demasiados intentos. Espera unos minutos e inténtalo otra vez.";
    case "auth/operation-not-allowed": return "Falta activar “Correo electrónico/contraseña” en Firebase → Authentication.";
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
    case "auth/configuration-not-found": return "Revisa los datos de firebase-config.js.";
    default: return "No se pudo completar la acción. Inténtalo otra vez.";
  }
}
