// ===== KONFIGURASI API =====
const API_BASE = "https://v2.kencana.org/";
const AUTH_KEY = "auth";
const REMEMBER_KEY = "login_remember";
const POLL_INTERVAL_MS = 1000;

// ===== AUTH GUARD =====
function getAuth() {
    try {
        return JSON.parse(localStorage.getItem(AUTH_KEY));
    } catch (_) {
        return null;
    }
}

let auth = getAuth();
if (!auth || !auth.access_token) {
    window.location.href = "index.html";
}

function goToLogin() {
    localStorage.removeItem(AUTH_KEY);
    window.location.href = "index.html";
}

// ===== HELPER FETCH KE API (POST, butuh token) =====
async function apiPost(path, body) {
    const res = await fetch(API_BASE + path, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": (auth.token_type || "Bearer") + " " + auth.access_token
        },
        body: JSON.stringify(body || {})
    });

    if (res.status === 401) {
        goToLogin();
        throw new Error("UNAUTHORIZED");
    }

    let json = null;
    try {
        json = await res.json();
    } catch (_) {
        json = null;
    }

    if (!res.ok) {
        const message = (json && json.message) ? json.message : "Terjadi kesalahan! Silakan coba lagi.";
        throw new Error(message);
    }

    return json ? json.data : null;
}

// ===== DATA KENDARAAN (diisi dari API) =====
let vehicles = [];
let isLoadingVehicles = false;

// availability -> label filter (lihat dokumentasi API bagian Referensi Kode Status)
const AVAILABILITY_MAP = { I: "Tersedia", R: "Siap", L: "Muat", M: "Kirim" };

function mapVehicle(v) {
    // Cuma availability "I" yang dihitung Tersedia - kode lain/tak dikenal TIDAK
    // otomatis dianggap Tersedia, supaya jumlahnya tidak salah hitung.
    // Kode yang tidak dikenali dilabeli "Lainnya" (bukan disembunyikan) supaya
    // tetap kelihatan di list & bisa dicek raw_availability-nya.
    let status = AVAILABILITY_MAP[v.availability] || "Lainnya";
    if (v.active_flag === "N") status = "Blokir";

    return {
        id: v.vehicle_id,
        status: status,
        tipe: v.vehicle_type,
        plat: v.vehicle_id,
        driver: v.driver_name || v.exp_descr || "-",
        kapasitas: v.kapasitas || "-",
        exp_descr: v.exp_descr || "",
        raw_availability: v.availability // disimpan untuk debug kalau perlu dicek
    };
}

// STAT CARD CONFIG
const statConfig = [
    { key:"Tersedia", label:"Tersedia", sub:"Semua kendaraan siap",  color:"blue",   icon:"fa-truck" },
    { key:"Siap",     label:"Siap",     sub:"Siap diberangkatkan",   color:"green",  icon:"fa-clipboard-check" },
    { key:"Kirim",    label:"Kirim",    sub:"Sedang dalam perjalanan", color:"purple", icon:"fa-paper-plane" },
    { key:"Muat",     label:"Muat",     sub:"Sedang dimuat",         color:"orange", icon:"fa-box" },
    { key:"Blokir",   label:"Blokir",   sub:"Tidak dapat digunakan", color:"red",    icon:"fa-ban" },
];

function countStatus(status){
    return vehicles.filter(v=>v.status===status).length;
}

function renderStats(){
    const container=document.getElementById("statCards");
    container.innerHTML = statConfig.map(s=>`
        <div class="stat-card ${s.color}">
            <div class="stat-icon"><i class="fa-solid ${s.icon}"></i></div>
            <div class="stat-value">${countStatus(s.key)}</div>
            <div class="stat-label">${s.label}</div>
            <div class="stat-dots"><span></span><span></span><span></span><span></span></div>
            <div class="stat-sub">${s.sub}</div>
        </div>
    `).join("");
}

// ===== KELOMPOK TIPE KENDARAAN (pakai foto asli, semua sudah hadap kanan) =====
// CDD               -> img/truck-cdd.png
// CDD LONG          -> img/truck-sedang.png (belum ada foto khusus)
// ENGKEL            -> img/truck-engkel.png
// FUSO              -> img/truck-fuso.png
// PICK UP / L300    -> img/truck-pickup.png
// KONTAINER         -> img/truck-kontainer.png
// TRAILER PANJANG   -> img/truck-trailer.png
// TRAILER PENDEK    -> img/truck-trailer-pendek.png
// TRONTON, TRONTON PENDEK -> img/truck-tronton.png
function vehicleGroup(tipe){
    const t = (tipe || "").toUpperCase().trim();
    if (t === "CDD") return "cdd";
    if (t === "ENGKEL") return "engkel";
    if (t === "FUSO") return "fuso";
    if (t === "KONTAINER") return "kontainer";
    if (t === "PICK UP") return "pickup";
    if (t === "TRAILER PANJANG") return "trailer";
    if (t === "TRAILER PENDEK") return "trailer-pendek";
    if (t === "TRONTON" || t === "TRONTON PENDEK") return "tronton";
    return "sedang"; // CDD LONG + tipe tak dikenal lainnya
}

const GROUP_IMAGE = {
    sedang:         "img/truck-sedang.png",
    cdd:            "img/truck-cdd.png",
    engkel:         "img/truck-engkel.png",
    fuso:           "img/truck-fuso.png",
    pickup:         "img/truck-pickup.png",
    kontainer:      "img/truck-kontainer.png",
    trailer:        "img/truck-trailer.png",
    "trailer-pendek": "img/truck-trailer-pendek.png",
    tronton:        "img/truck-tronton.png",
};

// Label + kelas warna badge & filter foto berubah sesuai status
const STATUS_THEME = {
    Tersedia: { text:"IDLE",  color:"#64748b", cls:"status-tersedia" },
    Siap:     { text:"READY", color:"#15803d", cls:"status-siap" },
    Kirim:    { text:"OTW",   color:"#1d4ed8", cls:"status-kirim" },
    Muat:     { text:"LOAD",  color:"#b45309", cls:"status-muat" },
    Blokir:   { text:"BAN",   color:"#b91c1c", cls:"status-blokir" },
    Lainnya:  { text:"NOT",   color:"#64748b", cls:"status-tersedia" },
};

// ===== VISUAL KENDARAAN (foto asli + filter warna status + badge) =====
function vehicleVisualHTML(status, tipe){
    const theme = STATUS_THEME[status] || STATUS_THEME.Tersedia;
    const img = GROUP_IMAGE[vehicleGroup(tipe)] || GROUP_IMAGE.sedang;
    const moving = status === "Kirim"
        ? `<span class="speed-lines"><span></span><span></span><span></span></span>`
        : "";

    return `
        ${moving}
        <img src="${img}" class="truck-img ${theme.cls}" alt="${tipe || ''}" onerror="this.style.visibility='hidden'">
        <span class="truck-badge" style="color:${theme.color};border-color:${theme.color}">${theme.text}</span>
    `;
}

// ===== RENDER VEHICLE GRID =====
function renderVehicles(list){
    const grid=document.getElementById("vehicleGrid");

    if(list.length===0){
        grid.innerHTML=`
        <div class="empty-state">
            <i class="fa-solid fa-box-open"></i>
            Tidak ada kendaraan yang cocok dengan pencarian
        </div>`;
        return;
    }

    grid.innerHTML = list.map(v=>{
        const displayStatus = v.status;
        return `
        <div class="vehicle-card" data-id="${v.id}">
            <div class="vehicle-status">
                <span class="dot ${displayStatus}"></span> ${displayStatus}
            </div>
            <div class="truck-visual">${vehicleVisualHTML(displayStatus, v.tipe)}</div>
            <div class="vehicle-type">${v.tipe}</div>
            <div class="vehicle-plate">${v.plat}</div>
            <div class="vehicle-driver" title="${v.driver}">${v.driver}</div>
        </div>
    `}).join("");

    document.querySelectorAll(".vehicle-card").forEach(card=>{
        card.addEventListener("click",()=>openVehicleModal(card.dataset.id));
    });
}

// ===== FILTERING (lokal, sesuai perilaku app aslinya) =====
function applyFilter(){
    const query = document.getElementById("searchInput").value.trim().toLowerCase();
    const status = document.getElementById("filterStatus").dataset.value;
    const tipe = document.getElementById("filterTipe").dataset.value;

    const filtered = vehicles.filter(v=>{
        const matchQuery = !query ||
            v.plat.toLowerCase().includes(query) ||
            v.driver.toLowerCase().includes(query) ||
            v.tipe.toLowerCase().includes(query);
        const matchStatus = !status || v.status===status;
        const matchTipe = !tipe || v.tipe===tipe;
        return matchQuery && matchStatus && matchTipe;
    });

    renderVehicles(filtered);
}

// ===== FILTER TIPE KENDARAAN (dibangun dari data asli + getApplConstant) =====
async function loadVehicleTypeOptions(vehicleList){
    const types = [...new Set(vehicleList.map(v=>v.tipe).filter(Boolean))];

    try {
        const constants = await apiPost("api/viva/exp_vhc/getApplConstant", { key_id: "VH_TYPE" });
        (constants || []).forEach(c=>{
            const val = c.str1 || c.nama_gabungan;
            if(val && !types.includes(val)) types.push(val);
        });
    } catch (err) {
        if (err.message !== "UNAUTHORIZED") {
            console.warn("Gagal memuat getApplConstant, filter tipe dibangun dari data kendaraan saja.", err);
        }
    }

    types.sort();

    const container = document.getElementById("filterTipe");
    const optionsWrap = container.querySelector(".custom-select-options");
    const currentValue = container.dataset.value;

    optionsWrap.innerHTML = `<div class="custom-select-option${currentValue ? "" : " selected"}" data-value="">Semua Tipe</div>` +
        types.map(t=>`<div class="custom-select-option${currentValue===t ? " selected" : ""}" data-value="${t}">${t}</div>`).join("");

    bindCustomSelectOptions(container);
}

// ===== INFO EKSPEDISI (getUserExp) - ditampilkan di header sapaan =====
async function loadUserExpedition(){
    try {
        const list = await apiPost("api/viva/exp_vhc/getUserExp", {});
        if (list && list.length > 0) {
            const exp = list[0];
            const label = exp.nama_gabungan || exp.exp_descr;
            if (label) {
                document.querySelector(".welcome h1").innerHTML =
                    `Selamat datang, ${label}<span class="wave"></span>`;
            }
        }
    } catch (err) {
        if (err.message !== "UNAUTHORIZED") {
            console.warn("Gagal memuat data ekspedisi user.", err);
        }
    }
}

// ===== LOAD DAFTAR KENDARAAN =====
async function loadVehicles(isInitialLoad){
    if (isLoadingVehicles) return;
    isLoadingVehicles = true;

    try {
        const data = await apiPost("api/viva/exp_vhc/getExpVehicle", { user_id: "" });
        vehicles = (data || []).map(mapVehicle);

        renderStats();
        applyFilter();

        if (isInitialLoad) {
            await loadVehicleTypeOptions(vehicles);
        }
    } catch (err) {
        if (err.message !== "UNAUTHORIZED") {
            console.error("Gagal memuat daftar kendaraan.", err);
            if (isInitialLoad) {
                document.getElementById("vehicleGrid").innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    Gagal memuat data kendaraan. Silakan refresh halaman.
                </div>`;
            }
        }
    } finally {
        isLoadingVehicles = false;
    }
}

// ===== MODAL INFORMASI / KONFIRMASI KENDARAAN =====

// Cuma dua arah yang bisa diubah: Tersedia <-> Siap (to_avail "R" / "I").
// Kirim, Muat, dan Blokir hanya menampilkan info, tanpa opsi ubah status.
const statusFlow = {
    Tersedia: "R", // -> Siap
    Siap: "I",     // -> Tersedia
};

const statusLabel = {
    Tersedia: "ready (siap)",
    Siap: "idle (tersedia)",
};

let activeVehicleId = null;

function openVehicleModal(id){
    const v = vehicles.find(x=>x.id===id);
    if(!v) return;

    activeVehicleId = id;
    const nextAvail = statusFlow[v.status]; // undefined kalau Kirim/Muat/Blokir

    let bodyHTML = `
        <p>Kendaraan dengan Informasi:</p>
        <p>Driver : <strong>${v.driver}</strong></p>
        <p>Plat Nomor : <strong>${v.plat}</strong></p>
        <p>Kapasitas : <strong>${v.kapasitas}</strong></p>
        <p>Tipe Kendaraan : <strong>${v.tipe}</strong></p>
        <p>Status : <strong>${v.status}</strong></p>
    `;

    const actions = document.getElementById("modalActions");

    if(nextAvail){
        bodyHTML += `
            <p class="confirm-question">
                Apakah Anda ingin mengubah status menjadi ${statusLabel[v.status]}?
            </p>
        `;
        actions.classList.add("show");
    } else {
        actions.classList.remove("show");
    }

    document.getElementById("modalBody").innerHTML = bodyHTML;
    document.getElementById("detailModal").classList.add("show");
}

function closeVehicleModal(){
    document.getElementById("detailModal").classList.remove("show");
    activeVehicleId = null;
}

async function confirmStatusChange(){
    if(activeVehicleId === null) return;

    const v = vehicles.find(x=>x.id===activeVehicleId);
    const nextAvail = v ? statusFlow[v.status] : null;
    if(!v || !nextAvail) {
        closeVehicleModal();
        return;
    }

    const confirmBtn = document.getElementById("confirmYes");
    const cancelBtn = document.getElementById("confirmCancel");
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;

    try {
        await apiPost("api/viva/exp_vhc/deleteActivateExpVhc", {
            vehicle_id: v.id,
            to_avail: nextAvail,
            to_stat: "Y"
        });
        closeVehicleModal();
        await loadVehicles(false);
    } catch (err) {
        if (err.message !== "UNAUTHORIZED") {
            alert(err.message || "Update Gagal");
        }
    } finally {
        confirmBtn.disabled = false;
        cancelBtn.disabled = false;
    }
}

document.getElementById("modalClose").addEventListener("click", closeVehicleModal);
document.getElementById("confirmCancel").addEventListener("click", closeVehicleModal);
document.getElementById("confirmYes").addEventListener("click", confirmStatusChange);
document.getElementById("detailModal").addEventListener("click",(e)=>{
    if(e.target.id==="detailModal") closeVehicleModal();
});

// ===== CUSTOM DROPDOWN =====
function bindCustomSelectOptions(cs){
    const trigger = cs.querySelector(".custom-select-trigger");
    const label = cs.querySelector(".custom-select-label");
    const options = cs.querySelectorAll(".custom-select-option");

    options.forEach(opt=>{
        opt.addEventListener("click",()=>{
            options.forEach(o=>o.classList.remove("selected"));
            opt.classList.add("selected");
            label.textContent = opt.textContent;
            cs.dataset.value = opt.dataset.value;
            cs.classList.remove("open");
            applyFilter();
        });
    });
}

document.querySelectorAll(".custom-select").forEach(cs=>{
    const trigger = cs.querySelector(".custom-select-trigger");

    trigger.addEventListener("click",(e)=>{
        e.stopPropagation();
        document.querySelectorAll(".custom-select").forEach(other=>{
            if(other!==cs) other.classList.remove("open");
        });
        cs.classList.toggle("open");
    });

    bindCustomSelectOptions(cs);
});

document.addEventListener("click",()=>{
    document.querySelectorAll(".custom-select").forEach(cs=>cs.classList.remove("open"));
});

// ===== EVENTS =====
document.getElementById("searchInput").addEventListener("input", applyFilter);

document.querySelector(".logout").addEventListener("click", async (e)=>{
    e.preventDefault();

    if(!confirm("Apakah Anda yakin ingin keluar dari aplikasi?")) return;

    try {
        const res = await fetch(API_BASE + "api/logout", {
            method: "GET",
            headers: {
                "Authorization": (auth.token_type || "Bearer") + " " + auth.access_token
            }
        });

        if (res.ok || res.status === 401) {
            localStorage.removeItem(AUTH_KEY);
            window.location.href = "index.html";
        } else {
            alert("Unknown error, please contact admin");
        }
    } catch (err) {
        // Kalau request gagal total (network/CORS), tetap arahkan ke login
        // supaya user tidak terjebak di dashboard.
        localStorage.removeItem(AUTH_KEY);
        window.location.href = "index.html";
    }
});

// ===== INIT =====
document.getElementById("vehicleGrid").innerHTML = `
    <div class="empty-state">
        <i class="fa-solid fa-spinner fa-spin"></i>
        Memuat data kendaraan...
    </div>`;

renderStats();
loadVehicles(true);
loadUserExpedition();

setInterval(()=>{ loadVehicles(false); }, POLL_INTERVAL_MS);