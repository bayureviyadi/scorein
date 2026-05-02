if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentRound = 1;
let timerRunning = false;
let timeLeft = 0;

// VAR state
let varAktif = false;
let varJenis = null;       // 'Pelanggaran' | 'Jatuhan'
let varVotes = {};         // { j1: 'Biru'|'Merah'|'Invalid', j2: ..., j3: ... }
let varListener = null;
let manualKeputusan = null;

// --- THEME LOGIC ---
const themes = ['standard', 'night', 'sporty', 'olympic'];
let themeIdx = themes.indexOf(localStorage.getItem('dewan-theme') || 'standard');
function cycleTheme() {
    themeIdx = (themeIdx + 1) % themes.length;
    const newTheme = themes[themeIdx];
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('dewan-theme', newTheme);
}
document.body.setAttribute('data-theme', themes[themeIdx]);

// --- GENERATE JURI STATUS BOXES ---
['Biru', 'Merah'].forEach(s => {
    const g = document.getElementById('grid' + s);
    if (g) {
        g.innerHTML = '';
        for (let j = 1; j <= 3; j++) g.innerHTML += `<div id="box-${s}-pukul-${j}" class="juri-box">J${j} P</div>`;
        for (let j = 1; j <= 3; j++) g.innerHTML += `<div id="box-${s}-tendang-${j}" class="juri-box">J${j} T</div>`;
    }
});

function flashJuriDewan(juriId, sudut, aksi) {
    const id = `box-${sudut}-${aksi}-${juriId}`;
    const el = document.getElementById(id);
    if (!el) return;
    const activeClass = (sudut === 'Biru') ? 'active-blue' : 'active-red';
    el.classList.add(activeClass);
    setTimeout(() => el.classList.remove(activeClass), 1000);
}

// --- LISTENER ANIMASI JURI ---
db.ref('log_wasit').limitToLast(1).on('child_added', snap => {
    const d = snap.val();
    if (!d) return;
    if (Date.now() - (d.waktu || 0) < 3000) {
        flashJuriDewan(d.wasit, d.sudut, d.aksi);
    }
});

// --- LISTENER DATA UTAMA ---
db.ref().on('value', snap => {
    const data = snap.val();
    if (!data) return;

    const d = data.match_info || {};
    document.getElementById('nameBiru').innerText = d.namaBiru || '-';
    document.getElementById('teamBiru').innerText = d.timBiru || 'BIRU';
    document.getElementById('nameMerah').innerText = d.namaMerah || '-';
    document.getElementById('teamMerah').innerText = d.timMerah || 'MERAH';
    document.getElementById('partaiDisp').innerText = "PARTAI " + (d.partai || "-");
    document.getElementById('kategoriDisp').innerText = d.kategori || "KATEGORI";
    document.getElementById('kelasDisp').innerText = d.kelas || "KELAS";

    const s = data.match_status || {};
    currentRound = s.round || 1;
    timeLeft = s.timeLeft || 0;
    timerRunning = s.isRunning || false;

    let min = Math.floor(timeLeft / 60), sec = timeLeft % 60;
    const timerDisp = document.getElementById('timerDisp');
    if (timerDisp) timerDisp.innerText = `${min}:${sec.toString().padStart(2, '0')}`;

    [1, 2, 3].forEach(n => {
        const rb = document.getElementById('rb' + n);
        if (rb) rb.classList.toggle('active', currentRound == n);
    });

    updateStatsAndButtons(data.log_wasit || {}, data.log_dewan || {});
});

// --- STATISTIK & SKOR ---
function updateStatsAndButtons(wasitLogs, dewanLogs) {
    const stats = {
        Biru: { pukul: 0, tendang: 0, Jatuhan: 0, BN1: 0, BN2: 0, T1: 0, T2: 0, P1: 0, P2: 0, P3: 0 },
        Merah: { pukul: 0, tendang: 0, Jatuhan: 0, BN1: 0, BN2: 0, T1: 0, T2: 0, P1: 0, P2: 0, P3: 0 }
    };

    const clusters = { Biru: { pukul: [], tendang: [] }, Merah: { pukul: [], tendang: [] } };
    Object.values(wasitLogs).forEach(log => {
        const { sudut, aksi, wasit, waktu } = log;
        if (aksi !== 'pukul' && aksi !== 'tendang') return;
        let found = false;
        for (let group of clusters[sudut][aksi]) {
            if (Math.abs(waktu - group.startTime) <= 2000) {
                if (!group.juriList.includes(wasit)) group.juriList.push(wasit);
                found = true; break;
            }
        }
        if (!found) clusters[sudut][aksi].push({ startTime: waktu, juriList: [wasit] });
    });

    for (let s in clusters) {
        for (let a in clusters[s]) {
            stats[s][a] = clusters[s][a].filter(g => g.juriList.length >= 2).length;
        }
    }

    Object.values(dewanLogs).forEach(d => {
        if (stats[d.sudut]) {
            if (['BN1', 'BN2', 'T1', 'T2'].includes(d.aksi)) {
                if (d.ronde == currentRound) stats[d.sudut][d.aksi]++;
            } else {
                stats[d.sudut][d.aksi]++;
            }
        }
    });

    ['Biru', 'Merah'].forEach(s => {
        let finalScore = 0;
        finalScore += (stats[s].pukul * 1);
        finalScore += (stats[s].tendang * 2);
        finalScore += (stats[s].Jatuhan * 3);

        Object.values(dewanLogs).forEach(log => {
            if (log.sudut === s) {
                if (log.aksi === 'T1') finalScore -= 1;
                if (log.aksi === 'T2') finalScore -= 2;
                if (log.aksi === 'P1') finalScore -= 5;
                if (log.aksi === 'P2') finalScore -= 10;
                if (log.aksi === 'P3') finalScore -= 15;
            }
        });

        const scoreEl = document.getElementById(`score${s}`);
        if (scoreEl) scoreEl.innerText = finalScore;
        db.ref(`score/${s}`).set(finalScore);

        for (let aks in stats[s]) {
            const el = document.getElementById(`stat-${s}-${aks}`);
            if (el) el.innerText = stats[s][aks];

            if (aks === 'BN1' || aks === 'BN2') {
                const btn = document.getElementById(`btn-${s}-${aks}`);
                if (btn) {
                    if (stats[s][aks] > 0) {
                        btn.classList.add('disabled-binaan');
                        btn.onclick = null;
                    } else {
                        btn.classList.remove('disabled-binaan');
                        btn.onclick = () => inputDewan(s, aks, 0);
                    }
                }
            }
        }
    });

    db.ref('stats').set(stats);
}

function inputDewan(sudut, aksi, poin) {
    db.ref('log_dewan').push({
        sudut: sudut,
        aksi: aksi,
        poin: poin,
        ronde: currentRound,
        waktu: firebase.database.ServerValue.TIMESTAMP
    });
}

function hapusTerakhir(sudut) {
    showCustomConfirm("UNDO AKSI", `UNDO AKSI TERAKHIR ${sudut}?`, function(confirmed) {
        if (!confirmed) return;
        db.ref('log_dewan').orderByChild('sudut').equalTo(sudut).limitToLast(1).once('value', snap => {
            snap.forEach(child => child.ref.remove());
        });
    });
}

// ══════════════════════════════════════════════
//  VAR VERIFICATION SYSTEM
// ══════════════════════════════════════════════

function bukaVAR(jenis) {
    if (varAktif) {
        alert("VAR sedang aktif! Batalkan atau konfirmasi terlebih dahulu.");
        return;
    }

    varJenis = jenis;
    varVotes = {};
    manualKeputusan = null;

    // Reset UI vote boxes
    [1, 2, 3].forEach(n => {
        const box = document.getElementById('voteBox' + n);
        const res = document.getElementById('voteResult' + n);
        if (box) { box.className = 'var-vote-box'; }
        if (res) res.innerText = '—';
    });

    document.getElementById('varTypeLabel').innerHTML =
        (jenis === 'Pelanggaran' ? '<iconify-icon inline icon="mdi:alert-outline" style="vertical-align: -0.125em;"></iconify-icon> VERIFIKASI PELANGGARAN' : '<iconify-icon inline icon="mdi:boxing-glove" style="vertical-align: -0.125em;"></iconify-icon> VERIFIKASI JATUHAN');
    document.getElementById('varWaitingText').innerText = 'MENUNGGU VOTE JURI 1, 2, 3...';
    document.getElementById('varMajority').innerText = 'Menunggu hasil voting...';
    document.getElementById('varMajority').className = 'var-majority';
    document.getElementById('tallyBiru').innerText = 'BIRU: 0';
    document.getElementById('tallyMerah').innerText = 'MERAH: 0';
    document.getElementById('tallyInvalid').innerText = 'INV: 0';
    document.getElementById('btnVarConfirm').classList.remove('ready');

    // Tulis ke Firebase agar Juri tahu VAR aktif
    db.ref('var_aktif').set({
        jenis: jenis,
        waktu: firebase.database.ServerValue.TIMESTAMP,
        votes: { j1: null, j2: null, j3: null }
    });

    varAktif = true;
    document.getElementById('varModal').classList.add('open');
    document.getElementById('varModalBox').classList.add('waiting');

    // Pasang listener untuk votes realtime
    varListener = db.ref('var_aktif/votes').on('value', snap => {
        const votes = snap.val() || {};
        varVotes = votes;
        renderVarVotes(votes);
    });
}

function renderVarVotes(votes) {
    let countBiru = 0, countMerah = 0, countInvalid = 0;
    let allVoted = true;

    [1, 2, 3].forEach(n => {
        const key = 'j' + n;
        const val = votes[key];
        const box = document.getElementById('voteBox' + n);
        const res = document.getElementById('voteResult' + n);

        if (val === null || val === undefined) {
            allVoted = false;
            if (box) box.className = 'var-vote-box';
            if (res) res.innerHTML = '—';
        } else if (val === 'Biru') {
            countBiru++;
            if (box) box.className = 'var-vote-box vote-biru';
            if (res) res.innerHTML = '<iconify-icon inline icon="mdi:circle" style="vertical-align: -0.125em;"></iconify-icon> BIRU';
        } else if (val === 'Merah') {
            countMerah++;
            if (box) box.className = 'var-vote-box vote-merah';
            if (res) res.innerHTML = '<iconify-icon inline icon="mdi:circle" style="vertical-align: -0.125em;"></iconify-icon> MERAH';
        } else if (val === 'Invalid') {
            countInvalid++;
            if (box) box.className = 'var-vote-box vote-invalid';
            if (res) res.innerHTML = '<iconify-icon inline icon="mdi:circle-off-outline" style="vertical-align: -0.125em;"></iconify-icon> INVALID';
        }
    });

    // Tally counter
    document.getElementById('tallyBiru').innerText = `BIRU: ${countBiru}`;
    document.getElementById('tallyMerah').innerText = `MERAH: ${countMerah}`;
    document.getElementById('tallyInvalid').innerText = `INV: ${countInvalid}`;

    // Update waiting text
    const voted = [votes.j1, votes.j2, votes.j3].filter(v => v !== null && v !== undefined).length;
    document.getElementById('varWaitingText').innerHTML =
        allVoted ? 'SEMUA JURI TELAH VOTE <iconify-icon inline icon="mdi:check-bold" style="vertical-align: -0.125em;"></iconify-icon>' : `MENUNGGU VOTE JURI... (${voted}/3)`;

    // Determine majority
    const majorityEl = document.getElementById('varMajority');
    const confirmBtn = document.getElementById('btnVarConfirm');

    if (manualKeputusan) {
        // Jangan override text jika dewan sudah memilih secara manual
        return;
    }

    if (countBiru >= 2) {
        majorityEl.className = 'var-majority majority-biru';
        majorityEl.innerHTML = `MAYORITAS: BIRU (${countBiru} SUARA)`;
        document.getElementById('varModalBox').classList.remove('waiting');
        confirmBtn.classList.add('ready');
    } else if (countMerah >= 2) {
        majorityEl.className = 'var-majority majority-merah';
        majorityEl.innerHTML = `MAYORITAS: MERAH (${countMerah} SUARA)`;
        document.getElementById('varModalBox').classList.remove('waiting');
        confirmBtn.classList.add('ready');
    } else if (countInvalid >= 2) {
        majorityEl.className = 'var-majority majority-invalid';
        majorityEl.innerHTML = `MAYORITAS: INVALID / TIDAK SAH (${countInvalid} SUARA)`;
        document.getElementById('varModalBox').classList.remove('waiting');
        confirmBtn.classList.add('ready');
    } else if (allVoted) {
        // Semua vote tapi tidak ada mayoritas (1-1-1) → tidak ada keputusan
        majorityEl.className = 'var-majority majority-invalid';
        majorityEl.innerHTML = '<iconify-icon inline icon="mdi:alert" style="vertical-align: -0.125em;"></iconify-icon> SUARA TIDAK BULAT — DEWAN TENTUKAN';
        document.getElementById('varModalBox').classList.remove('waiting');
        confirmBtn.classList.add('ready');
    } else {
        majorityEl.className = 'var-majority';
        majorityEl.innerHTML = 'Menunggu hasil voting...';
        document.getElementById('varModalBox').classList.add('waiting');
        confirmBtn.classList.remove('ready');
    }
}

function getMajorityResult(votes) {
    const v = [votes.j1, votes.j2, votes.j3];
    const countBiru = v.filter(x => x === 'Biru').length;
    const countMerah = v.filter(x => x === 'Merah').length;
    const countInvalid = v.filter(x => x === 'Invalid').length;

    if (countBiru >= 2) return 'Biru';
    if (countMerah >= 2) return 'Merah';
    return 'Invalid'; // termasuk 1-1-1
}

function setKeputusanVAR(hasil) {
    if (!varAktif) return;
    manualKeputusan = hasil;
    
    // Kirim langsung ke Firebase (berguna untuk scoreboard)
    db.ref('var_aktif/keputusan').set(hasil);

    // Update UI Dewan
    const majorityEl = document.getElementById('varMajority');
    majorityEl.className = `var-majority majority-${hasil.toLowerCase()}`;
    majorityEl.innerHTML = `KEPUTUSAN DEWAN: ${hasil.toUpperCase()}`;
    
    document.getElementById('varModalBox').classList.remove('waiting');
    document.getElementById('btnVarConfirm').classList.add('ready');
}

function konfirmasiVAR() {
    const hasil = manualKeputusan || getMajorityResult(varVotes);

    showCustomConfirm(
        `KONFIRMASI VAR ${varJenis.toUpperCase()}`,
        `Hasil Keputusan: ${hasil.toUpperCase()}\n\nSelesaikan VAR?`,
        function(confirmed) {
            if (confirmed) selesaiVAR(hasil);
        }
    );
}

function selesaiVAR(hasil) {
    // Simpan hasil VAR ke history
    db.ref('var_history').push({
        jenis: varJenis,
        hasil: hasil,
        votes: varVotes,
        ronde: currentRound,
        waktu: firebase.database.ServerValue.TIMESTAMP
    });

    // Bersihkan var_aktif
    tutupVAR();
}

function batalVAR() {
    showCustomConfirm(
        "BATALKAN VAR",
        "BATALKAN VAR? Data vote akan dihapus.",
        function(confirmed) {
            if (confirmed) tutupVAR();
        }
    );
}

function tutupVAR() {
    // Matikan listener
    if (varListener) {
        db.ref('var_aktif/votes').off('value', varListener);
        varListener = null;
    }

    // Hapus dari Firebase
    db.ref('var_aktif').remove();

    varAktif = false;
    varJenis = null;
    varVotes = {};
    manualKeputusan = null;

    document.getElementById('varModal').classList.remove('open');
    document.getElementById('varModalBox').classList.remove('waiting');
    document.getElementById('btnVarConfirm').classList.remove('ready');
}

// --- CUSTOM CONFIRM MODAL CONTROLLER ---
let confirmCallback = null;
function showCustomConfirm(title, text, callback) {
    document.getElementById('confirmModalTitle').innerText = title;
    document.getElementById('confirmModalText').innerText = text;
    document.getElementById('customConfirmModal').style.display = 'flex';
    confirmCallback = callback;
}
function closeCustomConfirm(result) {
    document.getElementById('customConfirmModal').style.display = 'none';
    if (confirmCallback) {
        confirmCallback(result);
        confirmCallback = null;
    }
}