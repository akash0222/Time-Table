import assert from "node:assert/strict";
import { applyRecurringHolidayCalendar, recurringHolidayOccurrences } from "../services/recurringHolidayCalendar.js";

const source = {
  _id: "session-source",
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  holidayDetails: [
    { date: "2026-12-25", name: "Christmas", description: "Campus closed", holidayType: "Mandatory", occursEveryYear: true },
    { date: "2026-08-15", name: "Independence Day", description: "", holidayType: "Optional", occursEveryYear: true },
    { date: "2024-02-29", name: "Leap Day", description: "", holidayType: "Optional", occursEveryYear: true },
    { date: "2026-10-02", name: "One-off", description: "", holidayType: "Mandatory", occursEveryYear: false }
  ]
};
const target = {
  _id: "session-target",
  startDate: new Date("2027-04-01T00:00:00.000Z"),
  endDate: new Date("2028-03-31T00:00:00.000Z"),
  holidayDates: [],
  holidayDetails: [],
  holidayExceptions: []
};

const occurrences = recurringHolidayOccurrences(target, [source]);
assert.equal(occurrences.get("2027-12-25")?.name, "Christmas");
assert.equal(occurrences.get("2027-12-25")?.sourceSessionId, "session-source");
assert.equal(occurrences.get("2027-12-25")?.sourceDate, "2026-12-25");
assert.equal(occurrences.get("2028-02-29")?.name, "Leap Day");
assert.equal(occurrences.has("2027-08-15"), false, "Sunday remains an automatic holiday");
assert.equal(occurrences.has("2027-10-02"), false, "one-off holidays must not repeat");

const expanded = applyRecurringHolidayCalendar(target, [source]);
assert.ok(expanded.holidayDates.includes("2027-12-25"));
assert.equal(expanded.holidayDetails.find(item => item.date === "2027-12-25")?.recurringProjection, true);

const excluded = applyRecurringHolidayCalendar({
  ...target,
  holidayExceptions: ["2027-12-25"]
}, [source]);
assert.equal(excluded.holidayDates.includes("2027-12-25"), false, "a session-local exception removes that occurrence");
assert.equal(excluded.holidayExceptions.includes("2027-12-25"), true);

const localOverride = applyRecurringHolidayCalendar({
  ...target,
  holidayDates: ["2027-12-25"],
  holidayDetails: [{ date: "2027-12-25", name: "Local override", description: "Session-specific", holidayType: "Mandatory", occursEveryYear: false }]
}, [source]);
assert.equal(localOverride.holidayDetails.find(item => item.date === "2027-12-25")?.name, "Local override");

console.log("Recurring holiday calendar tests passed.");
