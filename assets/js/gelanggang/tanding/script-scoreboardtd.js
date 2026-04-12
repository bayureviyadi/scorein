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
    const b = parseInt(d.Biru) || 0;
    const m = parseInt(d.Merah) || 0;

    const elBiru = document.getElementById('scoreBiru');
    const elMerah = document.getElementById('scoreMerah');

    // Update Angka
    elBiru.innerText = b;
    elMerah.innerText = m;

    // Reset Class
    elBiru.classList.remove('is-leading-blue');
    elMerah.classList.remove('is-leading-red');

    // Cek Siapa Unggul
    if (b > m) {
        elBiru.classList.add('is-leading-blue');
    } else if (m > b) {
        elMerah.classList.add('is-leading-red');
    }
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

    // Reset semua lampu ke posisi MATI (hapus class tanpa timer)
    sides.forEach(s => {
        categories.forEach(c => {
            const el = document.getElementById(`${s}-${c}`);
            if (el) el.classList.remove('active-p', 'active-t', 'active-binaan'); 
        });
    });

    // Nyalakan lampu jika data ada di ronde aktif
    Object.values(logs).forEach(log => {
        if (log.ronde == currentRound) {
            const el = document.getElementById(`${log.sudut}-${log.aksi}`);
            if (el) {
                if (log.aksi.includes('BN')) el.classList.add('active-binaan');
                else if (log.aksi.includes('T')) el.classList.add('active-t');
                else if (log.aksi.includes('P')) el.classList.add('active-p');
            }
        }
    });
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