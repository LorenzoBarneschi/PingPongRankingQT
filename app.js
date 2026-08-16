import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, setDoc, getDoc, updateDoc, deleteDoc, Timestamp, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyBv0C_tgvchxbG6xrvtj9ypeN_ARmvIhdA", authDomain: "pingpongrankingqt.firebaseapp.com", projectId: "pingpongrankingqt" };
const app = initializeApp(firebaseConfig); const db = getFirestore(app);
const playersRef = collection(db, "players"); const matchesRef = collection(db, "matches"); const toursRef = collection(db, "tournaments");

let playersData = []; let matchesData = []; let toursData = []; let lineChart = null; let pieChart = null;
let activeTourId = null; let activeTourData = null;

function setNow() { 
    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); 
    document.getElementById('match-date').value = now.toISOString().slice(0,16); document.getElementById('tour-date').value = now.toISOString().slice(0,16); 
}
window.addEventListener('DOMContentLoaded', setNow); document.getElementById('btn-now').addEventListener('click', setNow);
document.getElementById('format').addEventListener('change', (e) => { document.getElementById('custom-format-details').style.display = e.target.value === 'custom' ? 'block' : 'none'; });
const pickRnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

function switchTab(tabId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`view-${tabId}`).classList.add('active-view');
    document.getElementById(`nav-${tabId}`).classList.add('active');
}
document.getElementById("nav-arena").addEventListener("click", () => switchTab('arena'));
document.getElementById("nav-history").addEventListener("click", () => switchTab('history'));
document.getElementById("nav-stats").addEventListener("click", () => { switchTab('stats'); generateSmartComment(document.getElementById("stats-player-select").value); populateMonths(); });
document.getElementById("nav-tournaments").addEventListener("click", () => { switchTab('tournaments'); checkActiveTournament(); });

// ⚠️ RESET DATABASE (Riporta a 1000)
document.getElementById("btn-hard-reset").addEventListener("click", async () => {
    if(confirm("ATTENZIONE! Riportare TUTTI i giocatori a 1000 punti e azzerare Vittorie e Sconfitte?")) {
        if(confirm("Sei sicuro? (Le partite nello storico perderanno il riferimento corretto ai punti)")) {
            const batch = writeBatch(db);
            playersData.forEach(p => { batch.update(doc(db, "players", p.id), { rating: 1000, wins: 0, losses: 0 }); });
            await batch.commit(); alert("Tutti i giocatori resettati a 1000 pt.");
        }
    }
});

// CLASSIFICA
onSnapshot(query(playersRef, orderBy("rating", "desc")), (snapshot) => {
    const rankingList = document.getElementById("ranking-list");
    const selects = [document.getElementById("winner"), document.getElementById("loser"), document.getElementById("delete-player-select"), document.getElementById("stats-player-select"), document.getElementById("h2h-p1"), document.getElementById("h2h-p2")];
    rankingList.innerHTML = "";
    selects.forEach(s => s.innerHTML = (s.id==='stats-player-select'?'<option value="general">📊 Statistiche Generali</option>':'<option value="">Seleziona...</option>'));
    playersData = []; let pos = 1;
    snapshot.forEach((doc) => {
        const p = doc.data(); p.id = doc.id; playersData.push(p);
        let rowClass = pos === 3 && snapshot.size > 3 ? "podium-divider" : "";
        let rankClass = pos === 1 ? "rank-1" : (pos === 2 ? "rank-2" : (pos === 3 ? "rank-3" : (pos === snapshot.size && snapshot.size >= 4 ? "rank-last" : "")));
        rankingList.innerHTML += `<tr class="${rowClass}"><td class="${rankClass}">${pos}°</td><td class="${rankClass}">${p.name}</td><td class="${rankClass}">${Math.round(p.rating)}</td><td>${p.wins} - ${p.losses}</td></tr>`;
        selects.forEach(s => s.innerHTML += `<option value="${p.id}">${p.name}</option>`); pos++;
    });
    if(document.getElementById('view-tournaments').classList.contains('active-view')) renderTournamentCheckboxes();
});

// STORICO
onSnapshot(query(matchesRef, orderBy("timestamp", "desc")), (snapshot) => {
    matchesData = []; snapshot.forEach(docSnap => { const m = docSnap.data(); m.id = docSnap.id; matchesData.push(m); }); renderHistory(); updateH2H();
});
onSnapshot(query(toursRef, orderBy("timestamp", "desc")), (snapshot) => {
    toursData = []; snapshot.forEach(docSnap => { const t = docSnap.data(); t.id = docSnap.id; toursData.push(t); }); renderHistory(); checkActiveTournament();
});

function renderHistory() {
    const list = document.getElementById("history-list"); list.innerHTML = "";
    const allEvents = [...matchesData.map(m=>({...m, type:'match'})), ...toursData.map(t=>({...t, type:'tour'}))].filter(e => e.timestamp).sort((a,b) => b.timestamp - a.timestamp);
    if(allEvents.length === 0) return list.innerHTML = "<p>Nessun evento registrato.</p>";

    allEvents.forEach(ev => {
        const date = ev.timestamp.toDate().toLocaleDateString("it-IT", {day:'numeric', month:'short', year:'2-digit'});
        if(ev.type === 'match') {
            if(ev.tournamentId) return; // Nasconde le singole partite di torneo, verranno raggruppate
            const wName = playersData.find(p => p.id === ev.winner)?.name || "Ignoto"; const lName = playersData.find(p => p.id === ev.loser)?.name || "Ignoto";
            list.innerHTML += `<div class="history-item"><div class="history-info"><div class="match-title">🥇 ${wName} (${ev.winnerScore}) vs 🥈 ${lName} (${ev.loserScore})</div><div class="match-meta">📅 ${date} | 📈 Punti: ${ev.pointsExchanged}</div></div><button class="btn-delete-match" onclick="deleteMatch('${ev.id}', '${ev.winner}', '${ev.loser}', ${ev.pointsExchanged})">Annulla</button></div>`;
        } else {
            if(ev.status === 'active') return; 
            const n1 = playersData.find(p => p.id === ev.podium1)?.name || "?"; const n2 = playersData.find(p => p.id === ev.podium2)?.name || "?"; const n3 = playersData.find(p => p.id === ev.podium3)?.name || "?";
            list.innerHTML += `<div class="history-item is-tournament"><div class="history-info"><div class="match-title" style="color:#d4af37; font-size:1.1rem;">🏆 Torneo del ${date}</div><div class="match-meta">🥇 ${n1} (+${ev.prizes.p1}pt)<br>🥈 ${n2} (+${ev.prizes.p2}pt)<br>🥉 ${n3} (+${ev.prizes.p3}pt)<br>💰 Pot: ${ev.pot}pt</div></div><button class="btn-delete-match" onclick="deleteTournament('${ev.id}')">Annulla Torneo</button></div>`;
        }
    });
}

// CANCELLAZIONI (La magia del viaggio nel tempo)
window.deleteMatch = async (matchId, wId, lId, pts) => {
    if(!confirm("Annullare partita? I punti torneranno come prima.")) return;
    const w = await getDoc(doc(db, "players", wId)); const l = await getDoc(doc(db, "players", lId));
    if (w.exists()) await updateDoc(doc(db, "players", wId), { rating: w.data().rating - pts, wins: Math.max(0, w.data().wins - 1) });
    if (l.exists()) await updateDoc(doc(db, "players", lId), { rating: l.data().rating + pts, losses: Math.max(0, l.data().losses - 1) });
    await deleteDoc(doc(db, "matches", matchId));
};

window.deleteTournament = async (tourId) => {
    if(!confirm("⚠️ ATTENZIONE: Annullare questo torneo eliminerà anche TUTTE LE PARTITE giocate al suo interno e restituirà i punti scambiati. Procedere?")) return;
    const t = toursData.find(x => x.id === tourId); if(!t) return;
    
    // 1. Togli i premi dal podio
    if(t.podium1) { const d = await getDoc(doc(db, "players", t.podium1)); await updateDoc(doc(db, "players", t.podium1), { rating: d.data().rating - t.prizes.p1}); }
    if(t.podium2) { const d = await getDoc(doc(db, "players", t.podium2)); await updateDoc(doc(db, "players", t.podium2), { rating: d.data().rating - t.prizes.p2}); }
    if(t.podium3) { const d = await getDoc(doc(db, "players", t.podium3)); await updateDoc(doc(db, "players", t.podium3), { rating: d.data().rating - t.prizes.p3}); }
    
    // 2. Restituisci il Buy-in ai partecipanti
    for(let pid of t.players) { let pDoc = await getDoc(doc(db, "players", pid)); if(pDoc.exists()) await updateDoc(doc(db, "players", pid), { rating: pDoc.data().rating + t.entryFeeMap[pid] }); }

    // 3. Cancella e inverte tutte le partite legate al torneo
    const mQuery = await getDocs(query(matchesRef));
    const batch = writeBatch(db);
    for(let docSnap of mQuery.docs) {
        const m = docSnap.data();
        if(m.tournamentId === tourId) {
            const wDoc = await getDoc(doc(db, "players", m.winner)); const lDoc = await getDoc(doc(db, "players", m.loser));
            if(wDoc.exists()) batch.update(doc(db, "players", m.winner), { rating: wDoc.data().rating - m.pointsExchanged, wins: Math.max(0, wDoc.data().wins - 1) });
            if(lDoc.exists()) batch.update(doc(db, "players", m.loser), { rating: lDoc.data().rating + m.pointsExchanged, losses: Math.max(0, lDoc.data().losses - 1) });
            batch.delete(docSnap.ref); 
        }
    }
    batch.delete(doc(db, "tournaments", tourId));
    await batch.commit(); alert("Torneo e partite interne annullate con successo!");
};

document.getElementById("player-form").addEventListener("submit", async (e) => { e.preventDefault(); const n = document.getElementById("new-player-name").value.trim(); if (n) { await setDoc(doc(playersRef, n.toLowerCase()), { name: n, rating: 1000, wins: 0, losses: 0 }); document.getElementById("new-player-name").value = ""; }});
document.getElementById("delete-player-btn").addEventListener("click", async () => { const id = document.getElementById("delete-player-select").value; if(id && confirm("Sicuro?")) await deleteDoc(doc(playersRef, id)); });

// SALVA PARTITA (Arena)
document.getElementById("match-form").addEventListener("submit", async (e) => {
    e.preventDefault(); const wId = document.getElementById("winner").value; const lId = document.getElementById("loser").value;
    if (wId === lId) return alert("Giocatori diversi!"); document.getElementById("save-match-btn").disabled = true;
    
    const wData = (await getDoc(doc(db, "players", wId))).data(); const lData = (await getDoc(doc(db, "players", lId))).data();
    let fmtMult = document.getElementById("format").value === "21" ? 1.2 : (document.getElementById("format").value === "bo3_11" ? 1.5 : 1.0);
    const expW = 1 / (1 + Math.pow(10, (lData.rating - wData.rating) / 400));
    let points = Math.max(1, Math.round(32 * (1 - expW) * fmtMult));
    
    await updateDoc(doc(db, "players", wId), { rating: wData.rating + points, wins: wData.wins + 1 });
    await updateDoc(doc(db, "players", lId), { rating: lData.rating - points, losses: lData.losses + 1 });
    await addDoc(matchesRef, { winner: wId, loser: lId, winnerScore: document.getElementById("score-winner").value, loserScore: document.getElementById("score-loser").value, pointsExchanged: points, winnerNewRating: wData.rating+points, loserNewRating: lData.rating-points, timestamp: Timestamp.fromDate(new Date(document.getElementById('match-date').value)) });
    document.getElementById("match-form").reset(); setNow(); document.getElementById("save-match-btn").disabled = false;
});

// --- MOTORE TORNEI INTEGRATO ---
function renderTournamentCheckboxes() {
    const container = document.getElementById("tournament-players-checkboxes"); container.innerHTML = "";
    playersData.forEach(p => { container.innerHTML += `<label style="display: flex; align-items: center; gap: 10px; cursor: pointer;"><input type="checkbox" value="${p.id}" class="tour-cb" style="width: 20px; height: 20px; margin: 0;"> ${p.name} (${Math.round(p.rating)} pt)</label>`; });
}

function checkActiveTournament() {
    activeTourData = toursData.find(t => t.status === 'active');
    if(activeTourData) {
        activeTourId = activeTourData.id;
        document.getElementById("tour-setup-section").style.display = "none";
        document.getElementById("active-tournament-section").style.display = "block";
        document.getElementById("tour-pot").innerText = activeTourData.pot;
        
        const selects = [document.getElementById("tour-winner"), document.getElementById("tour-loser"), document.getElementById("tour-1st"), document.getElementById("tour-2nd"), document.getElementById("tour-3rd")];
        selects.forEach(s => { s.innerHTML = s.innerHTML.split('</option>')[0] + '</option>'; activeTourData.players.forEach(pid => { const name = playersData.find(x=>x.id===pid)?.name; if(name) s.innerHTML += `<option value="${pid}">${name}</option>`; }); });
        
        renderBracket(); // Disegna l'albero!
    } else {
        activeTourId = null; document.getElementById("tour-setup-section").style.display = "block"; document.getElementById("active-tournament-section").style.display = "none"; renderTournamentCheckboxes();
    }
}

// Disegna Tabellone ad Albero
function renderBracket() {
    const container = document.getElementById("bracket-container"); container.innerHTML = "";
    const tMatches = matchesData.filter(m => m.tournamentId === activeTourId).reverse(); // Più vecchie prima
    if(tMatches.length === 0) { container.innerHTML = "<p style='text-align:center; color:#888; font-size:0.9rem;'>Inizia a registrare le partite per formare il tabellone.</p>"; return; }

    const rounds = {};
    tMatches.forEach(m => { if(!rounds[m.tourRound]) rounds[m.tourRound] = []; rounds[m.tourRound].push(m); });

    // Ordine di visualizzazione turni
    const order = ["Preliminari", "Quarti", "Semifinale", "Finalina", "Finale"];
    order.forEach(r => {
        if(rounds[r]) {
            let html = `<div class="bracket-round"><div class="bracket-round-title">${r}</div>`;
            rounds[r].forEach(m => {
                const w = playersData.find(p=>p.id===m.winner)?.name; const l = playersData.find(p=>p.id===m.loser)?.name;
                html += `<div class="bracket-match ${r==='Finale'?'finale':''}">
                    <div style="flex:1;"><span class="bracket-player" style="color:var(--success-color);">🥇 ${w}</span> <span class="bracket-score">${m.winnerScore}</span></div>
                    <div style="flex:1; text-align:right;"><span class="bracket-score">${m.loserScore}</span> <span class="bracket-player" style="color:var(--danger-color);">${l}</span></div>
                </div>`;
            });
            html += `</div>`; container.innerHTML += html;
        }
    });
}

document.getElementById("btn-start-tournament").addEventListener("click", async () => {
    const checked = Array.from(document.querySelectorAll(".tour-cb:checked")).map(cb => cb.value);
    if(checked.length < 4) return alert("Minimo 4 giocatori!");
    if(!confirm("Prelevo 0.5% Elo come Buy-in. Confermi?")) return;
    
    let pot = 0; let feeMap = {};
    for(let pid of checked) { const pData = playersData.find(x => x.id === pid); let fee = Math.max(1, Math.round(pData.rating * 0.005)); pot += fee; feeMap[pid] = fee; await updateDoc(doc(db, "players", pid), { rating: pData.rating - fee }); }
    await addDoc(toursRef, { status: 'active', players: checked, pot: pot, entryFeeMap: feeMap, timestamp: Timestamp.fromDate(new Date(document.getElementById('tour-date').value)) });
});

document.getElementById("btn-cancel-active-tour").addEventListener("click", async () => {
    if(confirm("Annullare torneo in corso? Eliminerà anche le partite registrate finora in questo torneo.")) { await deleteTournament(activeTourId); }
});

// Aggiungi Partita Manuale al Tabellone
document.getElementById("tour-match-form").addEventListener("submit", async (e) => {
    e.preventDefault(); const wId = document.getElementById("tour-winner").value; const lId = document.getElementById("tour-loser").value;
    if (wId === lId) return alert("Giocatori diversi!");
    
    const wData = (await getDoc(doc(db, "players", wId))).data(); const lData = (await getDoc(doc(db, "players", lId))).data();
    const expW = 1 / (1 + Math.pow(10, (lData.rating - wData.rating) / 400));
    let points = Math.max(1, Math.round(32 * (1 - expW) * 1.0)); // Elo base! Niente moltiplicatori torneo.
    
    await updateDoc(doc(db, "players", wId), { rating: wData.rating + points, wins: wData.wins + 1 });
    await updateDoc(doc(db, "players", lId), { rating: lData.rating - points, losses: lData.losses + 1 });
    await addDoc(matchesRef, { tournamentId: activeTourId, tourRound: document.getElementById("tour-round").value, winner: wId, loser: lId, winnerScore: document.getElementById("tour-score-winner").value, loserScore: document.getElementById("tour-score-loser").value, pointsExchanged: points, timestamp: Timestamp.now() });
    document.getElementById("tour-match-form").reset();
});

// Generatore Sorteggi
document.getElementById("btn-auto-matchmaker").addEventListener("click", () => {
    const suggBox = document.getElementById("auto-match-suggestions");
    let pool = [...activeTourData.players]; pool.sort(() => Math.random() - 0.5); 
    let text = "<strong>🎲 Accoppiamenti Casuali:</strong><br><br>";
    if(pool.length === 5) text += `<em>Turno Preliminare:</em><br>👉 ${playersData.find(x=>x.id===pool[0]).name} VS ${playersData.find(x=>x.id===pool[1]).name}<br><br><em>In Semifinale diretti:</em> ${playersData.find(x=>x.id===pool[2]).name}, ${playersData.find(x=>x.id===pool[3]).name}, ${playersData.find(x=>x.id===pool[4]).name}`;
    else if(pool.length === 6) { text += `<em>Quarti di finale (Passano i 3 Vincitori + 1 Miglior Sconfitto "Lucky Loser"):</em><br>`; for(let i=0; i<6; i+=2) text += `👉 ${playersData.find(x=>x.id===pool[i]).name} VS ${playersData.find(x=>x.id===pool[i+1]).name}<br>`; }
    else if(pool.length === 7) { text += `<em>Quarti (1 Salta il turno):</em><br>`; for(let i=0; i<6; i+=2) text += `👉 ${playersData.find(x=>x.id===pool[i]).name} VS ${playersData.find(x=>x.id===pool[i+1]).name}<br>`; text += `<br><em>Salta il primo turno:</em> ${playersData.find(x=>x.id===pool[6]).name} (Affronterà il Miglior Sconfitto)`; }
    else { text += `<em>Sfide Dirette:</em><br>`; for(let i=0; i<pool.length; i+=2) { if(pool[i+1]) text += `👉 ${playersData.find(x=>x.id===pool[i]).name} VS ${playersData.find(x=>x.id===pool[i+1]).name}<br>`; } }
    suggBox.innerHTML = text; suggBox.style.display = "block";
});

// Concludi Torneo e Assegna
document.getElementById("btn-finish-tournament").addEventListener("click", async () => {
    const p1 = document.getElementById("tour-1st").value; const p2 = document.getElementById("tour-2nd").value; const p3 = document.getElementById("tour-3rd").value;
    if(!p1 || !p2 || !p3 || p1===p2 || p1===p3 || p2===p3) return alert("Scegli un podio valido (3 diversi)!");
    if(!confirm("Concludere e assegnare il Jackpot?")) return;
    
    const prize1 = Math.round(activeTourData.pot * 0.60); const prize2 = Math.round(activeTourData.pot * 0.30); const prize3 = Math.round(activeTourData.pot * 0.10);
    const d1 = (await getDoc(doc(db, "players", p1))).data(); await updateDoc(doc(db, "players", p1), { rating: d1.rating + prize1 });
    const d2 = (await getDoc(doc(db, "players", p2))).data(); await updateDoc(doc(db, "players", p2), { rating: d2.rating + prize2 });
    const d3 = (await getDoc(doc(db, "players", p3))).data(); await updateDoc(doc(db, "players", p3), { rating: d3.rating + prize3 });

    await updateDoc(doc(db, "tournaments", activeTourId), { status: 'finished', podium1: p1, podium2: p2, podium3: p3, prizes: {p1: prize1, p2: prize2, p3: prize3} });
    alert(`🏆 TORNEO CONCLUSO!\n🥇 +${prize1}pt\n🥈 +${prize2}pt\n🥉 +${prize3}pt`);
});

// H2H E MESI
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
    const [year, month] = e.target.value.split('-'); let pointsGained = {};
    matchesData.forEach(m => { if(m.timestamp) { const d = m.timestamp.toDate(); if(d.getFullYear() == year && d.getMonth() + 1 == month) { pointsGained[m.winner] = (pointsGained[m.winner] || 0) + m.pointsExchanged; pointsGained[m.loser] = (pointsGained[m.loser] || 0) - m.pointsExchanged; } } });
    let resultHTML = '<div class="table-container"><table><thead><tr><th>Giocatore</th><th>Saldo Punti</th></tr></thead><tbody>';
    const sorted = Object.entries(pointsGained).sort((a,b) => b[1] - a[1]);
    if(sorted.length === 0) resultHTML += '<tr><td colspan="2">Nessun dato.</td></tr>';
    sorted.forEach(([pId, pts], index) => { const pName = playersData.find(x=>x.id===pId)?.name || "Ignoto"; const color = pts > 0 ? 'var(--success-color)' : 'var(--danger-color)'; const sign = pts > 0 ? '+' : ''; resultHTML += `<tr><td style="font-weight: ${index === 0 ? 'bold' : 'normal'}; ${index===0 ? 'color:#d4af37;':''}">${index === 0 ? '👑 ' : ''}${pName}</td><td style="color: ${color}; font-weight: bold;">${sign}${pts}</td></tr>`; });
    resDiv.innerHTML = resultHTML + '</tbody></table></div>';
});

// ORACOLO COMPLETO REINTEGRATO
document.getElementById("stats-player-select").addEventListener("change", (e) => generateSmartComment(e.target.value));

function generateSmartComment(playerId) {
    const commentBox = document.getElementById("ai-comment"); const extraBox = document.getElementById("extra-stats");
    const epicBadgeBox = document.getElementById("epic-title-container"); const epicTitleSpan = document.getElementById("player-epic-title");
    extraBox.innerHTML = ""; document.getElementById("chart-container-pie").style.display = playerId === "general" ? "none" : "block";
    if(playersData.length === 0) { epicBadgeBox.style.display = "none"; return commentBox.innerText = "Attendo giocatori..."; }
    
    if(playerId === "general") {
        epicBadgeBox.style.display = "none";
        const sorted = [...playersData].sort((a,b) => b.rating - a.rating); const leader = sorted[0]; let genNar = "";
        if(sorted.length > 1) {
            const gap = leader.rating - sorted[1].rating;
            if(gap > 100) genNar = pickRnd([`Il tavolo è sotto la dittatura assoluta di ${leader.name}. Con un distacco incolmabile di ${Math.round(gap)} punti, gli altri giocano solo per le briciole. Serve una rivolta!`, `${leader.name} sta giocando un altro sport. Ha creato un abisso colossale col resto del gruppo.`]);
            else if(gap < 15) genNar = pickRnd([`Situazione incandescente al vertice! ${leader.name} è primo, ma sente il fiato sul collo. Basterebbe un colpo di tosse per fargli perdere la corona.`, `Testa a testa in vetta! Nessuno può dormire sonni tranquilli lassù.`]);
            else genNar = pickRnd([`Il trono è attualmente di ${leader.name} (${Math.round(leader.rating)} pt). Il gruppo è vivo e battagliero, il livello si alza.`, `Le gerarchie sono stabilite, ma la classifica è fluida. Chi sarà la sorpresa di questa settimana?`]);
        } else { genNar = "C'è solo un giocatore nell'Arena. Chi oserà sfidarlo?"; }
        commentBox.innerText = `🎙️ "${genNar}"`; drawRealCharts("general", null); return;
    }
    
    const p = playersData.find(x => x.id === playerId);
    const tot = p.wins + p.losses; const wr = tot > 0 ? Math.round((p.wins / tot) * 100) : 0;
    const playerMatches = matchesData.filter(m => m.winner === p.id || m.loser === p.id).sort((a,b) => b.timestamp - a.timestamp);
    let currentStreak = 0;
    for(let m of playerMatches) { if(m.winner === p.id && currentStreak >= 0) currentStreak++; else if(m.loser === p.id && currentStreak <= 0) currentStreak--; else break; }

    let title = "Il Novizio"; let narrative = ""; const isFirst = p.id === [...playersData].sort((a,b)=>b.rating-a.rating)[0].id;
    if(tot < 5) { title = "L'Incognita"; narrative = pickRnd([`È da poco sceso nell'arena. Il mistero che lo avvolge lo rende un avversario imprevedibile da decifrare.`, `Un talento grezzo. Deve ancora accumulare partite.`]); }
    else if (isFirst && wr > 65) { title = pickRnd(["Il Tiranno", "Il Monarca", "L'Intoccabile"]); narrative = `Siede sul trono con ferocia. Con un win rate del ${wr}%, non fa prigionieri. Sfiderà mai qualcuno in grado di farlo sudare?`; }
    else if (isFirst && wr <= 65) { title = "Il Re Astuto"; narrative = `Primo in classifica, ma non invincibile. Mantiene il comando con l'astuzia, cadendo ogni tanto ma rialzandosi sempre.`; }
    else if (!isFirst && wr >= 70) { title = pickRnd(["Il Predatore Oculto", "L'Esecutore", "Il Cecchino"]); narrative = `Guarda il suo Win Rate: ${wr}%. Quando gioca è una condanna a morte per chi sta dall'altra parte. Se giocasse di più, il trono cambierebbe padrone.`; }
    else if (currentStreak >= 5) { title = pickRnd(["L'Inarrestabile", "La Fenice", "La Cometa"]); narrative = `Totalmente "On Fire" (Striscia di ${currentStreak} vittorie consecutive). È entrato in una bolla mistica dove ogni schiacciata entra.`; }
    else if (currentStreak <= -5) { title = pickRnd(["L'Anima Tormentata", "Il Sopravvissuto", "Il Disperso"]); narrative = `Un tunnel buio lungo ${Math.abs(currentStreak)} sconfitte. Sta dubitando delle leggi della fisica. Servono energie positive, o un esorcismo alla racchetta.`; }
    else if (wr > 40 && wr < 60 && tot > 20) { title = pickRnd(["Il Caotico", "La Mina Vagante", "Il Jolly"]); narrative = `Può battere il campione del mondo o perdere col peggiore in classifica nella stessa giornata. L'imprevedibilità è la sua firma.`; }
    else if (wr <= 30 && tot > 15) { title = pickRnd(["L'Incudine", "Il Muro di Gomma", "Il Temerario"]); narrative = `Prende colpi, subisce, ma torna sempre al tavolo. Il suo Win Rate non racconta il coraggio d'acciaio che ci mette. Massimo rispetto per il guerriero.`; }
    else if (tot > 40 && wr >= 50) { title = pickRnd(["Il Veterano", "Lo Stratega", "Il Maestro"]); narrative = `Ha visto più top-spin lui di chiunque altro. Non si affida solo al braccio, ma alla conoscenza dei punti deboli del gruppo.`; }
    else { title = "La Promessa"; narrative = `Alterna sprazzi di genio a blackout dolorosi. Se riesce a stabilizzare la sua percentuale, può puntare alle zone alte della classifica.`; }

    let ops = {}; playerMatches.forEach(m => { if(m.winner === playerId) { ops[m.loser] = ops[m.loser] || {w:0, l:0}; ops[m.loser].w++; } if(m.loser === playerId) { ops[m.winner] = ops[m.winner] || {w:0, l:0}; ops[m.winner].l++; } });
    let best = null, wBest = 0, worst = null, lWorst = 0;
    for(const [id, s] of Object.entries(ops)) { if(s.w > wBest){wBest = s.w; best = id;} if(s.l > lWorst){lWorst = s.l; worst = id;} }
    const nBest = best ? (playersData.find(x=>x.id===best)?.name || "?") : "-"; const nWorst = worst ? (playersData.find(x=>x.id===worst)?.name || "?") : "-";

    if(worst && lWorst >= 3) narrative += pickRnd([` Il suo tallone d'Achille è ${nWorst}, una vera maledizione.`, ` Davanti a ${nWorst} va regolarmente in tilt.`]);
    else if(best && wBest >= 3) narrative += pickRnd([` Ha trovato nel povero ${nBest} il suo bancomat personale.`, ` Contro ${nBest} si sente onnipotente.`]);

    epicBadgeBox.style.display = "block"; epicTitleSpan.innerText = title;
    commentBox.innerText = `🎙️ "${narrative}"`;
    extraBox.innerHTML = `<div class="stat-box"><span>Partite</span><strong>${tot}</strong></div><div class="stat-box"><span>Vittima</span><strong>${nBest}</strong></div><div class="stat-box"><span>Bestia Nera</span><strong>${nWorst}</strong></div>`;
    drawRealCharts("single", p);
}

function drawRealCharts(type, p) {
    if(lineChart) lineChart.destroy(); if(pieChart) pieChart.destroy();
    const ctx = document.getElementById('rankingChart').getContext('2d'); Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--text-color').trim(); Chart.defaults.font.family = 'Inter, sans-serif';
    if(type === "general") { lineChart = new Chart(ctx, { type: 'line', data: { labels: ['Vuoto'], datasets: [{ label: 'Generale', data: [1000] }] }, options: { maintainAspectRatio: false } }); } else {
        const pm = matchesData.filter(m => m.winner === p.id || m.loser === p.id).reverse(); let lbs = ['Inizio'], dts = [1000];
        pm.forEach((m, i) => { lbs.push(`M${i+1}`); dts.push(m.winner === p.id && m.winnerNewRating ? m.winnerNewRating : (m.loser === p.id && m.loserNewRating ? m.loserNewRating : dts[dts.length-1])); });
        lineChart = new Chart(ctx, { type: 'line', data: { labels: lbs, datasets: [{ label: p.name, data: dts, borderColor: '#e63946', backgroundColor: 'rgba(230, 57, 70, 0.1)', fill: true, tension: 0.2 }] }, options: { maintainAspectRatio: false, responsive: true } });
        pieChart = new Chart(document.getElementById('winRateChart').getContext('2d'), { type: 'doughnut', data: { labels: ['Vittorie', 'Sconfitte'], datasets: [{ data: [p.wins, p.losses], backgroundColor: ['#2a9d8f', '#d62828'] }] }, options: { maintainAspectRatio: false, responsive: true } });
    }
}