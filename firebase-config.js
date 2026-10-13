// Datos de conexión del proyecto Firebase que usan todos los juegos.
export const firebaseConfig = {
  apiKey: "AIzaSyBfrs6B-j22O67pnUb5DYq5CevrIg0dtEs",
  authDomain: "project-349e4491-0828-4f64-bb5.firebaseapp.com",
  databaseURL: "https://project-349e4491-0828-4f64-bb5-default-rtdb.firebaseio.com",
  projectId: "project-349e4491-0828-4f64-bb5",
  storageBucket: "project-349e4491-0828-4f64-bb5.firebasestorage.app",
  messagingSenderId: "180444249462",
  appId: "1:180444249462:web:bdf189d171d908a0274e57",
  measurementId: "G-26KF5MSDNR"
};

// Si algún día vuelves a dejar "PEGA_AQUI" en apiKey, el menú abre sin pedir cuenta.
export const isConfigured = !String(firebaseConfig.apiKey).startsWith("PEGA_AQUI");
