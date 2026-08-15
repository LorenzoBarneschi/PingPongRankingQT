// Importiamo Firebase (dal web)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Le tue chiavi Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBv0C_tgvchxbG6xrvtj9ypeN_ARmvIhdA",
  authDomain: "pingpongrankingqt.firebaseapp.com",
  projectId: "pingpongrankingqt",
  storageBucket: "pingpongrankingqt.firebasestorage.app",
  messagingSenderId: "821761508750",
  appId: "1:821761508750:web:68c583ff2be7feb5f810df"
};

// Inizializziamo l'app e il Database
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

console.log("Firebase collegato con successo! 🏓");

// --- IL RESTO DELLA LOGICA LA SCRIVEREMO QUI ---
// (Es. caricare i giocatori, inviare i dati al database, formula Elo decrescente)