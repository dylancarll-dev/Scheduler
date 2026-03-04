import { useState, useEffect } from "react";
import logo from "./Back of Shirt Logo.png";

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const CONFIG = {
  GOOGLE_MAPS_API_KEY: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
  BUSINESS_NAME: import.meta.env.VITE_BUSINESS_NAME || "Frog Splash Coatings",
  ESTIMATE_DURATION_MIN: 30,
  BUFFER_MIN: 15,
  // Mon–Fri 7:30 AM–6:00 PM | Sat 7:30 AM–1:00 PM (enforced server-side)
  DAYS_AHEAD: 14,
};

// ─── MAPS LOADER ─────────────────────────────────────────────────────────────
function loadMapsJS() {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) return resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${CONFIG.GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────
function StepIndicator({ step }) {
  const steps = ["Your Info", "Pick a Date", "Choose a Time", "Confirmed"];
  return (
    <div className="step-indicator">
      {steps.map((s, i) => (
        <div
          key={i}
          className={`step ${i + 1 === step ? "active" : i + 1 < step ? "done" : ""}`}
        >
          <div className="step-dot">{i + 1 < step ? "✓" : i + 1}</div>
          <span>{s}</span>
        </div>
      ))}
    </div>
  );
}

function AddressAutocomplete({ value, onChange, onVerified, placeholder }) {
  const [ref, setRef] = useState(null);

  useEffect(() => {
    if (!ref || !window.google?.maps) return;
    const ac = new window.google.maps.places.Autocomplete(ref, {
      types: ["address"],
      componentRestrictions: { country: "us" },
    });
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (place.formatted_address) {
        onChange(place.formatted_address);
        onVerified(true);
      }
    });
  }, [ref]);

  return (
    <input
      ref={setRef}
      type="text"
      value={value}
      onChange={(e) => { onChange(e.target.value); onVerified(false); }}
      placeholder={placeholder}
      className="input"
    />
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState(null);
  const [bookingError, setBookingError] = useState(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [addressVerified, setAddressVerified] = useState(false);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    jobType: "",
    floorCondition: "",
    hearAboutUs: "",
    notes: "",
  });

  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);

  useEffect(() => {
    loadMapsJS().then(() => setMapsReady(true)).catch(() => setMapsReady(false));
  }, []);

  // Load slots from backend when date selected
  async function handleDateSelect(date) {
    setSelectedDate(date);
    setSlots([]);
    setSelectedSlot(null);
    setSlotsError(null);
    setSlotsLoading(true);
    setStep(3);

    try {
      const dateStr = date.toISOString().split("T")[0];
      const params = new URLSearchParams({ date: dateStr, address: form.address });
      const resp = await fetch(`/api/slots?${params}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to load slots");
      setSlots(
        data.slots.map((s) => ({
          start: new Date(s.start),
          end: new Date(s.end),
          travelNote: s.travelNote,
        }))
      );
    } catch (_) {
      setSlotsError("Could not load available times. Please try again.");
    }

    setSlotsLoading(false);
  }

  // Submit booking to backend
  async function bookSlot() {
    if (!selectedSlot) return;
    setLoading(true);
    setBookingError(null);

    try {
      const resp = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          email: form.email,
          address: form.address,
          jobType: form.jobType,
          floorCondition: form.floorCondition,
          hearAboutUs: form.hearAboutUs,
          notes: form.notes,
          slotStart: selectedSlot.start.toISOString(),
          slotEnd: selectedSlot.end.toISOString(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Booking failed");
      setStep(4);
    } catch (_) {
      setBookingError("Booking failed. Please try again.");
    }

    setLoading(false);
  }

  // Generate calendar days
  function getCalendarDays() {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 1; i <= CONFIG.DAYS_AHEAD; i++) {
      const d = new Date(today.getTime() + i * 86400000);
      if (d.getDay() !== 0) days.push(d); // skip Sundays (Mon–Sat only)
    }
    return days;
  }

  const calDays = getCalendarDays();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  function formatTime(date) {
    let h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }

  return (
    <div className="app">
      <header>
        <div className="logo-mark"><img src={logo} alt="Frog Splash Coatings" /></div>
        <h1>{CONFIG.BUSINESS_NAME}</h1>
        <p className="tagline">Free Estimate Scheduling</p>
      </header>

      <main>
        <StepIndicator step={step} />

        {/* STEP 1 – Client Info */}
        {step === 1 && (
          <div className="card">
            <h2>Tell us about your project</h2>
            <div className="form-grid">
              <label>
                Full Name *
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Jane Smith"
                />
              </label>
              <label>
                Phone *
                <input
                  className="input"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(555) 000-0000"
                  type="tel"
                />
              </label>
              <label>
                Email
                <input
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="jane@email.com"
                  type="email"
                />
              </label>
              <label>
                Service Address *
                <AddressAutocomplete
                  value={form.address}
                  onChange={(v) => setForm({ ...form, address: v })}
                  onVerified={setAddressVerified}
                  placeholder="123 Main St, City, State"
                />
                {mapsReady && form.address && !addressVerified && (
                  <span className="field-hint">Select an address from the dropdown to verify it</span>
                )}
                {mapsReady && addressVerified && (
                  <span className="field-hint verified">✓ Address verified</span>
                )}
              </label>
              <label className="full">
                Type of Service *
                <select
                  className="input"
                  value={form.jobType}
                  onChange={(e) => setForm({ ...form, jobType: e.target.value })}
                >
                  <option value="">Select a service…</option>
                  <option>Garage Floor Coatings</option>
                  <option>Commercial Floor Coatings</option>
                  <option>Outdoor Floor Coatings</option>
                </select>
              </label>
              <label className="full">
                Floor Condition *
                <select
                  className="input"
                  value={form.floorCondition}
                  onChange={(e) =>
                    setForm({ ...form, floorCondition: e.target.value })
                  }
                >
                  <option value="">Select condition…</option>
                  <option>Good condition</option>
                  <option>Minor cracks or chips</option>
                  <option>Has existing coating</option>
                  <option>Significant damage</option>
                </select>
              </label>
              <label className="full">
                How did you hear about us?
                <select
                  className="input"
                  value={form.hearAboutUs}
                  onChange={(e) =>
                    setForm({ ...form, hearAboutUs: e.target.value })
                  }
                >
                  <option value="">Select one…</option>
                  <option>Google Search</option>
                  <option>Google Maps</option>
                  <option>Facebook / Instagram</option>
                  <option>Referral / Word of mouth</option>
                  <option>Yard sign or truck</option>
                  <option>Other</option>
                </select>
              </label>
              <label className="full">
                Additional Notes
                <textarea
                  className="input"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any details that would help us prepare…"
                />
              </label>
            </div>
            <button
              className="btn primary"
              disabled={
                !form.name || !form.phone || !form.address || !form.jobType || !form.floorCondition ||
                (mapsReady && !addressVerified)
              }
              onClick={() => setStep(2)}
            >
              Choose a Date →
            </button>
          </div>
        )}

        {/* STEP 2 – Date Picker */}
        {step === 2 && (
          <div className="card">
            <h2>Pick a Date</h2>
            <p className="sub">
              Select a day that works for you. We'll show you available times
              based on our current schedule and travel distance.
            </p>
            <div className="cal-grid">
              {calDays.map((d, i) => (
                <button
                  key={i}
                  className={`cal-day ${
                    selectedDate?.toDateString() === d.toDateString()
                      ? "selected"
                      : ""
                  }`}
                  onClick={() => handleDateSelect(d)}
                >
                  <span className="day-name">{dayNames[d.getDay()]}</span>
                  <span className="day-num">{d.getDate()}</span>
                  <span className="day-month">{monthNames[d.getMonth()]}</span>
                </button>
              ))}
            </div>
            <button className="btn ghost" onClick={() => setStep(1)}>
              ← Back
            </button>
          </div>
        )}

        {/* STEP 3 – Time Slots */}
        {step === 3 && (
          <div className="card">
            <h2>
              Available Times
              <span className="date-badge">
                {selectedDate &&
                  `${dayNames[selectedDate.getDay()]}, ${monthNames[selectedDate.getMonth()]} ${selectedDate.getDate()}`}
              </span>
            </h2>
            <p className="sub">
              Times are calculated based on travel distance from our other
              appointments that day.
            </p>

            {slotsLoading && (
              <div className="loading-slots">
                <div className="spinner" />
                <span>Calculating available times based on your location…</span>
              </div>
            )}

            {slotsError && <div className="error">{slotsError}</div>}

            {!slotsLoading && !slotsError && slots.length === 0 && (
              <div className="no-slots">
                <span>😔</span>
                <p>
                  No available times on this day. Please go back and choose
                  another date.
                </p>
              </div>
            )}

            <div className="slots-grid">
              {slots.map((s, i) => (
                <button
                  key={i}
                  className={`slot ${selectedSlot === s ? "selected" : ""}`}
                  onClick={() => setSelectedSlot(s)}
                >
                  <strong>{formatTime(s.start)}</strong>
                  <span>to {formatTime(s.end)}</span>
                  {s.travelNote && <em>{s.travelNote}</em>}
                </button>
              ))}
            </div>

            {selectedSlot && (
              <div className="confirm-bar">
                <div>
                  <strong>Selected:</strong> {formatTime(selectedSlot.start)} –{" "}
                  {formatTime(selectedSlot.end)}
                </div>
                <button
                  className="btn primary"
                  onClick={bookSlot}
                  disabled={loading}
                >
                  {loading ? "Booking…" : "Confirm Booking →"}
                </button>
              </div>
            )}

            {bookingError && <div className="error">{bookingError}</div>}

            <button className="btn ghost" onClick={() => setStep(2)}>
              ← Choose Another Day
            </button>
          </div>
        )}

        {/* STEP 4 – Confirmed */}
        {step === 4 && (
          <div className="card confirm-card">
            <div className="confirm-icon">✅</div>
            <h2>You're Booked!</h2>
            <div className="confirm-details">
              <div className="detail-row">
                <span>Name</span>
                <strong>{form.name}</strong>
              </div>
              <div className="detail-row">
                <span>Date</span>
                <strong>
                  {selectedDate &&
                    `${dayNames[selectedDate.getDay()]}, ${monthNames[selectedDate.getMonth()]} ${selectedDate.getDate()}`}
                </strong>
              </div>
              <div className="detail-row">
                <span>Time</span>
                <strong>
                  {selectedSlot &&
                    `${formatTime(selectedSlot.start)} – ${formatTime(selectedSlot.end)}`}
                </strong>
              </div>
              <div className="detail-row">
                <span>Address</span>
                <strong>{form.address}</strong>
              </div>
              <div className="detail-row">
                <span>Service</span>
                <strong>{form.jobType}</strong>
              </div>
            </div>
            <p className="confirm-note">
              Have questions? We'll be in touch. Thank you for choosing Frog
              Splash Coatings!
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
