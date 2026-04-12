if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let localTime = 120;
let isRunning = false;
let selectedDuration = 120;
let currentRound = 1;
let mainInterval = null;

// --- THEME LOGIC ---
const themes = ['standard', 'night', 'sporty', 'olympic'];
let themeIdx = themes.indexOf(localStorage.getItem('op-theme') || 'standard');

function cycleTheme() {
    themeIdx = (themeIdx + 1) % themes.length;
    const newTheme = themes[themeIdx];
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('op-theme', newTheme);
    document.getElementById('themeTitle').innerText = "ADMIN MODE: " + newTheme.toUpperCase();
}
document.body.setAttribute('data-theme', themes[themeIdx]);
document.getElementById('themeTitle').innerText = "ADMIN MODE: " + themes[themeIdx].toUpperCase();

// --- LISTENER SKOR UTAMA ---
// Menampilkan skor yang sudah dihitung dan disahkan oleh Dewan
db.ref('score').on('value', snap => {
    const d = snap.val() || { Biru: 0, Merah: 0 };
    const elB = document.getElementById('liveScoreBiru');
    const elM = document.getElementById('liveScoreMerah');
    if(elB) elB.innerText = d.Biru;
    if(elM) elM.innerText = d.Merah;
});

// --- LISTENER INFO IDENTITAS ---
db.ref('match_info').on('value', snap => {
    const d = snap.val();
    if(d) {
        document.getElementById('event').value = d.event || '';
        document.getElementById('babak').value = d.babak || '';
        document.getElementById('kelas').value = d.kelas || '';
        document.getElementById('partai').value = d.partai || '';
        document.getElementById('namaBiru').value = d.namaBiru || '';
        document.getElementById('timBiru').value = d.timBiru || '';
        document.getElementById('namaMerah').value = d.namaMerah || '';
        document.getElementById('timMerah').value = d.timMerah || '';
    }
});

// --- LISTENER STATUS MATCH & TIMER ---
db.ref('match_status').on('value', snap => {
    const d = snap.val();
    if(!d) return;

    if (Math.abs(localTime - d.timeLeft) > 1 || !isRunning) {
        localTime = d.timeLeft;
    }
    
    isRunning = d.isRunning;
    currentRound = d.round || 1;

    document.getElementById('timerDisp').innerText = formatWaktu(localTime);
    document.getElementById('btnStart').style.display = isRunning ? 'none' : 'inline-block';
    document.getElementById('btnStop').style.display = isRunning ? 'inline-block' : 'none';
    document.getElementById('roundLabel').innerText = ["", "I", "II", "III"][currentRound] || "-";
    
    document.querySelectorAll('.btn-rd').forEach(btn => btn.classList.remove('active'));
    if(document.getElementById('rd' + currentRound)) document.getElementById('rd' + currentRound).classList.add('active');

    if (isRunning) {
        startClockInternal();
    } else {
        stopClockInternal();
    }
});

function startClockInternal() {
    if (!mainInterval) {
        mainInterval = setInterval(() => {
            if (localTime > 0) {
                localTime--;
                document.getElementById('timerDisp').innerText = formatWaktu(localTime);
                db.ref('match_status/timeLeft').set(localTime);
            } else {
                stopClockInternal();
                db.ref('match_status').update({ isRunning: false, timeLeft: 0 });
                if (navigator.vibrate) navigator.vibrate(1000);
            }
        }, 1000);
    }
}

function stopClockInternal() {
    clearInterval(mainInterval);
    mainInterval = null;
}

function setDuration(seconds) {
    if(isRunning) return; 
    selectedDuration = seconds;
    localTime = seconds;
    document.querySelectorAll('.btn-time').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById('t' + seconds);
    if(btn) btn.classList.add('active');
    db.ref('match_status').update({ timeLeft: seconds, isRunning: false });
}

function formatWaktu(t) {
    let m = Math.floor(t/60);
    let s = t % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function toggleTimer() { 
    db.ref('match_status/isRunning').set(!isRunning); 
}

function setRound(r) { 
    db.ref('match_status').update({ 
        round: r, 
        timeLeft: selectedDuration, 
        isRunning: false 
    }); 
}

function updateIdentity() {
    db.ref('match_info').update({
        event: document.getElementById('event').value,
        babak: document.getElementById('babak').value,
        kelas: document.getElementById('kelas').value,
        partai: document.getElementById('partai').value,
        namaBiru: document.getElementById('namaBiru').value,
        timBiru: document.getElementById('timBiru').value,
        namaMerah: document.getElementById('namaMerah').value,
        timMerah: document.getElementById('timMerah').value
    });
    alert("DATA IDENTITAS TERSIMPAN!");
}

// --- FUNGSI RESET TOTAL ---
function resetMatch() {
    if(confirm("⚠️ RESET TOTAL DATA?\nSkor dan Log akan dihapus untuk Partai baru.")) {
        stopClockInternal();
        
        const resetData = {
            match_status: { 
                timeLeft: selectedDuration, 
                isRunning: false, 
                round: 1 
            },
            score: { Biru: 0, Merah: 0 },
            log_wasit: null,
            log_dewan: null,
            verifikasi_aktif: null 
        };

        db.ref().update(resetData).then(() => {
            localTime = selectedDuration;
            alert("SISTEM BERHASIL DI-RESET!");
        });
    }
}