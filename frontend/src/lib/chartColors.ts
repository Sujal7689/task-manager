// Validated categorical palette (light mode) — fixed slot order, never cycled
// or reassigned per-render. See the dataviz skill's references/palette.md.
export const CATEGORICAL = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
  yellow: "#eda100",
  magenta: "#e87ba4",
  green: "#008300",
  violet: "#4a3aa7",
  red: "#e34948",
};

export const CHART_CHROME = {
  gridline: "#e1e0d9",
  axis: "#898781",
  textSecondary: "#52514e",
  textPrimary: "#0b0b0b",
};

// Fixed status → color mapping so a status never repaints across charts/filters.
export const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: CATEGORICAL.blue,
  IN_PROGRESS: CATEGORICAL.yellow,
  ON_HOLD: CATEGORICAL.magenta,
  UNDER_REVIEW: CATEGORICAL.violet,
  COMPLETED: CATEGORICAL.aqua,
  CANCELLED: CATEGORICAL.red,
};
