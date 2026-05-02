if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

const urlParams = new URLSearchParams(window.location.search);
const idJuri = urlParams.get('id') || "1";
document.getElementById('juriId').innerText = "JURI " + idJuri;

let currentRound = 1;
let isTimerRunning = false;
let lastKeys = { Biru: null, Merah: null };
let counts = { Biru: 0, Merah: 0 };

// --- SAFETY LOCK ---
db.ref('match_status/isRunning').on('value', snap => {
    isTimerRunning = snap.val() || false;
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
    if (cb) cb.innerText = counts.Biru;
    if (cr) cr.innerText = counts.Merah;
}

db.ref('match_status/round').on('value', snap => {
    currentRound = snap.val() || 1;
    const roundDisp = document.getElementById('roundDisp');
    if (roundDisp) roundDisp.innerText = currentRound;
    resetCounters();
});

db.ref('match_info').on('value', snap => {
    const d = snap.val();
    if (d) {
        if (document.getElementById('partaiDisp'))  document.getElementById('partaiDisp').innerText  = d.partai   || '-';
        if (document.getElementById('babakDisp'))   document.getElementById('babakDisp').innerText   = d.babak    || 'PENYISIHAN';
        if (document.getElementById('namaBiru'))    document.getElementById('namaBiru').innerText    = d.namaBiru || 'PESILAT BIRU';
        if (document.getElementById('namaMerah'))   document.getElementById('namaMerah').innerText   = d.namaMerah|| 'PESILAT MERAH';
        if (document.getElementById('teamBiru'))    document.getElementById('teamBiru').innerText    = d.timBiru  || 'BIRU';
        if (document.getElementById('teamMerah'))   document.getElementById('teamMerah').innerText   = d.timMerah || 'MERAH';
    }
});

// --- KIRIM POIN ---
function kirim(sudut, aksi) {
    if (!isTimerRunning) {
        if (navigator.vibrate) navigator.vibrate(100);
        return;
    }

    const flashClass = sudut === 'Biru' ? 'flash-blue' : 'flash-red';
    document.body.classList.add(flashClass);
    setTimeout(() => document.body.classList.remove(flashClass), 100);

    const ref = db.ref('log_wasit').push();
    lastKeys[sudut] = ref.key;

    const undoBtn = document.getElementById(sudut === 'Biru' ? 'undoB' : 'undoR');
    if (undoBtn) undoBtn.disabled = false;

    counts[sudut]++;
    updateCounterUI();

    ref.set({
        wasit:  idJuri,
        sudut:  sudut,
        aksi:   aksi,
        ronde:  currentRound,
        waktu:  firebase.database.ServerValue.TIMESTAMP
    });

    if (navigator.vibrate) navigator.vibrate(40);
}

function undo(sudut) {
    const key = lastKeys[sudut];
    if (key && confirm("UNDO " + sudut + "?")) {
        db.ref('log_wasit').child(key).remove().then(() => {
            lastKeys[sudut] = null;
            const undoBtn = document.getElementById(sudut === 'Biru' ? 'undoB' : 'undoR');
            if (undoBtn) undoBtn.disabled = true;
            counts[sudut]--;
            updateCounterUI();
        });
    }
}

// ══════════════════════════════════════════════
//  VAR VOTE SYSTEM — sisi juri
//  Styling menggunakan CSS variable dari wasit.css.
// ══════════════════════════════════════════════

(function injectVARStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Overlay fullscreen — muncul di atas timer-stopped */
        #varJuriOverlay {
            display: none;
            position: fixed;
            inset: 0;
            z-index: 10000;
            background: rgba(0, 0, 0, 0.92);
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 14px;
            padding: 24px 20px;
            /* Mewarisi font dari body wasit */
            font-family: inherit;
        }
        #varJuriOverlay.open { display: flex; }

        /* Tanda VAR aktif — pakai warna info bar (--bg-info) */
        .var-juri-alert {
            font-size: 0.68rem;
            font-weight: 900;
            letter-spacing: 4px;
            text-transform: uppercase;
            color: #fbbf24;                     /* .partai-badge dari wasit.css */
            background: var(--bg-info, #1e293b);
            padding: 4px 16px;
            border-radius: 20px;
            border: 1px solid rgba(251,191,36,0.4);
        }

        /* Label jenis — tebal, seperti nama atlet */
        .var-juri-type {
            text-align: center;
            font-size: 1.5rem;
            font-weight: 900;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: #fbbf24;
            border: 2px solid rgba(251,191,36,0.5);
            padding: 10px 28px;
            border-radius: 8px;
            background: rgba(251,191,36,0.07);
            width: 100%;
            max-width: 360px;
            text-align: center;
        }

        .var-juri-instruction {
            font-size: 0.68rem;
            font-weight: 700;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: var(--text-sub, #475569);
        }

        /* Wrapper tombol vote */
        .var-juri-btns {
            display: flex;
            flex-direction: column;
            gap: 10px;
            width: 100%;
            max-width: 360px;
        }

        /* Tombol vote — sama rasanya dengan .btn di wasit.css */
        .btn-var-vote {
            width: 100%;
            padding: 20px 16px;
            font-size: 1.25rem;
            font-weight: 900;
            letter-spacing: 3px;
            text-transform: uppercase;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            box-shadow: 0 6px 0 rgba(0,0,0,0.3);
            transition: all 0.05s;
            -webkit-tap-highlight-color: transparent;
            user-select: none;
        }
        .btn-var-vote:active {
            transform: translateY(4px);
            box-shadow: none;
            filter: brightness(1.15);
        }

        /* Warna tombol — selaras dengan .blue-side dan .red-side di wasit.css */
        .btn-var-biru {
            background: var(--btn-b-1, #2563eb);
            color: #fff;
        }
        .btn-var-merah {
            background: var(--btn-r-1, #dc2626);
            color: #fff;
        }
        .btn-var-invalid {
            background: #78350f;
            color: #fbbf24;
            border: 2px solid rgba(251,191,36,0.4);
        }

        /* Konfirmasi setelah vote */
        .var-voted-confirm {
            display: none;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            text-align: center;
        }
        .var-voted-confirm.show { display: flex; }

        .voted-emoji { font-size: 3.5rem; line-height: 1; }

        .voted-label {
            font-size: 1.1rem;
            font-weight: 900;
            letter-spacing: 2px;
            text-transform: uppercase;
        }
        /* Warna label pakai variable wasit.css */
        .voted-biru  { color: var(--btn-b-1, #2563eb); }
        .voted-merah { color: var(--btn-r-1, #dc2626); }
        .voted-invalid { color: #fbbf24; }

        .voted-wait {
            font-size: 0.62rem;
            font-weight: 700;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: var(--text-sub, #475569);
            opacity: 0.7;
        }

        /* Dark mode override — wasit.css body.dark-mode */
        body.dark-mode .var-juri-type {
            color: #fbbf24;
        }
    `;
    document.head.appendChild(style);
})();

(function injectVAROverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'varJuriOverlay';
    overlay.innerHTML = `
        <div class="var-juri-alert">⚡ VAR — VERIFIKASI AKTIF</div>
        <div class="var-juri-type" id="varJuriTypeLabel">—</div>
        <div class="var-juri-instruction">PILIH KEPUTUSAN ANDA:</div>

        <div class="var-juri-btns" id="varJuriBtns">
            <button class="btn-var-vote btn-var-biru"    onclick="kirimVAR('Biru')">🔵 BIRU</button>
            <button class="btn-var-vote btn-var-merah"   onclick="kirimVAR('Merah')">🔴 MERAH</button>
            <button class="btn-var-vote btn-var-invalid" onclick="kirimVAR('Invalid')">🟡 INVALID / TIDAK SAH</button>
        </div>

        <div class="var-voted-confirm" id="varVotedConfirm">
            <div class="voted-emoji" id="varVotedEmoji">✅</div>
            <div class="voted-label" id="varVotedLabel">VOTE TERKIRIM</div>
            <div class="voted-wait">Menunggu keputusan dewan...</div>
        </div>
    `;
    document.body.appendChild(overlay);
})();

// ── Listener VAR aktif dari Firebase ──
let sudahVote = false;

db.ref('var_aktif').on('value', snap => {
    const varData = snap.val();

    if (!varData) {
        // VAR selesai atau dibatal oleh dewan
        document.getElementById('varJuriOverlay').classList.remove('open');
        sudahVote = false;
        document.getElementById('varJuriBtns').style.display = '';
        document.getElementById('varVotedConfirm').classList.remove('show');
        return;
    }

    // VAR aktif — tampilkan overlay
    document.getElementById('varJuriOverlay').classList.add('open');
    document.getElementById('varJuriTypeLabel').innerText =
        varData.jenis === 'Pelanggaran' ? '⚠️ PELANGGARAN' : '🥊 JATUHAN';

    // Getarkan device juri
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);

    // Cek apakah juri ini sudah vote
    const myKey  = 'j' + idJuri;
    const myVote = varData.votes ? varData.votes[myKey] : null;

    if (myVote !== null && myVote !== undefined) {
        tampilkanVotedState(myVote);
    } else {
        document.getElementById('varJuriBtns').style.display = '';
        document.getElementById('varVotedConfirm').classList.remove('show');
    }
});

function kirimVAR(pilihan) {
    if (sudahVote) return;
    sudahVote = true;

    db.ref('var_aktif/votes/j' + idJuri).set(pilihan).then(() => {
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        tampilkanVotedState(pilihan);
    });
}

function tampilkanVotedState(pilihan) {
    document.getElementById('varJuriBtns').style.display = 'none';

    const confirmEl = document.getElementById('varVotedConfirm');
    const emoji     = document.getElementById('varVotedEmoji');
    const label     = document.getElementById('varVotedLabel');

    confirmEl.classList.add('show');

    if (pilihan === 'Biru') {
        emoji.innerText      = '🔵';
        label.className      = 'voted-label voted-biru';
        label.innerText      = 'VOTE: BIRU';
    } else if (pilihan === 'Merah') {
        emoji.innerText      = '🔴';
        label.className      = 'voted-label voted-merah';
        label.innerText      = 'VOTE: MERAH';
    } else {
        emoji.innerText      = '🟡';
        label.className      = 'voted-label voted-invalid';
        label.innerText      = 'VOTE: INVALID';
    }
}

// --- KONEKSI MONITOR ---
setInterval(() => {
    db.ref('.info/connected').once('value', snap => {
        if (snap.val()) {
            const start = Date.now();
            db.ref('ping').set(start, () => {
                const pingText = document.getElementById('pingText');
                if (pingText) pingText.innerText = (Date.now() - start) + ' ms';
            });
        }
    });
}, 5000);

db.ref('.info/connected').on('value', snap => {
    const conn = snap.val();
    const dot  = document.getElementById('connDot');
    const txt  = document.getElementById('connText');
    if (dot) dot.className  = conn ? 'dot online' : 'dot';
    if (txt) txt.innerText  = conn ? 'ONLINE' : 'OFFLINE';
});