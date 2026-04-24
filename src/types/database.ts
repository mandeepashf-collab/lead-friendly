// Core database types matching Supabase schema

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  owner_id: string | null;
  primary_logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  sidebar_color: string;
  plan: "starter" | "professional" | "agency";
  ai_minutes_limit: number;
  ai_minutes_used: number;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  organization_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "owner" | "admin" | "manager" | "agent" | "viewer";
  status: "active" | "inactive" | "invited";
  created_at: string;
}

export interface Contact {
  id: string;
  organization_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  cell_phone?: string | null;
  company_name: string | null;
  lender_name: string | null;
  job_title: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  source: string | null;
  status: string;
  assigned_to: string | null;
  lead_score: number;
  tags: string[];
  custom_fields: Record<string, unknown>;
  call_status: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  organization_id: string;
  contact_id: string | null;
  channel: string;
  last_message: string | null;
  last_message_at: string | null;
  status: string;
  unread_count: number;
  is_starred: boolean;
  assigned_to: string | null;
}

export interface Opportunity {
  id: string;
  organization_id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id: string | null;
  name: string;
  value: number;
  status: string;
  assigned_to: string | null;
  expected_close_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Call {
  id: string;
  organization_id: string;
  contact_id: string | null;
  ai_agent_id: string | null;
  direction: "inbound" | "outbound";
  status: string;
  outcome: string | null;
  duration_seconds: number;
  call_summary: string | null;
  recording_url: string | null;
  transcript: string | null;
  sentiment: string | null;
  call_type: "telnyx" | "webrtc" | null;
  livekit_room_id: string | null;
  created_at: string;
}

export interface Campaign {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  status: string;
  ai_agent_id: string | null;
  daily_call_limit: number;
  total_contacted: number;
  total_answered: number;
  total_appointments: number;
}

export interface AIAgent {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  status: string;
  voice_id: string | null;
  system_prompt: string | null;
  greeting_message: string | null;
  retell_agent_id: string | null;
  retell_llm_id: string | null;
  cost_per_minute: number | null;
  total_calls: number;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  organization_id: string;
  contact_id: string | null;
  assigned_to: string | null;
  title: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  booked_by: string;
}

export interface Workflow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  status: string;
  trigger_type: string;
  steps: unknown[];
  total_runs: number;
}

export interface Invoice {
  id: string;
  organization_id: string;
  contact_id: string | null;
  invoice_number: string;
  status: string;
  total: number;
  issue_date: string;
  due_date: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  channel: string;
  body: string;
  content: string;
  is_outgoing: boolean;
  status: string;
  created_at: string;
}
