// generate-whats-new.js
import { execSync } from "child_process";
import { writeFileSync } from "fs";

// Get last 5 commit messages
const raw = execSync("git log -n 5 --pretty=format:'%s'")
  .toString()
  .split("\n");

// Format with emojis (optional: customize this logic)
const formatted = raw.map(line => {
  if (line.toLowerCase().includes("fix")) return `🐛 ${line}`;
  if (line.toLowerCase().includes("add")) return `✨ ${line}`;
  if (line.toLowerCase().includes("update")) return `🔧 ${line}`;
  return `📌 ${line}`;
});

// Save to whats-new.json
writeFileSync("whats-new.json", JSON.stringify(formatted, null, 2));
console.log("✅ whats-new.json updated from Git history.");