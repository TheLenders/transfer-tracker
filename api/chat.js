import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { db } from "./app.js";

// 🧠 Chat + Bug Support Widget
document.addEventListener("DOMContentLoaded", () => {
  const supportToggle = document.getElementById("support-toggle");
  const supportPanel = document.getElementById("support-panel");
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  // Toggle panel
  supportToggle.addEventListener("click", () => {
    supportPanel.style.display = supportPanel.style.display === "none" ? "block" : "none";
  });

  // Tab switching
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
      console.error("❌ Error submitting bug:", err);
      alert("❌ Failed to submit bug.");
    });
  });

  // 🧠 Chat Assistant
  const chatInput = document.getElementById("chat-input");
  const chatMessages = document.getElementById("chat-messages");
  const sendBtn = document.getElementById("chat-send-btn"); // Optional button
  let chatHistory = [];

  if (!chatInput || !chatMessages) return;

  chatInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && chatInput.value.trim()) {
      await handleChat(chatInput.value.trim());
      chatInput.value = "";
    }
  });

  if (sendBtn) {
    sendBtn.addEventListener("click", async () => {
      if (chatInput.value.trim()) {
        await handleChat(chatInput.value.trim());
        chatInput.value = "";
      }
    });
  }

  async function handleChat(msg) {
    appendChat("🧑", msg);
    appendChat("🤖", "Thinking...");

    chatHistory.push({ role: "user", content: msg });

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer ",
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: chatHistory,
          temperature: 0.7
        })
      });

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "⚠️ No response.";

      chatHistory.push({ role: "assistant", content: reply });
      appendChat("🤖", reply);
    } catch (err) {
      console.error("❌ Chat error:", err);
      appendChat("🤖", "⚠️ Error reaching assistant.");
    }
  }

  function appendChat(sender, msg) {
    const div = document.createElement("div");
    div.innerHTML = `<strong>${sender}</strong>: ${msg}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
});
