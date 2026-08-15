import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, setDoc, getDoc, updateDoc, serverTimestamp, getDocs, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBv0C_tgvchxbG6xrvtj9ypeN_ARmvIhdA",
    authDomain: "pingpongrankingqt.firebaseapp.com",
    projectId: "pingpongrankingqt",
    storageBucket: "pingpongrankingqt.firebasestorage.app",
    messagingSenderId: "821761508750",
    appId: "1:821761508750:web:68c583ff2be7feb5f810df"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- 1. GESTIONE GIOCATORI E CLASSIFICA ---
const playersRef = collection(db, "players");
const matchesRef = collection(db, "matches");

// Ascolta in tempo reale la classifica dal DB
onSnapshot(query(playersRef, orderBy("rating", "desc")), (snapshot) => {
    const rankingList = document.getElementById("ranking-list");
    const winnerSelect = document.getElementById("winner");
    const loserSelect = document.getElementById("loser");
    
    rankingList.innerHTML = "";
    winnerSelect.innerHTML = '<option value="">Seleziona...</option>';
    loserSelect.innerHTML = '<option value="">Seleziona...</option>';

    let pos = 1;
    snapshot.forEach((doc) => {
        const player = doc.data();
        const id = doc.id;
        
        // Aggiorna tabella
        rankingList.innerHTML += `
            <tr>
                <td>${pos}°</td>
                <td>${player.name}</td>
                <td><strong>${Math.round(player.rating)}</strong></td>
                <td>${player.wins} - ${player.losses}</td>
            </tr>
        `;
        pos++;

        // Aggiorna menu a tendina
        winnerSelect.innerHTML += `<option value="${id}">${player.name}</option>`;
        loserSelect.innerHTML += `<option value="${id}">${player.name}</option>`;
    });

    if(snapshot.empty) {
        rankingList.innerHTML = `<tr><td colspan="4">Nessun giocatore. Aggiungine uno!</td></tr>`;
    }
});

// Aggiungi nuovo giocatore (parte da 1000 punti)
document.getElementById("player-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("new-player-name");
    const name = nameInput.value.trim();
    
    if (name) {
        await setDoc(doc(playersRef, name.toLowerCase()), {
            name: name,
            rating: 1000, // Punteggio iniziale
            wins: 0,
            losses: 0
        });
        nameInput.value = "";
        alert(`${name} aggiunto al torneo!`);
    }
});

// --- 2. LOGICA DELLA PARTITA E FORMULA ELO ---
document.getElementById("match-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("save-match-btn");
    btn.disabled = true;
    btn.innerText = "Salvataggio...";

    const winnerId = document.getElementById("winner").value;
    const loserId = document.getElementById("loser").value;
    const scoreW = parseInt(document.getElementById("score-winner").value);
    const scoreL = parseInt(document.getElementById("score-loser").value);
    const format = document.getElementById("format").value;
    const notes = document.getElementById("match-notes").value;

    if (winnerId === loserId) {
        alert("Un giocatore non può giocare contro se stesso!");
        btn.disabled = false;
        btn.innerText = "Salva Risultato";
        return;
    }

    // Prendi i dati attuali dei giocatori
    const winnerSnap = await getDoc(doc(db, "players", winnerId));
    const loserSnap = await getDoc(doc(db, "players", loserId));
    const winnerData = winnerSnap.data();
    const loserData = loserSnap.data();

    // --- CALCOLO ELO ---
    const K = 32; // Fattore K base
    
    // Probabilità di vittoria (Formula standard Elo)
    const expectedWinner = 1 / (1 + Math.pow(10, (loserData.rating - winnerData.rating) / 400));
    
    // Moltiplicatore Formato
    let formatMultiplier = 1;
    if (format === "21") formatMultiplier = 1.2;
    if (format === "bo3") formatMultiplier = 1.5;

    // Controllo Partite Ripetute nella stessa giornata (Penalità spam)
    // Cerchiamo le partite di oggi tra questi due
    const today = new Date();
    today.setHours(0,0,0,0);
    const qMatches = query(matchesRef, orderBy("timestamp", "desc"));
    const matchesSnap = await getDocs(qMatches);
    
    let matchesToday = 0;
    matchesSnap.forEach(docSnap => {
        const m = docSnap.data();
        if (!m.timestamp) return;
        const matchDate = m.timestamp.toDate();
        if (matchDate >= today) {
            if ((m.winner === winnerId && m.loser === loserId) || (m.winner === loserId && m.loser === winnerId)) {
                matchesToday++;
            }
        }
    });

    let spamPenalty = 1; // 100% dei punti
    if (matchesToday >= 3) spamPenalty = 0.5; // Dalla 4° partita punti dimezzati
    if (matchesToday >= 7) spamPenalty = 0.2; // Dalla 8° partita punti ridotti all'80%

    // Punti scambiati
    let pointsExchanged = Math.round(K * (1 - expectedWinner) * formatMultiplier * spamPenalty);
    if (pointsExchanged < 1) pointsExchanged = 1; // Minimo 1 punto scambiato sempre

    // Aggiorna giocatori nel Database
    await updateDoc(doc(db, "players", winnerId), {
        rating: winnerData.rating + pointsExchanged,
        wins: winnerData.wins + 1
    });

    await updateDoc(doc(db, "players", loserId), {
        rating: loserData.rating - pointsExchanged,
        losses: loserData.losses + 1
    });

    // Salva lo storico della partita
    await addDoc(matchesRef, {
        winner: winnerId,
        loser: loserId,
        winnerScore: scoreW,
        loserScore: scoreL,
        format: format,
        notes: notes,
        pointsExchanged: pointsExchanged,
        timestamp: serverTimestamp()
    });

    alert(`Partita salvata! ${winnerData.name} vince +${pointsExchanged} punti.`);
    
    // Reset Form
    document.getElementById("match-form").reset();
    btn.disabled = false;
    btn.innerText = "Salva Risultato";
});