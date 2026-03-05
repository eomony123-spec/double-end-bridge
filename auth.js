const AUTH_KEY = "chotensai_auth_ok";
const FIXED_PASSWORD = "Chotensai-R7-Bridge-2026-Private-Only-8391";

const passwordInputEl = document.getElementById("passwordInput");
const unlockBtn = document.getElementById("unlockBtn");
const backBtn = document.getElementById("backBtn");
const authErrorEl = document.getElementById("authError");

init();

function init() {
  if (localStorage.getItem(AUTH_KEY) === "1") {
    window.location.replace("./tool.html");
    return;
  }

  unlockBtn.addEventListener("click", handleUnlock);
  backBtn.addEventListener("click", () => {
    window.location.href = "./index.html";
  });
  passwordInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handleUnlock();
  });
}

function handleUnlock() {
  const input = passwordInputEl.value;
  if (input === FIXED_PASSWORD) {
    localStorage.setItem(AUTH_KEY, "1");
    window.location.replace("./tool.html");
    return;
  }

  authErrorEl.textContent = "パスワードが違います。";
  passwordInputEl.focus();
}
