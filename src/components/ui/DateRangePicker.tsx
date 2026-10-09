import { today } from "../../lib/api";
export type DateRange = { start: string; end: string };
export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (v: DateRange) => void;
}) {
  return (
    <div className="date-range">
      <label>
        From
        <input
          type="date"
          aria-label="Cash flow start date"
          value={value.start}
          max={value.end}
          onChange={(e) =>
            e.target.value && onChange({ ...value, start: e.target.value })
          }
        />
      </label>
      <label>
        To
        <input
          type="date"
          aria-label="Cash flow end date"
          value={value.end}
          min={value.start}
          max={today()}
          onChange={(e) =>
            e.target.value && onChange({ ...value, end: e.target.value })
          }
        />
      </label>
    </div>
  );
}
export function periodRange(period: string, weekStart = 1): DateRange {
  const end = today();
  const d = new Date(end + "T12:00:00");
  if (period === "Week")
    d.setDate(d.getDate() - ((d.getDay() - weekStart + 7) % 7));
  else if (period === "Month") d.setDate(1);
  else {
    d.setMonth(0, 1);
  }
  return {
    start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    end,
  };
}
