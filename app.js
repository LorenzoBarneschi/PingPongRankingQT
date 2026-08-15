import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, setDoc, getDoc, updateDoc, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyBv0C_tgvchxbG6xrvtj9ypeN_ARmvIhdA", authDomain: "pingpongrankingqt.firebaseapp.com", projectId: "pingpongrankingqt" };
const app = initializeApp(firebaseConfig); const db = getFirestore(app);
const playersRef = collection(db, "players"); const matchesRef = collection(db, "matches");

let playersData = []; let matchesData = []; let lineChart = null; let pieChart = null;

function setNow() { const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); document.getElementById('match-date').value = now.toISOString().slice(0,16); }
window.addEventListener('DOMContentLoaded', setNow); document.getElementById('btn-now').addEventListener('click', setNow);

document.getElementById('format').addEventListener('change', (e) => {
    document.getElementById('custom-format-details').style.display = e.target.value === 'custom' ? 'block' : 'none';
});

function switchTab(tabId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`view-${tabId}`).classList.add('active-view');
    document.getElementById(`nav-${tabId}`).classList.add('active');
}
document.getElementById("nav-arena").addEventListener("click", () => switchTab('arena'));
document.getElementById("nav-history").addEventListener("click", () => switchTab('history'));
document.getElementById("nav-stats").addEventListener("click", () => {
    switchTab('stats'); generateSmartComment(document.getElementById("stats-player-select").value); populateMonths();
});

// CLASSIFICA
onSnapshot(query(playersRef, orderBy("rating", "desc")), (snapshot) => {
    const rankingList = document.getElementById("ranking-list");
    const selects = [document.getElementById("winner"), document.getElementById("loser"), document.getElementById("delete-player-select"), document.getElementById("stats-player-select"), document.getElementById("h2h-p1"), document.getElementById("h2h-p2")];
    rankingList.innerHTML = "";
    selects[0].innerHTML = '<option value="">Seleziona...</option>'; selects[1].innerHTML = '<option value="">Seleziona...</option>';
    selects[2].innerHTML = '<option value="">Seleziona per eliminare...</option>';
    selects[3].innerHTML = '<option value="general">📊 Statistiche Generali (Gruppo)</option>';
    selects[4].innerHTML = '<option value="">Giocatore 1</option>'; selects[5].innerHTML = '<option value="">Giocatore 2</option>';
    playersData = []; let pos = 1;
    snapshot.forEach((doc) => {
        const p = doc.data(); p.id = doc.id; playersData.push(p);
        let rowClass = ""; let rankClass = "";
        if(pos === 1) rankClass = "rank-1"; else if(pos === 2) rankClass = "rank-2"; else if(pos === 3) rankClass = "rank-3";
        if(pos === 3 && snapshot.size > 3) rowClass = "podium-divider"; 
        if(pos === snapshot.size && snapshot.size >= 4) rankClass = "rank-last";
        rankingList.innerHTML += `<tr class="${rowClass}"><td class="${rankClass}">${pos}°</td><td class="${rankClass}">${p.name}</td><td class="${rankClass}">${Math.round(p.rating)}</td><td>${p.wins} - ${p.losses}</td></tr>`;
        const opt = `<option value="${p.id}">${p.name}</option>`; selects.forEach(s => s.innerHTML += opt); pos++;
    });
});

// STORICO
onSnapshot(query(matchesRef, orderBy("timestamp", "desc")), (snapshot) => {
    const historyList = document.getElementById("history-list");
    historyList.innerHTML = ""; matchesData = [];
    if(snapshot.empty) return historyList.innerHTML = "<p>Nessuna partita giocata.</p>";
    snapshot.forEach((docSnap) => {
        const match = docSnap.data(); match.id = docSnap.id; matchesData.push(match);
        const wName = playersData.find(p => p.id === match.winner)?.name || "Ignoto";
        const lName = playersData.find(p => p.id === match.loser)?.name || "Ignoto";
        const date = match.timestamp ? match.timestamp.toDate().toLocaleDateString("it-IT", {day:'numeric', month:'short', year:'2-digit'}) : "Ora";
        let fmt = match.format; 
        if(match.format === 'custom') fmt = `Custom(Bo${match.customSets})`;
        else if (match.format === 'tournament_match') fmt = `🏆 Torneo`;
        else if (match.format === 'tournament_final') fmt = `👑 Finale`;
        
        historyList.innerHTML += `<div class="history-item"><div class="history-info"><div class="match-title">🥇 ${wName} (${match.winnerScore}) vs 🥈 ${lName} (${match.loserScore})</div><div class="match-meta">📅 ${date} | Fmt: ${fmt} | 📈 Punti: ${match.pointsExchanged} ${match.notes ? `<br><em>Note: ${match.notes}</em>` : ''}</div></div><button class="btn-delete-match" onclick="deleteMatch('${match.id}', '${match.winner}', '${match.loser}', ${match.pointsExchanged})">Annulla</button></div>`;
    });
    populateMonths();
});

window.deleteMatch = async (matchId, wId, lId, pts) => {
    if(!confirm("Annullare? I punti torneranno come prima.")) return;
    try {
        const w = await getDoc(doc(db, "players", wId)); const l = await getDoc(doc(db, "players", lId));
        if (w.exists()) await updateDoc(doc(db, "players", wId), { rating: w.data().rating - pts, wins: Math.max(0, w.data().wins - 1) });
        if (l.exists()) await updateDoc(doc(db, "players", lId), { rating: l.data().rating + pts, losses: Math.max(0, l.data().losses - 1) });
        await deleteDoc(doc(db, "matches", matchId));
    } catch(e) {}
};

document.getElementById("player-form").addEventListener("submit", async (e) => { e.preventDefault(); const n = document.getElementById("new-player-name").value.trim(); if (n) { await setDoc(doc(playersRef, n.toLowerCase()), { name: n, rating: 1000, wins: 0, losses: 0 }); document.getElementById("new-player-name").value = ""; }});
document.getElementById("delete-player-btn").addEventListener("click", async () => { const id = document.getElementById("delete-player-select").value; if(id && confirm("Sicuro?")) await deleteDoc(doc(playersRef, id)); });

// SALVA PARTITA
document.getElementById("match-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const wId = document.getElementById("winner").value; const lId = document.getElementById("loser").value;
    if (wId === lId) return alert("Scegli giocatori diversi!");
    const btn = document.getElementById("save-match-btn"); btn.disabled = true;

    try {
        const wData = (await getDoc(doc(db, "players", wId))).data(); const lData = (await getDoc(doc(db, "players", lId))).data();
        const mDateObj = new Date(document.getElementById('match-date').value);
        
        let fmtMult = 1.0; const format = document.getElementById("format").value;
        let cSets = null, cPts = null;
        if(format === "21") fmtMult = 1.2; else if(format === "bo3_11") fmtMult = 1.5; else if(format === "bo3_21") fmtMult = 1.8;
        else if(format === "tournament_match") fmtMult = 1.5;
        else if(format === "tournament_final") fmtMult = 2.0;
        else if(format === "custom") {
            cSets = parseInt(document.getElementById("custom-sets").value); cPts = parseInt(document.getElementById("custom-points").value);
            fmtMult = 1.0 + (cSets > 1 ? (cSets-1)*0.25 : 0) + (cPts > 11 ? (cPts-11)*0.02 : 0);
        }

        let matchesThatDay = 0; const targetDateString = mDateObj.toDateString();
        matchesData.forEach(m => {
            if(m.timestamp && m.timestamp.toDate().toDateString() === targetDateString) {
                if((m.winner === wId && m.loser === lId) || (m.winner === lId && m.loser === wId)) matchesThatDay++;
            }
        });

        const matchNumber = matchesThatDay + 1;
        let spamPenalty = 1.0;
        if (matchNumber >= 6 && matchNumber <= 10) spamPenalty = 0.75;
        else if (matchNumber >= 11 && matchNumber <= 14) spamPenalty = 0.45;
        else if (matchNumber >= 15) spamPenalty = 0.25;

        const expW = 1 / (1 + Math.pow(10, (lData.rating - wData.rating) / 400));
        let points = Math.max(1, Math.round(32 * (1 - expW) * fmtMult * spamPenalty));

        const nW = wData.rating + points; const nL = lData.rating - points;
        await updateDoc(doc(db, "players", wId), { rating: nW, wins: wData.wins + 1 });
        await updateDoc(doc(db, "players", lId), { rating: nL, losses: lData.losses + 1 });

        await addDoc(matchesRef, {
            winner: wId, loser: lId, winnerScore: document.getElementById("score-winner").value, loserScore: document.getElementById("score-loser").value,
            format: format, customSets: cSets, customPoints: cPts, notes: document.getElementById("match-notes").value, 
            pointsExchanged: points, winnerNewRating: nW, loserNewRating: nL, timestamp: Timestamp.fromDate(mDateObj) 
        });
        document.getElementById("match-form").reset(); setNow();
    } catch(e) {}
    btn.disabled = false;
});

// STATS E H2H (Logica intatta)
function updateH2H() {
    const p1 = document.getElementById("h2h-p1").value; const p2 = document.getElementById("h2h-p2").value;
    const resDiv = document.getElementById("h2h-result");
    if(!p1 || !p2 || p1 === p2) return resDiv.innerHTML = "Seleziona due giocatori diversi.";
    let w1 = 0, w2 = 0;
    matchesData.forEach(m => { if(m.winner === p1 && m.loser === p2) w1++; if(m.winner === p2 && m.loser === p1) w2++; });
    const n1 = playersData.find(x=>x.id===p1).name; const n2 = playersData.find(x=>x.id===p2).name; const tot = w1 + w2;
    if(tot === 0) return resDiv.innerHTML = `Nessuna sfida tra ${n1} e ${n2}.`;
    resDiv.innerHTML = `<div style="margin-bottom: 10px; font-weight: bold; color: var(--text-color);">Totale Scontri: ${tot}</div><div style="display: flex; align-items: center; justify-content: space-between; font-weight: bold;"><span style="color: ${w1>w2 ? 'var(--success-color)' : 'var(--text-color)'};">${n1} (${w1})</span><span style="color: ${w2>w1 ? 'var(--success-color)' : 'var(--text-color)'};">${n2} (${w2})</span></div><div style="width: 100%; height: 10px; background: var(--input-bg); border-radius: 5px; overflow: hidden; margin-top: 5px; display: flex;"><div style="height: 100%; width: ${(w1/tot)*100}%; background: var(--success-color);"></div><div style="height: 100%; width: ${(w2/tot)*100}%; background: var(--danger-color);"></div></div>`;
}
document.getElementById("h2h-p1").addEventListener("change", updateH2H); document.getElementById("h2h-p2").addEventListener("change", updateH2H);

function populateMonths() {
    const select = document.getElementById("month-select"); const months = new Set();
    matchesData.forEach(m => { if(m.timestamp) { const d = m.timestamp.toDate(); months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); }});
    const arr = Array.from(months).sort().reverse();
    select.innerHTML = '<option value="">Seleziona Mese...</option>';
    arr.forEach(val => { const [y, m] = val.split('-'); const nomeMese = new Date(y, m-1, 1).toLocaleString('it-IT', { month: 'long', year: 'numeric' }); select.innerHTML += `<option value="${val}">${nomeMese.charAt(0).toUpperCase() + nomeMese.slice(1)}</option>`; });
}
document.getElementById("month-select").addEventListener("change", (e) => {
    const resDiv = document.getElementById("monthly-leaderboard");
    if(!e.target.value) return resDiv.innerHTML = "<p style='text-align:center; color: #888;'>Seleziona un mese.</p>";
    const [year, month] = e.target.value.split('-'); let pointsGained = {};
    matchesData.forEach(m => { if(m.timestamp) { const d = m.timestamp.toDate(); if(d.getFullYear() == year && d.getMonth() + 1 == month) { pointsGained[m.winner] = (pointsGained[m.winner] || 0) + m.pointsExchanged; pointsGained[m.loser] = (pointsGained[m.loser] || 0) - m.pointsExchanged; } } });
    let resultHTML = '<div class="table-container"><table><thead><tr><th>Giocatore</th><th>Saldo Punti</th></tr></thead><tbody>';
    const sorted = Object.entries(pointsGained).sort((a,b) => b[1] - a[1]);
    if(sorted.length === 0) resultHTML += '<tr><td colspan="2">Nessun dato.</td></tr>';
    sorted.forEach(([pId, pts], index) => { const pName = playersData.find(x=>x.id===pId)?.name || "Ignoto"; const color = pts > 0 ? 'var(--success-color)' : 'var(--danger-color)'; const sign = pts > 0 ? '+' : ''; resultHTML += `<tr><td style="font-weight: ${index === 0 ? 'bold' : 'normal'}; ${index===0 ? 'color:#d4af37;':''}">${index === 0 ? '👑 ' : ''}${pName}</td><td style="color: ${color}; font-weight: bold;">${sign}${pts}</td></tr>`; });
    resDiv.innerHTML = resultHTML + '</tbody></table></div>';
});

// --- MOTORE NARRATIVO EPICO ---
document.getElementById("stats-player-select").addEventListener("change", (e) => generateSmartComment(e.target.value));

function generateSmartComment(playerId) {
    const commentBox = document.getElementById("ai-comment"); const extraBox = document.getElementById("extra-stats");
    const epicBadgeBox = document.getElementById("epic-title-container"); const epicTitleSpan = document.getElementById("player-epic-title");
    
    extraBox.innerHTML = ""; document.getElementById("chart-container-pie").style.display = playerId === "general" ? "none" : "block";
    
    if(playersData.length === 0) { epicBadgeBox.style.display = "none"; return commentBox.innerText = "Attendo giocatori..."; }
    
    if(playerId === "general") {
        epicBadgeBox.style.display = "none";
        const leader = [...playersData].sort((a,b) => b.rating - a.rating)[0];
        commentBox.innerText = `🎙️ "Il tavolo sussulta ogni volta che si gioca. Al momento, il trono appartiene incontrastato a ${leader.name} (${Math.round(leader.rating)} pt). Ma il vento sta cambiando, e chi è dietro affila le racchette..."`;
        drawRealCharts("general", null); return;
    }
    
    // Analisi Giocatore per l'Appellativo
    const p = playersData.find(x => x.id === playerId);
    const tot = p.wins + p.losses; const wr = tot > 0 ? Math.round((p.wins / tot) * 100) : 0;
    
    // Trova le ultime 3 partite di questo giocatore
    const playerMatches = matchesData.filter(m => m.winner === p.id || m.loser === p.id).sort((a,b) => b.timestamp - a.timestamp);
    let currentStreak = 0;
    for(let m of playerMatches) {
        if(m.winner === p.id && currentStreak >= 0) currentStreak++;
        else if(m.loser === p.id && currentStreak <= 0) currentStreak--;
        else break; // Striscia interrotta
    }

    // Generazione TITOLO EPICO
    let title = "Il Novizio"; let narrative = "";
    if(tot < 5) {
        title = "L'Incognita"; narrative = `È da poco sceso nell'arena. Pochi l'hanno visto giocare davvero, ma il mistero che lo avvolge lo rende un avversario imprevedibile.`;
    } else if (p.rating === [...playersData].sort((a,b)=>b.rating-a.rating)[0].rating && wr > 60) {
        title = "L'Imperatore"; narrative = `Dall'alto del suo trono, guarda gli altri sudare. Con un devastante ${wr}% di vittorie, ogni suo colpo è una sentenza capitale per le speranze avversarie.`;
    } else if (currentStreak >= 4) {
        title = "L'Inarrestabile"; narrative = `È in uno stato di grazia assoluto (Striscia di ${currentStreak} vittorie). La pallina viaggia esattamente dove vuole lui. Affrontarlo ora significa andare incontro alla sconfitta.`;
    } else if (currentStreak <= -4) {
        title = "L'Anima Tormentata"; narrative = `Una nube nera staziona sopra la sua racchetta. ${Math.abs(currentStreak)} sconfitte consecutive stanno minando le sue certezze, ma ricordate: la belva ferita è la più pericolosa.`;
    } else if (wr >= 65) {
        title = "Il Cecchino"; narrative = `La precisione fatta a persona. Quando scende in campo sai già che sbaglierà pochissimo. Il suo polso è chirurgico.`;
    } else if (wr > 40 && wr < 60 && tot > 15) {
        title = "Il Caotico"; narrative = `Una scheggia impazzita. Può battere il campione del mondo e perdere con l'ultimo in classifica nello stesso giorno. Portatore sano di entropia sportiva.`;
    } else if (wr <= 35 && tot > 10) {
        title = "L'Ostinato"; narrative = `I numeri (Win Rate ${wr}%) direbbero di arrendersi, ma lui torna sempre al tavolo. Cade, si rialza, e prima o poi piazzerà il colpo che nessuno si aspetta. Rispetto assoluto.`;
    } else {
        title = "Il Tattico"; narrative = `Studia, osserva e aspetta il momento giusto. La sua forma è un'onda, ma quando il mare si alza, travolge chiunque si trovi dall'altra parte.`;
    }

    // Nemesi e Vittima
    let ops = {}; playerMatches.forEach(m => {
        if(m.winner === playerId) { ops[m.loser] = ops[m.loser] || {w:0, l:0}; ops[m.loser].w++; }
        if(m.loser === playerId) { ops[m.winner] = ops[m.winner] || {w:0, l:0}; ops[m.winner].l++; }
    });
    let best = null, wBest = 0, worst = null, lWorst = 0;
    for(const [id, s] of Object.entries(ops)) { if(s.w > wBest){wBest = s.w; best = id;} if(s.l > lWorst){lWorst = s.l; worst = id;} }
    const nBest = best ? (playersData.find(x=>x.id===best)?.name || "?") : "-";
    const nWorst = worst ? (playersData.find(x=>x.id===worst)?.name || "?") : "-";

    if(worst && lWorst >= 2) narrative += ` L'unico vero scoglio insormontabile per lui è ${nWorst}, che sembra leggergli nel pensiero.`;

    // Aggiorna UI
    epicBadgeBox.style.display = "block";
    epicTitleSpan.innerText = title;
    commentBox.innerText = `🎙️ "${narrative}"`;
    extraBox.innerHTML = `<div class="stat-box"><span>Partite Giocate</span><strong>${tot}</strong></div><div class="stat-box"><span>Vittima Preferita</span><strong>${nBest}</strong></div><div class="stat-box"><span>Bestia Nera</span><strong>${nWorst}</strong></div>`;
    
    drawRealCharts("single", p);
}

function drawRealCharts(type, p) {
    if(lineChart) lineChart.destroy(); if(pieChart) pieChart.destroy();
    const ctx = document.getElementById('rankingChart').getContext('2d');
    Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--text-color').trim();
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