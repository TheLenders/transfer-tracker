import { ref, get, set } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { appState } from "./state.js";
import { logAuditEntry } from "./auditLog.js";

// === UTILS ===
function getToday() {
  return new Date().toISOString().split("T")[0];
}

function getDateRange(filterType) {
  const today = new Date();
  let start, end;

  if (filterType === "daily") {
    start = end = today.toISOString().split("T")[0];
  } else if (filterType === "weekly") {
    const day = today.getDay();
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

// === CORE DASHBOARD LOGIC ===
export function renderTransfers() {
  const username = localStorage.getItem("username");
  const selectedDate = document.getElementById("transfer-date").value || getToday();
  const transferList = document.getElementById("transfer-list");
  transferList.innerHTML = "";

  const transferRef = ref(appState.db, `transfers/${username}/${selectedDate}`);
  get(transferRef).then(snapshot => {
    const transfers = snapshot.exists() ? snapshot.val() : [];

    if (transfers.length === 0) {
      const li = document.createElement("li");
      li.style.color = "#888";
      li.style.textAlign = "center";
      li.textContent = "No transfers submitted yet.";
      transferList.appendChild(li);
    } else {
      transfers.forEach(t => {
        const li = document.createElement("li");
        li.textContent = `${t.client} – ${t.phone} → ${t.banker} (${t.loanPurpose})`;
        transferList.appendChild(li);
      });
    }

    document.getElementById("transfer-count").textContent = transfers.length;
    updateStats(transfers.length);
  }).catch(err => {
    console.error("❌ Error loading transfers:", err);
  });
}

export function updateStats(transferCount) {
  const username = localStorage.getItem("username");
  const today = getToday();
  const callsRef = ref(appState.db, `calls/${username}/${today}`);

  get(callsRef).then(snapshot => {
    const dialCount = snapshot.exists() ? snapshot.val() : 0;
    const conversion = dialCount > 0 ? ((transferCount / dialCount) * 100).toFixed(1) + "%" : "0%";

    document.getElementById("dial-count").textContent = dialCount;
    document.getElementById("conversion-rate").textContent = conversion;

    const transferGoal = appState.appSettings.transferGoal || 5;
    const dialGoal = appState.appSettings.dialGoal || 75;

    const tProgress = document.getElementById("transfer-progress");
    const dProgress = document.getElementById("dial-progress");

    if (tProgress) {
      tProgress.max = transferGoal;
      tProgress.value = transferCount;
    }
    if (dProgress) {
      dProgress.max = dialGoal;
      dProgress.value = dialCount;
    }
  });
}

export function renderLeaderboard() {
  const today = getToday();
  const leaderboardBody = document.getElementById("leaderboard-body");
  if (!leaderboardBody) return;
  leaderboardBody.innerHTML = "";

  const users = appState.cachedUsers;
  const rows = [];
  const agentUsers = users.filter(user => user.role === "agent");
  let completed = 0;

  for (const user of agentUsers) {
    const transferRef = ref(appState.db, `transfers/${user.username}/${today}`);
    const callsRef = ref(appState.db, `calls/${user.username}/${today}`);

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

        const top5 = rows.slice(0, 5);
        leaderboardBody.innerHTML = top5.length === 0
          ? `<tr><td colspan="6" style="text-align: center; color: #888;">No transfers logged today.</td></tr>`
          : top5.map((row, i) => {
            let rankIcon = i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : "";
            return `
              <tr>
                <td>${i + 1}</td>
                <td>${rankIcon}${row.username}</td>
                <td>${row.transfers}</td>
                <td>${row.calls}</td>
                <td>${row.conversion}</td>
                <td>${row.badge}</td>
              </tr>`;
          }).join("");
      }
    }).catch(err => {
      console.error(`❌ Failed to load leaderboard data for ${user.username}:`, err);
    });
  }
}

export function renderAgentDashboardView(filter) {
  const username = localStorage.getItem("username");
  const { start, end } = getDateRange(filter);

  const transferPromises = [];
  const callPromises = [];

  let date = new Date(start);
  const endDate = new Date(end);

  while (date <= endDate) {
    const dateStr = date.toISOString().split("T")[0];
    transferPromises.push(get(ref(appState.db, `transfers/${username}/${dateStr}`)));
    callPromises.push(get(ref(appState.db, `calls/${username}/${dateStr}`)));
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

// === EVENT HANDLERS ===
export function initAgentEvents() {
  const phone = document.getElementById("client-phone");
  if (phone) {
    phone.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        const raw = this.value.replace(/\D/g, "");
        if (raw.length === 10) {
          const formatted = `(${raw.slice(0,3)}) ${raw.slice(3,6)}-${raw.slice(6)}`;
          this.value = formatted;
        }
      }
    });
  }

  const callsBtn = document.getElementById("submit-calls");
  if (callsBtn) {
    callsBtn.addEventListener("click", function () {
      const calls = parseInt(document.getElementById("call-input").value);
      if (!isNaN(calls) && calls >= 0) {
        const today = getToday();
        const username = localStorage.getItem("username");

        const callsRef = ref(appState.db, `calls/${username}/${today}`);
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
  }

  const transferBtn = document.getElementById("submit-transfer");
  if (transferBtn) {
    transferBtn.addEventListener("click", async function () {
      const selectedDate = document.getElementById("transfer-date").value || new Date().toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const username = localStorage.getItem("username");

      if (selectedDate !== today) {
        const approvedRef = ref(appState.db, `approvedBackdates/${username}/${selectedDate}`);
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

      const transferRef = ref(appState.db, `transfers/${username}/${selectedDate}`);
      const snapshot = await get(transferRef);
      const current = snapshot.exists() ? snapshot.val() : [];
      current.push(transfer);

      set(transferRef, current).then(() => {
        logAuditEntry("Submit Transfer", `Client: ${transfer.client}, Banker: ${transfer.banker}`);
        client.value = "";
        phone.value = "";
        banker.value = "";
        loanPurpose.value = "";
        notes.value = "";
        renderTransfers();
        updateStats();
        renderLeaderboard();
      }).catch(error => {
        console.error("❌ Error saving transfer to Firebase:", error);
        alert("❌ Transfer failed to save. Try again.");
      });
    });
  }
}