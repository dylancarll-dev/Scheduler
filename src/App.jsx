import { useState } from "react";
import logo from "./Back of Shirt Logo.png";

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const CONFIG = {
  BUSINESS_NAME: import.meta.env.VITE_BUSINESS_NAME || "Frog Splash Coatings",
  DAYS_AHEAD: 14,
};

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

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState(null);
  const [bookingError, setBookingError] = useState(null);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    street: "",
    city: "",
    zip: "",
    jobType: "",
    floorCondition: "",
    hearAboutUs: "",
    notes: "",
  });

  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [pendingSlot, setPendingSlot] = useState(null);

  function fullAddress() {
    return `${form.street}, ${form.city}, GA ${form.zip}`;
  }

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
      const params = new URLSearchParams({ date: dateStr, address: fullAddress() });
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

  // Submit booking — called directly when user clicks a time slot
  async function bookSlot(slot) {
    setSelectedSlot(slot);
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
          address: fullAddress(),
          jobType: form.jobType,
          floorCondition: form.floorCondition,
          hearAboutUs: form.hearAboutUs,
          notes: form.notes,
          slotStart: slot.start.toISOString(),
          slotEnd: slot.end.toISOString(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Booking failed");
      setStep(4);
    } catch (_) {
      setBookingError("Booking failed. Please try again.");
      setSelectedSlot(null);
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
      if (d.getDay() !== 0) days.push(d); // skip Sundays
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

  const step1Valid =
    form.name.trim() &&
    form.phone.trim() &&
    form.street.trim() &&
    form.city.trim() &&
    form.zip.trim() &&
    form.jobType &&
    form.floorCondition;

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
              <label className="full">
                Email
                <input
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="jane@email.com"
                  type="email"
                />
              </label>
              <label className="full">
                Street Address *
                <input
                  className="input"
                  value={form.street}
                  onChange={(e) => setForm({ ...form, street: e.target.value })}
                  placeholder="123 Main St"
                />
              </label>
              <label>
                City *
                <input
                  className="input"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Savannah"
                />
              </label>
              <label>
                ZIP Code *
                <input
                  className="input"
                  value={form.zip}
                  onChange={(e) => setForm({ ...form, zip: e.target.value })}
                  placeholder="31401"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                />
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
                  onChange={(e) => setForm({ ...form, floorCondition: e.target.value })}
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
                  onChange={(e) => setForm({ ...form, hearAboutUs: e.target.value })}
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
              disabled={!step1Valid}
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
                    selectedDate?.toDateString() === d.toDateString() ? "selected" : ""
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
              Tap a time to book it. Times are based on travel from our other
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
                <p>No available times on this day. Please go back and choose another date.</p>
              </div>
            )}

            <div className="slots-grid">
              {slots.map((s, i) => (
                <button
                  key={i}
                  className="slot"
                  onClick={() => setPendingSlot(s)}
                >
                  <strong>{formatTime(s.start)}</strong>
                  <span>to {formatTime(s.end)}</span>
                </button>
              ))}
            </div>

            {bookingError && <div className="error">{bookingError}</div>}

            {/* Confirmation modal */}
            {pendingSlot && (
              <div className="modal-overlay">
                <div className="modal">
                  <h3>Confirm Your Appointment</h3>
                  <div className="modal-details">
                    <div className="modal-row">
                      <span>Date</span>
                      <strong>
                        {selectedDate &&
                          `${dayNames[selectedDate.getDay()]}, ${monthNames[selectedDate.getMonth()]} ${selectedDate.getDate()}`}
                      </strong>
                    </div>
                    <div className="modal-row">
                      <span>Time</span>
                      <strong>{formatTime(pendingSlot.start)} – {formatTime(pendingSlot.end)}</strong>
                    </div>
                    <div className="modal-row">
                      <span>Address</span>
                      <strong>{fullAddress()}</strong>
                    </div>
                  </div>
                  <div className="modal-actions">
                    <button
                      className="btn primary"
                      onClick={() => { bookSlot(pendingSlot); setPendingSlot(null); }}
                      disabled={loading}
                    >
                      {loading ? "Booking…" : "Yes, Book It →"}
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => setPendingSlot(null)}
                      disabled={loading}
                    >
                      Go Back
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                <strong>{fullAddress()}</strong>
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
