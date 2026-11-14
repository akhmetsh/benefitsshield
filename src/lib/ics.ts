/**
 * Builds an iCalendar (.ics) file with two all-day events for the FSA
 * use-it-or-lose-it deadline: a 90-day heads-up and the deadline itself.
 * Pure: the timestamp is passed in.
 */

function compact(iso: string): string {
  return iso.replaceAll("-", "");
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildFsaCalendar(
  fsaDeadline: string,
  fsaAtRiskLabel: string,
  stamp: string,
): string {
  const event = (uid: string, date: string, summary: string, description: string) => [
    "BEGIN:VEVENT",
    `UID:${uid}@benefitsshield`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact(date)}`,
    `DTEND;VALUE=DATE:${compact(addDaysIso(date, 1))}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(summary)}`,
    "TRIGGER:-PT15H",
    "END:VALARM",
    "END:VEVENT",
  ];

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BenefitsShield//FSA Reminder//EN",
    "CALSCALE:GREGORIAN",
    ...event(
      `fsa-warning-${fsaDeadline}`,
      addDaysIso(fsaDeadline, -90),
      "FSA: 90 days left to spend your balance",
      `Your health FSA use-it-or-lose-it deadline is ${fsaDeadline}. ${fsaAtRiskLabel}`,
    ),
    ...event(
      `fsa-deadline-${fsaDeadline}`,
      fsaDeadline,
      "FSA deadline: last day to use your balance",
      "Unspent health FSA dollars above the carryover are forfeited after today. Educational reminder only.",
    ),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
