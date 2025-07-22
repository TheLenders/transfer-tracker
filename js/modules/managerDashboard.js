import { appState } from "./state.js";
import { getDateRangeDays } from "../utils/date.js";
import { getDateRange, getToday } from "./utils.js";
import { db, dbGet, dbSet, dbRemove, dbRef } from "../utils/firebase.js";

// Fetch full data summary for a date range
export async function fetchManagerAgentData(startDate, endDate) {
  const agents = appState.cachedUsers.filter(u => u.role === "agent");
  const days = getDateRangeDays(startDate, endDate);
  const result = {};

  await Promise.all(
    agents.map(async agent => {
      let totalTransfers = 0;
      let totalCalls = 0;

      await Promise.all(
        days.map(async date => {
          const [transfers, calls] = await Promise.all([
            dbGet(`transfers/${agent.username}/${date}`),
            dbGet(`calls/${agent.username}/${date}`)
          ]);
          if (transfers) totalTransfers += transfers.length;
          if (calls) totalCalls += calls;
        })
      );

      result[agent.username] = { totalTransfers, totalCalls };
    })
  );

  return result;
}

export async function renderManagerLeaderboardFiltered(startDate, endDate) {
  const data = await fetchManagerAgentData(startDate, endDate);
  const leaderboard = Object.entries(data).map(([username, stats]) => {
    const { totalTransfers, totalCalls } = stats;
    const conv = totalCalls > 0 ? ((totalTransfers / totalCalls) * 100).toFixed(1) + "%" : "0%";
    return { username, transfers: totalTransfers, calls: totalCalls, conv };
  }).sort((a, b) => b.transfers - a.transfers);

  const tbody = document.getElementById("manager-leaderboard");
  if (!tbody) return;

  tbody.innerHTML = "";
  const badgeThreshold = parseInt(appState.appSettings.badgeThreshold) || 5;
  leaderboard.slice(0, 5).forEach((a, i) => {
    let rankIcon = i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : "";
    const badge = a.transfers >= badgeThreshold ? "🏅" : "";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${i + 1}</td>
      <td>${rankIcon}${a.username}</td>
      <td>${a.transfers}</td>
      <td>${a.calls}</td>
      <td>${a.conv} ${badge}</td>`;
    tbody.appendChild(row);
  });
}

export async function renderManagerSummary(startDate, endDate) {
  const data = await fetchManagerAgentData(startDate, endDate);
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