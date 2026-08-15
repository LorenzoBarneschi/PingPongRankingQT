import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, setDoc, getDoc, updateDoc, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

// Imposta Data e Ora attuali nel form
window.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('match-date').value = now.toISOString().slice(0,16);
});

// Mostra/Nascondi form custom
document.getElementById('format').addEventListener('change', (e) => {
    const customDiv = document.getElementById('custom-format-details');
    customDiv.style.display = e.target.value === 'custom' ? 'block' : 'none';
});

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

// --- CLASSIFICA ---
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
        const player = doc.data(); player.id = doc.id; playersData.push(player);
        rankingList.innerHTML += `<tr><td>${pos}°</td><td>${player.name}</td><td><strong>${Math.round(player.rating)}</strong></td><td>${player.wins} - ${player.losses}</td></tr>`;
        const opt = `<option value="${player.id}">${player.name}</option>`;
        selects.forEach(s => s.innerHTML += opt);
        pos++;
    });
});

// --- STORICO ---
onSnapshot(query(matchesRef, orderBy("timestamp", "desc")), (snapshot) => {
    const historyList = document.getElementById("history-list");
    historyList.innerHTML = ""; matchesData = [];
    if(snapshot.empty) return historyList.innerHTML = "<p>Nessuna partita giocata ancora.</p>";

    snapshot.forEach((docSnap) => {
        const match = docSnap.data(); match.id = docSnap.id; matchesData.push(match);
        const wName = playersData.find(p => p.id === match.winner)?.name || "Ignoto";
        const lName = playersData.find(p => p.id === match.loser)?.name || "Ignoto";
        const date = match.timestamp ? match.timestamp.toDate().toLocaleDateString("it-IT", {day:'numeric', month:'short', year:'2-digit'}) : "Ora";
        
        let formatDisplay = match.format;
        if(match.format === 'custom') formatDisplay = `Custom (Bo${match.customSets} a ${match.customPoints})`;

        historyList.innerHTML += `
            <div class="history-item">
                <div class="history-info">
                    <div class="match-title">🥇 ${wName} (${match.winnerScore}) vs 🥈 ${lName} (${match.loserScore})</div>
                    <div class="match-meta">📅 ${date} | Fmt: ${formatDisplay} | 📈 Punti: ${match.pointsExchanged} ${match.notes ? `<br><em>Note: ${match.notes}</em>` : ''}</div>
                </div>
                <button class="btn-delete-match" onclick="deleteMatch('${match.id}', '${match.winner}', '${match.loser}', ${match.pointsExchanged})">Annulla</button>
            </div>
        `;
    });
});

window.deleteMatch = async (matchId, winnerId, loserId, pointsExchanged) => {
    if(!confirm("Vuoi annullare questa partita? I punti verranno restituiti.")) return;
    try {
        const wSnap = await getDoc(doc(db, "players", winnerId));
        const lSnap = await getDoc(doc(db, "players", loserId));
        if (wSnap.exists()) await updateDoc(doc(db, "players", winnerId), { rating: wSnap.data().rating - pointsExchanged, wins: Math.max(0, wSnap.data().wins - 1) });
        if (lSnap.exists()) await updateDoc(doc(db, "players", loserId), { rating: lSnap.data().rating + pointsExchanged, losses: Math.max(0, lSnap.data().losses - 1) });
        await deleteDoc(doc(db, "matches", matchId));
    } catch(e) { console.error(e); }
};

// Aggiungi / Elimina
document.getElementById("player-form").addEventListener("submit", async (e) => { e.preventDefault(); const n = document.getElementById("new-player-name").value.trim(); if (n) { await setDoc(doc(playersRef, n.toLowerCase()), { name: n, rating: 1000, wins: 0, losses: 0 }); document.getElementById("new-player-name").value = ""; }});
document.getElementById("delete-player-btn").addEventListener("click", async () => { const id = document.getElementById("delete-player-select").value; if(id && confirm("Sei sicuro?")) await deleteDoc(doc(playersRef, id)); });

// --- SALVATAGGIO PARTITA (Con Data Retroattiva, Penalità Spam e Formato Custom) ---
document.getElementById("match-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const winnerId = document.getElementById("winner").value; const loserId = document.getElementById("loser").value;
    if (winnerId === loserId) return alert("Scegli giocatori diversi!");
    const btn = document.getElementById("save-match-btn"); btn.disabled = true;

    try {
        const wData = (await getDoc(doc(db, "players", winnerId))).data();
        const lData = (await getDoc(doc(db, "players", loserId))).data();
        
        // Lettura Data Manuale
        const matchDateStr = document.getElementById('match-date').value;
        const matchDateObj = new Date(matchDateStr);
        const matchTimestamp = Timestamp.fromDate(matchDateObj); // Converte per Firebase

        // Formato e Moltiplicatore
        const format = document.getElementById("format").value;
        let formatMultiplier = 1;
        let customSets = null, customPoints = null;

        if(format === "21") formatMultiplier = 1.2;
        else if(format === "bo3_11") formatMultiplier = 1.5;
        else if(format === "bo3_21") formatMultiplier = 1.8;
        else if(format === "custom") {
            customSets = parseInt(document.getElementById("custom-sets").value);
            customPoints = parseInt(document.getElementById("custom-points").value);
            // Calcolo moltiplicatore custom: base 1.0 + (bonus per i set) + (bonus per i punti)
            formatMultiplier = 1.0 + (customSets > 1 ? (customSets-1)*0.25 : 0) + (customPoints > 11 ? (customPoints-11)*0.02 : 0);
        }

        // Sistema Anti-Spam retroattivo (Conta le partite di QUELLA data)
        let matchesThatDay = 0;
        const targetDateString = matchDateObj.toDateString(); // Es. "Tue Aug 15 2023"
        matchesData.forEach(m => {
            if(m.timestamp && m.timestamp.toDate().toDateString() === targetDateString) {
                if((m.winner === winnerId && m.loser === loserId) || (m.winner === loserId && m.loser === winnerId)) {
                    matchesThatDay++;
                }
            }
        });

        // Penalità Spam
        let spamPenalty = 1.0;
        if (matchesThatDay >= 3 && matchesThatDay < 5) spamPenalty = 0.75; // Partite 4 e 5: 75%
        else if (matchesThatDay >= 5 && matchesThatDay < 8) spamPenalty = 0.50; // Partite 6, 7, 8: 50%
        else if (matchesThatDay >= 8) spamPenalty = 0.20; // Partita 9+: 20%

        // Calcolo Elo Finale
        const expectedWinner = 1 / (1 + Math.pow(10, (lData.rating - wData.rating) / 400));
        let points = Math.max(1, Math.round(32 * (1 - expectedWinner) * formatMultiplier * spamPenalty));

        const newWR = wData.rating + points; const newLR = lData.rating - points;
        await updateDoc(doc(db, "players", winnerId), { rating: newWR, wins: wData.wins + 1 });
        await updateDoc(doc(db, "players", loserId), { rating: newLR, losses: lData.losses + 1 });

        // Salva in DB
        await addDoc(matchesRef, {
            winner: winnerId, loser: loserId, winnerScore: document.getElementById("score-winner").value, loserScore: document.getElementById("score-loser").value,
            format: format, customSets: customSets, customPoints: customPoints, notes: document.getElementById("match-notes").value, 
            pointsExchanged: points, winnerNewRating: newWR, loserNewRating: newLR, 
            timestamp: matchTimestamp // <--- Data inserita dall'utente!
        });
        document.getElementById("match-form").reset();
        
        // Reimposta la data attuale nel form dopo il salvataggio
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('match-date').value = now.toISOString().slice(0,16);
        
    } catch(e) { console.error(e); }
    btn.disabled = false;
});

// --- L'ORACOLO (Restato identico, ma usa i nuovi ID per evitare scroll) ---
function generateSmartComment(playerId) {
    const commentBox = document.getElementById("ai-comment"); const extraBox = document.getElementById("extra-stats");
    extraBox.innerHTML = ""; document.getElementById("chart-container-pie").style.display = playerId === "general" ? "none" : "block";
    if(playersData.length === 0) return commentBox.innerText = "Attendo giocatori...";
    if(playerId === "general") {
        const leader = [...playersData].sort((a,b) => b.rating - a.rating)[0];
        commentBox.innerText = `🎙️ "Tavolo dominato da ${leader.name} (${Math.round(leader.rating)} pt). Chi riuscirà a buttarlo giù?"`;
        drawRealCharts("general", null); return;
    }
    const p = playersData.find(x => x.id === playerId);
    const tot = p.wins + p.losses; const wr = tot > 0 ? Math.round((p.wins / tot) * 100) : 0;
    
    let ops = {}; matchesData.forEach(m => {
        if(m.winner === playerId) { ops[m.loser] = ops[m.loser] || {w:0, l:0}; ops[m.loser].w++; }
        if(m.loser === playerId) { ops[m.winner] = ops[m.winner] || {w:0, l:0}; ops[m.winner].l++; }
    });
    let best = null, wBest = 0, worst = null, lWorst = 0;
    for(const [id, s] of Object.entries(ops)) { if(s.w > wBest){wBest = s.w; best = id;} if(s.l > lWorst){lWorst = s.l; worst = id;} }
    
    const nBest = best ? (playersData.find(x=>x.id===best)?.name || "?") : "-";
    const nWorst = worst ? (playersData.find(x=>x.id===worst)?.name || "?") : "-";

    commentBox.innerText = `🎙️ "Analisi su ${p.name}: ${wr >= 60 ? 'Un vero cecchino' : (wr < 40 ? 'In difficoltà' : 'Altalenante')} con il ${wr}% di vittorie."`;
    extraBox.innerHTML = `<div class="stat-box"><span>Partite</span><strong>${tot}</strong></div><div class="stat-box"><span>Vittima</span><strong>${nBest}</strong></div><div class="stat-box"><span>Bestia Nera</span><strong>${nWorst}</strong></div>`;
    drawRealCharts("single", p);
}

function drawRealCharts(type, p) {
    if(lineChart) lineChart.destroy(); if(pieChart) pieChart.destroy();
    const ctx = document.getElementById('rankingChart').getContext('2d');
    
    Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--text-color').trim(); // Colore testi grafici dark mode
    Chart.defaults.font.family = 'Inter, sans-serif';

    if(type === "general") {
        lineChart = new Chart(ctx, { type: 'line', data: { labels: ['Vuoto'], datasets: [{ label: 'Generale', data: [1000] }] }, options: { maintainAspectRatio: false } });
    } else {
        const pm = matchesData.filter(m => m.winner === p.id || m.loser === p.id).reverse();
        let lbs = ['Inizio'], dts = [1000];
        pm.forEach((m, i) => { lbs.push(`M${i+1}`); dts.push(m.winner === p.id && m.winnerNewRating ? m.winnerNewRating : (m.loser === p.id && m.loserNewRating ? m.loserNewRating : dts[dts.length-1])); });
        lineChart = new Chart(ctx, { type: 'line', data: { labels: lbs, datasets: [{ label: p.name, data: dts, borderColor: '#e63946', backgroundColor: 'rgba(230, 57, 70, 0.1)', fill: true, tension: 0.2 }] }, options: { maintainAspectRatio: false, responsive: true } });
        pieChart = new Chart(document.getElementById('winRateChart').getContext('2d'), { type: 'doughnut', data: { labels: ['Vittorie', 'Sconfitte'], datasets: [{ data: [p.wins, p.losses], backgroundColor: ['#2a9d8f', '#d62828'] }] }, options: { maintainAspectRatio: false, responsive: true } });
    }
}