import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { db } from "./app.js"; // make sure this works depending on structure

const supportToggle = document.getElementById("support-toggle");
const supportPanel = document.getElementById("support-panel");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

// 🧠 Toggle panel
supportToggle.addEventListener("click", () => {
  supportPanel.style.display = supportPanel.style.display === "none" ? "block" : "none";
});

// 📁 Tab switching
tabButtons.forEach(button => {
  button.addEventListener("click", () => {
    tabButtons.forEach(btn => btn.classList.remove("active"));
    button.classList.add("active");

    tabContents.forEach(tab => {
      tab.style.display = tab.id === "tab-" + button.dataset.tab ? "block" : "none";
    });
  });
});

// 🐞 Bug submission
document.getElementById("submit-bug").addEventListener("click", () => {
  const issue = document.getElementById("bug-description").value.trim();
  if (!issue) return alert("Please describe the issue.");

  const username = localStorage.getItem("username") || "anonymous";
  const timestamp = Date.now();

  const bug = {
    user: username,
    issue,
    timestamp,
    page: location.href,
    status: "open"
  };

  const bugRef = ref(db, `bugReports/${timestamp}`);
  set(bugRef, bug).then(() => {
    alert("🐞 Bug submitted. Thank you!");
    document.getElementById("bug-description").value = "";
  }).catch(err => {
    console.error("Error submitting bug:", err);
    alert("❌ Failed to submit bug.");
  });
});

// 💬 Chat simulation (local only for now)
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");

chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && chatInput.value.trim()) {
    const msg = chatInput.value.trim();
    chatInput.value = "";

    appendChat("🧑", msg);
    setTimeout(() => appendChat("🤖", "Thanks! We'll get back to you soon."), 600);
  }
});

function appendChat(sender, msg) {
  const div = document.createElement("div");
  div.textContent = `${sender} ${msg}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
