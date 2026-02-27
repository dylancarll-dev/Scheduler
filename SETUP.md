# Setup Guide — Frog Splash Coatings Estimate Scheduler

Customers fill out a form and book directly — no Google sign-in required.
The app uses a **service account** to read/write your calendar on the backend.

Follow these steps and you'll be live in about 45 minutes.

---

## PART 1 — Google Cloud Setup (20 min)

### Step 1: Create a Google Cloud Project

1. Go to https://console.cloud.google.com
2. Sign in with the Google account that owns your business calendar
3. Click the project dropdown at the top → **"New Project"**
4. Name it `Frog Splash Scheduler` → Click **Create**

---

### Step 2: Enable Required APIs

1. In the left menu → **APIs & Services** → **Library**
2. Enable each of these (search by name → click → Enable):
   - **Google Calendar API**
   - **Maps JavaScript API**
   - **Distance Matrix API**
   - **Places API (New)**

---

### Step 3: Create a Service Account

The service account lets the backend read and write your calendar without
requiring customers to sign in.

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **Service account**
3. Name it `estimate-scheduler` → Click **Create and Continue**
4. Skip the optional role and user steps → Click **Done**
5. Click the service account email to open it
6. Go to the **Keys** tab → **Add Key** → **Create new key** → choose **JSON**
7. A `.json` file will download — keep it safe, you'll need it in Part 2

---

### Step 4: Share Your Google Calendar with the Service Account

1. Open **Google Calendar** (calendar.google.com)
2. Find your business calendar in the left panel → click the three dots → **Settings and sharing**
3. Scroll to **Share with specific people** → **+ Add people**
4. Enter the service account email (looks like `estimate-scheduler@your-project.iam.gserviceaccount.com`)
5. Set permission to **Make changes to events** → **Send**
6. Also on that settings page, scroll down to **Integrate calendar** and copy the **Calendar ID** — you'll need it later

---

### Step 5: Create an API Key for Maps

1. Still in **Credentials** → **+ Create Credentials** → **API Key**
2. Click **Edit API key** (pencil icon)
3. Under **API restrictions** → **Restrict key** → select:
   - Maps JavaScript API
   - Distance Matrix API
   - Places API (New)
4. Under **Application restrictions** → **HTTP referrers (websites)** → Add:
   - `localhost:5173/*`
   - `your-app-name.vercel.app/*` (add this after you deploy)
5. Save → **Copy this API Key**

---

## PART 2 — Configure the App (5 min)

1. Open the project folder on your computer
2. Find `.env.example` → make a copy of it named `.env`
3. Open `.env` in any text editor and fill it in:

```
VITE_GOOGLE_MAPS_API_KEY=paste-your-maps-api-key-here
VITE_BUSINESS_NAME=Frog Splash Coatings

GOOGLE_SERVICE_ACCOUNT_JSON=paste-the-entire-contents-of-the-json-file-here
GOOGLE_CALENDAR_ID=paste-your-calendar-id-here
GOOGLE_MAPS_API_KEY=paste-your-maps-api-key-here
```

> **Note:** `GOOGLE_SERVICE_ACCOUNT_JSON` should be the raw JSON content of the
> key file you downloaded in Part 1 Step 3 — paste it on a single line.
> `GOOGLE_MAPS_API_KEY` appears twice: once prefixed with `VITE_` (for the
> browser's Places autocomplete) and once without (for the server-side
> Distance Matrix calls).

---

## PART 3 — Test It Locally (5 min)

1. Install Node.js if you don't have it: https://nodejs.org (LTS version)
2. Install the Vercel CLI: `npm install -g vercel`
3. Open a terminal in your project folder
4. Run: `npm install`
5. Run: `vercel dev`
6. Open your browser to `http://localhost:3000`
7. Fill out the form → pick a date → slots should appear → complete a booking
8. Check your Google Calendar to confirm the event was created

> **Why `vercel dev` instead of `npm run dev`?**
> The backend API routes (`/api/slots` and `/api/book`) only run in the Vercel
> environment. `vercel dev` emulates that locally. `npm run dev` (Vite only)
> is fine for previewing the form UI, but date selection will not work until
> the backend is available.

---

## PART 4 — Deploy to Vercel (10 min)

1. Push your project to GitHub (create a repo at https://github.com/new)
2. Go to https://vercel.com → **Add New Project** → Import from GitHub → select your repo
3. Before clicking Deploy, open **Environment Variables** and add all four:
   - `VITE_GOOGLE_MAPS_API_KEY`
   - `VITE_BUSINESS_NAME`
   - `GOOGLE_SERVICE_ACCOUNT_JSON`
   - `GOOGLE_CALENDAR_ID`
   - `GOOGLE_MAPS_API_KEY`
4. Click **Deploy** → wait ~2 minutes
5. You'll get a URL like `https://estimate-scheduler-abc.vercel.app`
6. Go back to Google Cloud → your API Key → add that Vercel URL to HTTP referrers

---

## PART 5 — Embed on Your Website (optional)

Because the app is a plain web page, you can drop it into any website with an iframe:

```html
<iframe
  src="https://your-app-name.vercel.app"
  width="100%"
  height="800"
  frameborder="0"
  style="border:none;"
></iframe>
```

No configuration needed — it just works.

---

## HOW IT WORKS

1. Customer fills out the form (name, phone, address, service type)
2. They pick a date — the app calls `/api/slots` on the backend
3. The backend authenticates with your Google Calendar using the service account
4. It fetches your existing appointments for that day
5. For each candidate 30-minute slot, it calls the Distance Matrix API to check:
   - Can you drive from the previous appointment to the new customer in time?
   - Can you drive from the new customer to the next appointment in time?
6. Only feasible slots are shown to the customer
7. Customer picks a time → `/api/book` creates the event in your calendar
8. The event includes the customer's address (used for travel time on future bookings)

**Important:** For travel time logic to work on future bookings, each estimate
event must have the client's address in the **Location** field — which this app
sets automatically.

---

## TO BLOCK OFF TIME

Create any event in your Google Calendar on the day you want blocked.
The app will exclude that time window from available slots.

---

## COSTS

| Service | Cost |
|---|---|
| Google Calendar API | Free |
| Maps JavaScript API | Free up to $200/month (~28,000 map loads) |
| Distance Matrix API | Free up to $200/month (~7,000 calculations) |
| Vercel hosting | Free |

For a small business doing 5–10 estimates per day, you'll stay well within
the free tier.

---

## TROUBLESHOOTING

**Slots not loading:** Check that `GOOGLE_SERVICE_ACCOUNT_JSON` is valid JSON
and that the service account has been shared on your calendar.

**"Permission denied" error:** The service account email must be added as a
calendar collaborator with "Make changes to events" permission (Part 1 Step 4).

**Address autocomplete not working:** Check that the Maps API key has Places
API enabled and that `localhost:5173` or your Vercel domain is in the referrers.

**Calendar ID:** It's usually your Gmail address (e.g. `you@gmail.com`) for a
personal calendar, or a long string ending in `@group.calendar.google.com` for
a shared calendar.
