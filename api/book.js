// api/book.js — POST /api/book
// Vercel serverless function — creates a Google Calendar event via service account
import { google } from "googleapis";

// Strip control characters, trim, and enforce a max length
function sanitize(value, maxLen = 300) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, maxLen);
}

// Validate that a string is a parseable ISO datetime containing "T"
function isValidISODateTime(str) {
  if (typeof str !== "string" || !str.includes("T")) return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Sanitize all string inputs
  const name         = sanitize(req.body?.name);
  const phone        = sanitize(req.body?.phone, 30);
  const email        = sanitize(req.body?.email, 200);
  const address      = sanitize(req.body?.address, 300);
  const jobType      = sanitize(req.body?.jobType, 100);
  const floorCondition = sanitize(req.body?.floorCondition, 100);
  const hearAboutUs  = sanitize(req.body?.hearAboutUs, 100);
  const notes        = sanitize(req.body?.notes, 1000);
  const slotStart    = sanitize(req.body?.slotStart, 50);
  const slotEnd      = sanitize(req.body?.slotEnd, 50);

  // Required field check
  if (!name || !phone || !address || !jobType || !slotStart || !slotEnd) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Validate datetime formats
  if (!isValidISODateTime(slotStart) || !isValidISODateTime(slotEnd)) {
    return res.status(400).json({ error: "Invalid slot time format" });
  }

  // Ensure slot is logically valid (start before end, max 4 hours)
  const startMs = new Date(slotStart).getTime();
  const endMs   = new Date(slotEnd).getTime();
  if (endMs <= startMs || endMs - startMs > 4 * 60 * 60 * 1000) {
    return res.status(400).json({ error: "Invalid slot duration" });
  }

  // Reject bookings more than 60 days out or in the past
  const now = Date.now();
  if (startMs < now - 60000 || startMs > now + 60 * 24 * 60 * 60 * 1000) {
    return res.status(400).json({ error: "Slot is outside the allowed booking window" });
  }

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    const calendar = google.calendar({ version: "v3", auth });
    const calendarId = process.env.GOOGLE_CALENDAR_ID;

    const descriptionLines = [
      `Service: ${jobType}`,
      floorCondition ? `Floor Condition: ${floorCondition}` : null,
      `Phone: ${phone}`,
      email ? `Email: ${email}` : null,
      hearAboutUs ? `Heard About Us: ${hearAboutUs}` : null,
      notes ? `Notes: ${notes}` : null,
    ].filter(Boolean);

    const event = {
      summary: `Estimate – ${name}`,
      description: descriptionLines.join("\n"),
      location: address,
      start: { dateTime: slotStart },
      end: { dateTime: slotEnd },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 60 },
          { method: "popup", minutes: 30 },
        ],
      },
    };

    await calendar.events.insert({ calendarId, resource: event });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("book error:", err.message);
    res.status(500).json({ error: "Failed to create booking" });
  }
}
