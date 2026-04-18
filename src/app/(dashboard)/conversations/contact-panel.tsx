"use client";

import { Mail, Phone, Building2, Tag, Clock } from "lucide-react";
import type { Contact } from "@/types/database";

interface ContactPanelProps {
  contact: Contact | null;
}

export function ContactPanel({ contact }: ContactPanelProps) {
  const getInitials = (contact: Contact | null) => {
    if (!contact) return "?";
    const first = contact.first_name?.[0] || "";
    const last = contact.last_name?.[0] || "";
    return (first + last).toUpperCase() || "?";
  };

  if (!contact) {
    return (
      <div className="flex h-full w-72 flex-col items-center justify-center border-l border-zinc-800 bg-zinc-950 text-zinc-500">
        <p className="text-sm">Select a conversation to view contact details</p>
      </div>
    );
  }

  const contactName = `${contact.first_name || ""} ${contact.last_name || ""}`.trim();
  const initials = getInitials(contact);

  return (
    <div className="flex w-72 flex-col border-l border-zinc-800 bg-zinc-950">
      {/* Contact Card */}
      <div className="border-b border-zinc-800 p-6">
        {/* Avatar */}
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-2xl font-bold text-white">
            {initials}
          </div>
        </div>

        {/* Name and Info */}
        <h3 className="text-center text-lg font-semibold text-white">
          {contactName || "Unknown"}
        </h3>

        {contact.job_title && (
          <p className="text-center text-sm text-zinc-400">{contact.job_title}</p>
        )}

        {contact.status && (
          <div className="mt-3 flex justify-center">
            <span className="inline-flex items-center rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300">
              {contact.status}
            </span>
          </div>
        )}
      </div>

      {/* Contact Details */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          {/* Email */}
          {contact.email && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-400">
                <Mail className="h-4 w-4" />
                Email
              </div>
              <a
                href={`mailto:${contact.email}`}
                className="block truncate text-sm text-indigo-400 hover:text-indigo-300"
              >
                {contact.email}
              </a>
            </div>
          )}

          {/* Phone */}
          {contact.phone && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-400">
                <Phone className="h-4 w-4" />
                Phone
              </div>
              <span className="block text-sm text-zinc-300">
                {contact.phone}
              </span>
            </div>
          )}

          {/* Company */}
          {contact.company_name && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-400">
                <Building2 className="h-4 w-4" />
                Company
              </div>
              <p className="text-sm text-white">{contact.company_name}</p>
            </div>
          )}

          {/* Location */}
          {(contact.city || contact.state) && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-400">
                <Clock className="h-4 w-4" />
                Location
              </div>
              <p className="text-sm text-white">
                {[contact.city, contact.state].filter(Boolean).join(", ")}
              </p>
            </div>
          )}

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-400">
                <Tag className="h-4 w-4" />
                Tags
              </div>
              <div className="flex flex-wrap gap-2">
                {contact.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-full bg-indigo-900/30 px-2.5 py-0.5 text-xs font-medium text-indigo-300 border border-indigo-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Lead Score */}
          {contact.lead_score > 0 && (
            <div>
              <div className="mb-2 text-sm font-semibold text-zinc-400">
                Lead Score
              </div>
              <div className="flex items-center">
                <div className="h-2 flex-1 rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-all"
                    style={{
                      width: `${Math.min(contact.lead_score, 100)}%`,
                    }}
                  />
                </div>
                <span className="ml-2 text-sm text-white font-semibold">
                  {Math.min(contact.lead_score, 100)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="border-t border-zinc-800 p-6">
        <h4 className="mb-4 font-semibold text-white">Recent Activity</h4>
        <div className="space-y-3">
          <div className="flex items-start gap-3 text-sm">
            <div className="mt-1 h-2 w-2 rounded-full bg-indigo-500 flex-shrink-0" />
            <div>
              <p className="text-zinc-300">Message received</p>
              <p className="text-xs text-zinc-500">2 hours ago</p>
            </div>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <div className="mt-1 h-2 w-2 rounded-full bg-zinc-600 flex-shrink-0" />
            <div>
              <p className="text-zinc-300">Conversation started</p>
              <p className="text-xs text-zinc-500">3 days ago</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
