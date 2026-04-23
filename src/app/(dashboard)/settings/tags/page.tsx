"use client";

/**
 * Tag management page.
 * Lists all tags for the current org with usage counts.
 * Supports: create, rename, change color, delete.
 *
 * Deletion cascades via FK to contact_tags, and the sync trigger
 * removes the tag name from every affected contact's tags[] array.
 */

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, Trash2, Tag as TagIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagRow {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  usage_count: number;
}

const SYSTEM_TAGS = new Set(["eval-failed"]); // cannot rename or delete

const DEFAULT_COLORS = [
  "#6366f1", "#ef4444", "#10b981", "#f59e0b",
  "#ec4899", "#14b8a6", "#8b5cf6", "#06b6d4",
];

export default function TagsSettingsPage() {
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tags")
      .select("id, name, color, description, usage_count")
      .order("name", { ascending: true });
    if (error) {
      setError(error.message);
    } else {
      setTags((data as TagRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCreating(false); return; }
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (!profile?.organization_id) { setCreating(false); return; }

    const { error } = await supabase.from("tags").insert({
      organization_id: profile.organization_id,
      name,
      color: newColor,
    });
    if (error) {
      setError(error.message);
    } else {
      setNewName("");
      setNewColor(DEFAULT_COLORS[0]);
      await load();
    }
    setCreating(false);
  }

  async function handleRename(tagId: string, currentName: string) {
    if (SYSTEM_TAGS.has(currentName.toLowerCase())) {
      setError(`"${currentName}" is a system tag and cannot be renamed.`);
      return;
    }
    const next = window.prompt(`Rename tag "${currentName}":`, currentName);
    if (!next || next.trim() === currentName) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("tags")
      .update({ name: next.trim() })
      .eq("id", tagId);
    if (error) setError(error.message);
    else await load();
  }

  async function handleColor(tagId: string, color: string) {
    const supabase = createClient();
    const { error } = await supabase.from("tags").update({ color }).eq("id", tagId);
    if (error) setError(error.message);
    else await load();
  }

  async function handleDelete(tag: TagRow) {
    if (SYSTEM_TAGS.has(tag.name.toLowerCase())) {
      setError(`"${tag.name}" is a system tag and cannot be deleted.`);
      return;
    }
    const used = tag.usage_count > 0
      ? `This tag is currently applied to ${tag.usage_count} contact${tag.usage_count === 1 ? "" : "s"}. Deleting will remove it from all of them.\n\n`
      : "";
    if (!window.confirm(`${used}Delete tag "${tag.name}"?`)) return;

    const supabase = createClient();
    const { error } = await supabase.from("tags").delete().eq("id", tag.id);
    if (error) setError(error.message);
    else await load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <TagIcon className="h-5 w-5 text-indigo-400" /> Tags
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Tags drive automation. When you add a tag to a contact, any campaign that
          listens for that tag will enroll the contact automatically.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <X className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-400">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Create new */}
      <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">
          Create tag
        </p>
        <div className="flex gap-2 items-center">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            placeholder="e.g. hot-lead"
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 placeholder:text-zinc-600"
          />
          <div className="flex gap-1">
            {DEFAULT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition-all",
                  newColor === c ? "border-white scale-110" : "border-transparent hover:scale-105",
                )}
                style={{ backgroundColor: c }}
                aria-label={`Pick color ${c}`}
              />
            ))}
          </div>
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-2 text-sm font-medium text-white transition-colors"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Create
          </button>
        </div>
      </div>

      {/* Tag list */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        {tags.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            No tags yet. Create your first tag above.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Tag</th>
                <th className="px-4 py-2 text-left font-semibold">Color</th>
                <th className="px-4 py-2 text-right font-semibold">Contacts</th>
                <th className="px-4 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {tags.map((tag) => {
                const isSystem = SYSTEM_TAGS.has(tag.name.toLowerCase());
                return (
                  <tr key={tag.id} className="hover:bg-zinc-900/30">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRename(tag.id, tag.name)}
                        disabled={isSystem}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          isSystem ? "cursor-not-allowed" : "hover:opacity-80",
                        )}
                        style={{
                          borderColor: (tag.color ?? "#6366f1") + "55",
                          backgroundColor: (tag.color ?? "#6366f1") + "15",
                          color: tag.color ?? "#6366f1",
                        }}
                        title={isSystem ? "System tag — cannot be renamed" : "Click to rename"}
                      >
                        {tag.name}
                        {isSystem && <span className="text-[10px] opacity-60">(system)</span>}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {DEFAULT_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => handleColor(tag.id, c)}
                            className={cn(
                              "h-5 w-5 rounded-full border-2 transition-all",
                              (tag.color ?? "") === c ? "border-white" : "border-transparent hover:scale-110",
                            )}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400">
                      {tag.usage_count}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(tag)}
                        disabled={isSystem}
                        className="inline-flex items-center gap-1 text-xs text-red-400/80 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
