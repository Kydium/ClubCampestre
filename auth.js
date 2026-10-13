// Cuenta única de Club Campestre (usuario + contraseña con Firebase Authentication).
// Los juegos pueden importar este mismo archivo:
//   import { watchUser, currentUsername, logoutUser } from "../auth.js";
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig, isConfigured } from "./firebase-config.js";

export { isConfigured };

const DOMINIO = "clubcampestre.app";          // correo "falso": usuario@clubcampestre.app
const REGLA_USUARIO = /^[a-z0-9_]{3,16}$/;

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

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

export async function registerUser(usuario, clave) {
  const u = normalizarUsuario(usuario);
  const cred = await createUserWithEmailAndPassword(auth, aCorreo(u), clave);
  await updateProfile(cred.user, { displayName: u });
  return cred.user;
}

export async function loginUser(usuario, clave) {
  const cred = await signInWithEmailAndPassword(auth, aCorreo(usuario), clave);
  return cred.user;
}

export const logoutUser = () => signOut(auth);

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
    case "auth/email-already-in-use": return "Ese usuario ya existe. Elige otro o entra con tu contraseña.";
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
