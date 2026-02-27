// api/book.js — POST /api/book
// Vercel serverless function — creates a Google Calendar event via service account
import { google } from "googleapis";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    name,
    phone,
    email,
    address,
    jobType,
    floorCondition,
    hearAboutUs,
    notes,
    slotStart,
    slotEnd,
  } = req.body;

  if (!name || !phone || !address || !jobType || !slotStart || !slotEnd) {
    return res.status(400).json({ error: "Missing required fields" });
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
      attendees: email ? [{ email }] : [],
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
    console.error("book error:", err);
    res.status(500).json({ error: "Failed to create booking" });
  }
}
