/**
 * TMS SILAT - Global Auth Guard & Firebase Config
 * Author: Bayu Reviyadi (Informatics UNMA)
 * Updated: Auto-Kick & Infinite Loop Protection
 */

const firebaseConfig = {
    apiKey: "AIzaSyCaY8iCrMLVHXukVTih5ZPLzLj-2JoQKv0",
    databaseURL: "https://tms-silat-sera-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "tms-silat-sera"
};

// Inisialisasi Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const authDb = firebase.database();

/**
 * FUNGSI DYNAMIC PATH
 * Menentukan lokasi login.html relatif terhadap posisi file sekarang
 */
function getLoginPath() {
    const path = window.location.pathname;
    
    // Jika berada di dalam subfolder, gunakan ../ untuk naik satu tingkat
    if (path.includes('/tanding/') || path.includes('/super/') || path.includes('/gelanggang/')) {
        return "../auth/login.html";
    }
    
    // Jika berada di root atau folder auth itu sendiri
    if (path.includes('/auth/')) {
        return "login.html";
    }

    return "auth/login.html";
}

function protectPage() {
    const path = window.location.pathname;
    const isAuth = localStorage.getItem('isAuth');
    const myRole = localStorage.getItem('userRole');
    const loginUrl = getLoginPath();

    // --- PERBAIKAN UTAMA: CEK APAKAH SUDAH DI HALAMAN LOGIN ---
    // Jika user sudah di login.html, jangan jalankan proteksi (agar tidak loop)
    if (path.endsWith('login.html')) {
        return; 
    }

    // 1. CEK AUTH DASAR
    if (isAuth !== 'true' || !myRole) {
        console.warn("Akses ditolak: Silahkan login terlebih dahulu.");
        window.location.href = loginUrl;
        return;
    }

    // 2. CEK FORCE LOGOUT (Real-time Firebase)
    // Menggunakan .once untuk pengecekan awal yang cepat, lalu .on untuk real-time
    authDb.ref('users/' + myRole + '/isLoggedIn').on('value', snap => {
        const isLoggedInFirebase = snap.val();
        
        if (isLoggedInFirebase === false) {
            alert("Sesi Anda telah berakhir atau dihentikan oleh Admin!");
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = loginUrl;
        }
    });

    // 3. PROTEKSI ROLE (RBAC)
    if (path.includes('/super/') && myRole !== 'super_admin') {
        alert("Akses Terlarang! Anda bukan Super Admin.");
        // Jika di subfolder, balik ke menu utama di root
        window.location.href = "../pilih_kategori.html"; 
    }
}

// 4. ANTI-INSPECT ELEMENT (Opsional)
document.addEventListener('contextmenu', e => e.preventDefault());
document.onkeydown = function(e) {
    if (e.keyCode == 123 || 
        (e.ctrlKey && e.shiftKey && (e.keyCode == 73 || e.keyCode == 74)) || 
        (e.ctrlKey && e.keyCode == 85)) {
        return false;
    }
};

// Jalankan fungsi satpam
protectPage();