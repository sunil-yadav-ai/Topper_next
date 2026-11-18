import { useMemo, useRef, useState } from "react";
import { CalendarDays, Flame, Leaf, Target } from "lucide-react";
import { useGSAP } from "@gsap/react";
import { gsap } from "../lib/gsap.js";

gsap.registerPlugin(useGSAP);

function parseDate(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function shiftDate(dateKey, days) {
  const date = parseDate(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDifference(start, end) {
  return Math.round((parseDate(end) - parseDate(start)) / 86_400_000);
}

function dateLabel(dateKey) {
  return parseDate(dateKey).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function activityDescription(day) {
  if (day.status === "untracked") return "No record — before this student joined";
  if (day.status === "today") return "Today — no resources opened yet";
  if (day.status === "absent") return "Absent — no resources opened";
  return `Present — ${day.totalResourcesOpened} ${day.totalResourcesOpened === 1 ? "resource" : "resources"} opened`;
}

function getIntensity(day) {
  if (day.status === "untracked") return "untracked";
  if (day.totalResourcesOpened <= 0) return "level-0";
  if (day.totalResourcesOpened === 1) return "level-1";
  if (day.totalResourcesOpened <= 3) return "level-2";
  if (day.totalResourcesOpened <= 5) return "level-3";
  return "level-4";
}

export default function StudentActivityHeatmap({
  activity,
  loading,
  error,
  onRetry,
  privateView = false,
}) {
  const rootRef = useRef(null);
  const [selectedDate, setSelectedDate] = useState("");
  const dayMap = useMemo(
    () => new Map(activity?.days.map((day) => [day.date, day]) ?? []),
    [activity],
  );
  const weeks = useMemo(() => {
    if (!activity?.startDate || !activity.endDate) return [];
    const first = parseDate(activity.startDate);
    first.setUTCDate(first.getUTCDate() - first.getUTCDay());
    const last = parseDate(activity.endDate);
    last.setUTCDate(last.getUTCDate() + (6 - last.getUTCDay()));
    const columns = [];
    for (let dateKey = first.toISOString().slice(0, 10); dateKey <= last.toISOString().slice(0, 10); dateKey = shiftDate(dateKey, 7)) {
      columns.push(Array.from({ length: 7 }, (_unused, weekday) => {
        const key = shiftDate(dateKey, weekday);
        return key > activity.endDate ? null : dayMap.get(key) ?? null;
      }));
    }
    return columns;
  }, [activity, dayMap]);
  const selectedDay = selectedDate ? dayMap.get(selectedDate) : null;

  const { contextSafe } = useGSAP(() => undefined, { scope: rootRef });

  function animateCell(event, entering) {
    const cell = event.currentTarget;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.to(cell, {
      scale: entering ? 1.28 : 1,
      duration: entering ? 0.18 : 0.22,
      ease: entering ? "back.out(1.7)" : "power2.out",
      overwrite: "auto",
      transformOrigin: "center",
    });
  }

  const handleEnter = contextSafe((event) => animateCell(event, true));
  const handleLeave = contextSafe((event) => animateCell(event, false));

  if (privateView) {
    return (
      <section aria-label="Learning activity" className="ed-activity-section" data-motion-scroll>
        <div className="ed-activity-heading">
          <div>
            <p className="ed-profile-kicker"><span aria-hidden="true">✳</span> YOUR STUDY RHYTHM</p>
            <h2>Learning activity</h2>
          </div>
        </div>
        <div className="ed-activity-empty">
          Learning activity details are private and visible only to the student.
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section aria-busy="true" className="ed-activity-section" data-motion-scroll>
        <div className="ed-activity-heading">
          <div>
            <p className="ed-profile-kicker"><span aria-hidden="true">✳</span> YOUR STUDY RHYTHM</p>
            <h2>Learning activity</h2>
          </div>
        </div>
        <div className="ed-activity-loading">
          <CalendarDays aria-hidden="true" size={18} />
          Loading your learning activity…
        </div>
      </section>
    );
  }

  if (error || !activity) {
    return (
      <section className="ed-activity-section" data-motion-scroll>
        <div className="ed-activity-heading">
          <div>
            <p className="ed-profile-kicker"><span aria-hidden="true">✳</span> YOUR STUDY RHYTHM</p>
            <h2>Learning activity</h2>
          </div>
        </div>
        <div className="ed-activity-empty">
          <p role={error ? "alert" : "status"}>{error || "Your learning activity will appear here after you open a study resource."}</p>
          {error && <button className="ed-activity-retry" onClick={onRetry} type="button">Try again</button>}
        </div>
      </section>
    );
  }

  const summary = activity.summary;
  const weekdayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];
  const firstWeekday = parseDate(activity.startDate).getUTCDay();
  const firstPadding = firstWeekday;
  const monthColumns = activity.months.map((month, index) => {
    const monthStart = month.startDate < activity.startDate ? activity.startDate : month.startDate;
    const nextMonth = activity.months[index + 1]?.startDate;
    const monthEnd = nextMonth
      ? shiftDate(nextMonth, -1)
      : activity.endDate;
    const firstVisible = dayDifference(activity.startDate, monthStart) + firstPadding;
    const lastVisible = dayDifference(activity.startDate, monthEnd) + firstPadding;
    return {
      ...month,
      column: Math.floor(firstVisible / 7) + 1,
      span: Math.max(1, Math.floor(lastVisible / 7) - Math.floor(firstVisible / 7) + 1),
    };
  });

  return (
    <section aria-label="Your learning activity" className="ed-activity-section" data-motion-scroll ref={rootRef}>
      <div className="ed-activity-heading">
        <div>
          <p className="ed-profile-kicker"><span aria-hidden="true">✳</span> YOUR STUDY RHYTHM</p>
          <h2>Learning activity</h2>
        </div>
        <span className="ed-activity-timezone">Last 12 months · Asia/Kolkata</span>
      </div>

      <div aria-label="Learning activity summary" className="ed-activity-summary">
        {[
          { label: "Active days", value: summary.totalActiveDays, icon: CalendarDays, className: "is-lime" },
          { label: "Resources opened", value: summary.totalResourcesOpened, icon: Leaf, className: "is-green" },
          { label: "Current streak", value: `${summary.currentStreak} days`, icon: Flame, className: "is-orange" },
          { label: "Longest streak", value: `${summary.longestStreak} days`, icon: Target, className: "is-purple" },
        ].map(({ label, value, icon: Icon, className }) => (
          <div className={`ed-activity-stat ${className}`} data-motion-stagger key={label}>
            <Icon aria-hidden="true" size={17} />
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
        <div className="ed-activity-extra-stat">
          <span><b>{summary.activityPercentage}%</b> activity rate</span>
          <span><b>{summary.thisWeekActiveDays}</b> active days this week</span>
          <span><b>{summary.totalNotesOpened}</b> notes · <b>{summary.totalPyqsOpened}</b> PYQs</span>
        </div>
      </div>

      <div className="ed-activity-heatmap-wrap">
        <div className="ed-activity-months" style={{ "--activity-weeks": weeks.length }}>
          {monthColumns.map((month) => (
            <span
              key={month.startDate}
              style={{ gridColumn: `${month.column} / span ${month.span}` }}
            >
              {month.month}
            </span>
          ))}
        </div>
        <div className="ed-activity-chart">
          <div aria-hidden="true" className="ed-activity-weekdays">
            {weekdayLabels.map((label, index) => <span key={index}>{label}</span>)}
          </div>
          <div
            aria-label="Daily learning activity over the last 12 months"
            className="ed-activity-grid"
            role="grid"
            style={{ "--activity-weeks": weeks.length }}
          >
            {weeks.map((week, weekIndex) => (
              <div aria-label={`Week ${weekIndex + 1}`} className="ed-activity-week" key={`week-${weekIndex}`} role="row">
                {week.map((day, weekday) => (
                  day ? (
                    <button
                      aria-label={`${dateLabel(day.date)}. ${activityDescription(day)}. ${
                        day.status === "untracked"
                          ? ""
                          : `${day.notesOpened} notes, ${day.pyqsOpened} PYQs, ${day.totalResourcesOpened} total.`
                      }`}
                      aria-pressed={selectedDate === day.date}
                      className={`ed-activity-cell ${getIntensity(day)}${selectedDate === day.date ? " is-selected" : ""}`}
                      key={day.date}
                      onBlur={handleLeave}
                      onClick={() => setSelectedDate((current) => current === day.date ? "" : day.date)}
                      onFocus={handleEnter}
                      onMouseEnter={handleEnter}
                      onMouseLeave={handleLeave}
                      role="gridcell"
                      title={`${dateLabel(day.date)} · ${activityDescription(day)}${
                        day.status === "untracked"
                          ? ""
                          : ` · ${day.notesOpened} notes · ${day.pyqsOpened} PYQs · ${day.totalResourcesOpened} total`
                      }`}
                      type="button"
                    />
                  ) : <span aria-hidden="true" className="ed-activity-cell is-future" key={`future-${weekIndex}-${weekday}`} />
                ))}
              </div>
            ))}
          </div>
        </div>
        {selectedDay && (
          <div aria-live="polite" className="ed-activity-tooltip" role="status">
            <strong>{dateLabel(selectedDay.date)}</strong>
            <span>{activityDescription(selectedDay)}</span>
            {selectedDay.status !== "untracked" && (
              <span>{selectedDay.notesOpened} notes · {selectedDay.pyqsOpened} PYQs · {selectedDay.totalResourcesOpened} total</span>
            )}
          </div>
        )}
        <div aria-label="Activity intensity legend" className="ed-activity-legend">
          <span>Before joining</span>
          <i aria-hidden="true" className="ed-activity-cell untracked" />
          <span>Less</span>
          {["level-0", "level-1", "level-2", "level-3", "level-4"].map((level) => (
            <i aria-hidden="true" className={`ed-activity-cell ${level}`} key={level} />
          ))}
          <span>More</span>
        </div>
      </div>
      <p className="ed-activity-footnote">
        No activity is marked absent only after that day ends. Today remains in progress until midnight in India.
      </p>
    </section>
  );
}
