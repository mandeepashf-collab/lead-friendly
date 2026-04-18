"use client";

import { useState, useEffect, useRef } from "react";

/* ──────────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────────── */
interface OwnedNumber {
  id: string;
  number: string;
  phone_number: string;
  friendly_name: string | null;
  vanity_format: string;
  status: string;
  daily_cap: number;
  daily_used: number;
  type: string;
  area_code: string | null;
}

interface AvailableNumber {
  phone_number: string;
  vanity_format: string;
  locality: string;
  region: string;
  monthly_cost: number;
  features: string[];
}

/* ──────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────── */
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
  "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
  "TX","UT","VT","VA","WA","WV","WI","WY",
];

function UsageBar({ used, cap }: { used: number; cap: number }) {
  const pct = cap > 0 ? Math.min((used / cap) * 100, 100) : 0;
  const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "#27272a", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 12, color: "#a1a1aa", whiteSpace: "nowrap" }}>{used}/{cap}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 9999, fontSize: 11, fontWeight: 500,
      background: isActive ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
      color: isActive ? "#4ade80" : "#f87171",
      border: `1px solid ${isActive ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: isActive ? "#22c55e" : "#ef4444" }} />
      {status}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Pool View — shows owned numbers
   ────────────────────────────────────────────────────────────────── */
function PoolView({
  numbers, loading, onRefresh, onRelease, onSwitchToBuy,
}: {
  numbers: OwnedNumber[];
  loading: boolean;
  onRefresh: () => void;
  onRelease: (num: string) => void;
  onSwitchToBuy: () => void;
}) {
  const [releasing, setReleasing] = useState<string | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);

  const handleRelease = async (phoneNumber: string) => {
    setReleasing(phoneNumber);
    try {
      const res = await fetch("/api/numbers/release", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: phoneNumber }),
      });
      if (res.ok) {
        onRelease(phoneNumber);
      }
    } catch { /* ignore */ }
    setReleasing(null);
    setConfirmRelease(null);
  };

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1, padding: 16, background: "#18181b", border: "1px solid #27272a", borderRadius: 12 }}>
          <p style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>Total Numbers</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: "white", marginTop: 4 }}>{numbers.length}</p>
        </div>
        <div style={{ flex: 1, padding: 16, background: "#18181b", border: "1px solid #27272a", borderRadius: 12 }}>
          <p style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>Active</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: "#4ade80", marginTop: 4 }}>
            {numbers.filter(n => n.status === "active").length}
          </p>
        </div>
        <div style={{ flex: 1, padding: 16, background: "#18181b", border: "1px solid #27272a", borderRadius: 12 }}>
          <p style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>Exhausted Today</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: "#f59e0b", marginTop: 4 }}>
            {numbers.filter(n => n.daily_used >= n.daily_cap).length}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={onRefresh}
          style={{ padding: "8px 16px", background: "#27272a", color: "#d4d4d8", borderRadius: 8, border: "1px solid #3f3f46", cursor: "pointer", fontSize: 13 }}
        >
          Refresh
        </button>
        <button
          onClick={onSwitchToBuy}
          style={{ padding: "8px 16px", background: "#4f46e5", color: "white", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13 }}
        >
          + Buy Number
        </button>
      </div>

      {/* Numbers grid */}
      <div style={{ border: "1px solid #27272a", borderRadius: 12, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 150px 100px", gap: 0, padding: "10px 16px", borderBottom: "1px solid #27272a", background: "#18181b" }}>
          <span style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>Number</span>
          <span style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>Label</span>
          <span style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>Status</span>
          <span style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>Daily Usage</span>
          <span style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>Actions</span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#71717a" }}>Loading...</div>
        ) : numbers.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#71717a" }}>
            <p style={{ fontSize: 14, marginBottom: 4 }}>No phone numbers yet</p>
            <p style={{ fontSize: 12 }}>Buy a number to get started with calls</p>
          </div>
        ) : (
          numbers.map(n => (
            <div key={n.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 150px 100px", gap: 0, padding: "12px 16px", borderBottom: "1px solid #1c1c1e", alignItems: "center" }}>
              <span style={{ fontFamily: "monospace", color: "white", fontSize: 14 }}>{n.vanity_format}</span>
              <span style={{ color: "#a1a1aa", fontSize: 13 }}>{n.friendly_name || "—"}</span>
              <StatusBadge status={n.status} />
              <UsageBar used={n.daily_used} cap={n.daily_cap} />
              <div>
                {confirmRelease === n.phone_number ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => handleRelease(n.phone_number)}
                      disabled={releasing === n.phone_number}
                      style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                    >
                      {releasing === n.phone_number ? "..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => setConfirmRelease(null)}
                      style={{ fontSize: 11, color: "#71717a", background: "none", border: "none", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRelease(n.phone_number)}
                    style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Release
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Buy View — search & purchase numbers
   ────────────────────────────────────────────────────────────────── */
function BuyView({ onBought, onBack }: { onBought: () => void; onBack: () => void }) {
  const [usState, setUsState] = useState("CO");
  const [areaCode, setAreaCode] = useState("");
  const [contains, setContains] = useState("");
  const [results, setResults] = useState<AvailableNumber[]>([]);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doSearch = async () => {
    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ state: usState });
      if (areaCode) params.set("area_code", areaCode);
      if (contains) params.set("contains", contains);
      const res = await fetch(`/api/numbers/search?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.numbers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    }
    setSearching(false);
  };

  const doBuy = async (phoneNumber: string) => {
    setBuying(phoneNumber);
    setError(null);
    try {
      const res = await fetch("/api/numbers/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: phoneNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      onBought();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Purchase failed");
    }
    setBuying(null);
  };

  return (
    <div>
      <button
        onClick={onBack}
        style={{ marginBottom: 16, fontSize: 13, color: "#818cf8", background: "none", border: "none", cursor: "pointer" }}
      >
        ← Back to My Numbers
      </button>

      <h3 style={{ color: "white", fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Search Available Numbers</h3>

      {/* Search filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#71717a", marginBottom: 4 }}>State</label>
          <select
            value={usState}
            onChange={e => setUsState(e.target.value)}
            style={{ height: 36, padding: "0 8px", background: "#18181b", color: "white", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 13 }}
          >
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#71717a", marginBottom: 4 }}>Area Code</label>
          <input
            value={areaCode}
            onChange={e => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder="e.g. 303"
            style={{ height: 36, padding: "0 8px", width: 100, background: "#18181b", color: "white", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 13 }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#71717a", marginBottom: 4 }}>Contains</label>
          <input
            value={contains}
            onChange={e => setContains(e.target.value)}
            placeholder="e.g. 1234"
            style={{ height: 36, padding: "0 8px", width: 120, background: "#18181b", color: "white", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 13 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button
            onClick={doSearch}
            disabled={searching}
            style={{ height: 36, padding: "0 20px", background: "#4f46e5", color: "white", borderRadius: 6, border: "none", cursor: searching ? "wait" : "pointer", fontSize: 13, opacity: searching ? 0.6 : 1 }}
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "8px 12px", marginBottom: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div style={{ border: "1px solid #27272a", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 100px", gap: 0, padding: "10px 16px", borderBottom: "1px solid #27272a", background: "#18181b" }}>
            <span style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>Number</span>
            <span style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>Location</span>
            <span style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>Cost/mo</span>
            <span style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>Action</span>
          </div>
          {results.map(n => (
            <div key={n.phone_number} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 100px", gap: 0, padding: "12px 16px", borderBottom: "1px solid #1c1c1e", alignItems: "center" }}>
              <span style={{ fontFamily: "monospace", color: "white", fontSize: 14 }}>{n.vanity_format}</span>
              <span style={{ color: "#a1a1aa", fontSize: 13 }}>{n.locality ? `${n.locality}, ${n.region}` : n.region}</span>
              <span style={{ color: "#a1a1aa", fontSize: 13 }}>${n.monthly_cost.toFixed(2)}</span>
              <button
                onClick={() => doBuy(n.phone_number)}
                disabled={buying === n.phone_number}
                style={{ height: 28, padding: "0 12px", background: "#22c55e", color: "white", borderRadius: 6, border: "none", cursor: buying ? "wait" : "pointer", fontSize: 12, fontWeight: 500, opacity: buying === n.phone_number ? 0.6 : 1 }}
              >
                {buying === n.phone_number ? "Buying..." : "Buy"}
              </button>
            </div>
          ))}
        </div>
      )}

      {!searching && results.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "#52525b", fontSize: 13 }}>
          Search for available phone numbers above
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Main Export
   ────────────────────────────────────────────────────────────────── */
export function PhoneNumbersTab() {
  const [subTab, setSubTab] = useState<"pool" | "buy">("pool");
  const [numbers, setNumbers] = useState<OwnedNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const loadNumbers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/numbers/list");
      const data = await res.json();
      if (res.ok) {
        setNumbers(data.numbers || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  // Fetch once on mount — useRef prevents double-fetch in StrictMode
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    loadNumbers();
  }, []);

  return (
    <div style={{ padding: "4px 0" }}>
      {subTab === "pool" ? (
        <PoolView
          numbers={numbers}
          loading={loading}
          onRefresh={loadNumbers}
          onRelease={(num) => setNumbers(prev => prev.filter(n => n.phone_number !== num))}
          onSwitchToBuy={() => setSubTab("buy")}
        />
      ) : (
        <BuyView
          onBought={() => { setSubTab("pool"); loadNumbers(); }}
          onBack={() => setSubTab("pool")}
        />
      )}
    </div>
  );
}
