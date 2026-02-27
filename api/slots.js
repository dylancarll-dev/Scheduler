// api/slots.js — GET /api/slots?date=YYYY-MM-DD&address=...
// Vercel serverless function — uses Google service account (no customer auth needed)
import { google } from "googleapis";

const WORK_START_HOUR = 8;
const WORK_END_HOUR = 18;
const ESTIMATE_DURATION_MIN = 30;
const BUFFER_MIN = 15;

async function getDriveMinutes(origin, destination) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const url =
    "https://maps.googleapis.com/maps/api/distancematrix/json?" +
    new URLSearchParams({
      origins: origin,
      destinations: destination,
      departure_time: "now",
      traffic_model: "best_guess",
      key,
    });
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    const element = data.rows?.[0]?.elements?.[0];
    if (element?.status === "OK") {
      const seconds =
        element.duration_in_traffic?.value || element.duration?.value || 1800;
      return Math.ceil(seconds / 60);
    }
  } catch (_) {
    // fall through to default
  }
  return 30;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { date, address } = req.query;
  if (!date) return res.status(400).json({ error: "Missing date parameter" });

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    const calendar = google.calendar({ version: "v3", auth });
    const calendarId = process.env.GOOGLE_CALENDAR_ID;

    // Build day boundaries in local time using the date string directly
    const dayStart = new Date(`${date}T00:00:00`);
    dayStart.setHours(WORK_START_HOUR, 0, 0, 0);
    const dayEnd = new Date(`${date}T00:00:00`);
    dayEnd.setHours(WORK_END_HOUR, 0, 0, 0);

    const eventsResp = await calendar.events.list({
      calendarId,
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = eventsResp.data.items || [];
    const booked = events
      .filter((e) => e.start?.dateTime)
      .map((e) => ({
        start: new Date(e.start.dateTime),
        end: new Date(e.end.dateTime),
        location: e.location || null,
      }))
      .sort((a, b) => a.start - b.start);

    const slots = [];
    let cursor = new Date(dayStart);

    while (cursor < dayEnd) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(
        cursor.getTime() + ESTIMATE_DURATION_MIN * 60000
      );

      if (slotEnd > dayEnd) break;

      // Check overlap with existing bookings plus buffer
      const overlaps = booked.some((b) => {
        const bufferedEnd = new Date(b.end.getTime() + BUFFER_MIN * 60000);
        return slotStart < bufferedEnd && slotEnd > b.start;
      });

      if (!overlaps) {
        const preceding = booked.filter((b) => b.end <= slotStart).slice(-1)[0];
        const following = booked.find((b) => b.start >= slotEnd);

        let feasible = true;
        let travelNote = null;

        if (preceding?.location && address) {
          const driveMin = await getDriveMinutes(preceding.location, address);
          const requiredStart = new Date(
            preceding.end.getTime() + driveMin * 60000
          );
          if (slotStart < requiredStart) {
            feasible = false;
          } else {
            travelNote = `~${driveMin} min drive from prior appointment`;
          }
        }

        if (feasible && following?.location && address) {
          const driveToNext = await getDriveMinutes(address, following.location);
          const mustLeaveBy = new Date(
            following.start.getTime() - driveToNext * 60000
          );
          if (slotEnd > mustLeaveBy) {
            feasible = false;
          }
        }

        if (feasible) {
          slots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            travelNote,
          });
        }
      }

      cursor = new Date(cursor.getTime() + 30 * 60000);
    }

    res.status(200).json({ slots });
  } catch (err) {
    console.error("slots error:", err);
    res.status(500).json({ error: "Failed to fetch slots" });
  }
}
