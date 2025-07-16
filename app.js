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

function showDashboard(role) {
  const username = localStorage.getItem("username");

  document.getElementById("login-container").style.display = "none";

  if (role === "agent") {
    document.getElementById("agent-dashboard").style.display = "block";
    document.getElementById("agent-name").textContent = username;
    document.getElementById("dial-count").textContent = localStorage.getItem("dialCount") || "0";
    document.getElementById("transfer-date").value = new Date().toISOString().slice(0, 10);

    renderTransfers();
    updateStats();
    renderLeaderboard();
  }

  if (role === "manager") {
    document.getElementById("manager-dashboard").style.display = "block";

    // Redundant double-check
    getUsers(users => {
      const user = users.find(u => u.username === username);
      if (!user || user.role !== "manager") {
        alert("Unauthorized access attempt. Logging out.");
        localStorage.clear();
        location.reload();
        return;
      }

      renderManagerLeaderboard();
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
    });
  }
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
    alert("Settings saved!");
  }).catch(err => {
    console.error("❌ Error saving settings:", err);
  });
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
function saveUsersToFirebase(users) {
  set(ref(db, "users"), users);
}


function getUsers(callback) {
  getUsersFromFirebase(callback);
}

function saveUsers(users) {
  saveUsersToFirebase(users);
}

function saveTransferToFirebase(username, date, transfer) {
  const transferRef = ref(db, `transfers/${username}/${date}`);

  get(transferRef).then(snapshot => {
    const current = snapshot.exists() ? snapshot.val() : [];
    current.push(transfer);
    set(transferRef, current);
  }).then(() => {
    logAuditEntry("Submit Transfer", `Client: ${transfer.client}, Banker: ${transfer.banker}`);
    renderTransfers();
    updateStats();
    renderLeaderboard();
  }).catch(error => {
    console.error("❌ Error saving transfer to Firebase:", error);
  });
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
  document.getElementById("scorecard-select").addEventListener("change", function () {
  renderAgentScorecard(this.value);
});
  const dropdown = document.getElementById("scorecard-select");
  dropdown.innerHTML = "";

  const usersRef = ref(db, "users");
  get(usersRef).then(snapshot => {
    if (!snapshot.exists()) return;
    const users = snapshot.val();

    users.forEach(user => {
      if (user.role === "agent") {
        const option = document.createElement("option");
        option.value = user.username;
        option.textContent = user.username;
        dropdown.appendChild(option);
      }
    });

    if (users.length > 0) {
      renderAgentScorecard(users[0].username); // default to first
    }
  });
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
  if (toggle) {
    toggle.addEventListener("click", () => {
      document.getElementById("chatbot-container").style.display = "block";
      toggle.style.display = "none";
    });

    document.getElementById("chatbot-close").addEventListener("click", () => {
      document.getElementById("chatbot-container").style.display = "none";
      toggle.style.display = "block";
    });

    document.getElementById("chatbot-send").addEventListener("click", () => {
      const input = document.getElementById("chatbot-input");
      const messages = document.getElementById("chatbot-messages");

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
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  getUsers(users => {
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return alert("Invalid login.");

  localStorage.setItem("username", user.username);
  localStorage.setItem("role", user.role);
  localStorage.setItem("isLoggedIn", true);
  logAuditEntry("Login", `Role: ${user.role}`);
  showDashboard(user.role);
});
});


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
document.getElementById("submit-transfer").addEventListener("click", function () {
  const selectedDate = document.getElementById("transfer-date").value || new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const username = localStorage.getItem("username");

  if (selectedDate !== today) {
    const approved = JSON.parse(localStorage.getItem("approvedBackdates")) || [];
    const allowed = approved.find(r => r.username === username && r.date === selectedDate);
    if (!allowed) {
      alert("Backdated transfer not approved by manager.");
      return;
    }
  }

  const client = document.getElementById("client-name").value;
  const phone = document.getElementById("client-phone").value;
  const banker = document.getElementById("banker").value;
  const loanPurpose = document.getElementById("loan-purpose").value;
  const notes = document.getElementById("notes").value;

  if (!client || !phone || !banker || !loanPurpose) {
    alert("Please fill in all required fields.");
    return;
  }

  const transfer = {
    agent: username,
    client,
    phone,
    banker,
    loanPurpose,
    notes,
    timestamp: new Date().toISOString(),
  };

  saveTransferToFirebase(username, selectedDate, transfer);
  logAuditEntry("Submit Transfer", `Client: ${client}, Banker: ${banker}`);


  document.getElementById("client-name").value = "";
  document.getElementById("client-phone").value = "";
  document.getElementById("banker").value = "";
  document.getElementById("loan-purpose").value = "";
  document.getElementById("notes").value = "";

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

    // 🔥 Save to Firebase
    const callsRef = ref(db, `calls/${username}/${today}`);
    set(callsRef, calls).then(() => {
      logAuditEntry("Update Call Count", `Count: ${calls}`);
      document.getElementById("dial-count").textContent = calls;
      updateStats();
      renderLeaderboard();
    }).catch(error => {
      console.error("❌ Error saving calls to Firebase:", error);
      alert("Error saving call count. Try again.");
    });
  } else {
    alert("Please enter a valid number of calls.");
  }
});

function getToday() {
  return new Date().toISOString().split("T")[0];
}

// === RENDER TRANSFERS ===
function renderTransfers() {
  const username = localStorage.getItem("username");
  const today = getToday();
  const transferList = document.getElementById("transfer-list");
  transferList.innerHTML = "";

  const transferRef = ref(db, `transfers/${username}/${today}`);
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
  const managerTable = document.getElementById("manager-leaderboard");
  if (leaderboardBody) leaderboardBody.innerHTML = "";
  if (managerTable) managerTable.innerHTML = "";

  const usersRef = ref(db, "users");

  get(usersRef).then(snapshot => {
    if (!snapshot.exists()) return;

    const users = snapshot.val();
    const rows = [];

    // Loop through each user
    for (const user of users) {
      if (user.role !== "agent") continue;

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

        // Wait for all rows before rendering
        if (rows.length === users.filter(u => u.role === "agent").length) {
          rows.sort((a, b) => b.transfers - a.transfers);
          rows.forEach((row, i) => {
            const html = `
              <tr>
                <td>${i + 1}</td>
                <td>${row.username}</td>
                <td>${row.transfers}</td>
                <td>${row.calls}</td>
                <td>${row.conversion}</td>
                ${leaderboardBody ? `<td>${row.badge}</td>` : ""}
              </tr>`;
            if (leaderboardBody) leaderboardBody.innerHTML += html;
            if (managerTable) managerTable.innerHTML += html;
          });
        }
      });
    }
  }).catch(err => {
    console.error("❌ Leaderboard error:", err);
  });
}

// === MANAGER FUNCTIONS ===

function renderManagerLeaderboard() {
  const today = new Date().toISOString().slice(0, 10);
  const usersRef = ref(db, "users");

  get(usersRef).then(snapshot => {
    if (!snapshot.exists()) return;

    const users = snapshot.val().filter(u => u.role === "agent");
    const rows = [];
    let completed = 0;

    users.forEach(user => {
      const username = user.username;
      const transferRef = ref(db, `transfers/${username}/${today}`);
      const callsRef = ref(db, `calls/${username}/${today}`);

      Promise.all([get(transferRef), get(callsRef)]).then(([tSnap, cSnap]) => {
        const transfers = tSnap.exists() ? tSnap.val() : [];
        const calls = cSnap.exists() ? cSnap.val() : 0;
        const conv = calls > 0 ? ((transfers.length / calls) * 100).toFixed(1) + "%" : "0%";

        rows.push({
          name: username,
          transfers: transfers.length,
          dials: calls,
          conv
        });

        completed++;
        if (completed === users.length) {
          // All data fetched, render
          rows.sort((a, b) => b.transfers - a.transfers);

          const tbody = document.getElementById("manager-leaderboard");
          tbody.innerHTML = "";
          rows.forEach((agent, i) => {
            const row = document.createElement("tr");
            row.innerHTML = `
              <td>${i + 1}</td>
              <td>${agent.name}</td>
              <td>${agent.transfers}</td>
              <td>${agent.dials}</td>
              <td>${agent.conv}</td>
            `;
            tbody.appendChild(row);
          });
        }
      }).catch(err => {
        console.error(`Error fetching data for ${username}:`, err);
        completed++;
      });
    });
  }).catch(err => {
    console.error("❌ Failed to load users:", err);
  });
}


function renderManagerSummary() {
  const today = new Date().toISOString().slice(0, 10);
  const usersRef = ref(db, "users");

  get(usersRef).then(snapshot => {
    if (!snapshot.exists()) return;
    const users = snapshot.val().filter(u => u.role === "agent");

    let totalTransfers = 0;
    let totalCalls = 0;
    let completed = 0;

    users.forEach(user => {
      const username = user.username;
      const transferRef = ref(db, `transfers/${username}/${today}`);
      const callsRef = ref(db, `calls/${username}/${today}`);

      Promise.all([get(transferRef), get(callsRef)]).then(([tSnap, cSnap]) => {
        const transfers = tSnap.exists() ? tSnap.val().length : 0;
        const calls = cSnap.exists() ? cSnap.val() : 0;

        totalTransfers += transfers;
        totalCalls += calls;

        completed++;
        if (completed === users.length) {
          const avgConv = totalCalls > 0 ? ((totalTransfers / totalCalls) * 100).toFixed(1) + "%" : "0%";
          document.getElementById("total-transfers").textContent = totalTransfers;
          document.getElementById("total-calls").textContent = totalCalls;
          document.getElementById("avg-conversion").textContent = avgConv;
        }
      }).catch(err => {
        console.error("❌ Error fetching summary data:", err);
      });
    });
  });
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
  let dialData = JSON.parse(localStorage.getItem("allDialCounts")) || {};
  dialData[agent + "_" + today] = newDials;
  localStorage.setItem("allDialCounts", JSON.stringify(dialData));
  logAuditEntry("Override Dials", `Agent: ${agent}, Dials set to: ${newDials}`);


  document.getElementById("override-dials").value = "";
  renderManagerLeaderboard();
  renderManagerSummary();
  alert("Call count updated.");
  
});

function populateOverrideDropdown() {
  const dropdown = document.getElementById("override-agent-select");
  dropdown.innerHTML = "";

  const usersRef = ref(db, "users");

  get(usersRef).then(snapshot => {
    if (!snapshot.exists()) return;
    const users = snapshot.val();

    users.forEach(user => {
      if (user.role === "agent") {
        const option = document.createElement("option");
        option.value = user.username;
        option.textContent = user.username;
        dropdown.appendChild(option);
      }
    });
  });
}

// === BACKDATE REQUEST + INBOX ===

document.getElementById("request-backdate-btn").addEventListener("click", () => {
  const username = localStorage.getItem("username");
  const selectedDate = document.getElementById("transfer-date").value;
  const reason = prompt("Why are you requesting to backdate this transfer?");

  if (!selectedDate || !reason) return alert("Please provide a date and reason.");

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

function approveBackdateFirebase(username, id, date) {
  const approved = JSON.parse(localStorage.getItem("approvedBackdates")) || [];
  approved.push({ username, date });
  localStorage.setItem("approvedBackdates", JSON.stringify(approved));

  const requestRef = ref(db, `backdateRequests/${username}/${id}`);
  set(requestRef, null); // delete from Firebase

  logAuditEntry("Approve Backdate", `Agent: ${username}, Date: ${date}`);
  renderBackdateInbox();
  alert("Backdate approved.");
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

  const usersRef = ref(db, "users");
  get(usersRef).then(snapshot => {
    if (!snapshot.exists()) return;
    const users = snapshot.val();

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
  });
}

function populateUserManagementDropdown() {
  const dropdown = document.getElementById("manage-user-select");
  dropdown.innerHTML = "";

  const usersRef = ref(db, "users");

  get(usersRef).then(snapshot => {
    if (!snapshot.exists()) return;
    const users = snapshot.val();

    users.forEach(user => {
      const option = document.createElement("option");
      option.value = user.username;
      option.textContent = user.username + " (" + user.role + ")";
      dropdown.appendChild(option);
    });
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
    const entries = Object.values(log).sort((a, b) => new Date(b.time) - new Date(a.time));

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


document.getElementById("download-audit-btn").addEventListener("click", function () {
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


document.getElementById("create-user-btn").addEventListener("click", () => {
  const username = document.getElementById("new-user-name").value.trim();
  const password = document.getElementById("new-user-pass").value;
  const role = document.getElementById("new-user-role").value;

  if (!username || !password) return alert("Please enter all fields.");

  getUsers(users => {
    users.push({ username, password, role });
    saveUsers(users);
    logAuditEntry("Create Account", `Username: ${username}, Role: ${role}`);
    alert("User created.");
  });
}); // ✅ This closes the outer .addEventListener()
// ✅ <- this closing line was missing before


document.getElementById("reset-pass-btn").addEventListener("click", function () {
  const user = document.getElementById("manage-user-select").value;
  const newPass = document.getElementById("reset-user-pass").value.trim();
  if (!user || !newPass) return alert("Please enter a new password.");

  getUsers(users => {
    const u = users.find(u => u.username === user);
    if (!u) return alert("User not found.");
    u.password = newPass;
    saveUsers(users);
    logAuditEntry("Reset Password", `User: ${user}`);
    alert("Password reset.");
    document.getElementById("reset-user-pass").value = "";
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

// AI Chat Widget Toggle
document.getElementById("chatbot-toggle").addEventListener("click", () => {
  document.getElementById("chatbot-container").style.display = "block";
  document.getElementById("chatbot-toggle").style.display = "none";
});

document.getElementById("chatbot-close").addEventListener("click", () => {
  document.getElementById("chatbot-container").style.display = "none";
  document.getElementById("chatbot-toggle").style.display = "block";
});

// Placeholder for sending messages
document.getElementById("chatbot-send").addEventListener("click", () => {
  const input = document.getElementById("chatbot-input");
  const messages = document.getElementById("chatbot-messages");

  const userMessage = input.value.trim();
  if (!userMessage) return;

  const userBubble = document.createElement("div");
  userBubble.textContent = "🧑 " + userMessage;
  messages.appendChild(userBubble);
  input.value = "";

  // Temporary fake response for now
  const botBubble = document.createElement("div");
  botBubble.textContent = "🤖 Let me think...";
  messages.appendChild(botBubble);

  messages.scrollTop = messages.scrollHeight;
});

