import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getDatabase, ref, get, set } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";


// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyA5gDeYoz8S3R3j3UXgq1GgvYuTD6HOHEY",
  authDomain: "transfertrackerapp.firebaseapp.com",
  projectId: "transfertrackerapp",
  storageBucket: "transfertrackerapp.firebasestorage.app",
  messagingSenderId: "134039442458",
  appId: "1:134039442458:web:bd9ee250cbbb4911aceda3",
  measurementId: "G-8PZFFB6XSM"
};

// ✅ New style initialization
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
let cachedUsers = [];
let managerFilterState = "daily"; // default to 'daily' on load

function showDashboard(role) {
  const username = localStorage.getItem("username");
  const dashboardAgent = document.getElementById("agent-dashboard");
  const dashboardManager = document.getElementById("manager-dashboard");

  getUsers(users => {
    const user = users.find(u => u.username === username);

    if (!user) {
      alert("Invalid session. Logging out.");
      localStorage.clear();
      location.reload();
      return;
    }

    if (user.role !== role) {
      console.warn("🚨 Role mismatch. Local role:", role, "Real role:", user.role);
      alert("Session mismatch. Logging out for security.");
      localStorage.clear();
      location.reload();
      return;
    }

    document.getElementById("login-container").style.display = "none";

    if (user.role === "agent") {
      dashboardAgent.style.display = "block";
      document.getElementById("agent-name").textContent = username;
      document.getElementById("dial-count").textContent = localStorage.getItem("dialCount") || "0";
      document.getElementById("transfer-date").value = new Date().toISOString().slice(0, 10);

      renderTransfers();
      updateStats();
      renderLeaderboard();
    }

    if (user.role === "manager") {
      dashboardManager.style.display = "block";

      const today = getToday();
      renderManagerLeaderboardFiltered(today, today);
      renderManagerSummary();
      populateOverrideDropdown();
      renderBackdateInbox();
      renderHourlyBreakdown();
      populateAnalyticsDropdown();
      renderAuditLog();
      populateUserManagementDropdown();
      syncAuditToLocalStorage();
      loadSettings();
      populateScorecardDropdown();
    }
  });
}


// Load settings from Firebase and populate inputs
function loadSettings() {
  const settingsRef = ref(db, "settings");
  get(settingsRef).then(snapshot => {
    if (!snapshot.exists()) return;
    const settings = snapshot.val();

    document.getElementById("setting-dial-goal").value = settings.dialGoal || "";
    document.getElementById("setting-transfer-goal").value = settings.transferGoal || "";
    document.getElementById("setting-badge-threshold").value = settings.badgeThreshold || "";
  });
}



// Save settings to Firebase
function saveSettings() {
  const settingsRef = ref(db, "settings");
  const newSettings = {
    dialGoal: parseInt(document.getElementById("setting-dial-goal").value),
    transferGoal: parseInt(document.getElementById("setting-transfer-goal").value),
    badgeThreshold: parseInt(document.getElementById("setting-badge-threshold").value),
  };

  set(settingsRef, newSettings).then(() => {
  logAuditEntry("Update Settings", JSON.stringify(newSettings));
  alert("✅ Settings saved!");
}).catch(err => {
  console.error("❌ Error saving settings:", err);
  alert("❌ Failed to save settings.");
});

}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Button listener
//document.getElementById("save-settings-btn").addEventListener("click", saveSettings);



// === USER MANAGEMENT ===

function getUsersFromFirebase(callback) {
  get(ref(db, "users")).then(snapshot => {
    const users = snapshot.val() || [];
    callback(users);
  });
}

async function cacheUsersOnce() {
  try {
    const snapshot = await get(ref(db, "users"));
    if (snapshot.exists()) {
      cachedUsers = snapshot.val();
    } else {
      cachedUsers = [];
    }
  } catch (error) {
    console.error("❌ Failed to cache users:", error);
    cachedUsers = [];
  }
}
function saveUsersToFirebase(users) {
  set(ref(db, "users"), users);
}


function getUsers(callback) {
  callback(cachedUsers);
}

function saveUsers(users) {
  saveUsersToFirebase(users);
}

function saveTransferToFirebase(username, date, transfer) {
  const transferRef = ref(db, `transfers/${username}/${date}`);

  get(transferRef).then(snapshot => {
    const current = snapshot.exists() ? snapshot.val() : [];
    current.push(transfer);
    set(transferRef, current).then(() => {
  logAuditEntry("Submit Transfer", `Client: ${transfer.client}, Banker: ${transfer.banker}`);
  renderTransfers();
  updateStats();
  renderLeaderboard();
}).catch(error => {
  console.error("❌ Error saving transfer to Firebase:", error);
  alert("❌ Transfer failed to save. Try again.");
});
  }); // <-- Added closing bracket for saveTransferToFirebase
}

function saveCallsToFirebase(username, date, callCount) {
  const callsRef = ref(db, `calls/${username}/${date}`);
  set(callsRef, callCount).then(() => {
    logAuditEntry("Update Call Count", `Count: ${callCount}`);
    updateStats(); // Refresh dashboard
    renderLeaderboard();
  }).catch(err => {
    console.error("❌ Error saving calls to Firebase:", err);
  });
}

function populateScorecardDropdown() {
  const selectEl = document.getElementById("scorecard-select");
  if (!selectEl) return;

  selectEl.addEventListener("change", function () {
    renderAgentScorecard(this.value);
  });

  const dropdown = selectEl;
  dropdown.innerHTML = "";

  const users = cachedUsers;

  const agents = users.filter(u => u.role === "agent");
  agents.forEach(user => {
    const option = document.createElement("option");
    option.value = user.username;
    option.textContent = user.username;
    dropdown.appendChild(option);
  });

  if (agents.length > 0) {
    dropdown.value = agents[0].username;
    renderAgentScorecard(agents[0].username);
  }
}

function renderAgentScorecard(agentName) {
  const today = getToday();
  const badgeThreshold = parseInt(document.getElementById("setting-badge-threshold").value) || 5;

  const transfersRef = ref(db, `transfers/${agentName}/${today}`);
  const callsRef = ref(db, `calls/${agentName}/${today}`);

  Promise.all([get(transfersRef), get(callsRef)]).then(([tSnap, cSnap]) => {
    const transfers = tSnap.exists() ? tSnap.val() : [];
    const calls = cSnap.exists() ? cSnap.val() : 0;
    const conv = calls > 0 ? ((transfers.length / calls) * 100).toFixed(1) + "%" : "0%";
    const badge = transfers.length >= badgeThreshold ? "🏅" : "—";

    document.getElementById("score-transfers").textContent = transfers.length;
    document.getElementById("score-dials").textContent = calls;
    document.getElementById("score-conversion").textContent = conv;
    document.getElementById("score-badge").textContent = badge;

    // Hourly Breakdown
    const hourlyCounts = Array(24).fill(0);
    transfers.forEach(t => {
      const hour = parseInt(t.timestamp.split("T")[1].split(":")[0]);
      hourlyCounts[hour]++;
    });

    const tbody = document.querySelector("#scorecard-hourly tbody");
    tbody.innerHTML = "";
    for (let hour = 9; hour <= 17; hour++) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${hour}:00 – ${hour + 1}:00</td>
        <td>${hourlyCounts[hour]}</td>
      `;
      tbody.appendChild(row);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("chatbot-toggle");
  const box = document.getElementById("chatbot-container");
  const input = document.getElementById("chatbot-input");
  const messages = document.getElementById("chatbot-messages");

  if (toggle && box && input && messages) {
    let chatHistory = [];

    toggle.addEventListener("click", () => {
      box.style.display = "block";
      toggle.style.display = "none";
    });

    document.getElementById("chatbot-close").addEventListener("click", () => {
      box.style.display = "none";
      toggle.style.display = "block";
    });

    document.getElementById("chatbot-send").addEventListener("click", () => {
      const userMessage = input.value.trim();
      if (!userMessage) return;

      const userBubble = document.createElement("div");
      userBubble.textContent = "🧑 " + userMessage;
      messages.appendChild(userBubble);
      input.value = "";

      const botBubble = document.createElement("div");
      botBubble.textContent = "🤖 Let me think...";
      messages.appendChild(botBubble);

      messages.scrollTop = messages.scrollHeight;
    });
  }
});
// === LOGIN ===

document.getElementById("login-btn").addEventListener("click", () => {
  handleLogin();
});

async function handleLogin() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  const hashedInput = await hashPassword(password);

  await cacheUsersOnce(); // ✅ this line is now valid
  const user = cachedUsers.find(u => u.username === username && u.passwordHash === hashedInput);
  if (!user) return alert("Invalid login.");

  localStorage.setItem("username", user.username);
  localStorage.setItem("role", user.role);
  localStorage.setItem("isLoggedIn", true);

  logAuditEntry("Login", `Role: ${user.role}`);
  showDashboard(user.role);
}




// === LOGOUTS ===
document.getElementById("logout-btn").addEventListener("click", () => {
  localStorage.clear();
  location.reload();
});

const logoutManager = document.getElementById("logout-btn-manager");
if (logoutManager) {
  logoutManager.addEventListener("click", () => {
    logAuditEntry("Logout", "");
    localStorage.clear();
    location.reload();
  });
}

// === ON LOAD ===
window.addEventListener("DOMContentLoaded", function () {
  const loggedIn = localStorage.getItem("isLoggedIn");
  const role = localStorage.getItem("role");
  const username = localStorage.getItem("username");

  // ⛔ First block showDashboard unless user is logged in
  if (!loggedIn || !role || !username) return;

  // 🔒 Validate session BEFORE showing dashboard
  getUsers(users => {
    const real = users.find(u => u.username === username);

    if (!real || real.role !== role) {
      console.warn("🚨 Spoofed role detected. Logging out.");
      alert("Invalid session. You've been logged out.");
      localStorage.clear();
      // ✅ Don't reload — just stop execution
      return;
    }

    // ✅ If all checks pass
    showDashboard(role);
  });
});


// === BACKDATE SELECTOR ===
document.getElementById("transfer-date").addEventListener("change", function () {
  const selectedDate = this.value;
  const today = new Date().toISOString().slice(0, 10);
  const username = localStorage.getItem("username");

  if (selectedDate !== today) {
    const approved = JSON.parse(localStorage.getItem("approvedBackdates")) || [];
    const allowed = approved.find(r => r.username === username && r.date === selectedDate);
    document.getElementById("date-warning").style.display = allowed ? "none" : "block";
  } else {
    document.getElementById("date-warning").style.display = "none";
  }
});

// === SUBMIT TRANSFER ===
document.getElementById("submit-transfer").addEventListener("click", async function () {
  const selectedDate = document.getElementById("transfer-date").value || new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const username = localStorage.getItem("username");

  if (selectedDate !== today) {
  const approvedRef = ref(db, `approvedBackdates/${username}/${selectedDate}`);
  const approvedSnap = await get(approvedRef);
  const isApproved = approvedSnap.exists();

  if (!isApproved) {
    alert("Backdated transfer not approved by manager.");
    return;
  }
}

  const client = document.getElementById("client-name");
  const phone = document.getElementById("client-phone");
  const banker = document.getElementById("banker");
  const loanPurpose = document.getElementById("loan-purpose");
  const notes = document.getElementById("notes");

  // Basic validation
  let valid = true;

  [client, phone, banker, loanPurpose].forEach(el => {
    el.classList.remove("invalid");
    if (!el.value.trim() || (el === phone && el.value.replace(/\D/g, "").length !== 10)) {
      el.classList.add("invalid");
      valid = false;
    }
  });

  if (!valid) {
    alert("⚠️ Please fill in all required fields correctly.");
    return;
  }

  const transfer = {
    agent: username,
    client: client.value.trim(),
    phone: phone.value.trim(),
    banker: banker.value.trim(),
    loanPurpose: loanPurpose.value.trim(),
    notes: notes.value.trim(),
    timestamp: new Date().toISOString(),
  };

  saveTransferToFirebase(username, selectedDate, transfer);

  // Clear fields
  client.value = "";
  phone.value = "";
  banker.value = "";
  loanPurpose.value = "";
  notes.value = "";

  renderTransfers();
  updateStats();
  renderLeaderboard();
});


// === SUBMIT DIALS ===
document.getElementById("submit-calls").addEventListener("click", function () {
  const calls = parseInt(document.getElementById("call-input").value);
  if (!isNaN(calls) && calls >= 0) {
    const today = getToday();
    const username = localStorage.getItem("username");

    const callsRef = ref(db, `calls/${username}/${today}`);
    set(callsRef, calls).then(() => {
      logAuditEntry("Update Call Count", `Count: ${calls}`);
      document.getElementById("dial-count").textContent = calls;
      updateStats();
      renderLeaderboard();
      alert("✅ Call count saved!");
    }).catch(error => {
      console.error("❌ Error saving calls to Firebase:", error);
      alert("❌ Failed to save call count. Try again.");
    });
  } else {
    alert("⚠️ Please enter a valid number of calls.");
  }
});

function getDateRange(filterType) {
  const today = new Date();
  let start, end;

  if (filterType === "daily") {
    start = end = today.toISOString().split("T")[0];
  } else if (filterType === "weekly") {
    const day = today.getDay(); // 0 (Sun) - 6 (Sat)
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    start = monday.toISOString().split("T")[0];
    end = sunday.toISOString().split("T")[0];
  } else if (filterType === "monthly") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    start = first.toISOString().split("T")[0];
    end = last.toISOString().split("T")[0];
  }

  return { start, end };
}


function getToday() {
  return new Date().toISOString().split("T")[0];
}

// === RENDER TRANSFERS ===
function renderTransfers() {
  const username = localStorage.getItem("username");
  const selectedDate = document.getElementById("transfer-date").value || getToday();
  const transferList = document.getElementById("transfer-list");
  transferList.innerHTML = "";

  const transferRef = ref(db, `transfers/${username}/${selectedDate}`);
  get(transferRef).then(snapshot => {
    const transfers = snapshot.exists() ? snapshot.val() : [];

    transfers.forEach(t => {
      const li = document.createElement("li");
      li.textContent = `${t.client} – ${t.phone} → ${t.banker} (${t.loanPurpose})`;
      transferList.appendChild(li);
    });

    document.getElementById("transfer-count").textContent = transfers.length;
    updateStats(transfers.length);
  }).catch(err => {
    console.error("Error loading transfers:", err);
  });
}

document.getElementById("client-phone").addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    const raw = this.value.replace(/\D/g, ""); // remove all non-digits
    if (raw.length === 10) {
      const formatted = `(${raw.slice(0,3)}) ${raw.slice(3,6)}-${raw.slice(6)}`;
      this.value = formatted;
    }
  }
});

// === UPDATE STATS ===
function updateStats(transferCount) {
  const username = localStorage.getItem("username");
  const today = getToday();
  const callsRef = ref(db, `calls/${username}/${today}`);

  get(callsRef).then(snapshot => {
    const dialCount = snapshot.exists() ? snapshot.val() : 0;
    const conversion = dialCount > 0 ? ((transferCount / dialCount) * 100).toFixed(1) + "%" : "0%";

    document.getElementById("dial-count").textContent = dialCount;
    document.getElementById("conversion-rate").textContent = conversion;
  }).catch(err => {
    console.error("Error loading call count:", err);
  });
}


// === RENDER AGENT LEADERBOARD ===
function renderLeaderboard() {
  const today = getToday();
  const leaderboardBody = document.getElementById("leaderboard-body");
  if (!leaderboardBody) return;
  leaderboardBody.innerHTML = "";

  const users = cachedUsers;
  const rows = [];

  const agentUsers = users.filter(user => user.role === "agent");
  let completed = 0;

  for (const user of agentUsers) {
    const transferRef = ref(db, `transfers/${user.username}/${today}`);
    const callsRef = ref(db, `calls/${user.username}/${today}`);

    Promise.all([get(transferRef), get(callsRef)]).then(([tSnap, cSnap]) => {
      const transfers = tSnap.exists() ? tSnap.val() : [];
      const calls = cSnap.exists() ? cSnap.val() : 0;
      const conversion = calls > 0 ? ((transfers.length / calls) * 100).toFixed(1) + "%" : "0%";
      const badge = transfers.length >= 5 ? "🏅" : "";

      rows.push({
        username: user.username,
        transfers: transfers.length,
        calls,
        conversion,
        badge
      });

      completed++;
      if (completed === agentUsers.length) {
        rows.sort((a, b) => b.transfers - a.transfers);
        rows.forEach((row, i) => {
          const html = `
            <tr>
              <td>${i + 1}</td>
              <td>${row.username}</td>
              <td>${row.transfers}</td>
              <td>${row.calls}</td>
              <td>${row.conversion}</td>
              <td>${row.badge}</td>
            </tr>`;
          leaderboardBody.innerHTML += html;
        });
      }
    }).catch(err => {
      console.error(`❌ Failed to load leaderboard data for ${user.username}:`, err);
    });
  }
}


// === MANAGER FUNCTIONS ===
function getDateRangeData(username, startDate, endDate) {
  return new Promise((resolve) => {
    const current = new Date(startDate);
    const end = new Date(endDate);
    const results = [];

    const checkNext = () => {
      if (current > end) {
        resolve(results.flat());
        return;
      }

      const dateStr = current.toISOString().slice(0, 10);
      const refPath = ref(db, `transfers/${username}/${dateStr}`);

      get(refPath).then(snap => {
        const transfers = snap.exists() ? snap.val() : [];
        results.push(transfers);
        current.setDate(current.getDate() + 1);
        checkNext();
      }).catch(err => {
        console.error(`❌ Error fetching ${dateStr} for ${username}:`, err);
        current.setDate(current.getDate() + 1);
        checkNext();
      });
    };

    checkNext();
  });
}

async function renderManagerLeaderboardFiltered(startDate, endDate) {
  const data = await fetchManagerAgentData(startDate, endDate);

  const leaderboard = Object.entries(data).map(([username, stats]) => {
    const { totalTransfers, totalCalls } = stats;
    const conv = totalCalls > 0 ? ((totalTransfers / totalCalls) * 100).toFixed(1) + "%" : "0%";
    return { username, transfers: totalTransfers, calls: totalCalls, conv };
  });

  leaderboard.sort((a, b) => b.transfers - a.transfers);

  const tbody = document.getElementById("manager-leaderboard");
  tbody.innerHTML = "";

  leaderboard.forEach((a, i) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${i + 1}</td>
      <td>${a.username}</td>
      <td>${a.transfers}</td>
      <td>${a.calls}</td>
      <td>${a.conv}</td>
    `;
    tbody.appendChild(row);
  });
}

async function renderManagerSummary() {
  const { start, end } = getDateRange(managerFilterState);
  const data = await fetchManagerAgentData(start, end);

  let totalTransfers = 0;
  let totalCalls = 0;

  Object.values(data).forEach(({ totalTransfers: t, totalCalls: c }) => {
    totalTransfers += t;
    totalCalls += c;
  });

  const avgConv = totalCalls > 0 ? ((totalTransfers / totalCalls) * 100).toFixed(1) + "%" : "0%";

  document.getElementById("total-transfers").textContent = totalTransfers;
  document.getElementById("total-calls").textContent = totalCalls;
  document.getElementById("avg-conversion").textContent = avgConv;
}



function getTransferCountsByHour(callback) {
  const today = new Date().toISOString().slice(0, 10);
  const hourlyCounts = Array(24).fill(0);

  const usersRef = ref(db, "users");
  get(usersRef).then(snapshot => {
    if (!snapshot.exists()) return callback(hourlyCounts);

    const agents = snapshot.val().filter(user => user.role === "agent");
    let completed = 0;

    agents.forEach(agent => {
      const refPath = ref(db, `transfers/${agent.username}/${today}`);
      get(refPath).then(tSnap => {
        const transfers = tSnap.exists() ? tSnap.val() : [];

        transfers.forEach(t => {
          const hour = parseInt(t.timestamp.split("T")[1].split(":")[0]);
          if (!isNaN(hour) && hour >= 0 && hour <= 23) {
            hourlyCounts[hour]++;
          }
        });

        completed++;
        if (completed === agents.length) {
          callback(hourlyCounts);
        }
      }).catch(err => {
        console.error(`❌ Error loading transfers for ${agent.username}:`, err);
        completed++;
        if (completed === agents.length) {
          callback(hourlyCounts);
        }
      });
    });
  }).catch(err => {
    console.error("❌ Error loading agent list:", err);
    callback(hourlyCounts);
  });
}



// === ADMIN PANEL ===


document.getElementById("override-save-btn").addEventListener("click", function () {
  const agent = document.getElementById("override-agent-select").value;
  const newDials = parseInt(document.getElementById("override-dials").value);
  if (!agent || isNaN(newDials)) return alert("Invalid input");

  const today = new Date().toISOString().slice(0, 10);
  const callsRef = ref(db, `calls/${agent}/${today}`);
set(ref(db, `calls/${agent}/${today}`), newDials).then(() => {
  logAuditEntry("Override Dials", `Agent: ${agent}, Dials set to: ${newDials}`);
  document.getElementById("override-dials").value = "";
  renderManagerLeaderboard();
  renderManagerSummary();
  alert("✅ Call count updated.");
}).catch(err => {
  console.error("❌ Error overriding dials:", err);
  alert("❌ Failed to update calls. Try again.");
});

});

function populateOverrideDropdown() {
  const dropdown = document.getElementById("override-agent-select");
  dropdown.innerHTML = "";

  const users = cachedUsers;

  users.forEach(user => {
    if (user.role === "agent") {
      const option = document.createElement("option");
      option.value = user.username;
      option.textContent = user.username;
      dropdown.appendChild(option);
    }
  });
}

// === BACKDATE REQUEST + INBOX ===

document.getElementById("request-backdate-btn").addEventListener("click", () => {
  const username = localStorage.getItem("username");
  const selectedDate = document.getElementById("transfer-date").value;
  const reason = prompt("Why are you requesting to backdate this transfer?");

  if (!selectedDate || !reason || reason.trim() === "") {
  alert("⚠️ Please provide a valid reason for your backdate request.");
  return;
}


  const timestamp = Date.now();
  const request = {
    date: selectedDate,
    reason,
    timestamp
  };

  const requestRef = ref(db, `backdateRequests/${username}/${timestamp}`);
  set(requestRef, request).then(() => {
    logAuditEntry("Backdate Request Submitted", `Date: ${selectedDate}`);
    alert("Backdate request submitted for manager review.");
  }).catch(err => {
    console.error("❌ Backdate request error:", err);
    alert("Error submitting request.");
  });
});


function renderBackdateInbox() {
  const container = document.getElementById("backdate-requests");
  container.innerHTML = "";

  const requestsRef = ref(db, "backdateRequests");

  get(requestsRef).then(snapshot => {
    if (!snapshot.exists()) return;
    const allRequests = snapshot.val();

    for (const username in allRequests) {
      for (const id in allRequests[username]) {
        const req = allRequests[username][id];
        const li = document.createElement("li");
        li.innerHTML = `
          ${username} → ${req.date}<br/>
          Reason: ${req.reason}<br/>
          <button onclick="approveBackdateFirebase('${username}', '${id}', '${req.date}')">✅</button>
          <button onclick="denyBackdateFirebase('${username}', '${id}')">❌</button>
        `;
        container.appendChild(li);
      }
    }
  }).catch(err => {
    console.error("❌ Failed to load backdate requests:", err);
  });
}

async function approveBackdateFirebase(username, requestId, date) {
  try {
    // Save approval in Firebase
    const approvedRef = ref(db, `approvedBackdates/${username}/${date}`);
    await set(approvedRef, true);

    // Remove request
    await remove(ref(db, `backdateRequests/${username}/${requestId}`));

    // Log audit
    logAuditEntry("Approve Backdate", `User: ${username}, Date: ${date}`);

    // Refresh UI
    renderBackdateInbox();
    alert(`Backdate for ${username} on ${date} approved.`);
  } catch (error) {
    console.error("Error approving backdate:", error);
    alert("Failed to approve backdate.");
  }
}
window.approveBackdateFirebase = approveBackdateFirebase;

function denyBackdateFirebase(username, id) {
  const requestRef = ref(db, `backdateRequests/${username}/${id}`);
  set(requestRef, null); // delete from Firebase
  renderBackdateInbox();
  alert("Backdate denied.");
}
window.denyBackdateFirebase = denyBackdateFirebase;


function renderHourlyBreakdown() {
  const table = document.getElementById("hourly-transfer-table");
  table.innerHTML = "";

  getTransferCountsByHour(hourlyData => {
    for (let hour = 9; hour <= 17; hour++) {
      const count = hourlyData[hour];
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${hour}:00 – ${hour + 1}:00</td>
        <td>${count}</td>
      `;
      table.appendChild(row);
    }
  });
}


function populateAnalyticsDropdown() {
  const dropdown = document.getElementById("analytics-agent-select");
  dropdown.innerHTML = "";

  const users = cachedUsers;

  users.forEach(user => {
    if (user.role === "agent") {
      const option = document.createElement("option");
      option.value = user.username;
      option.textContent = user.username;
      dropdown.appendChild(option);
    }
  });

  // Auto-load initial view
  if (dropdown.value) {
    renderAgentHourlyBreakdown(dropdown.value);
  }
}


function populateUserManagementDropdown() {
  const dropdown = document.getElementById("manage-user-select");
  dropdown.innerHTML = "";

  const users = cachedUsers;

  users.forEach(user => {
    const option = document.createElement("option");
    option.value = user.username;
    option.textContent = `${user.username} (${user.role})`;
    dropdown.appendChild(option);
  });
}


function renderAgentHourlyBreakdown(agentName) {
  const today = new Date().toISOString().slice(0, 10);
  const hourlyCounts = Array(24).fill(0);

  const transferRef = ref(db, `transfers/${agentName}/${today}`);
  get(transferRef).then(snapshot => {
    const transfers = snapshot.exists() ? snapshot.val() : [];

    transfers.forEach(t => {
      const hour = parseInt(t.timestamp.split("T")[1].split(":")[0]);
      if (!isNaN(hour) && hour >= 0 && hour <= 23) {
        hourlyCounts[hour]++;
      }
    });

    const table = document.getElementById("agent-hourly-table");
    table.innerHTML = "";

    for (let hour = 9; hour <= 17; hour++) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${hour}:00 – ${hour + 1}:00</td>
        <td>${hourlyCounts[hour]}</td>
      `;
      table.appendChild(row);
    }
  }).catch(err => {
    console.error("❌ Error loading agent hourly data:", err);
  });
}


document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("analytics-agent-select");
  if (!select) return;

  select.addEventListener("change", function () {
    renderAgentHourlyBreakdown(this.value);
  });
});


function logAuditEntry(action, details) {
  const username = localStorage.getItem("username") || "unknown";
  const role = localStorage.getItem("role") || "unknown";
  const time = new Date().toLocaleString();
  const timestamp = Date.now();

  const entry = {
    timestamp,
    time,
    user: username,
    role,
    action,
    details
  };

  // 🔥 Save to Firebase
  const auditRef = ref(db, `auditLog/${timestamp}`);
  set(auditRef, entry);

  // ✅ Save to localStorage too
  const localLog = JSON.parse(localStorage.getItem("auditLog")) || [];
  localLog.push(entry);
  localStorage.setItem("auditLog", JSON.stringify(localLog));

  // ✅ Also render to DOM immediately
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${entry.time}</td>
    <td>${entry.user}</td>
    <td>${entry.role}</td>
    <td>${entry.action}</td>
    <td>${entry.details}</td>`;
  const table = document.getElementById("audit-log-table");
  if (table) table.prepend(row);
}

function syncAuditToLocalStorage() {
  const auditRef = ref(db, "auditLog");

  get(auditRef).then(snapshot => {
    if (!snapshot.exists()) return;
    const log = snapshot.val();
    const entries = Object.values(log);
    localStorage.setItem("auditLog", JSON.stringify(entries));
  }).catch(err => {
    console.error("❌ Error syncing audit log:", err);
  });
}


function renderAuditLog() {
  const table = document.getElementById("audit-log-table");
  if (!table) return;

  const auditRef = ref(db, "auditLog");

  get(auditRef).then(snapshot => {
    if (!snapshot.exists()) return;
    const log = snapshot.val();
    const entries = Object.values(log).sort((a, b) => b.timestamp - a.timestamp);

    table.innerHTML = ""; // Clear existing
    entries.forEach(entry => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${entry.time}</td>
        <td>${entry.user}</td>
        <td>${entry.role}</td>
        <td>${entry.action}</td>
        <td>${entry.details}</td>`;
      table.appendChild(row);
    });
  }).catch(err => {
    console.error("❌ Error loading audit log:", err);
  });
}


document.getElementById("create-user-btn").addEventListener("click", () => {
  const username = document.getElementById("new-user-name").value.trim();
  const password = document.getElementById("new-user-pass").value;
  const role = document.getElementById("new-user-role").value;

  if (!username || !password) return alert("Please enter all fields.");

  hashPassword(password).then(passwordHash => {
    getUsers(users => {
      users.push({ username, passwordHash, role });
      saveUsers(users);
      logAuditEntry("Create Account", `Username: ${username}, Role: ${role}`);
      alert("User created.");
    });
  });
}); // ✅ <<< ADD THIS LINE




document.getElementById("reset-pass-btn").addEventListener("click", function () {
  const user = document.getElementById("manage-user-select").value;
  const newPass = document.getElementById("reset-user-pass").value.trim();
  if (!user || !newPass) return alert("Please enter a new password.");

  hashPassword(newPass).then(hash => {
    getUsers(users => {
      const u = users.find(u => u.username === user);
      if (!u) return alert("User not found.");

      u.passwordHash = hash;
      saveUsers(users);
      logAuditEntry("Reset Password", `User: ${user}`);
      alert("Password reset.");
      document.getElementById("reset-user-pass").value = "";
    });
  });
});



document.getElementById("change-role-btn").addEventListener("click", function () {
  const user = document.getElementById("manage-user-select").value;
  const newRole = document.getElementById("change-role-select").value;

  getUsers(users => {
    const u = users.find(u => u.username === user);
    if (!u) return alert("User not found.");
    u.role = newRole;
    saveUsers(users);
    logAuditEntry("Change Role", `User: ${user}, New Role: ${newRole}`);
    alert("Role updated.");
    populateUserManagementDropdown();
  });
});

document.getElementById("delete-user-btn").addEventListener("click", function () {
  const user = document.getElementById("manage-user-select").value;
  if (!confirm(`Delete user "${user}"? This cannot be undone.`)) return;

  getUsers(users => {
    users = users.filter(u => u.username !== user);
    saveUsers(users);
    logAuditEntry("Delete User", `User: ${user}`);
    alert("User deleted.");
    populateUserManagementDropdown();
  });
});


function renderAgentDashboardView(filter) {
  const username = localStorage.getItem("username");
  const { start, end } = getDateRange(filter);

  const transferPromises = [];
  const callPromises = [];

  let date = new Date(start);
  const endDate = new Date(end);

  while (date <= endDate) {
    const dateStr = date.toISOString().split("T")[0];
    transferPromises.push(get(ref(db, `transfers/${username}/${dateStr}`)));
    callPromises.push(get(ref(db, `calls/${username}/${dateStr}`)));
    date.setDate(date.getDate() + 1);
  }

  Promise.all([...transferPromises, ...callPromises]).then(results => {
    const transfers = results.slice(0, transferPromises.length).flatMap(snap => snap.exists() ? snap.val() : []);
    const calls = results.slice(transferPromises.length).reduce((sum, snap) => {
      return sum + (snap.exists() ? snap.val() : 0);
    }, 0);

    const conversion = calls > 0 ? ((transfers.length / calls) * 100).toFixed(1) + "%" : "0%";
    const badge = transfers.length >= 5 ? "🏅" : "";

    document.getElementById("transfer-count").textContent = transfers.length;
    document.getElementById("dial-count").textContent = calls;
    document.getElementById("conversion-rate").textContent = conversion;

    const leaderboardBadge = document.querySelector("#leaderboard-body td:last-child");
    if (leaderboardBadge) leaderboardBadge.textContent = badge;
  }).catch(err => {
    console.error("❌ Agent view error:", err);
  });
}

function renderManagerDashboardView(filter) {
  console.log("🔄 Manager view changed:", filter);

  const { start, end } = getDateRange(filter);

  renderManagerSummaryFiltered(start, end);
  renderManagerLeaderboardFiltered(start, end);
}

function renderManagerSummaryFiltered(startDate, endDate) {
  const usersRef = ref(db, "users");

  get(usersRef).then(snapshot => {
    if (!snapshot.exists()) return;

    const agents = snapshot.val().filter(u => u.role === "agent");

    let totalTransfers = 0;
    let totalCalls = 0;
    let completed = 0;

    agents.forEach(agent => {
      const username = agent.username;
      let transferCount = 0;
      let callCount = 0;

      const days = getDateRangeDays(startDate, endDate);
      let dayPromises = days.map(date => {
        const tRef = ref(db, `transfers/${username}/${date}`);
        const cRef = ref(db, `calls/${username}/${date}`);

        return Promise.all([get(tRef), get(cRef)]).then(([tSnap, cSnap]) => {
          if (tSnap.exists()) transferCount += tSnap.val().length;
          if (cSnap.exists()) callCount += cSnap.val();
        });
      });

      Promise.all(dayPromises).then(() => {
        totalTransfers += transferCount;
        totalCalls += callCount;

        completed++;
        if (completed === agents.length) {
          const conv = totalCalls > 0 ? ((totalTransfers / totalCalls) * 100).toFixed(1) + "%" : "0%";
          document.getElementById("total-transfers").textContent = totalTransfers;
          document.getElementById("total-calls").textContent = totalCalls;
          document.getElementById("avg-conversion").textContent = conv;
        }
      });
    });
  });
}

function getDateRangeDays(start, end) {
  const result = [];
  const date = new Date(start);

  while (date <= new Date(end)) {
    result.push(date.toISOString().slice(0, 10));
    date.setDate(date.getDate() + 1);
  }

  return result;
}

async function fetchManagerAgentData(startDate, endDate) {
  const agents = cachedUsers.filter(u => u.role === "agent");
  const days = getDateRangeDays(startDate, endDate);

  const result = {};

  await Promise.all(
    agents.map(async agent => {
      let totalTransfers = 0;
      let totalCalls = 0;

      await Promise.all(
        days.map(async date => {
          const tRef = ref(db, `transfers/${agent.username}/${date}`);
          const cRef = ref(db, `calls/${agent.username}/${date}`);
          const [tSnap, cSnap] = await Promise.all([get(tRef), get(cRef)]);

          if (tSnap.exists()) totalTransfers += tSnap.val().length;
          if (cSnap.exists()) totalCalls += cSnap.val();
        })
      );

      result[agent.username] = {
        totalTransfers,
        totalCalls
      };
    })
  );

  return result;
}

document.addEventListener("DOMContentLoaded", () => {
  const auditBtn = document.getElementById("download-audit-btn");
  if (auditBtn) {
    auditBtn.addEventListener("click", function () {
      const logs = JSON.parse(localStorage.getItem("auditLog")) || [];
      let csv = "Timestamp,User,Role,Action,Details\n";

      logs.forEach(log => {
        csv += `"${log.timestamp}","${log.user}","${log.role}","${log.action}","${log.details}"\n`;
      });

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit_log.csv";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const toggle = document.getElementById("chatbot-toggle");
  const box = document.getElementById("chatbot-container");
  const input = document.getElementById("chatbot-input");
  const messages = document.getElementById("chatbot-messages");

  if (toggle && box && input && messages) {
    toggle.addEventListener("click", () => {
      box.style.display = "block";
      toggle.style.display = "none";
    });

    const close = document.getElementById("chatbot-close");
    if (close) {
      close.addEventListener("click", () => {
        box.style.display = "none";
        toggle.style.display = "block";
      });
    }

    const send = document.getElementById("chatbot-send");
    if (send) {
      send.addEventListener("click", () => {
        const userMessage = input.value.trim();
        if (!userMessage) return;

        const userBubble = document.createElement("div");
        userBubble.textContent = "🧑 " + userMessage;
        messages.appendChild(userBubble);
        input.value = "";

        const botBubble = document.createElement("div");
        botBubble.textContent = "🤖 Let me think...";
        messages.appendChild(botBubble);

        messages.scrollTop = messages.scrollHeight;
      });
    }
  }

  const agentTime = document.getElementById("agent-time-view");
  if (agentTime) {
    agentTime.addEventListener("change", function () {
      renderAgentDashboardView(this.value);
    });
  }

  const managerTime = document.getElementById("manager-time-view");
  if (managerTime) {
    managerTime.addEventListener("change", function () {
      renderManagerDashboardView(this.value);
    });
  }
});
