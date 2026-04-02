import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import {
  sendApprovedNotification,
  sendDeletedNotification,
  sendNewRequestNotification,
  sendRejectedNotification,
} from "../services/notifications";

// ==========================================================
// HOOFDSTUK: TYPES
// ==========================================================

type DayType =
  | "stephan"
  | "wing"
  | "scoutskamp"
  | "schoolwissel"
  | "vakantiewissel"
  | "vakantieStephan"
  | "vakantieWing";

type DragMode = "set" | "unset";
type MainTab = "kalender" | "goedkeuringen";

type DayTypeConfig = {
  label: string;
  color: string;
  textColor: string;
  shortLabel: string;
};

type ChangeRequestRow = {
  id: string;
  requested_by: string;
  requested_at: string;
  changed_dates: string;
  old_value: string | null;
  new_value: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  request_comment: string | null;
};

type DayRow = {
  date: string;
  type: string;
};

type Props = {
  currentUserEmail: string;
};

// ==========================================================
// HOOFDSTUK: CONFIG
// ==========================================================

// ------------------------------
// SUB: Dagtypes
// ------------------------------

const DAY_TYPES: Record<DayType, DayTypeConfig> = {
  stephan: {
    label: "Stephan",
    shortLabel: "Stephan",
    color: "#a9c4f5",
    textColor: "#16325c",
  },
  wing: {
    label: "Wing",
    shortLabel: "Wing",
    color: "#b7ddb0",
    textColor: "#1d4a22",
  },
  scoutskamp: {
    label: "Scoutskamp",
    shortLabel: "Kamp",
    color: "#f2c94c",
    textColor: "#5b4500",
  },
  schoolwissel: {
    label: "Schoolwissel",
    shortLabel: "Schoolwissel",
    color: "#56c7d4",
    textColor: "#083d44",
  },
  vakantiewissel: {
    label: "Vakantiewissel",
    shortLabel: "Vakantiewissel",
    color: "#ffb366",
    textColor: "#5a3000",
  },
  vakantieStephan: {
    label: "Vakantie Stephan",
    shortLabel: "Vak. Stephan",
    color: "#5b8def",
    textColor: "#ffffff",
  },
  vakantieWing: {
    label: "Vakantie Wing",
    shortLabel: "Vak. Wing",
    color: "#5fa85a",
    textColor: "#ffffff",
  },
};

// ------------------------------
// SUB: Zwevende toolbar types
// ------------------------------

const TOOLBAR_TYPES: DayType[] = [
  "stephan",
  "wing",
  "scoutskamp",
  "schoolwissel",
  "vakantiewissel",
  "vakantieStephan",
  "vakantieWing",
];

// ------------------------------
// SUB: Weekdag labels
// ------------------------------

const WEEKDAYS = ["M", "D", "W", "D", "V", "Z", "Z"];

// ==========================================================
// HOOFDSTUK: HELPERS
// ==========================================================

// ------------------------------
// SUB: Datum helpers
// ------------------------------

function formatKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getMonthName(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString("nl-BE", {
    month: "long",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("nl-BE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ------------------------------
// SUB: Kalender opbouw
// ------------------------------

function buildMonths(year: number) {
  const months: { month: number; name: string; cells: (Date | null)[] }[] = [];

  for (let month = 0; month < 12; month++) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);

    const cells: (Date | null)[] = [];
    const offset = (first.getDay() + 6) % 7;

    for (let i = 0; i < offset; i++) cells.push(null);

    for (let day = 1; day <= last.getDate(); day++) {
      cells.push(new Date(year, month, day));
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    months.push({
      month,
      name: getMonthName(year, month),
      cells,
    });
  }

  return months;
}

// ------------------------------
// SUB: Data helpers
// ------------------------------

function cloneData(data: Record<string, DayType>) {
  return { ...data };
}

function isValidDayType(value: unknown): value is DayType {
  return typeof value === "string" && value in DAY_TYPES;
}

function isCountableOwner(type?: DayType) {
  return (
    type === "stephan" ||
    type === "wing" ||
    type === "vakantieStephan" ||
    type === "vakantieWing"
  );
}

function ownerFromType(type?: DayType): "stephan" | "wing" | null {
  if (type === "stephan" || type === "vakantieStephan") return "stephan";
  if (type === "wing" || type === "vakantieWing") return "wing";
  return null;
}

function pct(part: number, total: number) {
  if (!total) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function getStatusLabel(status: string) {
  if (status === "approved") return "Goedgekeurd";
  if (status === "rejected") return "Afgekeurd";
  return "Openstaand";
}

// ------------------------------
// SUB: Mini vergelijking in Goedkeuringen
// ------------------------------

function renderMiniDiffCalendar(
  oldValue: string | null,
  newValue: string | null
) {
  const parse = (value: string | null) => {
    const map: Record<string, string> = {};
    if (!value) return map;

    value.split(" | ").forEach((entry) => {
      const firstColon = entry.indexOf(":");
      if (firstColon === -1) return;

      const date = entry.slice(0, firstColon).trim();
      const val = entry.slice(firstColon + 1).trim();

      if (date) map[date] = val;
    });

    return map;
  };

  const oldMap = parse(oldValue);
  const newMap = parse(newValue);

  const allDates = Array.from(
    new Set([...Object.keys(oldMap), ...Object.keys(newMap)])
  ).sort();

  if (allDates.length === 0) return null;

  const weeks: Record<string, string[]> = {};

  allDates.forEach((dateStr) => {
    const d = new Date(dateStr);
    const monday = new Date(d);
    const day = (d.getDay() + 6) % 7;
    monday.setDate(d.getDate() - day);
    const key = monday.toISOString().slice(0, 10);

    if (!weeks[key]) weeks[key] = [];
    weeks[key].push(dateStr);
  });

  return (
    <div className="mini-week-wrapper">
      {Object.entries(weeks).map(([weekStart]) => (
        <div key={weekStart} className="mini-week">
          <div className="mini-week-label">Week van {weekStart.slice(5)}</div>

          <div className="mini-week-grid mini-week-head">
            {WEEKDAYS.map((d, i) => (
              <div key={`${weekStart}-${d}-${i}`} className="mini-week-head-cell">
                {d}
              </div>
            ))}
          </div>

          <div className="mini-week-grid">
            {Array.from({ length: 7 }).map((_, i) => {
              const base = new Date(weekStart);
              base.setDate(base.getDate() + i);
              const key = base.toISOString().slice(0, 10);

              const oldVal = oldMap[key];
              const newVal = newMap[key];

              const oldCfg = DAY_TYPES[oldVal as DayType];
              const newCfg = DAY_TYPES[newVal as DayType];
              const changed = oldVal !== newVal;

              return (
                <div
                  key={key}
                  className={`mini-week-day ${changed ? "changed" : ""}`}
                  title={`${key}: ${oldCfg?.label || "Leeg"} → ${newCfg?.label || "Leeg"}`}
                >
                  <div className="mini-day-top">{key.slice(8)}</div>

                  <div className="mini-day-content">
                    <div
                      className="mini-half"
                      style={{ background: oldCfg?.color || "#ffffff" }}
                    />
                    <div
                      className="mini-half"
                      style={{ background: newCfg?.color || "#ffffff" }}
                    />
                  </div>

                  <div className="mini-day-legend">
                    <span>{oldCfg?.shortLabel || "—"}</span>
                    <span>→</span>
                    <span>{newCfg?.shortLabel || "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ==========================================================
// HOOFDSTUK: COMPONENT
// ==========================================================

export default function CalendarPage({ currentUserEmail }: Props) {
  const year = 2026;

  const months = useMemo(() => buildMonths(year), []);
  const allDays = useMemo(() => months.flatMap((m) => m.cells), [months]);
  const realDayCount = useMemo(() => allDays.filter(Boolean).length, [allDays]);

  // ==========================================================
  // HOOFDSTUK: STATE
  // ==========================================================

  // ------------------------------
  // SUB: Kalender state
  // ------------------------------

  const [selected, setSelected] = useState<DayType>("stephan");
  const [data, setData] = useState<Record<string, DayType>>({});
  const [draftData, setDraftData] = useState<Record<string, DayType>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ------------------------------
  // SUB: UI state
  // ------------------------------

  const [showClearModal, setShowClearModal] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>("kalender");
  const [uiMessage, setUiMessage] = useState("");
  const [highlightedRequestId, setHighlightedRequestId] = useState<string | null>(null);
  const [deleteRequestTarget, setDeleteRequestTarget] =
    useState<ChangeRequestRow | null>(null);
  const [deletingRequest, setDeletingRequest] = useState(false);

  // ------------------------------
  // SUB: Aanvragen state
  // ------------------------------

  const [requests, setRequests] = useState<ChangeRequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestComment, setRequestComment] = useState("");
  const [reviewComments, setReviewComments] = useState<Record<string, string>>(
    {}
  );

  // ------------------------------
  // SUB: Wijzigen modus state
  // ------------------------------

  const [isEditMode, setIsEditMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [dragCurrentIndex, setDragCurrentIndex] = useState<number | null>(null);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  const [baseData, setBaseData] = useState<Record<string, DayType>>({});

  // ==========================================================
  // HOOFDSTUK: UI HELPERS
  // ==========================================================

  // ------------------------------
  // SUB: Tijdelijke boodschap tonen
  // ------------------------------

  function showMessage(message: string) {
    setUiMessage(message);
    window.clearTimeout((window as any).__msgTimer);
    (window as any).__msgTimer = window.setTimeout(() => {
      setUiMessage("");
    }, 3500);
  }

  // ==========================================================
  // HOOFDSTUK: DATA LADEN
  // ==========================================================

  // ------------------------------
  // SUB: Aanvragen laden
  // ------------------------------

  async function loadRequests() {
    setRequestsLoading(true);

    const { data: rows, error } = await supabase
      .from("change_requests")
      .select(
        "id, requested_by, requested_at, changed_dates, old_value, new_value, status, reviewed_by, reviewed_at, review_comment, request_comment"
      )
      .order("requested_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Fout bij laden aanvragen:", error);
      setRequestsLoading(false);
      return;
    }

    setRequests((rows as ChangeRequestRow[]) || []);
    setRequestsLoading(false);
  }

  // ------------------------------
  // SUB: Kalender laden
  // ------------------------------

  async function loadCalendar() {
    setLoading(true);

    const { data: rows, error } = await supabase
      .from("calendar_entries")
      .select("date, type");

    if (error) {
      console.error("Fout bij laden kalender:", error);
      setLoading(false);
      return;
    }

    const mapped: Record<string, DayType> = {};
    (rows as DayRow[] | null)?.forEach((row) => {
      if (isValidDayType(row.type)) {
        mapped[row.date] = row.type;
      }
    });

    setData(mapped);
    setDraftData(mapped);
    setLoading(false);
  }

  // ==========================================================
  // HOOFDSTUK: EFFECTS
  // ==========================================================

  // ------------------------------
  // SUB: Eerste keer laden
  // ------------------------------

  useEffect(() => {
    void loadCalendar();
    void loadRequests();
  }, []);

  // ------------------------------
  // SUB: Deep link naar specifiek verzoek
  // ------------------------------

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get("requestId");

    if (requestId) {
      setActiveTab("goedkeuringen");
      setHighlightedRequestId(requestId);

      setTimeout(() => {
        const el = document.getElementById(`request-${requestId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 500);
    }
  }, [requests.length]);

  // ------------------------------
  // SUB: Polling voor nieuwe verzoeken
  // ------------------------------

  useEffect(() => {
    const interval = setInterval(async () => {
      const { data: rows, error } = await supabase
        .from("change_requests")
        .select("id, requested_by, status")
        .eq("status", "pending");

      if (error || !rows) return;

      const newForMe = rows.filter((r) => r.requested_by !== currentUserEmail);

      if (newForMe.length > 0) {
        await loadRequests();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [currentUserEmail]);

  // ==========================================================
  // HOOFDSTUK: AFGELEIDE DATA
  // ==========================================================

  // ------------------------------
  // SUB: Openstaande verzoeken
  // ------------------------------

  const pendingForMe = useMemo(
    () =>
      requests.filter(
        (r) => r.status === "pending" && r.requested_by !== currentUserEmail
      ),
    [requests, currentUserEmail]
  );

  const myPendingRequests = useMemo(
    () =>
      requests.filter(
        (r) => r.status === "pending" && r.requested_by === currentUserEmail
      ),
    [requests, currentUserEmail]
  );

  const handledRequests = useMemo(
    () =>
      requests.filter(
        (r) => r.status === "approved" || r.status === "rejected"
      ),
    [requests]
  );

  const openRequestsCount = useMemo(
    () => pendingForMe.length + myPendingRequests.length,
    [pendingForMe.length, myPendingRequests.length]
  );

  // ------------------------------
  // SUB: Dag index mapping
  // ------------------------------

  const dayIndexByKey = useMemo(() => {
    const map: Record<string, number> = {};
    allDays.forEach((d, i) => {
      if (d) map[formatKey(d)] = i;
    });
    return map;
  }, [allDays]);

  // ------------------------------
  // SUB: Preview data tijdens slepen
  // ------------------------------

  function buildPreviewData() {
    if (
      !isEditMode ||
      !isDragging ||
      dragStartIndex === null ||
      dragCurrentIndex === null ||
      !dragMode
    ) {
      return draftData;
    }

    const min = Math.min(dragStartIndex, dragCurrentIndex);
    const max = Math.max(dragStartIndex, dragCurrentIndex);
    const next = cloneData(baseData);

    for (let i = min; i <= max; i++) {
      const date = allDays[i];
      if (!date) continue;

      const key = formatKey(date);

      if (dragMode === "set") {
        next[key] = selected;
      } else {
        delete next[key];
      }
    }

    return next;
  }

  const previewData = buildPreviewData();

  // ------------------------------
  // SUB: Gewijzigde conceptdata?
  // ------------------------------

  const hasDraftChanges = useMemo(() => {
    const keys = Array.from(
      new Set([...Object.keys(data), ...Object.keys(draftData)])
    );
    return keys.some((key) => data[key] !== draftData[key]);
  }, [data, draftData]);

  // ------------------------------
  // SUB: Tellingen overzicht
  // ------------------------------

  const resolvedTotals = useMemo(() => {
    let stephan = 0;
    let wing = 0;
    let vakantieStephan = 0;
    let vakantieWing = 0;
    let scoutskamp = 0;

    const openstaand = realDayCount - Object.keys(previewData).length;
    const keysByIndex = allDays.map((d) => (d ? formatKey(d) : null));

    for (let i = 0; i < keysByIndex.length; i++) {
      const key = keysByIndex[i];
      if (!key) continue;

      const type = previewData[key];

      if (type === "stephan") stephan++;
      if (type === "wing") wing++;
      if (type === "vakantieStephan") vakantieStephan++;
      if (type === "vakantieWing") vakantieWing++;
      if (type === "scoutskamp") scoutskamp++;

      if (type === "schoolwissel") {
        let owner: "stephan" | "wing" | null = null;

        for (let j = i + 1; j < keysByIndex.length; j++) {
          const nextKey = keysByIndex[j];
          if (!nextKey) continue;
          const nextType = previewData[nextKey];
          if (!nextType) continue;

          if (isCountableOwner(nextType)) {
            owner = ownerFromType(nextType);
            break;
          }
        }

        if (owner === "stephan") stephan++;
        if (owner === "wing") wing++;
      }

      if (type === "vakantiewissel") {
        let owner: "stephan" | "wing" | null = null;

        for (let j = i - 1; j >= 0; j--) {
          const prevKey = keysByIndex[j];
          if (!prevKey) continue;
          const prevType = previewData[prevKey];
          if (!prevType) continue;

          if (isCountableOwner(prevType)) {
            owner = ownerFromType(prevType);
            break;
          }
        }

        if (owner === "stephan") stephan++;
        if (owner === "wing") wing++;
      }
    }

    return {
      stephan,
      wing,
      vakantieStephan,
      vakantieWing,
      scoutskamp,
      openstaand,
    };
  }, [allDays, previewData, realDayCount]);

  const normalTotal = resolvedTotals.stephan + resolvedTotals.wing;
  const vacationTotal =
    resolvedTotals.vakantieStephan + resolvedTotals.vakantieWing;

  // ==========================================================
  // HOOFDSTUK: AANVRAGEN
  // ==========================================================

  // ------------------------------
  // SUB: Nieuw wijzigingsverzoek maken
  // ------------------------------

  async function createChangeRequest(
    previousData: Record<string, DayType>,
    nextData: Record<string, DayType>,
    comment?: string
  ) {
    const changedDates = Array.from(
      new Set([...Object.keys(previousData), ...Object.keys(nextData)])
    ).filter((key) => previousData[key] !== nextData[key]);

    if (changedDates.length === 0) {
      showMessage("Er zijn geen wijzigingen om te versturen.");
      return;
    }

    setSaving(true);

    try {
      const oldValues = changedDates
        .map((date) => `${date}: ${previousData[date] || "leeg"}`)
        .join(" | ");

      const newValues = changedDates
        .map((date) => `${date}: ${nextData[date] || "leeg"}`)
        .join(" | ");

      const { data: insertedRequest, error } = await supabase
        .from("change_requests")
        .insert({
          requested_by: currentUserEmail,
          changed_dates: changedDates.join(", "),
          old_value: oldValues,
          new_value: newValues,
          status: "pending",
          request_comment: comment?.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      setRequestComment("");
      await loadRequests();
      setIsEditMode(false);
      setDraftData(data);
      showMessage("Aanvraag verstuurd ter goedkeuring.");

      await sendNewRequestNotification({
        currentUserEmail,
        requestId: insertedRequest.id,
        changedDates,
        comment: comment?.trim() || null,
        oldValue: oldValues,
        newValue: newValues,
      });
    } catch (error) {
      console.error("Fout bij maken voorstel:", error);
      showMessage("Er liep iets mis bij het maken van de aanvraag.");
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------
  // SUB: Verzoek goedkeuren
  // ------------------------------

  async function approveRequest(request: ChangeRequestRow) {
    try {
      const changes = (request.new_value || "")
        .split(" | ")
        .map((part) => part.trim())
        .filter(Boolean);

      const upserts: {
        date: string;
        type: string;
        updated_by: string;
        updated_at: string;
      }[] = [];

      const deletes: string[] = [];

      changes.forEach((entry) => {
        const firstColon = entry.indexOf(":");
        if (firstColon === -1) return;

        const date = entry.slice(0, firstColon).trim();
        const value = entry.slice(firstColon + 1).trim();

        if (!date) return;

        if (value === "leeg") {
          deletes.push(date);
        } else {
          upserts.push({
            date,
            type: value,
            updated_by: request.requested_by,
            updated_at: new Date().toISOString(),
          });
        }
      });

      if (upserts.length > 0) {
        const { error } = await supabase
          .from("calendar_entries")
          .upsert(upserts, { onConflict: "date" });

        if (error) throw error;
      }

      if (deletes.length > 0) {
        const { error } = await supabase
          .from("calendar_entries")
          .delete()
          .in("date", deletes);

        if (error) throw error;
      }

      const reviewComment = reviewComments[request.id]?.trim() || null;

      const { error } = await supabase
        .from("change_requests")
        .update({
          status: "approved",
          reviewed_by: currentUserEmail,
          reviewed_at: new Date().toISOString(),
          review_comment: reviewComment,
        })
        .eq("id", request.id);

      if (error) throw error;

      setReviewComments((prev) => ({ ...prev, [request.id]: "" }));
      await loadCalendar();
      await loadRequests();
      showMessage("Voorstel goedgekeurd.");

      await sendApprovedNotification({
        to: request.requested_by,
        requestId: request.id,
        requester: request.requested_by,
        changedDates: request.changed_dates.split(", ").filter(Boolean),
        comment: reviewComment,
        reviewedBy: currentUserEmail,
        oldValue: request.old_value,
        newValue: request.new_value,
      });
    } catch (error) {
      console.error("Fout bij goedkeuren:", error);
      showMessage("Er liep iets mis bij het goedkeuren.");
    }
  }

  // ------------------------------
  // SUB: Verzoek afkeuren
  // ------------------------------

  async function rejectRequest(request: ChangeRequestRow) {
    try {
      const reviewComment = reviewComments[request.id]?.trim() || null;

      const { error } = await supabase
        .from("change_requests")
        .update({
          status: "rejected",
          reviewed_by: currentUserEmail,
          reviewed_at: new Date().toISOString(),
          review_comment: reviewComment,
        })
        .eq("id", request.id);

      if (error) throw error;

      setReviewComments((prev) => ({ ...prev, [request.id]: "" }));
      await loadRequests();
      showMessage("Voorstel afgekeurd.");

      await sendRejectedNotification({
        to: request.requested_by,
        requestId: request.id,
        requester: request.requested_by,
        changedDates: request.changed_dates.split(", ").filter(Boolean),
        comment: reviewComment,
        reviewedBy: currentUserEmail,
        oldValue: request.old_value,
        newValue: request.new_value,
      });
    } catch (error) {
      console.error("Fout bij afkeuren:", error);
      showMessage("Er liep iets mis bij het afkeuren.");
    }
  }

  // ------------------------------
  // SUB: Verwijder popup openen
  // ------------------------------

  function openDeleteRequestModal(request: ChangeRequestRow) {
    setDeleteRequestTarget(request);
  }

  // ------------------------------
  // SUB: Verwijder popup sluiten
  // ------------------------------

  function closeDeleteRequestModal() {
    if (deletingRequest) return;
    setDeleteRequestTarget(null);
  }

  // ------------------------------
  // SUB: Verzoek verwijderen
  // ------------------------------

  async function confirmDeleteRequest() {
    if (!deleteRequestTarget) return;

    setDeletingRequest(true);

    try {
      const request = deleteRequestTarget;

      const { error } = await supabase
        .from("change_requests")
        .delete()
        .eq("id", request.id);

      if (error) throw error;

      if (request.requested_by !== currentUserEmail) {
        await sendDeletedNotification({
          to: request.requested_by,
          requestId: request.id,
          requester: request.requested_by,
          changedDates: request.changed_dates.split(", ").filter(Boolean),
          comment: request.request_comment,
          reviewedBy: currentUserEmail,
          oldValue: request.old_value,
          newValue: request.new_value,
        });
      }

      await loadRequests();
      setDeleteRequestTarget(null);
      showMessage("Verzoek verwijderd.");
    } catch (error) {
      console.error("Fout bij verwijderen verzoek:", error);
      showMessage("Er liep iets mis bij het verwijderen.");
    } finally {
      setDeletingRequest(false);
    }
  }

  // ==========================================================
  // HOOFDSTUK: WIJZIGEN MODUS
  // ==========================================================

  // ------------------------------
  // SUB: Wijzigen modus starten
  // ------------------------------

  function startEditMode() {
    setDraftData(cloneData(data));
    setRequestComment("");
    setIsEditMode(true);
    showMessage(
      "Wijzigen modus actief. Maak je wijzigingen en verstuur daarna de aanvraag."
    );
  }

  // ------------------------------
  // SUB: Wijzigen modus annuleren
  // ------------------------------

  function cancelEditMode() {
    setIsDragging(false);
    setDragStartIndex(null);
    setDragCurrentIndex(null);
    setDragMode(null);
    setBaseData({});
    setDraftData(cloneData(data));
    setRequestComment("");
    setIsEditMode(false);
    showMessage("Wijzigen modus geannuleerd.");
  }

  // ------------------------------
  // SUB: Drag wijziging toepassen
  // ------------------------------

  function applyCurrentDragToDraft() {
    if (
      !isDragging ||
      dragStartIndex === null ||
      dragCurrentIndex === null ||
      !dragMode
    ) {
      return;
    }

    setDraftData(cloneData(previewData));
    setIsDragging(false);
    setDragStartIndex(null);
    setDragCurrentIndex(null);
    setDragMode(null);
    setBaseData({});
  }

  function handleMouseUpCalendar() {
    if (isEditMode) {
      applyCurrentDragToDraft();
    }
  }

  // ------------------------------
  // SUB: Huidige aanvraag versturen
  // ------------------------------

  async function submitCurrentRequest() {
    await createChangeRequest(data, draftData, requestComment);
  }

  // ------------------------------
  // SUB: Concept volledig leegmaken
  // ------------------------------

  function clearAllConfirmed() {
    setDraftData({});
    setShowClearModal(false);
    showMessage(
      "Concept leeggemaakt. Verstuur nog op 'Wijzigingen ter goedkeuring versturen' om de aanvraag echt te verzenden."
    );
  }

  // ==========================================================
  // HOOFDSTUK: AUTH
  // ==========================================================

  // ------------------------------
  // SUB: Uitloggen
  // ------------------------------

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  // ==========================================================
  // HOOFDSTUK: RENDER
  // ==========================================================

  return (
    <>
      <div className="app-shell" onMouseUp={handleMouseUpCalendar}>
        {/* ==========================================================
            HOOFDSTUK: BOVENBALK
            ========================================================== */}
        <header className="topbar">
          <div>
            <h1>Co-ouderschap kalender {year}</h1>
            <p>Bekijk de kalender of start expliciet een wijzigingsaanvraag.</p>
          </div>

          <div className="topbar-actions">
            {pendingForMe.length > 0 && (
              <button
                className="ghost-btn notify-btn"
                type="button"
                onClick={() => setActiveTab("goedkeuringen")}
              >
                {pendingForMe.length} open verzoek
                {pendingForMe.length > 1 ? "en" : ""}
              </button>
            )}

            <button className="ghost-btn" type="button">
              {currentUserEmail}
            </button>

            <button className="ghost-btn" onClick={handleLogout} type="button">
              Uitloggen
            </button>
          </div>
        </header>

        {uiMessage && <div className="inline-message">{uiMessage}</div>}

        {/* ==========================================================
            HOOFDSTUK: TABS
            ========================================================== */}
        <section className="page-tabs-card">
          <div className="page-tabs">
            <button
              type="button"
              className={`page-tab ${activeTab === "kalender" ? "active" : ""}`}
              onClick={() => setActiveTab("kalender")}
            >
              Kalender
            </button>

            <button
              type="button"
              className={`page-tab ${activeTab === "goedkeuringen" ? "active" : ""}`}
              onClick={() => setActiveTab("goedkeuringen")}
            >
              Goedkeuringen
              {openRequestsCount > 0 && (
                <span className="tab-badge tab-badge-danger">
                  {openRequestsCount}
                </span>
              )}
            </button>
          </div>
        </section>

        {/* ==========================================================
            HOOFDSTUK: TAB KALENDER
            ========================================================== */}
        {activeTab === "kalender" && (
          <>
            <section className="stats-card">
              <div className="stats-header">
                <div>
                  <div className="section-title">Overzicht</div>
                  <div className="section-subtitle">
                    Schoolwissel telt automatisch bij de ouder rechts.
                    Vakantiewissel telt automatisch bij de ouder links.
                  </div>
                </div>

                <div className="section-subtitle">
                  {loading
                    ? "Laden..."
                    : saving
                    ? "Aanvraag versturen..."
                    : isEditMode
                    ? "Wijzigen modus actief"
                    : "Kijkmodus"}
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-item emphasis">
                  <div className="stat-item-left">
                    <span
                      className="stat-color"
                      style={{ backgroundColor: DAY_TYPES.stephan.color }}
                    />
                    <span className="stat-label">Stephan</span>
                  </div>
                  <div className="stat-right">
                    <span className="stat-percent">
                      {pct(resolvedTotals.stephan, normalTotal)}
                    </span>
                    <span className="stat-value">{resolvedTotals.stephan}</span>
                  </div>
                </div>

                <div className="stat-item emphasis">
                  <div className="stat-item-left">
                    <span
                      className="stat-color"
                      style={{ backgroundColor: DAY_TYPES.wing.color }}
                    />
                    <span className="stat-label">Wing</span>
                  </div>
                  <div className="stat-right">
                    <span className="stat-percent">
                      {pct(resolvedTotals.wing, normalTotal)}
                    </span>
                    <span className="stat-value">{resolvedTotals.wing}</span>
                  </div>
                </div>

                <div className="stat-item">
                  <div className="stat-item-left">
                    <span
                      className="stat-color"
                      style={{ backgroundColor: DAY_TYPES.vakantieStephan.color }}
                    />
                    <span className="stat-label">Vakantie Stephan</span>
                  </div>
                  <div className="stat-right">
                    <span className="stat-percent">
                      {pct(resolvedTotals.vakantieStephan, vacationTotal)}
                    </span>
                    <span className="stat-value">
                      {resolvedTotals.vakantieStephan}
                    </span>
                  </div>
                </div>

                <div className="stat-item">
                  <div className="stat-item-left">
                    <span
                      className="stat-color"
                      style={{ backgroundColor: DAY_TYPES.vakantieWing.color }}
                    />
                    <span className="stat-label">Vakantie Wing</span>
                  </div>
                  <div className="stat-right">
                    <span className="stat-percent">
                      {pct(resolvedTotals.vakantieWing, vacationTotal)}
                    </span>
                    <span className="stat-value">
                      {resolvedTotals.vakantieWing}
                    </span>
                  </div>
                </div>

                <div className="stat-item">
                  <div className="stat-item-left">
                    <span
                      className="stat-color"
                      style={{ backgroundColor: DAY_TYPES.scoutskamp.color }}
                    />
                    <span className="stat-label">Scoutskamp</span>
                  </div>
                  <div className="stat-right">
                    <span className="stat-value">
                      {resolvedTotals.scoutskamp}
                    </span>
                  </div>
                </div>

                <div className="stat-item total">
                  <div className="stat-item-left">
                    <span className="stat-color neutral" />
                    <span className="stat-label">Openstaande dagen</span>
                  </div>
                  <div className="stat-right">
                    <span className="stat-value">{resolvedTotals.openstaand}</span>
                  </div>
                </div>
              </div>
            </section>

            {!isEditMode ? (
              <section className="request-note-card">
                <div className="edit-mode-bar">
                  <div>
                    <div className="section-title">Wijzigingen aanvragen</div>
                    <div className="section-subtitle">
                      Start eerst expliciet de wijzigen modus om een aanvraag op te maken.
                    </div>
                  </div>

                  <button
                    type="button"
                    className="primary-action-btn"
                    onClick={startEditMode}
                  >
                    Wijzigen modus starten
                  </button>
                </div>
              </section>
            ) : (
              <section className="request-note-card">
                <div className="edit-mode-bar">
                  <div>
                    <div className="section-title">Wijzigen modus actief</div>
                    <div className="section-subtitle">
                      Maak je wijzigingen, voeg eventueel een opmerking toe en verstuur dan de aanvraag.
                    </div>
                  </div>

                  <div className="edit-mode-actions">
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={cancelEditMode}
                    >
                      Annuleren
                    </button>

                    <button
                      type="button"
                      className="primary-action-btn"
                      onClick={() => void submitCurrentRequest()}
                      disabled={!hasDraftChanges || saving}
                    >
                      {saving
                        ? "Bezig..."
                        : "Wijzigingen ter goedkeuring versturen"}
                    </button>
                  </div>
                </div>

                <textarea
                  className="request-note-textarea"
                  placeholder="Extra verduidelijking voor de andere ouder..."
                  value={requestComment}
                  onChange={(e) => setRequestComment(e.target.value)}
                />

                <div className="section-subtitle" style={{ marginTop: 8 }}>
                  {hasDraftChanges
                    ? "Er zijn niet-verstuurde wijzigingen in je concept."
                    : "Nog geen wijzigingen geselecteerd."}
                </div>
              </section>
            )}

            <section className="calendar-section">
              <div className="calendar-grid">
                {months.map((month) => (
                  <article className="month-card" key={month.month}>
                    <div className="month-card-header">
                      <h2>{month.name}</h2>
                    </div>

                    <div className="weekdays">
                      {WEEKDAYS.map((day, i) => (
                        <div
                          key={`${month.month}-${day}-${i}`}
                          className="weekday"
                        >
                          {day}
                        </div>
                      ))}
                    </div>

                    <div className="days-grid">
                      {month.cells.map((date, i) => {
                        if (!date) {
                          return <div key={i} className="day empty" />;
                        }

                        const key = formatKey(date);
                        const owner = previewData[key];
                        const cfg = owner ? DAY_TYPES[owner] : null;
                        const globalIndex = dayIndexByKey[key];
                        const changedLive = draftData[key] !== data[key];
                        const titleText = changedLive
                          ? `Wijziging: ${data[key] || "leeg"} → ${draftData[key] || "leeg"}`
                          : cfg?.label || "Leeg";

                        return (
                          <button
                            key={key}
                            className={`day ${cfg ? "filled" : ""} ${
                              isEditMode ? "editable" : "readonly"
                            } ${changedLive ? "changed-live" : ""}`}
                            onMouseDown={() => {
                              if (!isEditMode) return;

                              const existingOwner = draftData[key];
                              const mode: DragMode =
                                existingOwner === selected ? "unset" : "set";

                              setIsDragging(true);
                              setDragStartIndex(globalIndex);
                              setDragCurrentIndex(globalIndex);
                              setDragMode(mode);
                              setBaseData(cloneData(draftData));
                            }}
                            onMouseEnter={() => {
                              if (isEditMode && isDragging) {
                                setDragCurrentIndex(globalIndex);
                              }
                            }}
                            style={{
                              backgroundColor: cfg ? cfg.color : "#ffffff",
                              color: cfg ? cfg.textColor : "#334155",
                              borderColor: cfg ? cfg.color : "#e2e8f0",
                              cursor: isEditMode ? "pointer" : "default",
                            }}
                            title={titleText}
                            type="button"
                          >
                            {date.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {isEditMode && (
              <div
                className={`floating-toolbar-overlay ${
                  toolbarCollapsed ? "collapsed" : ""
                }`}
              >
                <div className="floating-toolbar-overlay-inner">
                  <div className="floating-toolbar-overlay-top">
                    <button
                      className="collapse-btn"
                      type="button"
                      onClick={() => setToolbarCollapsed((prev) => !prev)}
                      title={toolbarCollapsed ? "Openen" : "Verbergen"}
                    >
                      {toolbarCollapsed ? "◀" : "▶"}
                    </button>

                    {!toolbarCollapsed && (
                      <button
                        className="danger-link-btn"
                        type="button"
                        onClick={() => setShowClearModal(true)}
                      >
                        Alles wissen
                      </button>
                    )}
                  </div>

                  {!toolbarCollapsed && (
                    <>
                      <div className="floating-toolbar-header">
                        <div className="section-title">Dagtypes</div>
                        <div className="section-subtitle">
                          Enkel zichtbaar in wijzigen modus.
                        </div>
                      </div>

                      <div
                        className="active-pill compact"
                        style={{
                          backgroundColor: DAY_TYPES[selected].color,
                          color: DAY_TYPES[selected].textColor,
                        }}
                      >
                        Actief: {DAY_TYPES[selected].label}
                      </div>

                      <div className="tool-grid compact">
                        {TOOLBAR_TYPES.map((key) => {
                          const cfg = DAY_TYPES[key];
                          const isActive = selected === key;

                          return (
                            <button
                              key={key}
                              className={`tool-btn compact ${
                                isActive ? "active" : ""
                              }`}
                              onClick={() => setSelected(key)}
                              style={{
                                borderColor: isActive ? cfg.color : "#dbe2ea",
                                backgroundColor: isActive
                                  ? cfg.color
                                  : "#ffffff",
                                color: isActive ? cfg.textColor : "#1e293b",
                              }}
                              type="button"
                            >
                              <span className="tool-btn-label">{cfg.label}</span>
                              <span
                                className="tool-btn-dot"
                                style={{
                                  backgroundColor: isActive
                                    ? "rgba(255,255,255,0.45)"
                                    : cfg.color,
                                }}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ==========================================================
            HOOFDSTUK: TAB GOEDKEURINGEN
            ========================================================== */}
        {activeTab === "goedkeuringen" && (
          <section className="logs-card">
            <div className="logs-header">
              <div>
                <div className="section-title">Goedkeuringen</div>
                <div className="section-subtitle">
                  Openstaande voorstellen die nog een beslissing nodig hebben.
                </div>
              </div>

              <button
                className="ghost-btn"
                type="button"
                onClick={() => void loadRequests()}
              >
                Vernieuwen
              </button>
            </div>

            <div className="approval-section">
              <h3 className="approval-heading">Te beoordelen</h3>

              {requestsLoading ? (
                <div className="logs-empty">Aanvragen laden...</div>
              ) : pendingForMe.length === 0 ? (
                <div className="logs-empty">Geen openstaande verzoeken voor jou.</div>
              ) : (
                <div className="logs-list">
                  {pendingForMe.map((request) => (
                    <article
                      id={`request-${request.id}`}
                      key={request.id}
                      className={`log-entry ${
                        highlightedRequestId === request.id
                          ? "highlighted-request"
                          : ""
                      }`}
                    >
                      <div className="log-entry-top">
                        <div className="log-user">{request.requested_by}</div>
                        <div className="log-time">
                          {formatDateTime(request.requested_at)}
                        </div>
                      </div>

                      <div className="log-block">
                        <div className="log-label">Datums</div>
                        <div className="log-content">{request.changed_dates}</div>
                      </div>

                      {request.request_comment && (
                        <div className="log-block">
                          <div className="log-label">Opmerking van aanvrager</div>
                          <div className="log-content">{request.request_comment}</div>
                        </div>
                      )}

                      {renderMiniDiffCalendar(request.old_value, request.new_value)}

                      <div className="log-block" style={{ marginTop: 12 }}>
                        <div className="log-label">Jouw reactie</div>
                        <textarea
                          className="request-note-textarea small"
                          placeholder="Optionele uitleg bij goedkeuren of weigeren..."
                          value={reviewComments[request.id] || ""}
                          onChange={(e) =>
                            setReviewComments((prev) => ({
                              ...prev,
                              [request.id]: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="approve-actions">
                        <button
                          className="approve-btn"
                          type="button"
                          onClick={() => void approveRequest(request)}
                        >
                          Goedkeuren
                        </button>

                        <button
                          className="reject-btn"
                          type="button"
                          onClick={() => void rejectRequest(request)}
                        >
                          Weigeren
                        </button>

                        <button
                          className="delete-btn"
                          type="button"
                          onClick={() => openDeleteRequestModal(request)}
                        >
                          Verwijderen
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="approval-section">
              <h3 className="approval-heading">Mijn openstaande aanvragen</h3>

              {requestsLoading ? (
                <div className="logs-empty">Aanvragen laden...</div>
              ) : myPendingRequests.length === 0 ? (
                <div className="logs-empty">Je hebt geen openstaande aanvragen.</div>
              ) : (
                <div className="logs-list">
                  {myPendingRequests.map((request) => (
                    <article
                      id={`request-${request.id}`}
                      key={request.id}
                      className={`log-entry ${
                        highlightedRequestId === request.id
                          ? "highlighted-request"
                          : ""
                      }`}
                    >
                      <div className="log-entry-top">
                        <div className="log-user">Aangevraagd door jou</div>
                        <div className="log-time">
                          {formatDateTime(request.requested_at)}
                        </div>
                      </div>

                      <div className="log-block">
                        <div className="log-label">Datums</div>
                        <div className="log-content">{request.changed_dates}</div>
                      </div>

                      {request.request_comment && (
                        <div className="log-block">
                          <div className="log-label">Jouw opmerking</div>
                          <div className="log-content">{request.request_comment}</div>
                        </div>
                      )}

                      {renderMiniDiffCalendar(request.old_value, request.new_value)}

                      <div className="request-row-actions">
                        <div className="pending-pill">Wacht op goedkeuring</div>

                        <button
                          className="delete-btn"
                          type="button"
                          onClick={() => openDeleteRequestModal(request)}
                        >
                          Verwijderen
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="approval-section">
              <h3 className="approval-heading">Afgehandelde verzoeken</h3>

              {requestsLoading ? (
                <div className="logs-empty">Aanvragen laden...</div>
              ) : handledRequests.length === 0 ? (
                <div className="logs-empty">Nog geen afgehandelde verzoeken.</div>
              ) : (
                <div className="logs-list">
                  {handledRequests.map((request) => (
                    <article
                      id={`request-${request.id}`}
                      key={request.id}
                      className={`log-entry ${
                        highlightedRequestId === request.id
                          ? "highlighted-request"
                          : ""
                      }`}
                    >
                      <div className="log-entry-top">
                        <div className="log-user">{request.requested_by}</div>
                        <div className="log-time">
                          Aangevraagd: {formatDateTime(request.requested_at)}
                        </div>
                      </div>

                      <div className="handled-top-row">
                        <span
                          className={`status-pill ${
                            request.status === "approved"
                              ? "status-approved"
                              : "status-rejected"
                          }`}
                        >
                          {getStatusLabel(request.status)}
                        </span>

                        {request.reviewed_at && (
                          <span className="handled-meta">
                            Beoordeeld op {formatDateTime(request.reviewed_at)}
                          </span>
                        )}
                      </div>

                      <div className="log-block">
                        <div className="log-label">Datums</div>
                        <div className="log-content">{request.changed_dates}</div>
                      </div>

                      {request.request_comment && (
                        <div className="log-block">
                          <div className="log-label">Opmerking van aanvrager</div>
                          <div className="log-content">{request.request_comment}</div>
                        </div>
                      )}

                      {request.review_comment && (
                        <div className="log-block">
                          <div className="log-label">Opmerking bij beoordeling</div>
                          <div className="log-content">{request.review_comment}</div>
                        </div>
                      )}

                      {request.reviewed_by && (
                        <div className="log-block">
                          <div className="log-label">Beoordeeld door</div>
                          <div className="log-content">{request.reviewed_by}</div>
                        </div>
                      )}

                      {renderMiniDiffCalendar(request.old_value, request.new_value)}

                      <div className="approve-actions">
                        <button
                          className="delete-btn"
                          type="button"
                          onClick={() => openDeleteRequestModal(request)}
                        >
                          Verwijderen
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* ==========================================================
          HOOFDSTUK: MODAL - ALLES WISSEN
          ========================================================== */}
      {showClearModal && (
        <div className="modal-backdrop">
          <div className="confirm-modal">
            <h3>Alles wissen?</h3>
            <p>
              Ben je zeker dat je in dit concept alle ingevulde dagen wilt leegmaken?
              Daarna moet je nog steeds zelf op
              <strong> wijzigingen ter goedkeuring versturen </strong>
              klikken om de aanvraag echt te verzenden.
            </p>

            <div className="confirm-actions">
              <button
                className="ghost-btn"
                type="button"
                onClick={() => setShowClearModal(false)}
              >
                Annuleren
              </button>

              <button
                className="danger-btn"
                type="button"
                onClick={clearAllConfirmed}
              >
                Ja, concept leegmaken
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================================
          HOOFDSTUK: MODAL - VERZOEK VERWIJDEREN
          ========================================================== */}
      {deleteRequestTarget && (
        <div className="modal-backdrop">
          <div className="confirm-modal confirm-modal-delete">
            <div className="confirm-modal-icon danger">🗑️</div>

            <h3>Verzoek verwijderen?</h3>

            <p>
              Ben je zeker dat je dit verzoek wilt verwijderen? Deze actie kan
              niet ongedaan gemaakt worden.
            </p>

            <div className="delete-request-summary">
              <div className="delete-request-row">
                <span className="delete-request-label">Aangevraagd door</span>
                <span className="delete-request-value">
                  {deleteRequestTarget.requested_by}
                </span>
              </div>

              <div className="delete-request-row">
                <span className="delete-request-label">Datums</span>
                <span className="delete-request-value">
                  {deleteRequestTarget.changed_dates}
                </span>
              </div>

              {deleteRequestTarget.request_comment && (
                <div className="delete-request-row">
                  <span className="delete-request-label">Opmerking</span>
                  <span className="delete-request-value">
                    {deleteRequestTarget.request_comment}
                  </span>
                </div>
              )}
            </div>

            <div className="confirm-actions">
              <button
                className="ghost-btn"
                type="button"
                onClick={closeDeleteRequestModal}
                disabled={deletingRequest}
              >
                Annuleren
              </button>

              <button
                className="danger-btn"
                type="button"
                onClick={() => void confirmDeleteRequest()}
                disabled={deletingRequest}
              >
                {deletingRequest ? "Bezig..." : "Ja, verwijderen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}