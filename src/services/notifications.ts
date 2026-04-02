import { supabase } from "../supabase";

export const APP_URL = "https://co-ouderschap-kalender.vercel.app";

export const STEPHAN_EMAIL = "stephanjacob84@icloud.com";
export const WING_EMAIL = "stephanjacob84@icloud.com";

export function getOtherParentEmail(email: string) {
  return email === STEPHAN_EMAIL ? WING_EMAIL : STEPHAN_EMAIL;
}

export function buildRequestLink(requestId: string) {
  return `${APP_URL}?requestId=${requestId}`;
}

type MailType = "new" | "approved" | "rejected";

type BuildEmailParams = {
  type: MailType;
  requestId: string;
  requester: string;
  dates: string[];
  comment?: string | null;
  reviewedBy?: string | null;
};

export function buildEmailSubject(type: MailType) {
  if (type === "new") return "Nieuw wijzigingsverzoek";
  if (type === "approved") return "Je verzoek werd goedgekeurd";
  return "Je verzoek werd afgekeurd";
}

export function buildEmailHtml({
  type,
  requestId,
  requester,
  dates,
  comment,
  reviewedBy,
}: BuildEmailParams) {
  const link = buildRequestLink(requestId);

  let title = "";
  let intro = "";

  if (type === "new") {
    title = "Nieuw wijzigingsverzoek";
    intro = "Er is een nieuw wijzigingsverzoek ingediend.";
  } else if (type === "approved") {
    title = "Je verzoek werd goedgekeurd";
    intro = "Je wijzigingsverzoek werd goedgekeurd.";
  } else {
    title = "Je verzoek werd afgekeurd";
    intro = "Je wijzigingsverzoek werd afgekeurd.";
  }

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
      <h2 style="margin-bottom: 12px;">${title}</h2>

      <p>${intro}</p>

      <p><strong>Aangevraagd door:</strong> ${requester}</p>
      <p><strong>Datums:</strong> ${dates.join(", ")}</p>
      <p><strong>Opmerking:</strong> ${comment || "-"}</p>
      ${
        reviewedBy
          ? `<p><strong>Beoordeeld door:</strong> ${reviewedBy}</p>`
          : ""
      }

      <br />

      <a
        href="${link}"
        style="
          display: inline-block;
          padding: 12px 20px;
          background-color: #1e293b;
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
        "
      >
        Open dit verzoek
      </a>

      <p style="margin-top: 20px;">
        Of kopieer deze link:<br />
        <a href="${link}">${link}</a>
      </p>
    </div>
  `;
}

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

export async function sendNewRequestNotification(params: {
  currentUserEmail: string;
  requestId: string;
  changedDates: string[];
  comment?: string | null;
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
    }),
  });
}

export async function sendApprovedNotification(params: {
  to: string;
  requestId: string;
  requester: string;
  changedDates: string[];
  comment?: string | null;
  reviewedBy: string;
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
    }),
  });
}

export async function sendRejectedNotification(params: {
  to: string;
  requestId: string;
  requester: string;
  changedDates: string[];
  comment?: string | null;
  reviewedBy: string;
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
    }),
  });
}