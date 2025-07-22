export function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export function getDateRange(type) {
  const today = new Date();
  let start = new Date(today);
  let end = new Date(today);

  if (type === "weekly") {
    start.setDate(today.getDate() - 6);
  } else if (type === "monthly") {
    start.setDate(today.getDate() - 29);
  }

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
