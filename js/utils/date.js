export function getDateRangeDays(start, end) {
  const result = [];
  const date = new Date(start);
  while (date <= new Date(end)) {
    result.push(date.toISOString().slice(0, 10));
    date.setDate(date.getDate() + 1);
  }
  return result;
}