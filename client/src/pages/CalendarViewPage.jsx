import React, {useMemo, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {refId} from "../core/utils.js";
import {Clock3, Check} from "lucide-react";

export default function CalendarView({ timetable, data, role, onMoved, setMessage }) {
  const [view, setView] = useState("week");
  const [day, setDay] = useState("Monday");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState("");
  const [dragged, setDragged] = useState(null);
  const [moving, setMoving] = useState(false);
  const [details, setDetails] = useState(null);

  /*
   * Calendar View intentionally uses Monday-Friday.
   * Saturday/Sunday can exist in the master timetable, but this
   * weekly academic view should not show them.
   */
  const calendarDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  /*
   * Normalize and deduplicate time slots.
   *
   * The old implementation rendered every TimeSlot document.
   * If the database contained multiple records with the same
   * start/end time, the UI rendered duplicate rows such as:
   *
   * 09:00-10:00
   * 09:00-10:00
   * 09:00-10:00
   *
   * We keep one unique interval.
   */
  const slots = useMemo(() => {
    const source = Array.isArray(data?.timeslots)
      ? data.timeslots
      : [];

    const unique = new Map();

    source
      .filter(slot => !slot?.isBreak)
      .filter(slot => slot?.startTime && slot?.endTime)
      .forEach(slot => {
        const start = String(slot.startTime).trim();
        const end = String(slot.endTime).trim();

        const key = `${start}|${end}`;

        if (!unique.has(key)) {
          unique.set(key, {
            ...slot,
            startTime: start,
            endTime: end
          });
        }
      });

    const rows = Array.from(unique.values());

    /*
     * Sort primarily by order when available.
     * Fall back to start time for old/incomplete records.
     */
    return rows.sort((a, b) => {
      const orderA = Number.isFinite(Number(a.order))
        ? Number(a.order)
        : Number.MAX_SAFE_INTEGER;

      const orderB = Number.isFinite(Number(b.order))
        ? Number(b.order)
        : Number.MAX_SAFE_INTEGER;

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });
  }, [data?.timeslots]);

  const canEdit =
    ["ADMIN", "SCHEDULER"].includes(role) &&
    String(timetable?.status || "DRAFT") === "DRAFT";

  const filterOptions =
    filter === "section"
      ? data?.sections || []
      : filter === "faculty"
        ? data?.faculty || []
        : filter === "room"
          ? data?.rooms || []
          : [];

  const visibleDays =
    view === "day"
      ? [day]
      : calendarDays;

  /*
   * Filter timetable entries.
   */
  const entries = useMemo(() => {
    const source = Array.isArray(timetable?.entries)
      ? timetable.entries
      : [];

    return source.filter(entry => {
      if (!calendarDays.includes(entry?.day)) {
        return false;
      }

      if (filter === "all") {
        return true;
      }

      if (!selected) {
        return true;
      }

      return refId(entry?.[filter]) === String(selected);
    });
  }, [timetable?.entries, filter, selected]);

  /*
   * Convert HH:mm / H:mm to minutes.
   */
  function timeToMinutes(value) {
    if (!value) return Number.MAX_SAFE_INTEGER;

    const text = String(value).trim();
    const parts = text.split(":");

    if (parts.length !== 2) {
      return Number.MAX_SAFE_INTEGER;
    }

    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return Number.MAX_SAFE_INTEGER;
    }

    return hours * 60 + minutes;
  }

  /*
   * Return the slot order used by an entry.
   *
   * New timetable records normally contain `order`.
   * Older records may only have startTime/endTime.
   */
  function getEntryStartOrder(entry) {
    const explicitOrder = Number(entry?.order);

    if (Number.isFinite(explicitOrder)) {
      return explicitOrder;
    }

    const matchingSlot = slots.find(
      slot =>
        String(slot.startTime) === String(entry?.startTime) &&
        String(slot.endTime) === String(entry?.endTime)
    );

    if (matchingSlot) {
      return Number(matchingSlot.order || 0);
    }

    /*
     * Last fallback: find the first slot whose start time
     * matches the entry start time.
     */
    const fallbackSlot = slots.find(
      slot =>
        String(slot.startTime) === String(entry?.startTime)
    );

    return Number(fallbackSlot?.order || 0);
  }

  /*
   * Determine whether a timetable entry occupies a slot.
   */
  function occupies(entry, slot) {
    if (!entry || !slot) {
      return false;
    }

    if (String(entry.day) !== String(slot.day)) {
      return false;
    }

    const entryOrder = getEntryStartOrder(entry);
    const slotOrder = Number(slot.order || 0);

    const duration = Math.max(
      1,
      Number(entry.duration || 1)
    );

    return (
      slotOrder >= entryOrder &&
      slotOrder < entryOrder + duration
    );
  }

  /*
   * Find the timetable entry displayed in a cell.
   */
  function entryAt(dayName, slot) {
    return entries.find(entry =>
      occupies(entry, {
        ...slot,
        day: dayName
      })
    );
  }

  /*
   * Check whether this is the first cell of a multi-period class.
   */
  function isEntryStart(entry, slot) {
    if (!entry || !slot) {
      return false;
    }

    if (String(entry.day) !== String(slot.day)) {
      return false;
    }

    return (
      getEntryStartOrder(entry) ===
      Number(slot.order || 0)
    );
  }

  /*
   * Stable light background based on subject.
   */
  function hashColor(value) {
    const str = String(value || "Subject");

    let hash = 0;

    for (let i = 0; i < str.length; i += 1) {
      hash =
        (hash * 31 + str.charCodeAt(i)) %
        360;
    }

    return `hsl(${hash} 72% 94%)`;
  }

  /*
   * Move timetable entry.
   *
   * The backend remains responsible for checking:
   * - faculty conflict
   * - section conflict
   * - room conflict
   * - availability
   * - holidays
   * - workload
   * - other timetable constraints
   */
  async function moveEntry(entry, targetDay, targetSlot) {
    if (!canEdit || !entry || moving) {
      return;
    }

    const currentOrder = getEntryStartOrder(entry);
    const targetOrder = Number(targetSlot?.order || 0);

    if (
      String(entry.day) === String(targetDay) &&
      currentOrder === targetOrder
    ) {
      return;
    }

    setMoving(true);

    try {
      const response = await axios.patch(
        `${API}/timetable/move`,
        {
          entryId: entry._id,
          day: targetDay,
          startTime: targetSlot.startTime
        }
      );

      setMessage?.(
        response.data?.message ||
        "Class moved successfully."
      );

      await onMoved?.();
    } catch (error) {
      setMessage?.(
        error.response?.data?.message ||
        error.message ||
        "Unable to move class."
      );
    } finally {
      setMoving(false);
      setDragged(null);
    }
  }

  /*
   * Count actual starting classes, not continuation cells.
   */
  function classCountForDay(dayName) {
    return entries.filter(entry =>
      String(entry.day) === String(dayName)
    ).length;
  }

  return (
    <div className="panel calendar-panel">

      {/* HEADER */}
      <div className="toolbar calendar-header-row">
        <div>
          <h3>Interactive Calendar</h3>
          <p>
            Weekly timetable by configured academic time slots.
            {canEdit
              ? " Click a class for details or drag it to another period."
              : " Click a class for details."
            }
          </p>
        </div>

        <div className="calendar-status">
          <span
            className={`status-badge ${String(
              timetable?.status || "DRAFT"
            ).toLowerCase()}`}
          >
            {timetable?.status || "DRAFT"}
          </span>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="calendar-toolbar">

        <div className="calendar-segment">
          <button
            type="button"
            className={view === "week" ? "active" : ""}
            onClick={() => setView("week")}
          >
            Week
          </button>

          <button
            type="button"
            className={view === "day" ? "active" : ""}
            onClick={() => setView("day")}
          >
            Day
          </button>
        </div>

        {view === "day" && (
          <select
            value={day}
            onChange={event =>
              setDay(event.target.value)
            }
          >
            {calendarDays.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        )}

        <select
          value={filter}
          onChange={event => {
            setFilter(event.target.value);
            setSelected("");
          }}
        >
          <option value="all">All classes</option>
          <option value="section">Section</option>
          <option value="faculty">Faculty</option>
          <option value="room">Room</option>
        </select>

        {filter !== "all" && (
          <select
            value={selected}
            onChange={event =>
              setSelected(event.target.value)
            }
          >
            <option value="">
              All {filter}s
            </option>

            {filterOptions.map(item => (
              <option
                key={refId(item)}
                value={refId(item)}
              >
                {item.name}
                {filter === "section"
                  ? ` · ${item.program || ""} ${item.semester || ""}`
                  : ""}
              </option>
            ))}
          </select>
        )}

      </div>

      {/* NO SLOTS */}
      {!slots.length ? (
        <div className="empty-state">
          <Clock3 size={30} />
          <h3>No time slots configured</h3>
          <p>
            Configure Time Slots before using Calendar View.
          </p>
        </div>
      ) : (
        <div className="calendar-scroll">

          <div
            className="calendar-grid calendar-grid-fixed"
            style={{
              "--calendar-day-count": visibleDays.length
            }}
          >

            {/* HEADER */}
            <div className="calendar-corner">
              Time
            </div>

            {visibleDays.map(dayName => (
              <div
                className="calendar-day-head"
                key={dayName}
              >
                <strong>{dayName}</strong>

                <span>
                  {classCountForDay(dayName)}{" "}
                  {classCountForDay(dayName) === 1
                    ? "class"
                    : "classes"}
                </span>
              </div>
            ))}

            {/* TIME SLOT ROWS */}
            {slots.map((slot, slotIndex) => (
              <React.Fragment
                key={
                  `${slot.startTime}-${slot.endTime}-${slotIndex}`
                }
              >

                {/* TIME */}
                <div className="calendar-time">
                  <strong>
                    {slot.startTime}
                  </strong>

                  <span>
                    {slot.endTime}
                  </span>
                </div>

                {/* DAYS */}
                {visibleDays.map(dayName => {

                  const cellSlot = {
                    ...slot,
                    day: dayName
                  };

                  const entry = entryAt(
                    dayName,
                    slot
                  );

                  const isStart =
                    entry &&
                    isEntryStart(
                      entry,
                      cellSlot
                    );

                  const isContinuation =
                    entry && !isStart;

                  return (
                    <div
                      className={`calendar-cell ${
                        dragged && canEdit
                          ? "calendar-drop-active"
                          : ""
                      }`}
                      key={`${dayName}-${slot.startTime}-${slot.endTime}`}
                      onDragOver={event => {
                        if (!canEdit || moving) {
                          return;
                        }

                        event.preventDefault();
                        event.dataTransfer.dropEffect =
                          "move";
                      }}
                      onDrop={event => {
                        event.preventDefault();

                        if (
                          dragged &&
                          canEdit &&
                          !moving
                        ) {
                          moveEntry(
                            dragged,
                            dayName,
                            slot
                          );
                        }
                      }}
                    >

                      {/* CLASS START */}
                      {entry && isStart ? (
                        <button
                          type="button"
                          className="calendar-entry"
                          style={{
                            background:
                              hashColor(
                                entry.subject?.name
                              )
                          }}
                          draggable={
                            canEdit && !moving
                          }
                          onDragStart={event => {
                            setDragged(entry);

                            event.dataTransfer.effectAllowed =
                              "move";

                            event.dataTransfer.setData(
                              "text/plain",
                              entry._id || ""
                            );
                          }}
                          onDragEnd={() =>
                            setDragged(null)
                          }
                          onClick={() =>
                            setDetails(entry)
                          }
                        >
                          <strong>
                            {entry.subject?.name ||
                              "Subject"}
                          </strong>

                          {entry.subject?.code && (
                            <span>
                              {entry.subject.code}
                            </span>
                          )}

                          <small>
                            {entry.faculty?.name ||
                              "Faculty"}
                          </small>

                          <small>
                            {entry.section?.name ||
                              "Section"}
                            {" · "}
                            {entry.room?.name ||
                              "Room"}
                          </small>

                          {Number(
                            entry.duration || 1
                          ) > 1 && (
                            <b>
                              {entry.duration} periods
                            </b>
                          )}
                        </button>

                      ) : isContinuation ? (

                        <div className="calendar-continuation">
                          <span>↳</span>
                          <span>
                            {entry.subject?.name ||
                              "Continued class"}
                          </span>
                        </div>

                      ) : (

                        <span className="calendar-empty">
                          Free
                        </span>

                      )}

                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* MOVE STATUS */}
      {moving && (
        <div className="move-message loading">
          Checking timetable constraints and moving
          class...
        </div>
      )}

      {/* DETAILS */}
      {details && (
        <div
          className="calendar-detail-overlay"
          onClick={() => setDetails(null)}
        >
          <div
            className="calendar-detail"
            onClick={event =>
              event.stopPropagation()
            }
          >
            <div className="panel-head">
              <div>
                <h3>
                  {details.subject?.name ||
                    "Subject"}
                </h3>

                <p>
                  {details.day} ·{" "}
                  {details.startTime}–
                  {details.endTime}
                </p>
              </div>

              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setDetails(null)
                }
              >
                Close
              </button>
            </div>

            <div className="detail-grid">

              <div>
                <span>Faculty</span>
                <strong>
                  {details.faculty?.name || "—"}
                </strong>
              </div>

              <div>
                <span>Section</span>
                <strong>
                  {details.section?.name || "—"}
                </strong>
              </div>

              <div>
                <span>Room</span>
                <strong>
                  {details.room?.name || "—"}
                </strong>
              </div>

              <div>
                <span>Duration</span>
                <strong>
                  {details.duration || 1} period(s)
                </strong>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
