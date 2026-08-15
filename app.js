import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
let matchesData = [];
let lineChart = null; 
let pieChart = null;

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
    generateSmartComment(document.getElementById("stats-player-select").value);
});

// --- CLASSIFICA E GIOCATORI ---
onSnapshot(query(playersRef, orderBy("rating", "desc")), (snapshot) => {
    const rankingList = document.getElementById("ranking-list");
    const selects = [document.getElementById("winner"), document.getElementById("loser"), document.getElementById("delete-player-select"), document.getElementById("stats-player-select")];
    
    rankingList.innerHTML = "";
    selects[0].innerHTML = '<option value="">Seleziona...</option>';
    selects[1].innerHTML = '<option value="">Seleziona...</option>';
    selects[2].innerHTML = '<option value="">Seleziona per eliminare...</option>';
    selects[3].innerHTML = '<option value="general">📊 Statistiche Generali (Gruppo)</option>';
    
    playersData = [];
    let pos = 1;

    snapshot.forEach((doc) => {
        const player = doc.data();
        player.id = doc.id;
        playersData.push(player);
        
        rankingList.innerHTML += `<tr><td>${pos}°</td><td>${player.name}</td><td><strong>${Math.round(player.rating)}</strong></td><td>${player.wins} - ${player.losses}</td></tr>`;
        const opt = `<option value="${player.id}">${player.name}</option>`;
        selects.forEach(s => s.innerHTML += opt);
        pos++;
    });
});

// --- STORICO PARTITE (Con funzione Elimina Reversibile) ---
onSnapshot(query(matchesRef, orderBy("timestamp", "desc")), (snapshot) => {
    const historyList = document.getElementById("history-list");
    historyList.innerHTML = "";
    matchesData = [];
    
    if(snapshot.empty) return historyList.innerHTML = "<p>Nessuna partita giocata ancora.</p>";

    snapshot.forEach((docSnap) => {
        const match = docSnap.data();
        match.id = docSnap.id;
        matchesData.push(match);

        const wName = playersData.find(p => p.id === match.winner)?.name || "Ignoto";
        const lName = playersData.find(p => p.id === match.loser)?.name || "Ignoto";
        const date = match.timestamp ? match.timestamp.toDate().toLocaleDateString("it-IT", {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : "Ora";
        
        historyList.innerHTML += `
            <div class="history-item">
                <div class="history-info">
                    <div class="match-title">🥇 ${wName} (${match.winnerScore}) vs 🥈 ${lName} (${match.loserScore})</div>
                    <div class="match-meta">📅 ${date} | 📈 Punti: ${match.pointsExchanged} ${match.notes ? `<br><em>Note: ${match.notes}</em>` : ''}</div>
                </div>
                <button class="btn-delete-match" onclick="deleteMatch('${match.id}', '${match.winner}', '${match.loser}', ${match.pointsExchanged})">Annulla</button>
            </div>
        `;
    });
});

// Funzione Globale per eliminare la partita e ricalcolare l'Elo
window.deleteMatch = async (matchId, winnerId, loserId, pointsExchanged) => {
    if(!confirm("Vuoi annullare questa partita? I punti verranno restituiti ai giocatori e la classifica verrà sistemata.")) return;
    
    try {
        const wSnap = await getDoc(doc(db, "players", winnerId));
        const lSnap = await getDoc(doc(db, "players", loserId));
        
        if (wSnap.exists()) {
            const wData = wSnap.data();
            await updateDoc(doc(db, "players", winnerId), { rating: wData.rating - pointsExchanged, wins: Math.max(0, wData.wins - 1) });
        }
        if (lSnap.exists()) {
            const lData = lSnap.data();
            await updateDoc(doc(db, "players", loserId), { rating: lData.rating + pointsExchanged, losses: Math.max(0, lData.losses - 1) });
        }
        
        await deleteDoc(doc(db, "matches", matchId));
        alert("Partita annullata con successo. Classifica ripristinata!");
    } catch(e) { alert("Errore durante l'annullamento."); console.error(e); }
};

// --- AGGIUNGI / ELIMINA GIOCATORE E SALVA PARTITA (Rimasti invariati rispetto a prima, funzionano benissimo) ---
document.getElementById("player-form").addEventListener("submit", async (e) => { e.preventDefault(); const n = document.getElementById("new-player-name").value.trim(); if (n) { await setDoc(doc(playersRef, n.toLowerCase()), { name: n, rating: 1000, wins: 0, losses: 0 }); document.getElementById("new-player-name").value = ""; }});
document.getElementById("delete-player-btn").addEventListener("click", async () => { const id = document.getElementById("delete-player-select").value; if(id && confirm("Sei sicuro?")) { await deleteDoc(doc(playersRef, id)); }});

document.getElementById("match-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const winnerId = document.getElementById("winner").value; const loserId = document.getElementById("loser").value;
    if (winnerId === loserId) return alert("Scegli due giocatori diversi!");
    const btn = document.getElementById("save-match-btn"); btn.disabled = true;

    try {
        const wData = (await getDoc(doc(db, "players", winnerId))).data();
        const lData = (await getDoc(doc(db, "players", loserId))).data();
        
        let formatMultiplier = 1;
        const format = document.getElementById("format").value;
        if(format === "21") formatMultiplier = 1.2;
        if(format === "bo3_11") formatMultiplier = 1.5; if(format === "bo3_21") formatMultiplier = 1.8; if(format === "bo5") formatMultiplier = 2.0;

        const expectedWinner = 1 / (1 + Math.pow(10, (lData.rating - wData.rating) / 400));
        let points = Math.max(1, Math.round(32 * (1 - expectedWinner) * formatMultiplier));

        const newWR = wData.rating + points; const newLR = lData.rating - points;
        await updateDoc(doc(db, "players", winnerId), { rating: newWR, wins: wData.wins + 1 });
        await updateDoc(doc(db, "players", loserId), { rating: newLR, losses: lData.losses + 1 });

        await addDoc(matchesRef, {
            winner: winnerId, loser: loserId, winnerScore: document.getElementById("score-winner").value, loserScore: document.getElementById("score-loser").value,
            format: format, notes: document.getElementById("match-notes").value, pointsExchanged: points, winnerNewRating: newWR, loserNewRating: newLR, timestamp: serverTimestamp()
        });
        document.getElementById("match-form").reset();
    } catch(e) { console.error(e); }
    btn.disabled = false;
});

// --- L'ORACOLO AVANZATO E GRAFICI REALI ---
document.getElementById("stats-player-select").addEventListener("change", (e) => generateSmartComment(e.target.value));

function generateSmartComment(playerId) {
    const commentBox = document.getElementById("ai-comment");
    const extraBox = document.getElementById("extra-stats");
    extraBox.innerHTML = ""; // Resetta stats extra
    
    if(playersData.length === 0) return commentBox.innerText = "Attendo giocatori...";
    
    // Grafico a Ciambella visibile solo per i singoli
    document.getElementById("chart-container-pie").style.display = playerId === "general" ? "none" : "block";

    if(playerId === "general") {
        const sorted = [...playersData].sort((a,b) => b.rating - a.rating);
        const leader = sorted[0];
        const last = sorted[sorted.length -1];
        
        const frasi = [
            `🎙️ "Classifica incandescente! ${leader.name} guida il gruppo con classe (Rating: ${Math.round(leader.rating)}). Tutti vogliono la sua testa. ${last.name} chiude la fila, ma a ping pong basta una serata magica per ribaltare tutto!"`,
            `🎙️ "Situazione al tavolo: ${leader.name} sembra inarrestabile. Ma attenzione alle retrovie, il livello medio si sta alzando in modo vertiginoso!"`,
            `🎙️ "Che gruppo! Al momento lo scettro è di ${leader.name}. Chi avrà il coraggio di sfidarlo in una Bo5 stasera?"`
        ];
        commentBox.innerText = frasi[Math.floor(Math.random() * frasi.length)];
        drawRealCharts("general", null);
        return;
    }

    // --- ANALISI SINGOLO GIOCATORE ---
    const p = playersData.find(x => x.id === playerId);
    const totalMatches = p.wins + p.losses;
    const winRate = totalMatches > 0 ? Math.round((p.wins / totalMatches) * 100) : 0;
    
    // Trova Nemesi e Vittima preferita scorrendo le partite
    let opponents = {};
    matchesData.forEach(m => {
        if(m.winner === playerId) { opponents[m.loser] = opponents[m.loser] || {w:0, l:0}; opponents[m.loser].w++; }
        if(m.loser === playerId) { opponents[m.winner] = opponents[m.winner] || {w:0, l:0}; opponents[m.winner].l++; }
    });

    let bestOp = null; let bestWins = 0;
    let worstOp = null; let worstLoss = 0;
    for(const [opId, stats] of Object.entries(opponents)) {
        if(stats.w > bestWins) { bestWins = stats.w; bestOp = opId; }
        if(stats.l > worstLoss) { worstLoss = stats.l; worstOp = opId; }
    }
    
    const nBest = bestOp ? (playersData.find(x=>x.id===bestOp)?.name || "?") : "Nessuno";
    const nWorst = worstOp ? (playersData.find(x=>x.id===worstOp)?.name || "?") : "Nessuno";

    // Costruzione dinamica del commento AI
    let comment = `🎙️ "Analisi su ${p.name}: `;
    
    if(totalMatches < 3) comment += `Ancora in fase di riscaldamento. Ha bisogno di giocare più partite per mostrare il suo vero valore. "`;
    else {
        if(winRate >= 65) comment += `Forma smagliante! Con un Win Rate del ${winRate}% è un vero e proprio cecchino. Ha una percentuale di conversione pazzesca. "`;
        else if(winRate >= 45) comment += `Giocatore solido (Win Rate: ${winRate}%). Alterna colpi da maestro a cali di concentrazione, ma è un avversario rognoso per tutti. "`;
        else comment += `Momento di flessione (Win Rate: ${winRate}%). I numeri dicono che sta faticando, ma il talento non si discute. Basterà ritrovare il dritto giusto! "`;

        if(worstOp && worstLoss >= 2) comment += `Deve assolutamente capire come battere ${nWorst}, che si sta rivelando la sua vera e propria bestia nera. "`;
        else if(bestOp && bestWins >= 2) comment += `Quando vede ${nBest} dall'altra parte della retina si esalta sempre. "`;
    }

    commentBox.innerText = comment;
    
    // Popola i box extra
    extraBox.innerHTML = `
        <div class="stat-box"><span>Partite Giocate</span><strong>${totalMatches}</strong></div>
        <div class="stat-box"><span>Vittima Preferita</span><strong>${nBest}</strong></div>
        <div class="stat-box"><span>Bestia Nera</span><strong>${nWorst}</strong></div>
    `;

    drawRealCharts("single", p);
}

// --- DISEGNO GRAFICI CON DATI REALI ---
function drawRealCharts(type, playerObj) {
    if(lineChart) lineChart.destroy();
    if(pieChart) pieChart.destroy();

    const ctxLine = document.getElementById('rankingChart').getContext('2d');
    
    if(type === "general") {
        // Grafico Dummy per il Generale (In futuro si può fare la Top 3)
        lineChart = new Chart(ctxLine, { type: 'line', data: { labels: ['Aggiungi partite per vederle qui'], datasets: [{ label: 'Generale', data: [1000], borderColor: '#ccc' }] } });
    } else {
        // Grafico Linea: Andamento Punti del Singolo Giocatore
        const pMatches = matchesData.filter(m => m.winner === playerObj.id || m.loser === playerObj.id).reverse(); // Dal più vecchio al più nuovo
        
        let labels = ['Inizio'];
        let dataPoints = [1000]; // Partono tutti da 1000
        
        pMatches.forEach((m, index) => {
            labels.push(`Match ${index + 1}`);
            // Usa il rating salvato nel match (winnerNewRating o loserNewRating)
            if(m.winner === playerObj.id && m.winnerNewRating) dataPoints.push(m.winnerNewRating);
            else if(m.loser === playerObj.id && m.loserNewRating) dataPoints.push(m.loserNewRating);
            else dataPoints.push(dataPoints[dataPoints.length - 1]); // Fallback
        });

        lineChart = new Chart(ctxLine, {
            type: 'line',
            data: { labels: labels, datasets: [{ label: `Punti di ${playerObj.name}`, data: dataPoints, borderColor: '#e63946', backgroundColor: 'rgba(230, 57, 70, 0.2)', borderWidth: 3, tension: 0.1, fill: true }] },
            options: { responsive: true }
        });

        // Grafico a Ciambella: Win Rate
        const ctxPie = document.getElementById('winRateChart').getContext('2d');
        pieChart = new Chart(ctxPie, {
            type: 'doughnut',
            data: {
                labels: ['Vittorie', 'Sconfitte'],
                datasets: [{ data: [playerObj.wins, playerObj.losses], backgroundColor: ['#2a9d8f', '#d62828'], hoverOffset: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}