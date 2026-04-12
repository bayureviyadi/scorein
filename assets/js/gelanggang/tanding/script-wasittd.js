if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

const urlParams = new URLSearchParams(window.location.search);
const idJuri = urlParams.get('id') || "1";
document.getElementById('juriId').innerText = "JURI " + idJuri;

let currentRound = 1;
let isTimerRunning = false; // Variable baru untuk status keamanan
let lastKeys = { Biru: null, Merah: null };
let counts = { Biru: 0, Merah: 0 };

// --- LOGIKA KEAMANAN TOMBOL (SAFETY LOCK) ---
db.ref('match_status/isRunning').on('value', snap => {
    isTimerRunning = snap.val() || false;
    
    // Memberi sinyal visual ke Juri
    if (isTimerRunning) {
        document.body.classList.remove('timer-stopped');
    } else {
        document.body.classList.add('timer-stopped');
    }
});

function resetCounters() {
    counts = { Biru: 0, Merah: 0 };
    updateCounterUI();
}

function updateCounterUI() {
    const cb = document.getElementById('countB');
    const cr = document.getElementById('countR');
    if(cb) cb.innerText = counts.Biru;
    if(cr) cr.innerText = counts.Merah;
}

db.ref('match_status/round').on('value', snap => {
    currentRound = snap.val() || 1;
    const roundDisp = document.getElementById('roundDisp');
    if(roundDisp) roundDisp.innerText = currentRound;
    resetCounters();
});

db.ref('match_info').on('value', snap => {
    const d = snap.val();
    if(d) {
        if(document.getElementById('partaiDisp')) document.getElementById('partaiDisp').innerText = d.partai || '-';
        if(document.getElementById('babakDisp')) document.getElementById('babakDisp').innerText = d.babak || 'PENYISIHAN';
        if(document.getElementById('namaBiru')) document.getElementById('namaBiru').innerText = d.namaBiru || 'PESILAT BIRU';
        if(document.getElementById('namaMerah')) document.getElementById('namaMerah').innerText = d.namaMerah || 'PESILAT MERAH';
        if(document.getElementById('teamBiru')) document.getElementById('teamBiru').innerText = d.timBiru || 'BIRU';
        if(document.getElementById('teamMerah')) document.getElementById('teamMerah').innerText = d.timMerah || 'MERAH';
    }
});

db.ref('verifikasi_aktif').on('value', snap => {
    const v = snap.val();
    if (!v) { document.body.classList.remove('var-active'); return; }
    if (v.votes && v.votes['j' + idJuri] === null) {
        document.body.classList.add('var-active');
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        setTimeout(() => {
            const hasil = confirm(`⚠️ VAR: ${v.sudut} - ${v.aksi} ⚠️\n\nSAH?`);
            db.ref(`verifikasi_aktif/votes/j${idJuri}`).set(hasil);
        }, 100);
    }
});

// --- FUNGSI KIRIM POIN DENGAN PROTEKSI ---
function kirim(sudut, aksi) {
    // PROTEKSI: Jika timer mati, batalkan pengiriman data
    if (!isTimerRunning) {
        console.log("Klik diabaikan: Timer sedang berhenti.");
        if (navigator.vibrate) navigator.vibrate(100); // Getar pendek tanda error
        return; 
    }

    const flashClass = sudut === 'Biru' ? 'flash-blue' : 'flash-red';
    document.body.classList.add(flashClass);
    setTimeout(() => document.body.classList.remove(flashClass), 100);

    const ref = db.ref('log_wasit').push();
    lastKeys[sudut] = ref.key;
    
    const undoBtn = document.getElementById(sudut === 'Biru' ? 'undoB' : 'undoR');
    if(undoBtn) undoBtn.disabled = false;

    counts[sudut]++;
    updateCounterUI();

    ref.set({ 
        wasit: idJuri, 
        sudut: sudut, 
        aksi: aksi, 
        ronde: currentRound, 
        waktu: firebase.database.ServerValue.TIMESTAMP 
    });

    if (navigator.vibrate) navigator.vibrate(40);
}

function undo(sudut) {
    // Undo tetap diperbolehkan saat timer berhenti (untuk koreksi kesalahan terakhir)
    const key = lastKeys[sudut];
    if (key && confirm("UNDO " + sudut + "?")) {
        db.ref('log_wasit').child(key).remove().then(() => {
            lastKeys[sudut] = null;
            const undoBtn = document.getElementById(sudut === 'Biru' ? 'undoB' : 'undoR');
            if(undoBtn) undoBtn.disabled = true;
            counts[sudut]--;
            updateCounterUI();
        });
    }
}

// Monitor Koneksi tetap berjalan
setInterval(() => {
    db.ref(".info/connected").once("value", snap => {
        if(snap.val()) {
            const start = Date.now();
            db.ref('ping').set(start, () => {
                const diff = Date.now() - start;
                const pingText = document.getElementById('pingText');
                if(pingText) pingText.innerText = diff + " ms";
            });
        }
    });
}, 5000);

db.ref(".info/connected").on("value", snap => {
    const conn = snap.val();
    const dot = document.getElementById('connDot');
    const txt = document.getElementById('connText');
    if(dot) dot.className = conn ? 'dot online' : 'dot';
    if(txt) txt.innerText = conn ? 'ONLINE' : 'OFFLINE';
});