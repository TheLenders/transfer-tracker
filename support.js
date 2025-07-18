import { getDatabase, ref, push } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { db } from "./app.js"; // assumes app.js exports the initialized `db`

document.addEventListener("DOMContentLoaded", () => {
  const bugBtn = document.getElementById("submit-bug");

  if (bugBtn) {
    bugBtn.addEventListener("click", () => {
      const description = document.getElementById("bug-description").value.trim();
      const username = localStorage.getItem("username") || "Anonymous";

      if (!description) {
        alert("⚠️ Please enter a bug description.");
        return;
      }

      const bugRef = ref(db, "bugReports");
      const report = {
        username,
        description,
        timestamp: new Date().toISOString()
      };

      push(bugRef, report)
        .then(() => {
          alert("✅ Bug report submitted!");
          document.getElementById("bug-description").value = "";
        })
        .catch((err) => {
          console.error("❌ Firebase error:", err);
          alert("❌ Failed to submit bug.");
        });
    });
  }
});