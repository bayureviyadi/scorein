// Pengaturan Tema Visual
function setMode(mode) {
    document.getElementById('mainBody').className = (mode === 'default' ? '' : 'theme-' + mode);
}

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// Simpan ronde aktif secara global agar bisa diakses fungsi lain
let currentRound = 1;
let currentScore = { Biru: 0, Merah: 0 };
let activePenalties = { Biru: [], Merah: [] };
let currentStats = { Biru: { pukul: 0, tendang: 0, Jatuhan: 0 }, Merah: { pukul: 0, tendang: 0, Jatuhan: 0 } };

function evaluateLeading() {
    const elBiru = document.getElementById('scoreBiru');
    const elMerah = document.getElementById('scoreMerah');
    if (!elBiru || !elMerah) return;

    elBiru.classList.remove('is-leading-blue');
    elMerah.classList.remove('is-leading-red');

    const b = currentScore.Biru;
    const m = currentScore.Merah;

    // Cek jika belum ada nilai atau teknik/penalti (Skor 0-0 awal pertandingan)
    const hasActivity = b !== 0 || m !== 0 || activePenalties.Biru.length > 0 || activePenalties.Merah.length > 0 || currentStats.Biru.Jatuhan > 0 || currentStats.Merah.Jatuhan > 0 || currentStats.Biru.tendang > 0 || currentStats.Merah.tendang > 0 || currentStats.Biru.pukul > 0 || currentStats.Merah.pukul > 0;

    if (b > m) {
        elBiru.classList.add('is-leading-blue');
    } else if (m > b) {
        elMerah.classList.add('is-leading-red');
    } else if (b === m && hasActivity) {
        // TIE BREAKER 1: Cek siapa yang memiliki penalti lebih ringan/sedikit
        const weight = { 'BN1': 1, 'BN2': 2, 'T1': 3, 'T2': 4, 'P1': 5, 'P2': 6 };
        let wBiru = 0, wMerah = 0;
        
        activePenalties.Biru.forEach(p => wBiru += weight[p] || 0);
        activePenalties.Merah.forEach(p => wMerah += weight[p] || 0);

        if (wBiru < wMerah) {
            elBiru.classList.add('is-leading-blue'); // Biru penaltinya lebih ringan
        } else if (wMerah < wBiru) {
            elMerah.classList.add('is-leading-red'); // Merah penaltinya lebih ringan
        } else {
            // TIE BREAKER 2: Jika penalti sama, cek teknik bobot terbesar (Jatuhan > Tendangan > Pukulan)
            const sB = currentStats.Biru || {};
            const sM = currentStats.Merah || {};

            const jB = sB.Jatuhan || 0, jM = sM.Jatuhan || 0;
            const tB = sB.tendang || 0, tM = sM.tendang || 0;
            const pB = sB.pukul || 0, pM = sM.pukul || 0;

            if (jB > jM) elBiru.classList.add('is-leading-blue');
            else if (jM > jB) elMerah.classList.add('is-leading-red');
            else if (tB > tM) elBiru.classList.add('is-leading-blue');
            else if (tM > tB) elMerah.classList.add('is-leading-red');
            else if (pB > pM) elBiru.classList.add('is-leading-blue');
            else if (pM > pB) elMerah.classList.add('is-leading-red');
        }
    }
}

// 0. Sinkronisasi Stats Teknik
db.ref('stats').on('value', snap => {
    const d = snap.val();
    if (d) {
        currentStats.Biru = d.Biru || currentStats.Biru;
        currentStats.Merah = d.Merah || currentStats.Merah;
        evaluateLeading();
    }
});

// 1. Sinkronisasi Informasi Pertandingan
db.ref('match_info').on('value', snap => {
    const d = snap.val(); 
    if(!d) return;
    document.getElementById('dispEvent').innerText = d.event || "SILAT DIGITAL";
    document.getElementById('dispBabak').innerText = d.babak || "PENYISIHAN";
    document.getElementById('dispKelas').innerText = d.kelas || "-";
    document.getElementById('dispPartai').innerText = d.partai || "0";
    document.getElementById('dispNamaBiru').innerText = d.namaBiru || "BIRU";
    document.getElementById('dispNamaMerah').innerText = d.namaMerah || "MERAH";
    document.getElementById('dispKontingenBiru').innerText = d.timBiru || "-";
    document.getElementById('dispKontingenMerah').innerText = d.timMerah || "-";
});

// 2. Sinkronisasi Timer & Ronde
db.ref('match_status').on('value', snap => {
    const d = snap.val(); 
    if(!d) return;
    
    currentRound = d.round || 1; // Update ronde global
    
    let m = Math.floor(d.timeLeft / 60), s = d.timeLeft % 60;
    const timerEl = document.getElementById('timerDisplay');
    if(timerEl) timerEl.innerText = `${m}:${s.toString().padStart(2,'0')}`;
    
    // Update Indikator Ronde Aktif
    [1, 2, 3].forEach(n => {
        const rb = document.getElementById('rb' + n);
        if (rb) rb.classList.toggle('active', currentRound == n);
    });

    // PENTING: Update lampu saat ronde berubah agar lampu lama mati
    db.ref('log_dewan').once('value', snapshot => {
        updateLampu(snapshot.val());
    });
});

// 3. Sinkronisasi Skor Utama (LOGIKA WARNA UNGGUL)
db.ref('score').on('value', snap => {
    const d = snap.val() || { Biru: 0, Merah: 0 };
    currentScore.Biru = parseInt(d.Biru) || 0;
    currentScore.Merah = parseInt(d.Merah) || 0;

    const elBiru = document.getElementById('scoreBiru');
    const elMerah = document.getElementById('scoreMerah');

    // Update Angka
    if (elBiru) elBiru.innerText = currentScore.Biru;
    if (elMerah) elMerah.innerText = currentScore.Merah;

    evaluateLeading();
});

// Fitur Menyembunyikan/Menampilkan Timer
function toggleTimer() {
    const timerElement = document.getElementById('timerDisplay');
    if (timerElement) {
        timerElement.classList.toggle('hidden');
    }
}

// --- LOGIKA LAMPU PELANGGARAN PERMANEN ---

function updateLampu(logs) {
    if (!logs) logs = {};
    const categories = ['BN1', 'BN2', 'T1', 'T2', 'P1', 'P2'];
    const sides = ['Biru', 'Merah'];

    // Reset array penalti aktif
    activePenalties = { Biru: [], Merah: [] };

    // Reset semua lampu ke posisi MATI (hapus class tanpa timer)
    sides.forEach(s => {
        categories.forEach(c => {
            const el = document.getElementById(`${s}-${c}`);
            if (el) el.classList.remove('active-p', 'active-t', 'active-binaan'); 
        });
    });

    // Nyalakan lampu jika data ada di ronde aktif dan catat penaltinya
    Object.values(logs).forEach(log => {
        if (log.ronde == currentRound) {
            const el = document.getElementById(`${log.sudut}-${log.aksi}`);
            if (el) {
                if (log.aksi.includes('BN')) el.classList.add('active-binaan');
                else if (log.aksi.includes('T')) el.classList.add('active-t');
                else if (log.aksi.includes('P')) el.classList.add('active-p');
            }
            if (categories.includes(log.aksi)) {
                activePenalties[log.sudut].push(log.aksi);
            }
        }
    });

    evaluateLeading();
}

// Listener log_dewan untuk perubahan data real-time
db.ref('log_dewan').on('value', snap => {
    updateLampu(snap.val());
});

// --- LOGIKA LAMPU JURI (FLASH 1 DETIK) ---

function flashJuri(juriId, sudut, aksi) {
    const id = `box-${sudut}-${aksi}-${juriId}`;
    const el = document.getElementById(id);
    if (!el) return;
    const activeClass = sudut === 'Biru' ? 'active-blue-j' : 'active-red-j';
    el.classList.add(activeClass);
    setTimeout(() => el.classList.remove(activeClass), 1000);
}

db.ref('log_wasit').limitToLast(1).on('child_added', snap => {
    const d = snap.val();
    if (!d) return;
    const sekarang = Date.now();
    // Hanya flash jika data masuk dalam 3 detik terakhir (mencegah flash saat baru buka halaman)
    if (sekarang - (d.waktu || 0) < 3000) {
        flashJuri(d.wasit, d.sudut, d.aksi);
    }
});

// --- LISTENER VAR AKTIF (MODAL SCOREBOARD) ---
db.ref('var_aktif').on('value', snap => {
    const data = snap.val();
    const modal = document.getElementById('varModalScoreboard');
    const subtitle = document.getElementById('varJenisScoreboard');
    const content = document.querySelector('.var-modal-content');
    
    if (!modal) return;

    if (data) {
        // VAR Sedang Aktif
        if (subtitle && content) {
            // Hapus semua state class
            content.classList.remove('decided-biru', 'decided-merah', 'decided-invalid');
            
            if (data.keputusan) {
                // Dewan sudah memilih hasil override
                subtitle.innerText = `KEPUTUSAN: ${data.keputusan.toUpperCase()}`;
                
                // Set warna modal sesuai dengan keputusan
                if (data.keputusan === 'Biru') content.classList.add('decided-biru');
                else if (data.keputusan === 'Merah') content.classList.add('decided-merah');
                else content.classList.add('decided-invalid'); // Kuning
            } else {
                // Menunggu hasil
                subtitle.innerText = `VERIFIKASI ${data.jenis ? data.jenis.toUpperCase() : '...'}`;
            }
        }
        modal.classList.add('show');
    } else {
        // VAR Selesai / Batal
        modal.classList.remove('show');
        if(content) content.classList.remove('decided-biru', 'decided-merah', 'decided-invalid');
    }
});