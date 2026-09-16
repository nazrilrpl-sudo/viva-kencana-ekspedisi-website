// ===== KONFIGURASI API =====
const API_BASE = "https://v2.kencana.org/";
const AUTH_KEY = "auth";
const REMEMBER_KEY = "login_remember";


const password = document.getElementById("password");
const toggle = document.getElementById("togglePassword");

toggle.onclick = function () {
    if (password.type === "password") {
        password.type = "text";
        toggle.classList.replace("fa-eye", "fa-eye-slash");
    } else {
        password.type = "password";
        toggle.classList.replace("fa-eye-slash", "fa-eye");
    }
};


if (localStorage.getItem(AUTH_KEY)) {
    window.location.href = "dashboard.html";
}


(function fillRemembered() {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (!saved) return;
    try {
        const remembered = JSON.parse(saved);
        document.getElementById("username").value = remembered.username || "";
        password.value = remembered.password || "";
        const checkbox = document.querySelector(".remember input[type='checkbox']");
        if (checkbox) checkbox.checked = true;
    } catch (_) {
        localStorage.removeItem(REMEMBER_KEY);
    }
})();

// ===== SUBMIT LOGIN =====
const form = document.getElementById("loginForm");
const submitBtn = form.querySelector(".login-btn");
const originalBtnText = submitBtn.textContent;
const errorBox = document.getElementById("loginError");

function showError(message){
    errorBox.textContent = message;
    errorBox.classList.remove("show");
    // trigger reflow supaya animasi shake bisa jalan lagi kalau error muncul berturut-turut
    void errorBox.offsetWidth;
    errorBox.classList.add("show");
}

function hideError(){
    errorBox.classList.remove("show");
}

document.getElementById("username").addEventListener("input", hideError);
password.addEventListener("input", hideError);

form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const pass = password.value;
    const rememberChecked = document.querySelector(".remember input[type='checkbox']").checked;

    hideError();

    if (!username || !pass) {
        showError("Username atau password kosong");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Memproses...";

    try {
        const res = await fetch(API_BASE + "api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: username, password: pass })
        });

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

        if (!json || !json.data || !json.data.access_token) {
            throw new Error("Terjadi kesalahan! Silakan coba lagi.");
        }

        const auth = json.data;
        localStorage.setItem(AUTH_KEY, JSON.stringify(auth));

        if (rememberChecked) {
            localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username: username, password: pass }));
        } else {
            localStorage.removeItem(REMEMBER_KEY);
        }

        window.location.href = "dashboard.html";
    } catch (err) {
        showError(err.message || "Username atau Password salah!");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
    }
});
