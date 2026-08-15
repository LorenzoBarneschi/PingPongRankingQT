import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBv0C_tgvchxbG6xrvtj9ypeN_ARmvIhdA",
    authDomain: "pingpongrankingqt.firebaseapp.com",
    projectId: "pingpongrankingqt"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const playersRef = collection(db, "players");
const matchesRef = collection(db, "matches");

let playersData = []; 
let myChart = null; // Variabile per il grafico

// --- NAVIGAZIONE TABS ---
function switchTab(tabId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`view-${tabId}`).classList.add('active-view');
    document.getElementById(`nav-${tabId}`).classList.add('active');
}
document.getElementById("nav-arena").addEventListener("click", () => switchTab('arena'));
document.getElementById("nav-history").addEventListener("click", () => switchTab('history'));
document.getElementById("nav-stats").addEventListener("click", () => {
    switchTab('stats');
    generateSmartComment("general"); // Aggiorna le statistiche all'apertura
});

// --- CLASSIFICA E POPOLAMENTO MENU ---
onSnapshot(query(playersRef, orderBy("rating", "desc")), (snapshot) => {
    const rankingList = document.getElementById("ranking-list");
    const selects = [document.getElementById("winner"), document.getElementById("loser"), document.getElementById("delete-player-select"), document.getElementById("stats-player-select")];
    
    rankingList.innerHTML = "";
    // Resetta le option dei select tranne lo stats (che ha l'opzione Generale fissa)
    selects[0].innerHTML = '<option value="">Seleziona...</option>';
    selects[1].innerHTML = '<option value="">Seleziona...</option>';
    selects[2].innerHTML = '<option value="">Seleziona per eliminare...</option>';
    selects[3].innerHTML = '<option value="general">📊 Statistiche Generali (Gruppo)</option>';
    
    playersData = [];
    let pos = 1;

    snapshot.forEach((doc) => {
        const player = doc.data();
        const id = doc.id;
        player.id = id;
        playersData.push(player);
        
        rankingList.innerHTML += `<tr><td>${pos}°</td><td>${player.name}</td><td><strong>${Math.round(player.rating)}</strong></td><td>${player.wins} - ${player.losses}</td></tr>`;
        
        const optionHTML = `<option value="${id}">${player.name}</option>`;
        selects[0].innerHTML += optionHTML;
        selects[1].innerHTML += optionHTML;
        selects[2].innerHTML += optionHTML;
        selects[3].innerHTML += optionHTML;
        pos++;
    });
});

// --- STORICO PARTITE ---
onSnapshot(query(matchesRef, orderBy("timestamp", "desc")), (snapshot) => {
    const historyList = document.getElementById("history-list");
    historyList.innerHTML = "";
    
    if(snapshot.empty) {
        historyList.innerHTML = "<p>Nessuna partita giocata ancora.</p>";
        return;
    }

    snapshot.forEach((doc) => {
        const match = doc.data();
        // Cerca i nomi reali (se cancellati, mostrerà l'ID vecchio)
        const wName = playersData.find(p => p.id === match.winner)?.name || "Giocatore eliminato";
        const lName = playersData.find(p => p.id === match.loser)?.name || "Giocatore eliminato";
        
        const date = match.timestamp ? match.timestamp.toDate().toLocaleDateString("it-IT", {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : "Poco fa";
        const notesHTML = match.notes ? `<br><em>Note: ${match.notes}</em>` : '';
        
        historyList.innerHTML += `
            <div class="history-item">
                <div class="match-title">🥇 ${wName} (${match.winnerScore}) vs 🥈 ${lName} (${match.loserScore})</div>
                <div class="match-meta">
                    📅 ${date} | Formato: ${match.format} <br>
                    📈 Punti scambiati: <strong>${match.pointsExchanged}</strong>
                    ${notesHTML}
                </div>
            </div>
        `;
    });
});

// --- AGGIUNGI / ELIMINA GIOCATORE ---
document.getElementById("player-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("new-player-name").value.trim();
    if (name) {
        await setDoc(doc(playersRef, name.toLowerCase()), { name: name, rating: 1000, wins: 0, losses: 0 });
        document.getElementById("new-player-name").value = "";
    }
});

document.getElementById("delete-player-btn").addEventListener("click", async () => {
    const playerId = document.getElementById("delete-player-select").value;
    if(!playerId) return alert("Seleziona un giocatore.");
    if(confirm("Sei sicuro? Il giocatore verrà rimosso dalla classifica! (Lo storico partite rimarrà)")) {
        await deleteDoc(doc(playersRef, playerId));
        alert("Giocatore eliminato.");
    }
});

// --- SALVA PARTITA (Con Formati Avanzati) ---
document.getElementById("match-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("save-match-btn");
    btn.disabled = true;

    const winnerId = document.getElementById("winner").value;
    const loserId = document.getElementById("loser").value;
    const format = document.getElementById("format").value;
    const scoreW = document.getElementById("score-winner").value;
    const scoreL = document.getElementById("score-loser").value;
    const notes = document.getElementById("match-notes").value;
    
    if (winnerId === loserId) {
        alert("Scegli due giocatori diversi!");
        btn.disabled = false; return;
    }

    try {
        const winnerSnap = await getDoc(doc(db, "players", winnerId));
        const loserSnap = await getDoc(doc(db, "players", loserId));
        const wData = winnerSnap.data();
        const lData = loserSnap.data();

        // Moltiplicatori Formato
        let formatMultiplier = 1;
        if(format === "21") formatMultiplier = 1.2;
        if(format === "bo3_11") formatMultiplier = 1.5;
        if(format === "bo3_21") formatMultiplier = 1.8;
        if(format === "bo5") formatMultiplier = 2.0;

        const expectedWinner = 1 / (1 + Math.pow(10, (lData.rating - wData.rating) / 400));
        let points = Math.round(32 * (1 - expectedWinner) * formatMultiplier);
        if (points < 1) points = 1;

        const newWinnerRating = wData.rating + points;
        const newLoserRating = lData.rating - points;

        await updateDoc(doc(db, "players", winnerId), { rating: newWinnerRating, wins: wData.wins + 1 });
        await updateDoc(doc(db, "players", loserId), { rating: newLoserRating, losses: lData.losses + 1 });

        await addDoc(matchesRef, {
            winner: winnerId, loser: loserId,
            winnerScore: scoreW, loserScore: scoreL,
            format: format, notes: notes,
            pointsExchanged: points,
            timestamp: serverTimestamp()
        });

        alert(`Salvato! Punti scambiati: ${points}`);
        document.getElementById("match-form").reset();
    } catch (error) {
        console.error(error);
        alert("Errore salvataggio.");
    }
    btn.disabled = false;
});

// --- STATISTICHE, GRAFICI E "LA VOCE DEL TAVOLO" ---
document.getElementById("stats-player-select").addEventListener("change", (e) => {
    generateSmartComment(e.target.value);
});

function generateSmartComment(playerId) {
    const commentBox = document.getElementById("ai-comment");
    
    if(playersData.length === 0) return commentBox.innerText = "Aggiungi giocatori per iniziare.";

    if(playerId === "general") {
        // Commento di Gruppo
        const sorted = [...playersData].sort((a,b) => b.rating - a.rating);
        const leader = sorted[0];
        commentBox.innerText = `🎙️ "Situazione generale: Il tavolo è dominato da ${leader.name} con ${Math.round(leader.rating)} punti. Chi riuscirà a buttarlo giù dal trono? Il livello si sta alzando partita dopo partita!"`;
        drawDummyChart("general"); // In futuro metteremo i dati veri qui
    } else {
        // Commento Singolo
        const player = playersData.find(p => p.id === playerId);
        const winRate = player.wins + player.losses > 0 ? Math.round((player.wins / (player.wins + player.losses)) * 100) : 0;
        
        let comment = `🎙️ "Analisi su ${player.name}: Attualmente ha ${Math.round(player.rating)} punti. `;
        if(winRate > 60) comment += `Un vero cecchino! Con il ${winRate}% di vittorie, è uno spauracchio per chiunque."`;
        else if(winRate < 40) comment += `Sta attraversando un periodo buio (Win Rate: ${winRate}%). Ma la ruota gira, serve solo allenare il rovescio!"`;
        else comment += `Molto bilanciato (Win Rate: ${winRate}%). Alterna ottime giocate a blackout, ma c'è potenziale."`;
        
        commentBox.innerText = comment;
        drawDummyChart(player.name);
    }
}

// Funzione Grafico (Per ora Dummy, poi lo colleghiamo allo storico partite se ti piace esteticamente)
function drawDummyChart(labelName) {
    const ctx = document.getElementById('rankingChart').getContext('2d');
    if(myChart) myChart.destroy(); // Distrugge il vecchio grafico prima di creare il nuovo
    
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Inizio', 'Partita 1', 'Partita 2', 'Partita 3', 'Oggi'],
            datasets: [{
                label: labelName === 'general' ? 'Media Punti del Gruppo' : `Andamento Punti - ${labelName}`,
                data: [1000, 1015, 990, 1020, 1045], // Dati finti per vedere come appare
                borderColor: '#e63946',
                backgroundColor: 'rgba(230, 57, 70, 0.2)',
                borderWidth: 3,
                tension: 0.3,
                fill: true
            }]
        },
        options: { responsive: true, scales: { y: { min: 950 } } }
    });
}