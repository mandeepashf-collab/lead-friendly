"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Globe,
  Plus,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShoppingCart,
  Search,
  Sparkles,
  Star,
  Calendar,
  RotateCcw,
  Info,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────

interface CustomDomain {
  id: string;
  domain: string;
  status: "pending" | "verified" | "active" | "failed";
  verification_token: string;
  txt_verified: boolean;
  cname_verified: boolean;
  ssl_status: string;
  created_at: string;
  verified_at: string | null;
}

interface DomainPurchase {
  id: string;
  domain: string;
  subdomain_connected: string | null;
  sell_price_cents: number;
  purchased_at: string;
  renewal_date: string | null;
  auto_renew: boolean;
  status: string;
}

interface DomainSearchResult {
  domain: string;
  tld: string;
  available: boolean;
  price: number;
  period: number;
  currency: string;
}

interface DnsInstruction {
  txt: { type: string; host: string; value: string; purpose: string };
  cname: { type: string; host: string; value: string; purpose: string };
}

// ── Helpers ───────────────────────────────────────────────────

function statusConfig(status: CustomDomain["status"]) {
  switch (status) {
    case "active":
      return {
        label: "Active",
        className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        icon: CheckCircle,
      };
    case "verified":
      return {
        label: "Verified",
        className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        icon: ShieldCheck,
      };
    case "failed":
      return {
        label: "Failed",
        className: "bg-red-500/10 text-red-400 border-red-500/20",
        icon: XCircle,
      };
    default:
      return {
        label: "Pending DNS",
        className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        icon: Clock,
      };
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ── Copy Button ───────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleCopy}
      title="Copy"
      className="flex-shrink-0 p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
    >
      {copied ? (
        <Check size={13} className="text-emerald-400" />
      ) : (
        <Copy size={13} />
      )}
    </button>
  );
}

// ── DNS Record Row ────────────────────────────────────────────

function DnsRow({
  label,
  type,
  host,
  value,
  verified,
}: {
  label: string;
  type: string;
  host: string;
  value: string;
  verified: boolean;
}) {
  return (
    <div className="border border-zinc-700/60 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/60 border-b border-zinc-700/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-200">{label}</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-700 text-zinc-300 rounded">
            {type}
          </span>
        </div>
        {verified ? (
          <span className="flex items-center gap-1 text-[11px] text-emerald-400">
            <CheckCircle size={11} /> Verified
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-amber-400/80">
            <Clock size={11} /> Waiting
          </span>
        )}
      </div>
      <div className="p-3 space-y-2 bg-zinc-900/40">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500 w-10 flex-shrink-0 uppercase tracking-wide">
            Host
          </span>
          <div className="flex-1 flex items-center gap-1.5 bg-zinc-800 rounded-md px-2.5 py-1.5 min-w-0">
            <code className="text-xs font-mono text-zinc-200 truncate flex-1">
              {host}
            </code>
            <CopyButton value={host} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500 w-10 flex-shrink-0 uppercase tracking-wide">
            Value
          </span>
          <div className="flex-1 flex items-center gap-1.5 bg-zinc-800 rounded-md px-2.5 py-1.5 min-w-0">
            <code className="text-xs font-mono text-indigo-300 truncate flex-1 break-all">
              {value}
            </code>
            <CopyButton value={value} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Domain Card (Connect tab) ─────────────────────────────────

function ConnectedDomainCard({
  domain,
  instructions,
  onVerify,
  onDelete,
}: {
  domain: CustomDomain;
  instructions: DnsInstruction | null;
  onVerify: (id: string) => Promise<{ message: string }>;
  onDelete: (id: string) => void;
}) {
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(domain.status === "pending");
  const [deleting, setDeleting] = useState(false);

  const { label, className, icon: StatusIcon } = statusConfig(domain.status);
  const parts = domain.domain.split(".");
  const cnameHost = parts.length > 2 ? parts[0] : "@";

  const dnsInstructions: DnsInstruction = instructions ?? {
    txt: {
      type: "TXT",
      host: "_leadfriendly",
      value: domain.verification_token,
      purpose: "Proves you own this domain",
    },
    cname: {
      type: "CNAME",
      host: cnameHost,
      value: "cname.vercel-dns.com",
      purpose: "Routes traffic to Lead Friendly",
    },
  };

  async function handleVerify() {
    setVerifying(true);
    setVerifyMsg(null);
    try {
      const result = await onVerify(domain.id);
      setVerifyMsg(result.message);
    } catch {
      setVerifyMsg("Verification failed. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove ${domain.domain}? This cannot be undone.`)) return;
    setDeleting(true);
    onDelete(domain.id);
  }

  return (
    <div className="border border-zinc-700/70 rounded-xl overflow-hidden bg-zinc-900/50">
      <div className="flex items-center gap-3 px-4 py-3">
        <Globe size={15} className="text-zinc-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-white font-medium truncate">
              {domain.domain}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${className}`}
            >
              <StatusIcon size={10} />
              {label}
            </span>
          </div>
          {domain.verified_at && (
            <p className="text-[11px] text-zinc-600 mt-0.5">
              Connected {formatDate(domain.verified_at)} · External domain
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {domain.status === "active" && (
            <a
              href={`https://${domain.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Visit"
            >
              <ExternalLink size={14} />
            </a>
          )}
          {domain.status !== "active" && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Remove"
          >
            {deleting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
          </button>
        </div>
      </div>

      {expanded && domain.status !== "active" && (
        <div className="border-t border-zinc-700/60 px-4 py-4 space-y-4 bg-zinc-950/40">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/15">
            <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-400/80 leading-relaxed">
              Add these two DNS records at your domain registrar, then click{" "}
              <strong className="text-amber-400">Verify DNS Records</strong> below. Changes typically
              propagate in 5–30 minutes.
            </p>
          </div>
          <DnsRow
            label="Step 1 — Ownership proof"
            type={dnsInstructions.txt.type}
            host={dnsInstructions.txt.host}
            value={dnsInstructions.txt.value}
            verified={domain.txt_verified}
          />
          <DnsRow
            label="Step 2 — Route traffic"
            type={dnsInstructions.cname.type}
            host={dnsInstructions.cname.host}
            value={dnsInstructions.cname.value}
            verified={domain.cname_verified}
          />
          <p className="text-[11px] text-zinc-600 text-center">
            DNS changes can take up to 48 hours to propagate. Usually 5–30 minutes.
          </p>
          {verifyMsg && (
            <div
              className={`flex items-start gap-2 p-3 rounded-lg text-xs border ${
                domain.txt_verified && domain.cname_verified
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-zinc-800/60 border-zinc-700 text-zinc-400"
              }`}
            >
              {domain.txt_verified && domain.cname_verified ? (
                <CheckCircle size={13} className="mt-0.5 flex-shrink-0" />
              ) : (
                <Clock size={13} className="mt-0.5 flex-shrink-0" />
              )}
              <span>{verifyMsg}</span>
            </div>
          )}
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {verifying ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Checking DNS…
              </>
            ) : (
              <>
                <RefreshCw size={14} /> Verify DNS Records
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Purchase Confirm Modal ────────────────────────────────────

function PurchaseModal({
  result,
  onConfirm,
  onCancel,
  buying,
}: {
  result: DomainSearchResult;
  onConfirm: () => void;
  onCancel: () => void;
  buying: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-zinc-800">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <ShoppingCart size={16} className="text-indigo-400" />
            Confirm Domain Purchase
          </h3>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center justify-between p-3 bg-zinc-800/60 rounded-lg border border-zinc-700/60">
            <div>
              <p className="font-mono text-white font-medium">{result.domain}</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {result.period} year registration
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-indigo-400">
                ${result.price}
              </p>
              <p className="text-xs text-zinc-600">/year</p>
            </div>
          </div>

          <div className="p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-lg space-y-1.5">
            <p className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
              <Sparkles size={12} />
              Auto-connected — zero DNS setup required
            </p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Since we register the domain on your behalf, your white-label
              platform will be live at{" "}
              <code className="text-emerald-400/80">app.{result.domain}</code>{" "}
              immediately after purchase. SSL included.
            </p>
          </div>

          <div className="flex items-start gap-2 p-3 bg-zinc-800/40 rounded-lg text-xs text-zinc-500">
            <Info size={12} className="mt-0.5 flex-shrink-0 text-zinc-600" />
            <span>
              This will be billed to your account. By purchasing you agree to the
              domain registration terms. Domains renew annually.
            </span>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-zinc-800 flex gap-3">
          <button
            onClick={onCancel}
            disabled={buying}
            className="flex-1 py-2.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-300 hover:border-zinc-600 text-sm font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={buying}
            className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {buying ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Purchasing…
              </>
            ) : (
              <>
                <ShoppingCart size={14} />
                Confirm Purchase
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Buy Domain Tab ────────────────────────────────────────────

function BuyDomainTab({
  onPurchaseSuccess,
}: {
  onPurchaseSuccess: (domain: CustomDomain) => void;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<DomainSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [confirmDomain, setConfirmDomain] = useState<DomainSearchResult | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [buySuccess, setBuySuccess] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSearch() {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setSearchError(null);
    setBuyError(null);
    setBuySuccess(null);
    setHasSearched(false);

    try {
      const res = await fetch(
        `/api/domains/search?query=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error || "Search failed");
        setSearchResults([]);
      } else {
        setSearchResults(data.results);
        setHasSearched(true);
      }
    } catch {
      setSearchError("Network error. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  async function handleBuy() {
    if (!confirmDomain) return;
    setBuying(true);
    setBuyError(null);

    try {
      const res = await fetch("/api/domains/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: confirmDomain.domain }),
      });
      const data = await res.json();

      if (!res.ok) {
        setBuyError(data.error || "Purchase failed. Please try again.");
        setConfirmDomain(null);
        return;
      }

      setBuySuccess(data.message);
      setConfirmDomain(null);

      // Remove the bought domain from search results
      setSearchResults((prev) =>
        prev.filter((r) => r.domain !== confirmDomain.domain)
      );

      // Propagate new domain record to parent
      if (data.domain_record) {
        onPurchaseSuccess(data.domain_record as CustomDomain);
      }
    } catch {
      setBuyError("Network error. Purchase may have failed — check your domains list.");
    } finally {
      setBuying(false);
    }
  }

  const allResults = searchResults;

  return (
    <div className="space-y-5">
      {/* Search bar */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-zinc-400">
          Search for your perfect domain name
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="myagency"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors font-mono"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || query.trim().length < 2}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
          >
            {searching ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Search size={14} />
            )}
            Search
          </button>
        </div>
        {searchError && (
          <p className="text-xs text-red-400 flex items-center gap-1.5">
            <XCircle size={12} /> {searchError}
          </p>
        )}
      </div>

      {/* Success banner */}
      {buySuccess && (
        <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <Sparkles size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-400">Domain purchased!</p>
            <p className="text-xs text-emerald-400/70 mt-0.5">{buySuccess}</p>
          </div>
        </div>
      )}

      {/* Buy error */}
      {buyError && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
          <XCircle size={13} className="mt-0.5 flex-shrink-0" />
          {buyError}
        </div>
      )}

      {/* Loading skeleton */}
      {searching && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 mb-3">Checking availability…</p>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-lg bg-zinc-800/50 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Results */}
      {!searching && hasSearched && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 mb-1">
            {allResults.filter((r) => r.available).length} domains available
          </p>

          {allResults.length === 0 && (
            <div className="py-8 text-center text-sm text-zinc-600">
              No domains available for "{query}". Try a different name.
            </div>
          )}

          {allResults.map((result) => {
            const isRecommended = result.tld === "com";
            return (
              <div
                key={result.domain}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                  result.available
                    ? "bg-zinc-900/60 border-zinc-700/70 hover:border-zinc-600"
                    : "bg-zinc-900/30 border-zinc-800/50 opacity-50"
                }`}
              >
                {/* Availability icon */}
                {result.available ? (
                  <CheckCircle
                    size={16}
                    className="text-emerald-400 flex-shrink-0"
                  />
                ) : (
                  <XCircle
                    size={16}
                    className="text-zinc-600 flex-shrink-0"
                  />
                )}

                {/* Domain name */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-white">
                      {result.domain}
                    </span>
                    {isRecommended && result.available && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 rounded-full">
                        <Star size={8} fill="currentColor" /> Recommended
                      </span>
                    )}
                  </div>
                  {!result.available && (
                    <p className="text-[11px] text-zinc-600 mt-0.5">
                      Already taken
                    </p>
                  )}
                </div>

                {/* Price + Buy */}
                {result.available && (
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-indigo-400">
                        ${result.price}
                      </p>
                      <p className="text-[10px] text-zinc-600">/year</p>
                    </div>
                    <button
                      onClick={() => {
                        setBuyError(null);
                        setBuySuccess(null);
                        setConfirmDomain(result);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors"
                    >
                      Buy Now
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Auto-connect note */}
      {!searching && (
        <div className="flex items-start gap-2.5 p-3.5 bg-indigo-500/5 border border-indigo-500/15 rounded-xl">
          <Sparkles size={14} className="text-indigo-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-indigo-400">
              Auto-connected — no DNS setup required
            </p>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              Domains purchased here are registered under your account and
              automatically connected. Your white-label platform is live at{" "}
              <code className="text-zinc-400">app.yourdomain.com</code> with SSL
              included — usually within 1–2 minutes.
            </p>
          </div>
        </div>
      )}

      {/* Purchase confirm modal */}
      {confirmDomain && (
        <PurchaseModal
          result={confirmDomain}
          onConfirm={handleBuy}
          onCancel={() => setConfirmDomain(null)}
          buying={buying}
        />
      )}
    </div>
  );
}

// ── Connect Domain Tab ────────────────────────────────────────

function ConnectDomainTab({
  domains,
  pendingInstructions,
  loadingDomains,
  domainError,
  onLoadDomains,
  onVerify,
  onDelete,
  onAdd,
}: {
  domains: CustomDomain[];
  pendingInstructions: Record<string, DnsInstruction>;
  loadingDomains: boolean;
  domainError: string | null;
  onLoadDomains: () => void;
  onVerify: (id: string) => Promise<{ message: string }>;
  onDelete: (id: string) => void;
  onAdd: (
    domain: CustomDomain,
    instructions: DnsInstruction
  ) => void;
}) {
  const [inputDomain, setInputDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function handleAdd() {
    if (!inputDomain.trim()) return;
    setAdding(true);
    setAddError(null);

    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: inputDomain }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || "Failed to add domain");
        return;
      }
      onAdd(data.domain as CustomDomain, data.instructions as DnsInstruction);
      setInputDomain("");
    } catch {
      setAddError("Network error. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  // Only show externally-connected domains (not purchased ones)
  const connectDomains = domains.filter(
    (d) => d.verification_token !== "purchased-via-platform"
  );

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-xs font-medium text-zinc-400">
          Enter your domain or subdomain
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
            />
            <input
              type="text"
              value={inputDomain}
              onChange={(e) => {
                setInputDomain(e.target.value);
                setAddError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="crm.youragency.com"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors font-mono"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !inputDomain.trim()}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
          >
            {adding ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Add Domain
          </button>
        </div>
        {addError && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <XCircle size={12} />
            {addError}
          </div>
        )}
      </div>

      {loadingDomains ? (
        <div className="flex items-center gap-2 text-zinc-600 py-4">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : domainError ? (
        <div className="flex flex-col gap-2 py-4">
          <p className="text-sm text-red-400">{domainError}</p>
          <button
            onClick={onLoadDomains}
            className="text-xs text-zinc-500 hover:text-zinc-300 underline"
          >
            Try again
          </button>
        </div>
      ) : connectDomains.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-xl py-10 text-center">
          <Globe size={28} className="text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-600">No external domains connected yet</p>
          <p className="text-xs text-zinc-700 mt-1">
            Enter a domain above and follow the DNS instructions
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {connectDomains.map((domain) => (
            <ConnectedDomainCard
              key={domain.id}
              domain={domain}
              instructions={pendingInstructions[domain.id] ?? null}
              onVerify={onVerify}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Your Domains (management) ─────────────────────────────────

function YourDomainsSection({
  domains,
  purchases,
  loadingPurchases,
  onDeleteDomain,
}: {
  domains: CustomDomain[];
  purchases: DomainPurchase[];
  loadingPurchases: boolean;
  onDeleteDomain: (id: string) => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(domainId: string, domainName: string) {
    if (!confirm(`Remove ${domainName}? This cannot be undone.`)) return;
    setDeletingId(domainId);
    onDeleteDomain(domainId);
    setDeletingId(null);
  }

  if (domains.length === 0 && !loadingPurchases) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Globe size={14} className="text-indigo-400" />
          Your Domains
        </h4>
        <span className="text-xs text-zinc-600">
          {domains.length} domain{domains.length !== 1 ? "s" : ""}
        </span>
      </div>

      {loadingPurchases ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-zinc-800/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {domains.map((domain) => {
            const { label, className, icon: StatusIcon } = statusConfig(domain.status);
            // Find matching purchase record (for purchased domains)
            const purchase = purchases.find(
              (p) => p.subdomain_connected === domain.domain
            );
            const isPurchased = domain.verification_token === "purchased-via-platform";

            return (
              <div
                key={domain.id}
                className="border border-zinc-700/70 rounded-xl bg-zinc-900/50 p-4"
              >
                <div className="flex items-start gap-3">
                  <Globe size={15} className="text-zinc-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-white font-medium">
                        {domain.domain}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${className}`}
                      >
                        <StatusIcon size={10} />
                        {label}
                      </span>
                      {domain.ssl_status === "active" && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/80">
                          <ShieldCheck size={10} /> SSL active
                        </span>
                      )}
                      {domain.ssl_status === "provisioning" && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-400/80">
                          <Clock size={10} /> SSL provisioning
                        </span>
                      )}
                    </div>

                    {/* Purchase info */}
                    {isPurchased && purchase ? (
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                        <span className="flex items-center gap-1">
                          <ShoppingCart size={10} />
                          Purchased ${(purchase.sell_price_cents / 100).toFixed(0)}/yr
                        </span>
                        {purchase.renewal_date && (
                          <span className="flex items-center gap-1">
                            <Calendar size={10} />
                            Renews {formatDate(purchase.renewal_date)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <RotateCcw size={10} />
                          Auto-renew:{" "}
                          <span
                            className={
                              purchase.auto_renew
                                ? "text-emerald-400"
                                : "text-zinc-600"
                            }
                          >
                            {purchase.auto_renew ? "On" : "Off"}
                          </span>
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-600 mt-1">
                        {domain.verified_at
                          ? `Connected ${formatDate(domain.verified_at)} · External domain`
                          : "External domain · Pending verification"}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {domain.status === "active" && (
                      <a
                        href={`https://${domain.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                        title="Visit"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(domain.id, domain.domain)}
                      disabled={deletingId === domain.id}
                      className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remove"
                    >
                      {deletingId === domain.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

type Tab = "buy" | "connect";

export default function CustomDomainManager() {
  const [activeTab, setActiveTab] = useState<Tab>("buy");

  // Domain records
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [pendingInstructions, setPendingInstructions] = useState<
    Record<string, DnsInstruction>
  >({});
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [domainError, setDomainError] = useState<string | null>(null);

  // Purchase records
  const [purchases, setPurchases] = useState<DomainPurchase[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);

  // Load domains
  const loadDomains = useCallback(async () => {
    setLoadingDomains(true);
    setDomainError(null);
    try {
      const res = await fetch("/api/domains");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDomains(data);
    } catch (err) {
      setDomainError(
        err instanceof Error ? err.message : "Failed to load domains"
      );
    } finally {
      setLoadingDomains(false);
    }
  }, []);

  // Load purchases (best-effort — table may not exist yet if migration not run)
  const loadPurchases = useCallback(async () => {
    setLoadingPurchases(true);
    try {
      const res = await fetch("/api/domains/purchases");
      if (res.ok) {
        const data = await res.json();
        setPurchases(data);
      }
    } catch {
      // Silently fail — purchases section just won't show renewal info
    } finally {
      setLoadingPurchases(false);
    }
  }, []);

  useEffect(() => {
    loadDomains();
    loadPurchases();
  }, [loadDomains, loadPurchases]);

  // Verify
  async function handleVerify(domainId: string): Promise<{ message: string }> {
    const res = await fetch("/api/domains/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain_id: domainId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Verification failed");

    setDomains((prev) =>
      prev.map((d) =>
        d.id === domainId
          ? {
              ...d,
              txt_verified: data.txt_verified,
              cname_verified: data.cname_verified,
              status: data.status,
            }
          : d
      )
    );
    return { message: data.message };
  }

  // Delete
  async function handleDelete(domainId: string) {
    setDomains((prev) => prev.filter((d) => d.id !== domainId));
    try {
      const res = await fetch(`/api/domains/${domainId}`, {
        method: "DELETE",
      });
      if (!res.ok) await loadDomains();
    } catch {
      await loadDomains();
    }
  }

  // Add from Connect tab
  function handleAdd(domain: CustomDomain, instructions: DnsInstruction) {
    setDomains((prev) => [domain, ...prev]);
    setPendingInstructions((prev) => ({
      ...prev,
      [domain.id]: instructions,
    }));
  }

  // Purchased from Buy tab
  function handlePurchaseSuccess(domain: CustomDomain) {
    setDomains((prev) => [domain, ...prev]);
    loadPurchases(); // refresh purchase records
  }

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div>
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Globe size={16} className="text-indigo-400" />
          Custom Domain
        </h3>
        <p className="text-sm text-zinc-500 mt-1">
          Connect your brand so clients see{" "}
          <code className="text-zinc-400">crm.youragency.com</code> instead of
          leadfriendly.com.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-zinc-800/60 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab("buy")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "buy"
              ? "bg-zinc-700 text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <ShoppingCart size={14} />
          Buy a Domain
        </button>
        <button
          onClick={() => setActiveTab("connect")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "connect"
              ? "bg-zinc-700 text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Globe size={14} />
          Connect Existing
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "buy" ? (
        <BuyDomainTab onPurchaseSuccess={handlePurchaseSuccess} />
      ) : (
        <ConnectDomainTab
          domains={domains}
          pendingInstructions={pendingInstructions}
          loadingDomains={loadingDomains}
          domainError={domainError}
          onLoadDomains={loadDomains}
          onVerify={handleVerify}
          onDelete={handleDelete}
          onAdd={handleAdd}
        />
      )}

      {/* Divider */}
      {domains.length > 0 && (
        <div className="border-t border-zinc-800 pt-6">
          <YourDomainsSection
            domains={domains}
            purchases={purchases}
            loadingPurchases={loadingPurchases}
            onDeleteDomain={handleDelete}
          />
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-800 pt-4">
        <p className="text-[11px] text-zinc-700 leading-relaxed">
          <strong className="text-zinc-600">How it works:</strong> Purchased
          domains are registered under your account and auto-connected. Externally
          connected domains require DNS verification. All domains include automatic
          SSL via Let's Encrypt. Your clients see your branding, not ours.
        </p>
      </div>
    </div>
  );
}
