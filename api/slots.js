// api/slots.js — GET /api/slots?date=YYYY-MM-DD&address=...
// Vercel serverless function — uses Google service account (no customer auth needed)
import { google } from "googleapis";

const ESTIMATE_DURATION_MIN = 30;
const BUFFER_MIN = 15;

// Returns UTC offset in ms for America/New_York (-5h EST, -4h EDT)
// US DST rule: 2nd Sunday of March → 1st Sunday of November
function easternOffsetMs(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (m < 3 || m > 11) return -5 * 3600000;
  if (m > 3 && m < 11) return -4 * 3600000;
  const nthSunday = (yr, mo, n) => {
    const dow = new Date(Date.UTC(yr, mo - 1, 1)).getUTCDay();
    return (dow === 0 ? 1 : 8 - dow) + (n - 1) * 7;
  };
  const isEDT = m === 3 ? d >= nthSunday(y, 3, 2) : d < nthSunday(y, 11, 1);
  return (isEDT ? -4 : -5) * 3600000;
}

// Returns a UTC Date for the given Eastern local time on dateStr (pure arithmetic, no string parsing)
function makeEasternDate(dateStr, hour, minute) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  const localMs = (hour * 60 + minute) * 60000;
  return new Date(utcMidnight + localMs - easternOffsetMs(dateStr));
}

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

function isValidDateStr(str) {
  if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str + "T12:00:00Z");
  return !isNaN(d.getTime());
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const date    = typeof req.query.date    === "string" ? req.query.date.trim()    : "";
  const address = typeof req.query.address === "string" ? req.query.address.trim().slice(0, 300) : "";

  if (!isValidDateStr(date)) {
    return res.status(400).json({ error: "Invalid or missing date parameter" });
  }

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    const calendar = google.calendar({ version: "v3", auth });
    const calendarId = process.env.GOOGLE_CALENDAR_ID;

    // Build day boundaries in Eastern Time (America/New_York)
    // Mon–Fri: 7:30 AM – 6:00 PM ET | Sat: 7:30 AM – 1:00 PM ET | Sun: closed
    const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0=Sun … 6=Sat
    if (dayOfWeek === 0) return res.status(200).json({ slots: [] });

    const dayStart = makeEasternDate(date, 7, 30);
    const dayEnd = makeEasternDate(date, dayOfWeek === 6 ? 13 : 18, 0);

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
    console.error("slots error:", err.message);
    res.status(500).json({ error: "Failed to fetch slots" });
  }
}
