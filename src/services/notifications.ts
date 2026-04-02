import { supabase } from "../supabase";

// ==========================================================
// HOOFDSTUK: BASIS CONFIGURATIE
// ==========================================================

export const APP_URL = "https://co-ouderschap-kalender.vercel.app";

export const STEPHAN_EMAIL = "stephanjacob84@icloud.com";
export const WING_EMAIL = "juztmuzik@me.com";

// ==========================================================
// HOOFDSTUK: TYPES
// ==========================================================

type MailType = "new" | "approved" | "rejected" | "deleted";

type BuildEmailParams = {
  type: MailType;
  requestId: string;
  requester: string;
  dates: string[];
  comment?: string | null;
  reviewedBy?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
};

type ParsedMap = Record<string, string>;

// ==========================================================
// HOOFDSTUK: DAGTYPE STYLING
// ==========================================================

const DAY_TYPE_STYLES: Record<
  string,
  { label: string; shortLabel: string; color: string; textColor: string }
> = {
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
  leeg: {
    label: "Leeg",
    shortLabel: "—",
    color: "#ffffff",
    textColor: "#475569",
  },
};

const WEEKDAYS = ["M", "D", "W", "D", "V", "Z", "Z"];

// ==========================================================
// HOOFDSTUK: ALGEMENE HELPERS
// ==========================================================

// ------------------------------
// SUB: Andere ouder bepalen
// ------------------------------

export function getOtherParentEmail(email: string) {
  return email === STEPHAN_EMAIL ? WING_EMAIL : STEPHAN_EMAIL;
}

// ------------------------------
// SUB: Directe link naar verzoek
// ------------------------------

export function buildRequestLink(requestId: string) {
  return `${APP_URL}?requestId=${requestId}`;
}

// ------------------------------
// SUB: E-mail onderwerp
// ------------------------------

export function buildEmailSubject(type: MailType) {
  if (type === "new") return "Nieuw wijzigingsverzoek";
  if (type === "approved") return "Je verzoek werd goedgekeurd";
  if (type === "rejected") return "Je verzoek werd afgekeurd";
  return "Een verzoek werd verwijderd";
}

// ------------------------------
// SUB: Datum formatteren
// ------------------------------

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-BE", {
    day: "2-digit",
    month: "2-digit",
  });
}

// ------------------------------
// SUB: Waarde string omzetten naar map
// ------------------------------

function parseValueMap(value: string | null | undefined): ParsedMap {
  const map: ParsedMap = {};
  if (!value) return map;

  value.split(" | ").forEach((entry) => {
    const firstColon = entry.indexOf(":");
    if (firstColon === -1) return;

    const date = entry.slice(0, firstColon).trim();
    const val = entry.slice(firstColon + 1).trim();

    if (date) {
      map[date] = val || "leeg";
    }
  });

  return map;
}

// ------------------------------
// SUB: Maandag van een week bepalen
// ------------------------------

function getWeekStart(dateStr: string) {
  const d = new Date(dateStr);
  const copy = new Date(d);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  return copy.toISOString().slice(0, 10);
}

// ==========================================================
// HOOFDSTUK: MINI KALENDER HTML
// ==========================================================

// ------------------------------
// SUB: 1 mini dag renderen
// ------------------------------

function renderMiniDayHtml(dateStr: string, oldType?: string, newType?: string) {
  const oldStyle = DAY_TYPE_STYLES[oldType || "leeg"] || DAY_TYPE_STYLES.leeg;
  const newStyle = DAY_TYPE_STYLES[newType || "leeg"] || DAY_TYPE_STYLES.leeg;
  const changed = (oldType || "leeg") !== (newType || "leeg");

  return `
    <td style="padding:4px; vertical-align:top;">
      <div style="
        border:${changed ? "2px solid #f87171" : "1px solid #dbe2ea"};
        border-radius:10px;
        overflow:hidden;
        background:#ffffff;
        min-width:84px;
      ">
        <div style="
          text-align:center;
          font-size:11px;
          font-weight:700;
          color:#475569;
          padding:6px 4px;
          background:#ffffff;
        ">
          ${dateStr.slice(8)}
        </div>

        <div style="display:flex; height:22px;">
          <div style="flex:1; background:${oldStyle.color};"></div>
          <div style="flex:1; background:${newStyle.color};"></div>
        </div>

        <div style="
          display:flex;
          justify-content:space-between;
          gap:4px;
          padding:6px 6px 7px;
          font-size:10px;
          color:#475569;
          background:#ffffff;
          white-space:nowrap;
        ">
          <span>${oldStyle.shortLabel}</span>
          <span>→</span>
          <span>${newStyle.shortLabel}</span>
        </div>
      </div>
    </td>
  `;
}

// ------------------------------
// SUB: Mini kalender renderen
// ------------------------------

function renderMiniCalendarHtml(
  oldValue: string | null | undefined,
  newValue: string | null | undefined
) {
  const oldMap = parseValueMap(oldValue);
  const newMap = parseValueMap(newValue);

  const allDates = Array.from(
    new Set([...Object.keys(oldMap), ...Object.keys(newMap)])
  ).sort();

  if (allDates.length === 0) return "";

  const weeks: Record<string, string[]> = {};

  allDates.forEach((dateStr) => {
    const weekStart = getWeekStart(dateStr);
    if (!weeks[weekStart]) weeks[weekStart] = [];
    weeks[weekStart].push(dateStr);
  });

  const weekBlocks = Object.entries(weeks)
    .map(([weekStart]) => {
      const weekStartDate = new Date(weekStart);

      const dayCells = Array.from({ length: 7 })
        .map((_, i) => {
          const d = new Date(weekStartDate);
          d.setDate(d.getDate() + i);
          const key = d.toISOString().slice(0, 10);

          return renderMiniDayHtml(key, oldMap[key], newMap[key]);
        })
        .join("");

      const headCells = WEEKDAYS.map(
        (d) => `
          <td style="
            padding:0 4px 6px;
            text-align:center;
            font-size:11px;
            font-weight:700;
            color:#64748b;
          ">
            ${d}
          </td>
        `
      ).join("");

      return `
        <div style="
          margin-top:14px;
          padding:14px;
          border:1px solid #e8eef5;
          border-radius:16px;
          background:#f8fafc;
        ">
          <div style="
            font-size:12px;
            font-weight:700;
            color:#64748b;
            margin-bottom:8px;
          ">
            Week van ${weekStart.slice(5)}
          </div>

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
            <tr>
              ${headCells}
            </tr>
            <tr>
              ${dayCells}
            </tr>
          </table>
        </div>
      `;
    })
    .join("");

  return `
    <div style="margin-top:18px;">
      <div style="
        font-size:13px;
        font-weight:800;
        color:#64748b;
        text-transform:uppercase;
        letter-spacing:0.04em;
        margin-bottom:8px;
      ">
        Kalenderoverzicht wijziging
      </div>

      <div style="
        display:flex;
        align-items:center;
        gap:12px;
        font-size:12px;
        color:#475569;
        margin-bottom:10px;
        flex-wrap:wrap;
      ">
        <span><strong>Links</strong> = oude situatie</span>
        <span><strong>Rechts</strong> = nieuwe situatie</span>
      </div>

      ${weekBlocks}
    </div>
  `;
}

// ==========================================================
// HOOFDSTUK: EMAIL HTML OPBOUW
// ==========================================================

// ------------------------------
// SUB: Titel en intro bepalen
// ------------------------------

function getEmailTexts(type: MailType) {
  if (type === "new") {
    return {
      title: "Nieuw wijzigingsverzoek",
      intro: "Er is een nieuw wijzigingsverzoek ingediend.",
      accent: "#1d4ed8",
      badgeBg: "#dbeafe",
      badgeText: "#1d4ed8",
    };
  }

  if (type === "approved") {
    return {
      title: "Je verzoek werd goedgekeurd",
      intro: "Je wijzigingsverzoek werd goedgekeurd.",
      accent: "#067647",
      badgeBg: "#ecfdf3",
      badgeText: "#067647",
    };
  }

  if (type === "rejected") {
    return {
      title: "Je verzoek werd afgekeurd",
      intro: "Je wijzigingsverzoek werd afgekeurd.",
      accent: "#b42318",
      badgeBg: "#fef3f2",
      badgeText: "#b42318",
    };
  }

  return {
    title: "Een verzoek werd verwijderd",
    intro: "Een wijzigingsverzoek werd verwijderd.",
    accent: "#9a6700",
    badgeBg: "#fff7e8",
    badgeText: "#9a6700",
  };
}

// ------------------------------
// SUB: Email HTML maken
// ------------------------------

export function buildEmailHtml({
  type,
  requestId,
  requester,
  dates,
  comment,
  reviewedBy,
  oldValue,
  newValue,
}: BuildEmailParams) {
  const link = buildRequestLink(requestId);
  const texts = getEmailTexts(type);
  const miniCalendarHtml = renderMiniCalendarHtml(oldValue, newValue);

  const formattedDates = dates
    .slice()
    .sort()
    .map((date) => formatShortDate(date))
    .join(", ");

  return `
    <div style="
      margin:0;
      padding:24px 12px;
      background:#f4f7fb;
      font-family:Arial, Helvetica, sans-serif;
      color:#1e293b;
    ">
      <div style="
        max-width:760px;
        margin:0 auto;
        background:#ffffff;
        border:1px solid #e8eef5;
        border-radius:24px;
        overflow:hidden;
      ">
        <div style="
          padding:24px 28px;
          background:linear-gradient(135deg, #1e293b, #334155);
          color:#ffffff;
        ">
          <div style="
            display:inline-block;
            padding:8px 12px;
            border-radius:999px;
            background:${texts.badgeBg};
            color:${texts.badgeText};
            font-size:12px;
            font-weight:800;
            margin-bottom:14px;
          ">
            ${texts.title}
          </div>

          <h1 style="
            margin:0;
            font-size:36px;
            line-height:1.1;
            letter-spacing:-0.03em;
          ">
            ${texts.title}
          </h1>

          <p style="
            margin:12px 0 0;
            font-size:16px;
            line-height:1.5;
            color:#e2e8f0;
          ">
            ${texts.intro}
          </p>
        </div>

        <div style="padding:28px;">
          <div style="
            display:grid;
            gap:14px;
          ">
            <div>
              <div style="
                font-size:12px;
                font-weight:800;
                color:#64748b;
                text-transform:uppercase;
                letter-spacing:0.05em;
                margin-bottom:4px;
              ">
                Aangevraagd door
              </div>
              <div style="font-size:18px; font-weight:700; color:#1e293b;">
                ${requester}
              </div>
            </div>

            <div>
              <div style="
                font-size:12px;
                font-weight:800;
                color:#64748b;
                text-transform:uppercase;
                letter-spacing:0.05em;
                margin-bottom:4px;
              ">
                Datums
              </div>
              <div style="font-size:18px; font-weight:700; color:#1e293b;">
                ${formattedDates || dates.join(", ")}
              </div>
            </div>

            <div>
              <div style="
                font-size:12px;
                font-weight:800;
                color:#64748b;
                text-transform:uppercase;
                letter-spacing:0.05em;
                margin-bottom:4px;
              ">
                Opmerking
              </div>
              <div style="
                font-size:18px;
                line-height:1.5;
                color:#1e293b;
              ">
                ${comment || "-"}
              </div>
            </div>

            ${
              reviewedBy
                ? `
                  <div>
                    <div style="
                      font-size:12px;
                      font-weight:800;
                      color:#64748b;
                      text-transform:uppercase;
                      letter-spacing:0.05em;
                      margin-bottom:4px;
                    ">
                      Beoordeeld door
                    </div>
                    <div style="font-size:18px; font-weight:700; color:#1e293b;">
                      ${reviewedBy}
                    </div>
                  </div>
                `
                : ""
            }
          </div>

          ${miniCalendarHtml}

          <div style="margin-top:26px;">
            <a
              href="${link}"
              style="
                display:inline-block;
                padding:14px 22px;
                background:#1e293b;
                color:#ffffff;
                text-decoration:none;
                border-radius:14px;
                font-weight:800;
                font-size:16px;
              "
            >
              Open dit verzoek
            </a>
          </div>

          <div style="
            margin-top:24px;
            padding-top:20px;
            border-top:1px solid #e8eef5;
          ">
            <div style="
              font-size:12px;
              font-weight:800;
              color:#64748b;
              text-transform:uppercase;
              letter-spacing:0.05em;
              margin-bottom:6px;
            ">
              Rechtstreekse link
            </div>

            <a
              href="${link}"
              style="
                color:${texts.accent};
                font-size:15px;
                line-height:1.6;
                word-break:break-word;
                text-decoration:underline;
              "
            >
              ${link}
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ==========================================================
// HOOFDSTUK: MAIL VERSTUREN
// ==========================================================

// ------------------------------
// SUB: Algemene function invoke
// ------------------------------

export async function sendMailNotification(params: {
  to: string;
  subject: string;
  html: string;
}) {
  try {
    const { error } = await supabase.functions.invoke("send-notification", {
      body: params,
    });

    if (error) {
      console.error("Mail notification fout:", error);
    }
  } catch (error) {
    console.error("Mail notification exception:", error);
  }
}

// ------------------------------
// SUB: Nieuw verzoek versturen
// ------------------------------

export async function sendNewRequestNotification(params: {
  currentUserEmail: string;
  requestId: string;
  changedDates: string[];
  comment?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}) {
  await sendMailNotification({
    to: getOtherParentEmail(params.currentUserEmail),
    subject: buildEmailSubject("new"),
    html: buildEmailHtml({
      type: "new",
      requestId: params.requestId,
      requester: params.currentUserEmail,
      dates: params.changedDates,
      comment: params.comment,
      oldValue: params.oldValue,
      newValue: params.newValue,
    }),
  });
}

// ------------------------------
// SUB: Goedkeuring mail versturen
// ------------------------------

export async function sendApprovedNotification(params: {
  to: string;
  requestId: string;
  requester: string;
  changedDates: string[];
  comment?: string | null;
  reviewedBy: string;
  oldValue?: string | null;
  newValue?: string | null;
}) {
  await sendMailNotification({
    to: params.to,
    subject: buildEmailSubject("approved"),
    html: buildEmailHtml({
      type: "approved",
      requestId: params.requestId,
      requester: params.requester,
      dates: params.changedDates,
      comment: params.comment,
      reviewedBy: params.reviewedBy,
      oldValue: params.oldValue,
      newValue: params.newValue,
    }),
  });
}

// ------------------------------
// SUB: Afkeuring mail versturen
// ------------------------------

export async function sendRejectedNotification(params: {
  to: string;
  requestId: string;
  requester: string;
  changedDates: string[];
  comment?: string | null;
  reviewedBy: string;
  oldValue?: string | null;
  newValue?: string | null;
}) {
  await sendMailNotification({
    to: params.to,
    subject: buildEmailSubject("rejected"),
    html: buildEmailHtml({
      type: "rejected",
      requestId: params.requestId,
      requester: params.requester,
      dates: params.changedDates,
      comment: params.comment,
      reviewedBy: params.reviewedBy,
      oldValue: params.oldValue,
      newValue: params.newValue,
    }),
  });
}

// ------------------------------
// SUB: Verwijdering mail versturen
// ------------------------------

export async function sendDeletedNotification(params: {
  to: string;
  requestId: string;
  requester: string;
  changedDates: string[];
  comment?: string | null;
  reviewedBy?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}) {
  await sendMailNotification({
    to: params.to,
    subject: buildEmailSubject("deleted"),
    html: buildEmailHtml({
      type: "deleted",
      requestId: params.requestId,
      requester: params.requester,
      dates: params.changedDates,
      comment: params.comment,
      reviewedBy: params.reviewedBy,
      oldValue: params.oldValue,
      newValue: params.newValue,
    }),
  });
}