if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentRound = 1;
let timerRunning = false;
let timeLeft = 0;

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
    if(g) {
        g.innerHTML = '';
        for(let j=1; j<=3; j++) g.innerHTML += `<div id="box-${s}-pukul-${j}" class="juri-box">J${j} P</div>`;
        for(let j=1; j<=3; j++) g.innerHTML += `<div id="box-${s}-tendang-${j}" class="juri-box">J${j} T</div>`;
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

// --- 1. LISTENER KHUSUS ANIMASI (LOG BARU) ---
db.ref('log_wasit').limitToLast(1).on('child_added', snap => {
    const d = snap.val();
    if (!d) return;
    const sekarang = Date.now();
    const waktuData = d.waktu || 0;
    if (sekarang - waktuData < 3000) {
        flashJuriDewan(d.wasit, d.sudut, d.aksi);
    }
});

// --- 2. LISTENER DATA UTAMA (SCORE & INFO) ---
db.ref().on('value', snap => {
    const data = snap.val();
    if (!data) return;

    // A. Update Informasi Pertandingan & Timer
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
    let min = Math.floor(timeLeft/60), sec = timeLeft%60;
    const timerDisp = document.getElementById('timerDisp');
    if(timerDisp) timerDisp.innerText = `${min}:${sec.toString().padStart(2,'0')}`;
    
    [1,2,3].forEach(n => {
        const rb = document.getElementById('rb'+n);
        if(rb) rb.classList.toggle('active', currentRound == n);
    });

    // B. Hitung Statistik & Skor Otomatis
    updateStatsAndButtons(data.log_wasit || {}, data.log_dewan || {});
});

// --- LOGIKA UTAMA: DENGAN FILTER LAMPU PER RONDE ---
function updateStatsAndButtons(wasitLogs, dewanLogs) {
    const stats = {
        Biru: { pukul: 0, tendang: 0, Jatuhan: 0, BN1: 0, BN2: 0, T1: 0, T2: 0, P1: 0, P2: 0, P3: 0 },
        Merah: { pukul: 0, tendang: 0, Jatuhan: 0, BN1: 0, BN2: 0, T1: 0, T2: 0, P1: 0, P2: 0, P3: 0 }
    };

    // 1. Cluster Wasit (2 Juri dalam 2 Detik)
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

    // 2. Filter Dewan (Lampu vs Skor)
    Object.values(dewanLogs).forEach(d => {
        if(stats[d.sudut]) {
            // Logika Lampu: Hanya "dihitung" untuk indikator jika terjadi di ronde aktif
            if(['BN1', 'BN2', 'T1', 'T2'].includes(d.aksi)) {
                if(d.ronde == currentRound) {
                    stats[d.sudut][d.aksi]++; 
                }
            } else {
                // Jatuhan dan Peringatan dihitung akumulasi semua ronde
                stats[d.sudut][d.aksi]++;
            }
        }
    });

    // 3. Kalkulasi Skor Akhir
    ['Biru', 'Merah'].forEach(s => {
        let finalScore = 0;
        finalScore += (stats[s].pukul * 1);
        finalScore += (stats[s].tendang * 2);
        finalScore += (stats[s].Jatuhan * 3);
        
        // Pengurangan poin dihitung dari SEMUA log dewan tanpa filter ronde
        Object.values(dewanLogs).forEach(log => {
            if(log.sudut === s) {
                if(log.aksi === 'T1') finalScore -= 1;
                if(log.aksi === 'T2') finalScore -= 2;
                if(log.aksi === 'P1') finalScore -= 5;
                if(log.aksi === 'P2') finalScore -= 10;
                if(log.aksi === 'P3') finalScore -= 15;
            }
        });
        
        const scoreEl = document.getElementById(`score${s}`);
        if(scoreEl) scoreEl.innerText = finalScore;
        db.ref(`score/${s}`).set(finalScore);
        
        // Update UI Indikator & Tombol Pelanggaran
        for(let aks in stats[s]) {
            const el = document.getElementById(`stat-${s}-${aks}`);
            if(el) el.innerText = stats[s][aks];
            
            // Logika Tombol Binaan: Aktif kembali setiap ronde baru jika belum ada binaan di ronde tersebut
            if(aks === 'BN1' || aks === 'BN2') {
                const btn = document.getElementById(`btn-${s}-${aks}`);
                if(btn) {
                    if(stats[s][aks] > 0) {
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
}

function inputDewan(sudut, aksi, poin) {
    // Pastikan input hanya masuk jika waktu belum habis (opsional, tergantung kebutuhan teknis)
    db.ref('log_dewan').push({
        sudut: sudut, 
        aksi: aksi, 
        poin: poin, 
        ronde: currentRound,
        waktu: firebase.database.ServerValue.TIMESTAMP
    });
}

function hapusTerakhir(sudut) {
    if(!confirm(`UNDO AKSI TERAKHIR ${sudut}?`)) return;
    db.ref('log_dewan').orderByChild('sudut').equalTo(sudut).limitToLast(1).once('value', snap => {
        snap.forEach(child => child.ref.remove());
    });
}