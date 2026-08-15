import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, setDoc, getDoc, updateDoc, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
const playersRef = collection(db, "players");
const matchesRef = collection(db, "matches");

let playersData = []; // Salveremo i giocatori qui per usarli nelle statistiche

// --- NAVIGAZIONE TABS ---
document.getElementById("nav-arena").addEventListener("click", (e) => {
    document.getElementById("view-arena").classList.add("active-view");
    document.getElementById("view-stats").classList.remove("active-view");
    document.getElementById("nav-arena").classList.add("active");
    document.getElementById("nav-stats").classList.remove("active");
});
document.getElementById("nav-stats").addEventListener("click", (e) => {
    document.getElementById("view-stats").classList.add("active-view");
    document.getElementById("view-arena").classList.remove("active-view");
    document.getElementById("nav-stats").classList.add("active");
    document.getElementById("nav-arena").classList.remove("active");
    generateSmartComment(); // Genera il commento quando apri la tab
});

// --- CLASSIFICA IN TEMPO REALE ---
try {
    onSnapshot(query(playersRef, orderBy("rating", "desc")), (snapshot) => {
        const rankingList = document.getElementById("ranking-list");
        const winnerSelect = document.getElementById("winner");
        const loserSelect = document.getElementById("loser");
        
        rankingList.innerHTML = "";
        winnerSelect.innerHTML = '<option value="">Seleziona...</option>';
        loserSelect.innerHTML = '<option value="">Seleziona...</option>';
        
        playersData = [];
        let pos = 1;

        snapshot.forEach((doc) => {
            const player = doc.data();
            const id = doc.id;
            playersData.push(player); // Salviamo in memoria
            
            rankingList.innerHTML += `<tr><td>${pos}°</td><td>${player.name}</td><td><strong>${Math.round(player.rating)}</strong></td><td>${player.wins} - ${player.losses}</td></tr>`;
            winnerSelect.innerHTML += `<option value="${id}">${player.name}</option>`;
            loserSelect.innerHTML += `<option value="${id}">${player.name}</option>`;
            pos++;
        });

        if(snapshot.empty) rankingList.innerHTML = `<tr><td colspan="4">Nessun giocatore in DB.</td></tr>`;
    }, (error) => {
        console.error("Errore lettura Firebase: ", error);
        alert("Errore di connessione al Database. Controlla le regole Firestore!");
    });
} catch (e) {
    console.error(e);
}

// --- AGGIUNGI GIOCATORE ---
document.getElementById("player-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("new-player-name");
    const name = nameInput.value.trim();
    
    if (name) {
        try {
            await setDoc(doc(playersRef, name.toLowerCase()), {
                name: name, rating: 1000, wins: 0, losses: 0
            });
            nameInput.value = "";
        } catch (error) {
            console.error(error);
            alert("Errore nell'aggiunta! Hai modificato le Rules su Firebase?");
        }
    }
});

// --- SALVA PARTITA (CON SALVATAGGIO STORICO PER GRAFICI) ---
document.getElementById("match-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("save-match-btn");
    btn.disabled = true;

    const winnerId = document.getElementById("winner").value;
    const loserId = document.getElementById("loser").value;
    
    if (winnerId === loserId) {
        alert("Un giocatore non può giocare contro se stesso!");
        btn.disabled = false; return;
    }

    try {
        const winnerSnap = await getDoc(doc(db, "players", winnerId));
        const loserSnap = await getDoc(doc(db, "players", loserId));
        const wData = winnerSnap.data();
        const lData = loserSnap.data();

        // Formula Elo semplificata per ora
        const expectedWinner = 1 / (1 + Math.pow(10, (lData.rating - wData.rating) / 400));
        let points = Math.round(32 * (1 - expectedWinner));
        if (points < 1) points = 1;

        const newWinnerRating = wData.rating + points;
        const newLoserRating = lData.rating - points;

        // Aggiorna i giocatori
        await updateDoc(doc(db, "players", winnerId), { rating: newWinnerRating, wins: wData.wins + 1 });
        await updateDoc(doc(db, "players", loserId), { rating: newLoserRating, losses: lData.losses + 1 });

        // Salva Partita con i rating NUOVI (Fondamentale per il grafico Chart.js)
        await addDoc(matchesRef, {
            winner: winnerId,
            loser: loserId,
            pointsExchanged: points,
            winnerNewRating: newWinnerRating,
            loserNewRating: newLoserRating,
            timestamp: serverTimestamp()
        });

        alert("Partita salvata!");
        document.getElementById("match-form").reset();
    } catch (error) {
        console.error(error);
        alert("Errore salvataggio partita.");
    }
    btn.disabled = false;
});

// --- GENERATORE DI COMMENTI "STILE IA" ---
function generateSmartComment() {
    const commentBox = document.getElementById("ai-comment");
    if(playersData.length < 2) {
        commentBox.innerText = "Non ci sono abbastanza giocatori per un'analisi! Aggiungi giocatori e gioca qualche partita.";
        return;
    }
    
    // Ordiniamo chi ha il rating più alto e più basso
    const sorted = [...playersData].sort((a,b) => b.rating - a.rating);
    const leader = sorted[0];
    const lastPlace = sorted[sorted.length - 1];

    // Creiamo frasi dinamiche
    const frasiLeader = [
        `${leader.name} sta letteralmente dominando il tavolo con ${Math.round(leader.rating)} punti.`,
        `Tutti vogliono battere ${leader.name}, ma per ora guarda tutti dall'alto.`,
        `Il re indiscusso al momento è ${leader.name}.`
    ];

    const frasiIncoraggiamento = [
        `Forza ${lastPlace.name}, la scalata è lunga ma un paio di vittorie cambiano tutto!`,
        `${lastPlace.name} deve ritrovare la concentrazione per risalire la china.`,
    ];

    // Pescaggio casuale (Finta IA)
    const randomLeader = frasiLeader[Math.floor(Math.random() * frasiLeader.length)];
    const randomLast = frasiIncoraggiamento[Math.floor(Math.random() * frasiIncoraggiamento.length)];

    commentBox.innerText = `🎙️ "${randomLeader} ${randomLast} Il gruppo è competitivo, ma vedremo chi avrà la meglio nelle prossime sfide!"`;
}

// TODO nel prossimo step: Popolare il grafico Chart.js leggendo lo storico partite!