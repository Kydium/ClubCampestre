// Pega aquí el bloque firebaseConfig que ya usas en tus juegos
// (Firebase → Configuración del proyecto → Tus apps → Configuración del SDK).
export const firebaseConfig = {
  apiKey: "PEGA_AQUI_TU_API_KEY",
  authDomain: "PEGA_AQUI.firebaseapp.com",
  databaseURL: "https://PEGA_AQUI-default-rtdb.firebaseio.com",
  projectId: "PEGA_AQUI",
  storageBucket: "PEGA_AQUI.appspot.com",
  messagingSenderId: "PEGA_AQUI",
  appId: "PEGA_AQUI"
};

// Mientras no pegues tus datos reales, el menú funciona sin pedir inicio de sesión.
export const isConfigured = !String(firebaseConfig.apiKey).startsWith("PEGA_AQUI");
