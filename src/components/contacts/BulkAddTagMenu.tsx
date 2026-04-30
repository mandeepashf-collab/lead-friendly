"use client";

/**
 * BulkAddTagMenu — Phase 1b
 *
 * Popover that lets the user pick an existing org tag from a filtered
 * autocomplete list, OR type a new tag name and create it inline.
 * Both paths call `bulk_add_contact_tag` (migration 031) which upserts
 * the tag and returns {tagged_count, tag_id}. The "ON CONFLICT DO NOTHING"
 * inside the RPC means tagged_count may legitimately be 0 if every
 * selected contact already has the tag — that's reported honestly to
 * the user via the toast.
 *
 * Org scoping is handled inside the RPC (SECURITY DEFINER + caller-org
 * lookup + cross-org defense). The tags fetch relies on the `tags`
 * table's existing RLS policy that scopes SELECT to the caller's org.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Plus, Tag as TagIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface TagRow {
  id: string;
  name: string;
}

interface Props {
  selectedIds: string[];
  anchorRef: RefObject<HTMLButtonElement | null>;
  onSuccess: (taggedCount: number, tagName: string) => void;
  onError: (msg: string) => void;
  onClose: () => void;
}

export function BulkAddTagMenu({
  selectedIds,
  anchorRef,
  onSuccess,
  onError,
  onClose,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [allTags, setAllTags] = useState<TagRow[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch org tags once on mount. RLS scopes them to caller's org.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tags")
        .select("id, name")
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("[BulkAddTagMenu] tags fetch failed:", error);
      }
      setAllTags((data as TagRow[]) ?? []);
      setLoadingTags(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-focus the input on open.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Click-outside + Escape to close.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (submitting) return;
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (submitting) return;
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [submitting, onClose, anchorRef]);

  const trimmed = query.trim();
  const trimmedLower = trimmed.toLowerCase();

  const filtered = useMemo(() => {
    if (!trimmedLower) return allTags;
    return allTags.filter((t) => t.name.toLowerCase().includes(trimmedLower));
  }, [allTags, trimmedLower]);

  // Show "Create tag X" if user typed something AND no exact match exists.
  const exactMatchExists = useMemo(
    () => allTags.some((t) => t.name.toLowerCase() === trimmedLower),
    [allTags, trimmedLower],
  );
  const showCreateOption = trimmed.length > 0 && !exactMatchExists;

  async function handleApply(tagName: string) {
    const name = tagName.trim();
    if (!name || submitting || selectedIds.length === 0) return;
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("bulk_add_contact_tag", {
        p_contact_ids: selectedIds,
        p_tag_name: name,
      });
      if (error) {
        console.error("[bulk_add_contact_tag] RPC error:", error);
        onError(error.message);
        return;
      }
      const taggedCount = (data as { tagged_count: number; created_tag_id: string }[] | null)?.[0]?.tagged_count ?? 0;
      onSuccess(Number(taggedCount), name);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      ref={popoverRef}
      className="absolute top-full left-0 mt-1 z-40 w-64 rounded-lg border border-zinc-800 bg-zinc-900 shadow-2xl"
      role="menu"
    >
      <div className="px-3 pt-3 pb-2 border-b border-zinc-800">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={submitting}
          placeholder="Search or create tag…"
          className="h-8 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
        />
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {showCreateOption && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleApply(trimmed)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-emerald-400 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Create tag &ldquo;{trimmed}&rdquo;</span>
          </button>
        )}
        {loadingTags ? (
          <div className="px-3 py-2 text-xs text-zinc-500">Loading tags…</div>
        ) : filtered.length === 0 && !showCreateOption ? (
          <div className="px-3 py-2 text-xs text-zinc-500">
            {trimmed ? "No matching tags" : "No tags yet — type to create one"}
          </div>
        ) : (
          filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={submitting}
              onClick={() => handleApply(t.name)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <TagIcon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <span className="truncate">{t.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
