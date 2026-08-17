import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, setDoc, getDoc, updateDoc, deleteDoc, Timestamp, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyBv0C_tgvchxbG6xrvtj9ypeN_ARmvIhdA", authDomain: "pingpongrankingqt.firebaseapp.com", projectId: "pingpongrankingqt" };
const app = initializeApp(firebaseConfig); const db = getFirestore(app);
const playersRef = collection(db, "players"); const matchesRef = collection(db, "matches"); const toursRef = collection(db, "tournaments");

let playersData = []; let matchesData = []; let toursData = []; let lineChart = null; let pieChart = null;
let activeTourId = null; let activeTourData = null; let currentMatchToPlay = null;

const ADMIN_PIN = "2580";

function setNow() { 
    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); 
    document.getElementById('match-date').value = now.toISOString().slice(0,16); 
    document.getElementById('tour-date').value = now.toISOString().slice(0,16); 
}
window.addEventListener('DOMContentLoaded', setNow); 
document.getElementById('btn-now').addEventListener('click', setNow);
document.getElementById('btn-tour-now').addEventListener('click', setNow);
document.getElementById('format').addEventListener('change', (e) => { document.getElementById('custom-format-details').style.display = e.target.value === 'custom' ? 'block' : 'none'; });

const pickRnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

function switchTab(tabId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`view-${tabId}`).classList.add('active-view'); document.getElementById(`nav-${tabId}`).classList.add('active');
}
document.getElementById("nav-arena").addEventListener("click", () => switchTab('arena'));
document.getElementById("nav-history").addEventListener("click", () => switchTab('history'));
document.getElementById("nav-stats").addEventListener("click", () => { switchTab('stats'); generateSmartComment(document.getElementById("stats-player-select").value); populateMonths(); });
document.getElementById("nav-tournaments").addEventListener("click", () => { switchTab('tournaments'); checkActiveTournament(); });

document.getElementById("btn-admin-login").addEventListener("click", () => {
    const pin = prompt("Inserisci il PIN di sicurezza (Solo Admin):");
    if(pin === ADMIN_PIN) {
        document.body.classList.add("admin-mode"); document.getElementById("btn-admin-login").style.display = "none";
        alert("🔓 Accesso Garantito! Opzioni distruttive sbloccate.");
    } else if(pin !== null) { alert("❌ PIN errato."); }
});

async function wipeEverything() {
    const batch = writeBatch(db);
    const mSnap = await getDocs(collection(db, "matches")); const tSnap = await getDocs(collection(db, "tournaments"));
    mSnap.forEach(d => batch.delete(d.ref)); tSnap.forEach(d => batch.delete(d.ref));
    playersData.forEach(p => { batch.update(doc(db, "players", p.id), { rating: 1000, wins: 0, losses: 0 }); });
    await batch.commit(); alert("Database riportato alle condizioni di fabbrica!");
}

document.getElementById("btn-hard-reset").addEventListener("click", async () => { if(confirm("CANCELLARE TUTTO lo storico?")) { if(confirm("Ultimo avviso!")) { await wipeEverything(); } } });
document.getElementById("btn-clear-history").addEventListener("click", async () => { if(confirm("Svuotare lo storico?")) { await wipeEverything(); } });

document.getElementById("btn-recalculate-elo").addEventListener("click", async () => {
    if(!confirm("Ricalcolare l'Elo cronologicamente?")) return;
    if(toursData.length > 0) { alert("Attenzione: Ci sono Tornei registrati. Ricalcolare l'Elo di base sfalsa le quote d'ingresso pagate.\nSi consiglia di non ricalcolare globalmente se si usano i tornei."); return; }
    try {
        const batch = writeBatch(db); let simP = {}; playersData.forEach(p => { simP[p.id] = { rating: 1000, wins: 0, losses: 0 }; });
        const allM = [...matchesData].sort((a,b) => a.timestamp - b.timestamp);
        allM.forEach(m => {
            const w = simP[m.winner]; const l = simP[m.loser];
            if(w && l) {
                let fmtMult = m.format === "21" ? 1.2 : (m.format === "bo3_11" ? 1.5 : 1.0);
                let diff = m.winnerScore - m.loserScore; let marginMult = 1.0;
                if(diff <= 2 && m.winnerScore > 11) marginMult = 0.85; else if(diff <= 3) marginMult = 0.95; else if(diff >= 7 && diff <= 8) marginMult = 1.10; else if(diff >= 9) marginMult = 1.15;
                const expW = 1 / (1 + Math.pow(10, (l.rating - w.rating) / 400));
                let pts = Math.max(1, Math.round(32 * (1 - expW) * fmtMult * marginMult));
                w.rating += pts; w.wins++; l.rating -= pts; l.losses++;
                batch.update(doc(db, "matches", m.id), { pointsExchanged: pts, winnerNewRating: w.rating, loserNewRating: l.rating });
            }
        });
        playersData.forEach(p => { if(simP[p.id]) { batch.update(doc(db, "players", p.id), { rating: simP[p.id].rating, wins: simP[p.id].wins, losses: simP[p.id].losses }); } });
        await batch.commit(); alert("Catena Elo ricalcolata!");
    } catch(e) { console.error(e); }
});

function calculateMatchPoints(wData, lData, wScore, lScore, format, matchDateObj) {
    let fmtMult = 1.0; let standardWinScore = 11;
    if(format === "21") { fmtMult = 1.2; standardWinScore = 21; } else if(format === "bo3_11") { fmtMult = 1.5; }
    else if(format === "custom") {
        let cSets = parseInt(document.getElementById("custom-sets").value || 1); let cPts = parseInt(document.getElementById("custom-points").value || 11);
        fmtMult = 1.0 + (cSets > 1 ? (cSets-1)*0.25 : 0) + (cPts > 11 ? (cPts-11)*0.02 : 0); standardWinScore = cPts;
    }
    let diff = wScore - lScore; let marginMult = 1.0;
    if(diff <= 2 && wScore > standardWinScore) marginMult = 0.85; else if(diff <= 3) marginMult = 0.95; else if(diff >= 4 && diff <= 6) marginMult = 1.0; else if(diff >= 7 && diff <= 8) marginMult = 1.10; else if(diff >= 9) marginMult = 1.15; 
    let matchesThatDay = 0; const targetDateString = matchDateObj.toDateString();
    matchesData.forEach(m => { if(m.timestamp && m.timestamp.toDate().toDateString() === targetDateString) { if((m.winner === wData.id && m.loser === lData.id) || (m.winner === lData.id && m.loser === wData.id)) matchesThatDay++; }});
    const matchNumber = matchesThatDay + 1; let spamPenalty = 1.0;
    if (matchNumber >= 6 && matchNumber <= 10) spamPenalty = 0.75; else if (matchNumber >= 11 && matchNumber <= 14) spamPenalty = 0.45; else if (matchNumber >= 15) spamPenalty = 0.25;
    const expW = 1 / (1 + Math.pow(10, (lData.rating - wData.rating) / 400));
    return Math.max(1, Math.round(32 * (1 - expW) * fmtMult * marginMult * spamPenalty));
}

function renderRanking() {
    if(playersData.length === 0) return;
    const rankingList = document.getElementById("ranking-list");
    const selects = [document.getElementById("winner"), document.getElementById("loser"), document.getElementById("delete-player-select"), document.getElementById("stats-player-select"), document.getElementById("h2h-p1"), document.getElementById("h2h-p2"), document.getElementById("edit-player-select")];
    
    const finishedTours = toursData.filter(t => t.status === 'finished').sort((a,b) => b.timestamp - a.timestamp);
    const reigningChampId = finishedTours.length > 0 ? finishedTours[0].podium1 : null;

    rankingList.innerHTML = "";
    let pos = 1;
    
    playersData.forEach((p) => {
        let rowClass = pos === 3 && playersData.length > 3 ? "podium-divider" : "";
        let rankClass = pos === 1 ? "rank-1" : (pos === 2 ? "rank-2" : (pos === 3 ? "rank-3" : (pos === playersData.length && playersData.length >= 4 ? "rank-last" : "")));
        let crown = p.id === reigningChampId ? " 👑" : "";
        rankingList.innerHTML += `<tr class="${rowClass}"><td class="${rankClass}">${pos}°</td><td class="${rankClass}">${p.name}${crown}</td><td class="${rankClass}">${Math.round(p.rating)}</td><td>${p.wins} - ${p.losses}</td></tr>`;
        pos++;
    });

    if(document.getElementById("winner").options.length <= 1) {
        selects.forEach(s => s.innerHTML = (s.id==='stats-player-select'?'<option value="general">📊 Statistiche Generali</option>':'<option value="">Seleziona...</option>'));
        playersData.forEach((p) => { selects.forEach(s => s.innerHTML += `<option value="${p.id}">${p.name}</option>`); });
    }
    
    if(document.getElementById('view-tournaments').classList.contains('active-view')) renderTournamentCheckboxes();
}

onSnapshot(query(playersRef, orderBy("rating", "desc")), (snapshot) => {
    playersData = []; snapshot.forEach((doc) => { const p = doc.data(); p.id = doc.id; playersData.push(p); });
    renderRanking();
});

onSnapshot(query(toursRef, orderBy("timestamp", "desc")), (snapshot) => {
    toursData = []; snapshot.forEach(docSnap => { const t = docSnap.data(); t.id = docSnap.id; toursData.push(t); }); 
    renderHistory(); checkActiveTournament(); renderRanking();
    if(playersData.length > 0 && toursData.length > 0) { const e = new Event('change'); document.getElementById("stats-player-select").dispatchEvent(e); }
});

onSnapshot(query(matchesRef, orderBy("timestamp", "desc")), (snapshot) => {
    matchesData = []; snapshot.forEach(docSnap => { const m = docSnap.data(); m.id = docSnap.id; matchesData.push(m); }); renderHistory(); updateH2H();
});

function renderHistory() {
    const list = document.getElementById("history-list"); list.innerHTML = "";
    const allEvents = [...matchesData.map(m=>({...m, type:'match'})), ...toursData.map(t=>({...t, type:'tour'}))].filter(e => e.timestamp).sort((a,b) => b.timestamp - a.timestamp);
    if(allEvents.length === 0) return list.innerHTML = "<p>Nessun evento registrato.</p>";

    allEvents.forEach(ev => {
        const date = ev.timestamp.toDate().toLocaleDateString("it-IT", {day:'numeric', month:'short', year:'2-digit'});
        if(ev.type === 'match') {
            if(ev.tournamentId) return; 
            const wName = playersData.find(p => p.id === ev.winner)?.name || "Ignoto"; const lName = playersData.find(p => p.id === ev.loser)?.name || "Ignoto";
            list.innerHTML += `<div class="history-item"><div class="history-info"><div class="match-title">🥇 ${wName} (${ev.winnerScore}) vs 🥈 ${lName} (${ev.loserScore})</div><div class="match-meta">📅 ${date} | 📈 Punti Elo: ${ev.pointsExchanged}</div></div><button class="btn-delete-match admin-only" onclick="deleteMatch('${ev.id}', '${ev.winner}', '${ev.loser}', ${ev.pointsExchanged})">Annulla</button></div>`;
        } else {
            if(ev.status === 'active') return; 
            const n1 = playersData.find(p => p.id === ev.podium1)?.name || "?"; const n2 = playersData.find(p => p.id === ev.podium2)?.name || "?"; const n3 = playersData.find(p => p.id === ev.podium3)?.name || "?";
            list.innerHTML += `<div class="history-item is-tournament"><div class="history-info"><div class="match-title" style="color:#d4af37; font-size:1.1rem;">🏆 Torneo del ${date}</div><div class="match-meta">🥇 ${n1} (+${ev.prizes.p1}pt)<br>🥈 ${n2} (+${ev.prizes.p2}pt)<br>🥉 ${n3} (+${ev.prizes.p3}pt)<br>💰 Pot Totale: ${ev.pot}pt</div></div><button class="btn-delete-match admin-only" onclick="deleteTournament('${ev.id}')">Annulla Torneo</button></div>`;
        }
    });
}

window.deleteMatch = async (matchId, wId, lId, pts) => {
    if(!confirm("Annullare partita? I punti torneranno come prima.")) return;
    const w = await getDoc(doc(db, "players", wId)); const l = await getDoc(doc(db, "players", lId));
    if (w.exists()) await updateDoc(doc(db, "players", wId), { rating: w.data().rating - pts, wins: Math.max(0, w.data().wins - 1) });
    if (l.exists()) await updateDoc(doc(db, "players", lId), { rating: l.data().rating + pts, losses: Math.max(0, l.data().losses - 1) });
    await deleteDoc(doc(db, "matches", matchId));
};

window.deleteTournament = async (tourId) => {
    if(!confirm("⚠️ ATTENZIONE: Annullando il torneo rimborserai il Buy-in, toglierai i premi dal Podio e INVERTIRAI L'ELO DI TUTTE LE PARTITE giocate al suo interno! Sei sicuro?")) return;
    const t = toursData.find(x => x.id === tourId); if(!t) return;
    try {
        const pSnap = await getDocs(query(playersRef)); let localP = {}; pSnap.forEach(d => { localP[d.id] = d.data(); });
        if(t.podium1 && localP[t.podium1]) localP[t.podium1].rating -= t.prizes.p1;
        if(t.podium2 && localP[t.podium2]) localP[t.podium2].rating -= t.prizes.p2;
        if(t.podium3 && localP[t.podium3]) localP[t.podium3].rating -= t.prizes.p3;
        t.players.forEach(pid => { if(localP[pid] && t.entryFeeMap[pid]) localP[pid].rating += t.entryFeeMap[pid]; });
        const batch = writeBatch(db); const mSnap = await getDocs(query(matchesRef));
        mSnap.forEach(docSnap => {
            const m = docSnap.data();
            if(m.tournamentId === tourId) {
                if(localP[m.winner]) { localP[m.winner].rating -= m.pointsExchanged; localP[m.winner].wins = Math.max(0, localP[m.winner].wins - 1); }
                if(localP[m.loser]) { localP[m.loser].rating += m.pointsExchanged; localP[m.loser].losses = Math.max(0, localP[m.loser].losses - 1); }
                batch.delete(docSnap.ref); 
            }
        });
        t.players.forEach(pid => { if(localP[pid]) { batch.update(doc(db, "players", pid), { rating: localP[pid].rating, wins: localP[pid].wins, losses: localP[pid].losses }); } });
        batch.delete(doc(db, "tournaments", tourId)); await batch.commit(); alert("Torneo annullato in sicurezza.");
    } catch(e) { console.error(e); alert("Errore durante l'annullamento."); }
};

document.getElementById("player-form").addEventListener("submit", async (e) => { e.preventDefault(); const n = document.getElementById("new-player-name").value.trim(); if (n) { await setDoc(doc(playersRef, n.toLowerCase().replace(/\s+/g, '_')), { name: n, rating: 1000, wins: 0, losses: 0 }); document.getElementById("new-player-name").value = ""; }});
document.getElementById("delete-player-btn").addEventListener("click", async () => { const id = document.getElementById("delete-player-select").value; if(id && confirm("Sicuro?")) await deleteDoc(doc(playersRef, id)); });
document.getElementById("edit-player-form").addEventListener("submit", async (e) => {
    e.preventDefault(); const id = document.getElementById("edit-player-select").value; const newName = document.getElementById("edit-player-name").value.trim();
    if(id && newName) { await updateDoc(doc(db, "players", id), { name: newName }); document.getElementById("edit-player-form").reset(); alert("Nome/Emoji aggiornati!"); }
});

document.getElementById("match-form").addEventListener("submit", async (e) => {
    e.preventDefault(); const wId = document.getElementById("winner").value; const lId = document.getElementById("loser").value;
    if (wId === lId) return alert("Giocatori diversi!"); document.getElementById("save-match-btn").disabled = true;
    
    const wData = playersData.find(p=>p.id===wId); const lData = playersData.find(p=>p.id===lId);
    const wScore = parseInt(document.getElementById("score-winner").value); const lScore = parseInt(document.getElementById("score-loser").value);
    const matchDateObj = new Date(document.getElementById('match-date').value);
    let points = calculateMatchPoints(wData, lData, wScore, lScore, document.getElementById("format").value, matchDateObj);
    
    await updateDoc(doc(db, "players", wId), { rating: wData.rating + points, wins: wData.wins + 1 });
    await updateDoc(doc(db, "players", lId), { rating: lData.rating - points, losses: lData.losses + 1 });
    await addDoc(matchesRef, { winner: wId, loser: lId, winnerScore: wScore, loserScore: lScore, pointsExchanged: points, winnerNewRating: wData.rating+points, loserNewRating: lData.rating-points, timestamp: Timestamp.fromDate(matchDateObj) });
    document.getElementById("match-form").reset(); setNow(); document.getElementById("save-match-btn").disabled = false;
});

function renderTournamentCheckboxes() {
    const container = document.getElementById("tournament-players-checkboxes"); if(!container) return; container.innerHTML = "";
    playersData.forEach(p => { container.innerHTML += `<label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: var(--text-color);"><input type="checkbox" value="${p.id}" class="tour-cb" style="width: 20px; height: 20px; margin: 0; flex-shrink: 0;"> <span style="flex:1;">${p.name} (${Math.round(p.rating)} pt)</span></label>`; });
}

function checkActiveTournament() {
    activeTourData = toursData.find(t => t.status === 'active');
    if(activeTourData) {
        activeTourId = activeTourData.id;
        document.getElementById("tour-setup-section").style.display = "none"; document.getElementById("active-tournament-section").style.display = "block";
        document.getElementById("tour-pot").innerText = activeTourData.pot;
        
        if(activeTourData.mode === 'auto') {
            document.getElementById("tour-auto-ui").style.display = "block"; document.getElementById("tour-manual-ui").style.display = "none"; document.getElementById("manual-podium-selects").style.display = "none";
            renderBracket();
        } else {
            document.getElementById("tour-auto-ui").style.display = "none"; document.getElementById("tour-manual-ui").style.display = "block"; document.getElementById("tour-completion-zone").style.display = "block"; document.getElementById("manual-podium-selects").style.display = "block";
            const selects = [document.getElementById("tour-winner"), document.getElementById("tour-loser"), document.getElementById("tour-1st"), document.getElementById("tour-2nd"), document.getElementById("tour-3rd")];
            selects.forEach(s => { s.innerHTML = s.innerHTML.split('</option>')[0] + '</option>'; activeTourData.players.forEach(pid => { const name = playersData.find(x=>x.id===pid)?.name; if(name) s.innerHTML += `<option value="${pid}">${name}</option>`; }); });
            const mList = document.getElementById("manual-matches-list"); mList.innerHTML = "";
            const tMatches = matchesData.filter(m => m.tournamentId === activeTourData.id);
            if(tMatches.length === 0) mList.innerHTML = "Nessuna partita registrata.";
            else tMatches.forEach(m => { const w = playersData.find(p=>p.id===m.winner)?.name; const l = playersData.find(p=>p.id===m.loser)?.name; mList.innerHTML += `<div style="border-bottom: 1px solid #ddd; padding: 5px 0;"><strong>${w}</strong> (${m.winnerScore}) ha battuto ${l} (${m.loserScore})</div>`; });
        }
    } else {
        activeTourId = null; activeTourData = null; document.getElementById("tour-setup-section").style.display = "block"; document.getElementById("active-tournament-section").style.display = "none"; renderTournamentCheckboxes();
    }
}

document.getElementById("btn-start-tournament").addEventListener("click", async () => {
    const checked = Array.from(document.querySelectorAll(".tour-cb:checked")).map(cb => cb.value);
    if(checked.length < 4 || checked.length > 8) return alert("Minimo 4, Massimo 8 giocatori!");
    if(!confirm("Prelevo lo 0.5% dei punti a ciascuno per il Montepremi. Confermi?")) return;
    
    let pot = 0; let feeMap = {};
    for(let pid of checked) { const pData = playersData.find(x => x.id === pid); let fee = Math.max(1, Math.round(pData.rating * 0.005)); pot += fee; feeMap[pid] = fee; await updateDoc(doc(db, "players", pid), { rating: pData.rating - fee }); }
    const mode = document.getElementById("tour-mode").value; let bracket = []; if(mode === 'auto') bracket = generateBracketData(checked);
    await addDoc(toursRef, { status: 'active', mode: mode, players: checked, pot: pot, entryFeeMap: feeMap, bracket: bracket, timestamp: Timestamp.fromDate(new Date(document.getElementById('tour-date').value)) });
});

document.getElementById("btn-cancel-active-tour").addEventListener("click", () => { deleteTournament(activeTourId); });

function generateBracketData(playersArr) {
    let b = []; let p = [...playersArr].sort(() => Math.random() - 0.5); 
    if(p.length === 4) {
        b.push({ id:'S1', round:'Semi', p1:p[0], p2:p[1], w:null, l:null, s1:null, s2:null, nextW:'F1.p1', nextL:'F3.p1' });
        b.push({ id:'S2', round:'Semi', p1:p[2], p2:p[3], w:null, l:null, s1:null, s2:null, nextW:'F1.p2', nextL:'F3.p2' });
        b.push({ id:'F3', round:'Fin3/4', p1:null, p2:null, w:null, l:null, s1:null, s2:null, nextW:null, nextL:null });
        b.push({ id:'F1', round:'Finale', p1:null, p2:null, w:null, l:null, s1:null, s2:null, nextW:null, nextL:null });
    } else if (p.length === 5) {
        b.push({ id:'P1', round:'Prelim', p1:p[0], p2:p[1], w:null, l:null, s1:null, s2:null, nextW:'S1.p1' });
        b.push({ id:'S1', round:'Semi', p1:null, p2:p[2], w:null, l:null, s1:null, s2:null, nextW:'F1.p1', nextL:'F3.p1' });
        b.push({ id:'S2', round:'Semi', p1:p[3], p2:p[4], w:null, l:null, s1:null, s2:null, nextW:'F1.p2', nextL:'F3.p2' });
        b.push({ id:'F3', round:'Fin3/4', p1:null, p2:null, w:null, l:null, s1:null, s2:null });
        b.push({ id:'F1', round:'Finale', p1:null, p2:null, w:null, l:null, s1:null, s2:null });
    } else if (p.length === 6) {
        b.push({ id:'Q1', round:'Quarti', p1:p[0], p2:p[1], w:null, l:null, s1:null, s2:null, nextW:'S1.p1' });
        b.push({ id:'Q2', round:'Quarti', p1:p[2], p2:p[3], w:null, l:null, s1:null, s2:null, nextW:'S1.p2' });
        b.push({ id:'Q3', round:'Quarti', p1:p[4], p2:p[5], w:null, l:null, s1:null, s2:null, nextW:'S2.p1' });
        b.push({ id:'S1', round:'Semi', p1:null, p2:null, w:null, l:null, s1:null, s2:null, nextW:'F1.p1', nextL:'F3.p1' });
        b.push({ id:'S2', round:'Semi', p1:null, p2:null, w:null, l:null, s1:null, s2:null, nextW:'F1.p2', nextL:'F3.p2' });
        b.push({ id:'F3', round:'Fin3/4', p1:null, p2:null, w:null, l:null, s1:null, s2:null });
        b.push({ id:'F1', round:'Finale', p1:null, p2:null, w:null, l:null, s1:null, s2:null });
    } else if (p.length === 7) {
        b.push({ id:'Q1', round:'Quarti', p1:p[0], p2:p[1], w:null, l:null, s1:null, s2:null, nextW:'S1.p1' });
        b.push({ id:'Q2', round:'Quarti', p1:p[2], p2:p[3], w:null, l:null, s1:null, s2:null, nextW:'S1.p2' });
        b.push({ id:'Q3', round:'Quarti', p1:p[4], p2:p[5], w:null, l:null, s1:null, s2:null, nextW:'S2.p1' });
        b.push({ id:'PI', round:'Spareggio', p1:p[6], p2:null, w:null, l:null, s1:null, s2:null, nextW:'S2.p2' }); 
        b.push({ id:'S1', round:'Semi', p1:null, p2:null, w:null, l:null, s1:null, s2:null, nextW:'F1.p1', nextL:'F3.p1' });
        b.push({ id:'S2', round:'Semi', p1:null, p2:null, w:null, l:null, s1:null, s2:null, nextW:'F1.p2', nextL:'F3.p2' });
        b.push({ id:'F3', round:'Fin3/4', p1:null, p2:null, w:null, l:null, s1:null, s2:null });
        b.push({ id:'F1', round:'Finale', p1:null, p2:null, w:null, l:null, s1:null, s2:null });
    } else if (p.length === 8) {
        b.push({ id:'Q1', round:'Quarti', p1:p[0], p2:p[1], w:null, l:null, s1:null, s2:null, nextW:'S1.p1' });
        b.push({ id:'Q2', round:'Quarti', p1:p[2], p2:p[3], w:null, l:null, s1:null, s2:null, nextW:'S1.p2' });
        b.push({ id:'Q3', round:'Quarti', p1:p[4], p2:p[5], w:null, l:null, s1:null, s2:null, nextW:'S2.p1' });
        b.push({ id:'Q4', round:'Quarti', p1:p[6], p2:p[7], w:null, l:null, s1:null, s2:null, nextW:'S2.p2' });
        b.push({ id:'S1', round:'Semi', p1:null, p2:null, w:null, l:null, s1:null, s2:null, nextW:'F1.p1', nextL:'F3.p1' });
        b.push({ id:'S2', round:'Semi', p1:null, p2:null, w:null, l:null, s1:null, s2:null, nextW:'F1.p2', nextL:'F3.p2' });
        b.push({ id:'F3', round:'Fin3/4', p1:null, p2:null, w:null, l:null, s1:null, s2:null });
        b.push({ id:'F1', round:'Finale', p1:null, p2:null, w:null, l:null, s1:null, s2:null });
    }
    return b;
}

function renderBracket() {
    const container = document.getElementById("bracket-container"); container.innerHTML = "";
    if(!activeTourData.bracket) return; const b = activeTourData.bracket;
    const roundCols = { 'Prelim':[], 'Quarti':[], 'Spareggio':[], 'Semi':[], 'Fin3/4':[], 'Finale':[] };
    b.forEach(m => { if(roundCols[m.round]) roundCols[m.round].push(m); });

    let colsOrder = [];
    if(activeTourData.players.length === 5) colsOrder = ['Prelim', 'Semi', 'Fin3/4', 'Finale'];
    else if(activeTourData.players.length === 6 || activeTourData.players.length === 8) colsOrder = ['Quarti', 'Semi', 'Fin3/4', 'Finale'];
    else if(activeTourData.players.length === 7) colsOrder = ['Quarti', 'Spareggio', 'Semi', 'Fin3/4', 'Finale'];
    else colsOrder = ['Semi', 'Fin3/4', 'Finale']; 

    colsOrder.forEach(colName => {
        if(roundCols[colName].length > 0) {
            let colHtml = `<div class="bracket-col"><div class="b-round-title">${colName}</div>`;
            roundCols[colName].forEach(m => {
                let p1Name = m.p1 ? (playersData.find(x=>x.id===m.p1)?.name || "?") : "TBD";
                let p2Name = m.p2 ? (playersData.find(x=>x.id===m.p2)?.name || "?") : "TBD";
                let isReady = m.p1 && m.p2 && !m.w;
                let cClass = m.w ? "done" : (isReady ? "ready" : "");
                if(m.round.includes("Final")) cClass += " final";

                colHtml += `<div class="b-match ${cClass}" ${isReady ? `onclick="openMatchModal('${m.id}')"` : ''}>
                    <div class="b-player ${(m.w===m.p1?'winner':(m.l===m.p1?'loser':(m.p1?'active':'')))}"><span>${p1Name}</span> <span class="b-score">${m.s1!==null?m.s1:'-'}</span></div>
                    <div class="b-player ${(m.w===m.p2?'winner':(m.l===m.p2?'loser':(m.p2?'active':'')))}"><span>${p2Name}</span> <span class="b-score">${m.s2!==null?m.s2:'-'}</span></div>
                </div>`;
            });
            colHtml += `</div>`; container.innerHTML += colHtml;
        }
    });

    const f1 = b.find(m=>m.id==='F1'); const f3 = b.find(m=>m.id==='F3');
    if(f1 && f1.w && f3 && f3.w) {
        document.getElementById("tour-completion-zone").style.display = "block";
        document.getElementById("auto-podium-text").innerHTML = `🥇 1° ${playersData.find(x=>x.id===f1.w).name}<br>🥈 2° ${playersData.find(x=>x.id===f1.l).name}<br>🥉 3° ${playersData.find(x=>x.id===f3.w).name}`;
        document.getElementById("auto-podium-text").style.display = "block";
    } else { document.getElementById("tour-completion-zone").style.display = "none"; }
}

window.openMatchModal = (mId) => {
    currentMatchToPlay = activeTourData.bracket.find(x => x.id === mId);
    document.getElementById("modal-match-title").innerText = currentMatchToPlay.round;
    document.getElementById("modal-p1-name").innerText = playersData.find(x=>x.id===currentMatchToPlay.p1).name;
    document.getElementById("modal-p2-name").innerText = playersData.find(x=>x.id===currentMatchToPlay.p2).name;
    document.getElementById("modal-s1").value = ""; document.getElementById("modal-s2").value = "";
    document.getElementById("match-modal").style.display = "flex";
};
document.getElementById("modal-btn-close").addEventListener("click", () => { document.getElementById("match-modal").style.display="none"; });

document.getElementById("modal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const s1 = parseInt(document.getElementById("modal-s1").value); const s2 = parseInt(document.getElementById("modal-s2").value);
    if(s1 === s2) return alert("Serve un vincitore!");

    const wId = s1 > s2 ? currentMatchToPlay.p1 : currentMatchToPlay.p2; const lId = s1 > s2 ? currentMatchToPlay.p2 : currentMatchToPlay.p1;
    let newBracket = [...activeTourData.bracket]; let cm = newBracket.find(x => x.id === currentMatchToPlay.id);
    cm.s1 = s1; cm.s2 = s2; cm.w = wId; cm.l = lId;

    const wData = playersData.find(p=>p.id===wId); const lData = playersData.find(p=>p.id===lId);
    let points = calculateMatchPoints(wData, lData, Math.max(s1,s2), Math.min(s1,s2), "11", new Date(activeTourData.timestamp.toDate())); 
    
    await updateDoc(doc(db, "players", wId), { rating: wData.rating + points, wins: wData.wins + 1 });
    await updateDoc(doc(db, "players", lId), { rating: lData.rating - points, losses: lData.losses + 1 });
    await addDoc(matchesRef, { tournamentId: activeTourData.id, tourRound: cm.round, winner: wId, loser: lId, winnerScore: Math.max(s1,s2), loserScore: Math.min(s1,s2), pointsExchanged: points, timestamp: Timestamp.now() });

    if(cm.nextW) { let [nid, slot] = cm.nextW.split('.'); newBracket.find(x=>x.id===nid)[slot] = wId; }
    if(cm.nextL) { let [nid, slot] = cm.nextL.split('.'); newBracket.find(x=>x.id===nid)[slot] = lId; }

    if(activeTourData.players.length === 6 || activeTourData.players.length === 7) {
        const qs = newBracket.filter(x => x.id.startsWith('Q'));
        if(!qs.some(x => !x.w)) { 
            let bestDiff = -999; let bestL = null;
            qs.forEach(q => { let diff = q.l === q.p1 ? (q.s1 - q.s2) : (q.s2 - q.s1); if(diff > bestDiff) { bestDiff = diff; bestL = q.l; }});
            if(activeTourData.players.length === 6) { let s2m = newBracket.find(x=>x.id==='S2'); if(!s2m.p2) { s2m.p2 = bestL; alert(`🎉 Il Miglior Perdente dei Quarti è ${playersData.find(x=>x.id===bestL).name}! Ripescato!`); } }
            if(activeTourData.players.length === 7) { let pi = newBracket.find(x=>x.id==='PI'); if(!pi.p2) { pi.p2 = bestL; alert(`🎉 ${playersData.find(x=>x.id===bestL).name} affronterà lo Spareggio per la Semifinale!`); } }
        }
    }
    await updateDoc(doc(db, "tournaments", activeTourData.id), { bracket: newBracket });
    document.getElementById("match-modal").style.display="none";
});

document.getElementById("tour-match-form").addEventListener("submit", async (e) => {
    e.preventDefault(); const wId = document.getElementById("tour-winner").value; const lId = document.getElementById("tour-loser").value;
    if (wId === lId) return alert("Giocatori diversi!");
    const wData = playersData.find(p=>p.id===wId); const lData = playersData.find(p=>p.id===lId);
    let points = calculateMatchPoints(wData, lData, parseInt(document.getElementById("tour-score-winner").value), parseInt(document.getElementById("tour-score-loser").value), "11", new Date(activeTourData.timestamp.toDate()));
    await updateDoc(doc(db, "players", wId), { rating: wData.rating + points, wins: wData.wins + 1 });
    await updateDoc(doc(db, "players", lId), { rating: lData.rating - points, losses: lData.losses + 1 });
    await addDoc(matchesRef, { tournamentId: activeTourData.id, winner: wId, loser: lId, winnerScore: document.getElementById("tour-score-winner").value, loserScore: document.getElementById("tour-score-loser").value, pointsExchanged: points, timestamp: Timestamp.now() });
    document.getElementById("tour-match-form").reset();
});

document.getElementById("btn-finish-tournament").addEventListener("click", async () => {
    let p1, p2, p3;
    if(activeTourData.mode === 'auto') {
        const f1 = activeTourData.bracket.find(m=>m.id==='F1'); const f3 = activeTourData.bracket.find(m=>m.id==='F3');
        p1 = f1.w; p2 = f1.l; p3 = f3.w;
    } else {
        p1 = document.getElementById("tour-1st").value; p2 = document.getElementById("tour-2nd").value; p3 = document.getElementById("tour-3rd").value;
        if(!p1 || !p2 || !p3 || p1===p2 || p1===p3 || p2===p3) return alert("Podio non valido!");
    }
    if(!confirm("Concludere e distribuire il Jackpot?")) return;
    
    const prize1 = Math.round(activeTourData.pot * 0.60); const prize2 = Math.round(activeTourData.pot * 0.30); const prize3 = Math.round(activeTourData.pot * 0.10);
    const d1 = (await getDoc(doc(db, "players", p1))).data(); await updateDoc(doc(db, "players", p1), { rating: d1.rating + prize1 });
    const d2 = (await getDoc(doc(db, "players", p2))).data(); await updateDoc(doc(db, "players", p2), { rating: d2.rating + prize2 });
    const d3 = (await getDoc(doc(db, "players", p3))).data(); await updateDoc(doc(db, "players", p3), { rating: d3.rating + prize3 });

    await updateDoc(doc(db, "tournaments", activeTourData.id), { status: 'finished', podium1: p1, podium2: p2, podium3: p3, prizes: {p1: prize1, p2: prize2, p3: prize3} });
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } }); 
});

function updateH2H() {
    const p1 = document.getElementById("h2h-p1").value; const p2 = document.getElementById("h2h-p2").value;
    const resDiv = document.getElementById("h2h-result"); const narDiv = document.getElementById("h2h-narrative"); narDiv.style.display = "none";
    if(!p1 || !p2 || p1 === p2) return resDiv.innerHTML = "Seleziona due giocatori diversi.";
    let w1 = 0, w2 = 0; const h2hMatches = matchesData.filter(m => (m.winner === p1 && m.loser === p2) || (m.winner === p2 && m.loser === p1)).sort((a,b) => b.timestamp - a.timestamp);
    h2hMatches.forEach(m => { if(m.winner === p1) w1++; else w2++; });
    const n1 = playersData.find(x=>x.id===p1).name; const n2 = playersData.find(x=>x.id===p2).name; const tot = w1 + w2;
    if(tot === 0) return resDiv.innerHTML = `Nessuna sfida registrata tra ${n1} e ${n2}.`;
    resDiv.innerHTML = `<div style="margin-bottom: 10px; font-weight: bold;">Scontri Diretti: ${tot}</div><div style="display: flex; justify-content: space-between; font-weight: bold;"><span style="color:var(--success-color);">${n1} (${w1})</span><span style="color:var(--text-color);">${n2} (${w2})</span></div><div style="width: 100%; height: 10px; background: var(--input-bg); border-radius: 5px; margin-top: 5px; display: flex;"><div style="height: 100%; width: ${(w1/tot)*100}%; background: var(--success-color);"></div><div style="height: 100%; width: ${(w2/tot)*100}%; background: var(--danger-color);"></div></div>`;
    
    let streakCount = 0; if(h2hMatches.length > 0) { const streakId = h2hMatches[0].winner; for(let m of h2hMatches) { if(m.winner === streakId) streakCount++; else break; } }
    let narrative = w1 === w2 ? pickRnd([`Equilibrio perfetto. Una rivalità sul filo del rasoio.`, `Uno stallo messicano.`]) : (Math.abs(w1-w2)===1 ? `Testa a testa apertissimo!` : (w1===0||w2===0 ? `Dominio assoluto. Incubo per lo sfidante.` : `I numeri parlano chiaro, ma c'è sempre speranza.`));
    if(streakCount >= 3) narrative += ` Striscia aperta di ${streakCount} vittorie!`;
    narDiv.innerText = `🎙️ "${narrative}"`; narDiv.style.display = "block";
}
document.getElementById("h2h-p1").addEventListener("change", updateH2H); document.getElementById("h2h-p2").addEventListener("change", updateH2H);

function populateMonths() {
    const select = document.getElementById("month-select"); const months = new Set();
    matchesData.forEach(m => { if(m.timestamp) { const d = m.timestamp.toDate(); months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); }});
    const arr = Array.from(months).sort().reverse(); select.innerHTML = '<option value="">Seleziona Mese...</option>';
    arr.forEach(val => { const [y, m] = val.split('-'); const nomeMese = new Date(y, m-1, 1).toLocaleString('it-IT', { month: 'long', year: 'numeric' }); select.innerHTML += `<option value="${val}">${nomeMese.charAt(0).toUpperCase() + nomeMese.slice(1)}</option>`; });
}
document.getElementById("month-select").addEventListener("change", (e) => {
    const resDiv = document.getElementById("monthly-leaderboard"); if(!e.target.value) return resDiv.innerHTML = "<p style='text-align:center; color: #888;'>Seleziona un mese.</p>";
    const [year, month] = e.target.value.split('-'); let pointsGained = {}; let matchCount = 0;
    matchesData.forEach(m => { if(m.timestamp) { const d = m.timestamp.toDate(); if(d.getFullYear() == year && d.getMonth() + 1 == month) { matchCount++; pointsGained[m.winner] = (pointsGained[m.winner] || 0) + m.pointsExchanged; pointsGained[m.loser] = (pointsGained[m.loser] || 0) - m.pointsExchanged; } } });
    if(matchCount === 0) return resDiv.innerHTML = "<p style='text-align:center; color: #888;'>Nessun movimento in questo mese.</p>";
    let resultHTML = '<div class="table-container"><table><thead><tr><th>Giocatore</th><th>Saldo Punti</th></tr></thead><tbody>';
    const sorted = Object.entries(pointsGained).sort((a,b) => b[1] - a[1]);
    if(sorted.length === 0) resultHTML += '<tr><td colspan="2">Nessun dato.</td></tr>';
    sorted.forEach(([pId, pts], index) => { const pName = playersData.find(x=>x.id===pId)?.name || "Ignoto"; const color = pts > 0 ? 'var(--success-color)' : 'var(--danger-color)'; const sign = pts > 0 ? '+' : ''; resultHTML += `<tr><td style="font-weight: ${index === 0 ? 'bold' : 'normal'}; ${index===0 ? 'color:#d4af37;':''}">${index === 0 ? '👑 ' : ''}${pName}</td><td style="color: ${color}; font-weight: bold;">${sign}${pts}</td></tr>`; });
    resDiv.innerHTML = resultHTML + '</tbody></table></div>';
});

document.getElementById("stats-player-select").addEventListener("change", (e) => generateSmartComment(e.target.value));

function generateSmartComment(playerId) {
    const commentBox = document.getElementById("ai-comment"); const extraBox = document.getElementById("extra-stats"); const extStatsBox = document.getElementById("extended-stats");
    const epicBadgeBox = document.getElementById("epic-title-container"); const epicTitleSpan = document.getElementById("player-epic-title");
    extraBox.innerHTML = ""; extStatsBox.style.display = "none"; document.getElementById("chart-container-pie").style.display = playerId === "general" ? "none" : "block";
    document.getElementById("wr-text-display").innerText = "";
    document.getElementById("chart-title-line").innerText = "📈 Andamento Punti";

    if(playersData.length === 0) { epicBadgeBox.style.display = "none"; return commentBox.innerText = "Attendo giocatori..."; }
    
    if(playerId === "general") {
        epicBadgeBox.style.display = "none";
        document.getElementById("chart-title-line").innerText = "📊 Punti Attuali (Classifica)";
        const sorted = [...playersData].sort((a,b) => b.rating - a.rating); const leader = sorted[0]; let genNar = "";
        if(sorted.length > 1) {
            const gap = leader.rating - sorted[1].rating;
            if(gap > 100) genNar = pickRnd([`Il tavolo è sotto la dittatura assoluta di ${leader.name}. Con un distacco incolmabile di ${Math.round(gap)} punti, gli altri giocano solo per le briciole. Serve una rivolta!`, `${leader.name} sta giocando un altro sport. Ha creato un abisso colossale col resto del gruppo.`]);
            else if(gap < 15) genNar = pickRnd([`Situazione incandescente al vertice! ${leader.name} è primo, ma sente il fiato sul collo. Basterebbe un colpo di tosse per fargli perdere la corona.`, `Testa a testa in vetta! Nessuno può dormire sonni tranquilli lassù.`]);
            else genNar = pickRnd([`Il trono è attualmente di ${leader.name} (${Math.round(leader.rating)} pt). Il gruppo è vivo e battagliero, il livello si alza.`, `Le gerarchie sono stabilite, ma la classifica è fluida. Chi sarà la sorpresa di questa settimana?`]);
        } else { genNar = "C'è solo un giocatore nell'Arena. Chi oserà sfidarlo?"; }
        commentBox.innerText = `🎙️ "${genNar}"`; 

        let maxStreakGlobal = 0; let streakOwner = "";
        playersData.forEach(pl => {
            let cs=0, ms=0; const pm = matchesData.filter(m => m.winner === pl.id || m.loser === pl.id).sort((a,b) => a.timestamp - b.timestamp);
            pm.forEach(m => { if(m.winner === pl.id) { cs++; if(cs>ms) ms=cs; } else cs=0; });
            if(ms > maxStreakGlobal) { maxStreakGlobal = ms; streakOwner = pl.name; }
        });

        extStatsBox.style.display = "flex";
        extStatsBox.innerHTML = `<div class="extended-stat-box"><span class="badge-title">Record All-Time Gruppo</span><strong>🔥 Striscia Imbattibilità:</strong> ${maxStreakGlobal} vittorie (${streakOwner})</div>`;
        drawRealCharts("general", null); return;
    }
    
    const p = playersData.find(x => x.id === playerId);
    const tot = p.wins + p.losses; const wr = tot > 0 ? Math.round((p.wins / tot) * 100) : 0;
    const wonTours = toursData.filter(t => t.status === 'finished' && t.podium1 === p.id).length;
    document.getElementById("wr-text-display").innerText = wr + "%";

    const playerMatchesChronological = matchesData.filter(m => m.winner === p.id || m.loser === p.id).sort((a,b) => a.timestamp - b.timestamp);
    let currentStreak = 0; let maxStreak = 0;
    playerMatchesChronological.forEach(m => { if(m.winner === p.id) { currentStreak++; if(currentStreak > maxStreak) maxStreak = currentStreak; } else currentStreak = 0; });
    let streakBadge = currentStreak >= 3 ? ` 🔥 (${currentStreak})` : ` (${currentStreak})`;

    let bestWin = null; let bestDiff = -1; let worstLoss = null; let worstDiff = -1;
    playerMatchesChronological.forEach(m => {
        let diff = Math.abs(m.winnerScore - m.loserScore);
        if(m.winner === p.id && diff > bestDiff) { bestDiff = diff; bestWin = m; }
        if(m.loser === p.id && diff > worstDiff) { worstDiff = diff; worstLoss = m; }
    });

    let title = "Il Novizio"; let narrative = ""; let badgeBg = "linear-gradient(45deg, #d4af37, #b8860b)";
    const isFirst = p.id === [...playersData].sort((a,b)=>b.rating-a.rating)[0].id;
    
    if(tot < 5) { title = "L'Incognita"; narrative = pickRnd([`È da poco sceso nell'arena. Il mistero che lo avvolge lo rende imprevedibile.`, `Un talento grezzo da decifrare.`]); badgeBg = "linear-gradient(45deg, #a8a8a8, #696969)"; }
    else if (wr < 20) { title = pickRnd(["Il Sacco da Boxe", "L'Eterno Sconfitto", "Il Disastro"]); narrative = `I numeri sono impietosi. Entra in campo solo per fare beneficenza di punti Elo.`; badgeBg = "linear-gradient(45deg, #2b2b2b, #000000)"; }
    else if (wr <= 30) { title = pickRnd(["L'Incudine", "Il Muro di Gomma", "Il Masochista"]); narrative = `Prende colpi su colpi, ma torna sempre al tavolo. Eroe tragico di questo gruppo.`; badgeBg = "linear-gradient(45deg, #708090, #2f4f4f)"; }
    else if (isFirst && wr > 65) { title = pickRnd(["Il Tiranno", "Il Monarca", "L'Intoccabile"]); narrative = `Siede sul trono con ferocia. Non fa prigionieri. Sfiderà mai qualcuno in grado di farlo sudare?`; badgeBg = "linear-gradient(45deg, #ffd700, #ff8c00)"; }
    else if (isFirst && wr <= 65) { title = "Il Re Astuto"; narrative = `Primo in classifica, ma non invincibile. Mantiene il comando con l'astuzia.`; }
    else if (!isFirst && wr >= 70) { title = pickRnd(["Il Predatore Occulto", "L'Esecutore", "Il Cecchino"]); narrative = `Guarda il suo Win Rate. Quando gioca è una condanna a morte per chi sta dall'altra parte.`; badgeBg = "linear-gradient(45deg, #8b0000, #4a0000)"; }
    else if (currentStreak >= 5) { title = pickRnd(["L'Inarrestabile", "La Fenice", "La Cometa"]); narrative = `Totalmente "On Fire". È entrato in una bolla mistica dove ogni schiacciata entra.`; badgeBg = "linear-gradient(45deg, #ff4500, #dc143c)"; }
    else if (currentStreak <= -5) { title = pickRnd(["L'Anima Tormentata", "Il Sopravvissuto"]); narrative = `Un tunnel buio lungo ${Math.abs(currentStreak)} sconfitte. Servono energie positive, o un esorcismo alla racchetta.`; badgeBg = "linear-gradient(45deg, #483d8b, #191970)"; }
    else if (wr > 40 && wr < 60 && tot > 20) { title = pickRnd(["Il Caotico", "La Mina Vagante", "Il Jolly"]); narrative = `Può battere il campione o perdere con l'ultimo. L'imprevedibilità è la sua firma.`; badgeBg = "linear-gradient(45deg, #8a2be2, #4b0082)"; }
    else if (tot > 40 && wr >= 50) { title = pickRnd(["Il Veterano", "Lo Stratega", "Il Maestro"]); narrative = `Ha visto più top-spin lui di chiunque altro. Conosce i punti deboli del gruppo.`; badgeBg = "linear-gradient(45deg, #008080, #006400)"; }
    else { title = "La Promessa"; narrative = `Alterna sprazzi di genio a blackout dolorosi. Ha un gran potenziale inespresso.`; badgeBg = "linear-gradient(45deg, #4682b4, #00008b)"; }

    let ops = {}; playerMatchesChronological.forEach(m => { if(m.winner === playerId) { ops[m.loser] = ops[m.loser] || {w:0, l:0}; ops[m.loser].w++; } if(m.loser === playerId) { ops[m.winner] = ops[m.winner] || {w:0, l:0}; ops[m.winner].l++; } });
    let best = null, wBest = 0, worst = null, lWorst = 0;
    for(const [id, s] of Object.entries(ops)) { if(s.w > wBest){wBest = s.w; best = id;} if(s.l > lWorst){lWorst = s.l; worst = id;} }
    const nBest = best ? (playersData.find(x=>x.id===best)?.name || "?") : "-"; const nWorst = worst ? (playersData.find(x=>x.id===worst)?.name || "?") : "-";

    if(worst && lWorst >= 3) narrative += pickRnd([` Il suo tallone d'Achille è ${nWorst}, una vera maledizione.`, ` Davanti a ${nWorst} va regolarmente in tilt.`]);
    else if(best && wBest >= 3) narrative += pickRnd([` Ha trovato nel povero ${nBest} il suo bancomat personale.`, ` Contro ${nBest} si sente onnipotente.`]);

    epicBadgeBox.style.display = "block"; epicTitleSpan.innerText = title; epicTitleSpan.style.background = badgeBg; commentBox.innerText = `🎙️ "${narrative}"`;
    extraBox.innerHTML = `<div class="stat-box"><span>Tornei Vinti</span><strong>🏆 ${wonTours}</strong></div><div class="stat-box"><span>Win Streak</span><strong>${streakBadge}</strong></div><div class="stat-box"><span>Vittima Preferita</span><strong>${nBest}</strong></div><div class="stat-box"><span>Bestia Nera</span><strong>${nWorst}</strong></div>`;
    
    extStatsBox.innerHTML = "";
    if(bestWin) { const lN = playersData.find(x=>x.id===bestWin.loser)?.name || "?"; const date = bestWin.timestamp.toDate().toLocaleDateString("it-IT", {month:'short', year:'numeric'}); extStatsBox.innerHTML += `<div class="extended-stat-box"><span class="badge-title">Vittoria Migliore</span><strong>Vinto ${bestWin.winnerScore}-${bestWin.loserScore}</strong> contro ${lN} <span class="match-context">(${date}${bestWin.tournamentId ? ' in Torneo' : ''})</span></div>`; }
    if(worstLoss) { const wN = playersData.find(x=>x.id===worstLoss.winner)?.name || "?"; const date = worstLoss.timestamp.toDate().toLocaleDateString("it-IT", {month:'short', year:'numeric'}); extStatsBox.innerHTML += `<div class="extended-stat-box"><span class="badge-title">Sconfitta Peggiore</span><strong>Perso ${worstLoss.loserScore}-${worstLoss.winnerScore}</strong> contro ${wN} <span class="match-context">(${date}${worstLoss.tournamentId ? ' in Torneo' : ''})</span></div>`; }
    extStatsBox.style.display = "flex";

    drawRealCharts("single", p);
}

function drawRealCharts(type, p) {
    if(lineChart) lineChart.destroy(); if(pieChart) pieChart.destroy();
    const ctx = document.getElementById('rankingChart').getContext('2d'); Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--text-color').trim(); Chart.defaults.font.family = 'Inter, sans-serif';
    
    if(type === "general") { 
        const sortedData = [...playersData].sort((a,b) => b.rating - a.rating);
        const labels = sortedData.map(pl => pl.name);
        const dataPts = sortedData.map(pl => Math.round(pl.rating));
        
        const minRating = Math.min(...dataPts);
        const yMin = Math.max(0, minRating - 30);

        // IL GRADIENTE ORA È ORIZZONTALE
        const gradient = ctx.createLinearGradient(0, 0, ctx.canvas.width || 400, 0);
        gradient.addColorStop(0, 'rgba(230, 57, 70, 0.4)');
        gradient.addColorStop(1, 'rgba(230, 57, 70, 0.9)');

        lineChart = new Chart(ctx, { 
            type: 'bar', 
            data: { 
                labels: labels, 
                datasets: [{ 
                    label: 'Punteggio Elo', 
                    data: dataPts, 
                    backgroundColor: gradient, 
                    borderColor: '#e63946', 
                    borderWidth: 1, 
                    borderRadius: 6 
                }] 
            }, 
            options: { 
                indexAxis: 'y', // QUESTA È LA MAGIA: GRAFICO ORIZZONTALE!
                maintainAspectRatio: false, 
                layout: { padding: { right: 20 } }, 
                scales: { 
                    x: { 
                        beginAtZero: false, 
                        min: yMin, 
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: { font: { family: 'Inter', size: 11 } } 
                    },
                    y: { 
                        grid: { display: false },
                        ticks: { 
                            autoSkip: false, 
                            font: { family: 'Inter', size: 12, weight: '600' } 
                        } 
                    }
                },
                plugins: { legend: { display: false } }
            } 
        }); 
    } else {
        const pm = matchesData.filter(m => m.winner === p.id || m.loser === p.id).reverse(); let lbs = ['Inizio'], dts = [1000];
        pm.forEach((m, i) => { lbs.push(`M${i+1}`); dts.push(m.winner === p.id && m.winnerNewRating ? m.winnerNewRating : (m.loser === p.id && m.loserNewRating ? m.loserNewRating : dts[dts.length-1])); });
        lineChart = new Chart(ctx, { type: 'line', data: { labels: lbs, datasets: [{ label: p.name, data: dts, borderColor: '#e63946', backgroundColor: 'rgba(230, 57, 70, 0.1)', fill: true, tension: 0.2 }] }, options: { maintainAspectRatio: false, responsive: true } });
        pieChart = new Chart(document.getElementById('winRateChart').getContext('2d'), { type: 'doughnut', data: { labels: ['Vittorie', 'Sconfitte'], datasets: [{ data: [p.wins, p.losses], backgroundColor: ['#2a9d8f', '#d62828'] }] }, options: { maintainAspectRatio: false, responsive: true } });
    }
}