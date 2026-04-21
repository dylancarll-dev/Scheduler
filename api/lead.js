// api/lead.js — POST /api/lead
// Vercel serverless function — captures leads to Google Sheets + Telegram notification
import { google } from "googleapis";

function sanitize(value, maxLen = 300) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, maxLen);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const lead = {
    timestamp: new Date().toISOString(),
    name: sanitize(req.body?.name, 200),
    phone: sanitize(req.body?.phone, 30),
    email: sanitize(req.body?.email, 200),
    serviceType: sanitize(req.body?.serviceType, 100),
    source: sanitize(req.body?.source, 100),
    sqft: sanitize(String(req.body?.sqft || ""), 10),
    finish: sanitize(req.body?.finish, 50),
    condition: sanitize(req.body?.condition, 100),
    priceEstimate: sanitize(req.body?.priceEstimate, 50),
    address: sanitize(req.body?.address, 300),
    city: sanitize(req.body?.city, 100),
    notes: sanitize(req.body?.notes, 1000),
  };

  if (!lead.name && !lead.phone && !lead.email) {
    return res.status(400).json({ error: "At least name, phone, or email required" });
  }

  try {
    // Write to Google Sheet
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.Leads_Sheet_ID || "1XTDHtOSWppV8-F1WaMBPhoxrUxsjQhS3vRZpNLHVoyY";

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Leads!A:M",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          lead.timestamp, lead.name, lead.phone, lead.email, lead.serviceType,
          lead.source, lead.sqft, lead.finish, lead.condition, lead.priceEstimate,
          lead.address, lead.city, lead.notes,
        ]],
      },
    });

    // Send Telegram notification
    const botToken = process.env.Telegram_Bot_Token || "7877190069:AAGY9Rd38Z4sVUX7V0HajTeurZtSIB9S8aw";
    const chatId = process.env.Telegram_Chat_ID || "7583599972";

    if (botToken && chatId) {
      const lines = ["🐸 NEW LEAD", ""];
      if (lead.name) lines.push(`Name: ${lead.name}`);
      if (lead.phone) lines.push(`Phone: ${lead.phone}`);
      if (lead.email) lines.push(`Email: ${lead.email}`);
      if (lead.serviceType) lines.push(`Service: ${lead.serviceType}`);
      if (lead.sqft) lines.push(`Sqft: ${lead.sqft}`);
      if (lead.finish) lines.push(`Finish: ${lead.finish}`);
      if (lead.condition) lines.push(`Condition: ${lead.condition}`);
      if (lead.priceEstimate) lines.push(`Estimate: ${lead.priceEstimate}`);
      if (lead.address) lines.push(`Address: ${lead.address}`);
      if (lead.city) lines.push(`City: ${lead.city}`);
      if (lead.notes) lines.push(`Notes: ${lead.notes}`);
      lines.push("", `Source: ${lead.source}`);

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: lines.join("\n"),
        }),
      }).catch(() => {}); // Don't fail the lead if Telegram is down
    }

    // Push to Pipedrive CRM
    const pipedriveToken = process.env.PIPEDRIVE_API_TOKEN;
    if (pipedriveToken) {
      try {
        const pdBase = 'https://api.pipedrive.com/v1';
        const pdHeaders = { 'Content-Type': 'application/json' };

        // 1. Create Person
        const personPayload = { name: lead.name };
        if (lead.phone) personPayload.phone = [{ value: lead.phone, primary: true }];
        if (lead.email) personPayload.email = [{ value: lead.email, primary: true }];

        const personRes = await fetch(`${pdBase}/persons?api_token=${pipedriveToken}`, {
          method: 'POST', headers: pdHeaders, body: JSON.stringify(personPayload),
        });
        const personData = await personRes.json();
        const personId = personData.success ? personData.data.id : null;

        // 2. Create Deal
        const serviceLabel = lead.serviceType || 'Epoxy Flooring';
        let dealTitle = `${lead.name} - ${serviceLabel}`;
        if (lead.city) dealTitle += ` (${lead.city})`;

        const dealPayload = { title: dealTitle, label: 'Website' };
        if (personId) dealPayload.person_id = personId;
        if (process.env.PIPEDRIVE_STAGE_ID) dealPayload.stage_id = parseInt(process.env.PIPEDRIVE_STAGE_ID, 10);
        if (process.env.PIPEDRIVE_LABEL_ID) dealPayload.label = parseInt(process.env.PIPEDRIVE_LABEL_ID, 10);

        const dealRes = await fetch(`${pdBase}/deals?api_token=${pipedriveToken}`, {
          method: 'POST', headers: pdHeaders, body: JSON.stringify(dealPayload),
        });
        const dealData = await dealRes.json();
        const dealId = dealData.success ? dealData.data.id : null;

        // 3. Add note
        if (dealId) {
          const noteLines = ['Website Lead - Frog Splash Coatings', ''];
          if (lead.phone)         noteLines.push(`Phone: ${lead.phone}`);
          if (lead.email)         noteLines.push(`Email: ${lead.email}`);
          if (lead.serviceType)   noteLines.push(`Service: ${lead.serviceType}`);
          if (lead.sqft)          noteLines.push(`Sqft: ${lead.sqft}`);
          if (lead.finish)        noteLines.push(`Finish: ${lead.finish}`);
          if (lead.condition)     noteLines.push(`Condition: ${lead.condition}`);
          if (lead.priceEstimate) noteLines.push(`Estimate: ${lead.priceEstimate}`);
          if (lead.address)       noteLines.push(`Address: ${lead.address}`);
          if (lead.city)          noteLines.push(`City: ${lead.city}`);
          if (lead.notes)         noteLines.push(`Notes: ${lead.notes}`);
          noteLines.push('', `Source: ${lead.source}`, `Submitted: ${lead.timestamp}`);

          await fetch(`${pdBase}/notes?api_token=${pipedriveToken}`, {
            method: 'POST', headers: pdHeaders,
            body: JSON.stringify({ deal_id: dealId, content: noteLines.join('\n') }),
          });
        }
      } catch (pdErr) {
        console.error('Pipedrive error:', pdErr.message);
      }
    }

    res.status(200).json({ success: true, message: "Lead captured" });
  } catch (err) {
    console.error("lead error:", err.message);
    res.status(500).json({ error: "Failed to capture lead", detail: err.message });
  }
}
