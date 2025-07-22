import { cacheUsersOnce, getUsers } from "../utils/firebase.js";
import { logAuditEntry } from "./auditLog.js";
import { showDashboard } from "./agentDashboard.js";

// ✅ Login Handler
export async function handleLogin() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  const hashedInput = await hashPassword(password);

  await cacheUsersOnce();
  const user = appState.cachedUsers.find(
    (u) => u.username === username && u.passwordHash === hashedInput
  );

  if (!user) return alert("Invalid login.");

  localStorage.setItem("username", user.username);
  localStorage.setItem("role", user.role);
  localStorage.setItem("isLoggedIn", true);

  logAuditEntry("Login", `Role: ${user.role}`);
  showDashboard(user.role);
}

// ✅ Auto-session restore
export function restoreSessionIfNeeded() {
  const loggedIn = localStorage.getItem("isLoggedIn");
  const role = localStorage.getItem("role");
  const username = localStorage.getItem("username");

  if (!loggedIn || !role || !username) return;

  cacheUsersOnce().then(() => {
    getUsers((users) => {
      const real = users.find((u) => u.username === username);

      if (!real || real.role !== role) {
        alert("Invalid session. You've been logged out.");
        localStorage.clear();
        return;
      }

      showDashboard(role);
    });
  });
}

// ✅ Setup event listeners on login/logout buttons
export function initAuthEvents() {
  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      handleLogin();
    });
  }

  const logoutAgent = document.getElementById("logout-btn");
  if (logoutAgent) {
    logoutAgent.addEventListener("click", () => {
      localStorage.clear();
      location.reload();
    });
  }

  const logoutManager = document.getElementById("logout-btn-manager");
  if (logoutManager) {
    logoutManager.addEventListener("click", () => {
      logAuditEntry("Logout", "");
      localStorage.clear();
      location.reload();
    });
  }
}