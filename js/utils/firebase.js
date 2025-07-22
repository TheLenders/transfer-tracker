import { getDatabase, ref, get, set, remove } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

// 🔐 Your config (can eventually be in .env if using Node/Server)
const firebaseConfig = {
  apiKey: "AIzaSyA5gDeYoz8S3R3j3UXgq1GgvYuTD6HOHEY",
  authDomain: "transfertrackerapp.firebaseapp.com",
  projectId: "transfertrackerapp",
  storageBucket: "transfertrackerapp.appspot.com",
  messagingSenderId: "134039442458",
  appId: "1:134039442458:web:bd9ee250cbbb4911aceda3",
  measurementId: "G-8PZFFB6XSM"
};

// 🔌 Init only once
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// 🔁 General helpers
export function dbRef(path) {
  return ref(db, path);
}

export async function dbGet(path) {
  const snap = await get(dbRef(path));
  return snap.exists() ? snap.val() : null;
}

export async function dbSet(path, value) {
  return set(dbRef(path), value);
}

export async function dbRemove(path) {
  return remove(dbRef(path));
}