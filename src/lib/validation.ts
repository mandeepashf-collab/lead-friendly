import { z } from "zod";

// ── Phone number (E.164 format) ────────────────────────────────
const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format");

// ── Contact ────────────────────────────────────────────────────
export const contactSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100).trim(),
  last_name: z.string().max(100).trim().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: phoneSchema.optional().or(z.literal("")),
  tags: z.array(z.string().max(50)).max(20).optional(),
  notes: z.string().max(10000).optional(),
  status: z.string().max(50).optional(),
  source: z.string().max(100).optional(),
});

// ── Call trigger ───────────────────────────────────────────────
export const callTriggerSchema = z.object({
  to: phoneSchema,
  from: phoneSchema.optional(),
  agent_id: z.string().uuid("Invalid agent ID").optional(),
  contact_id: z.string().uuid("Invalid contact ID").optional(),
});

// ── Agent generate ─────────────────────────────────────────────
export const agentGenerateSchema = z.object({
  description: z.string().min(10, "Description too short").max(5000),
});

// ── Agent chat ─────────────────────────────────────────────────
export const agentChatSchema = z.object({
  agent_id: z.string().uuid("Invalid agent ID"),
  message: z.string().min(1, "Message required").max(5000),
  conversation_history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(10000),
      })
    )
    .max(100)
    .optional(),
});

// ── Agent voice test ───────────────────────────────────────────
export const voiceTestSchema = z.object({
  agent_id: z.string().uuid("Invalid agent ID"),
  audio_base64: z.string().min(1, "Audio data required"),
  conversation_history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(10000),
      })
    )
    .max(100)
    .optional(),
});

// ── Agent simulate ─────────────────────────────────────────────
export const simulateSchema = z.object({
  agent_id: z.string().uuid("Invalid agent ID"),
  scenario: z.string().min(5).max(2000),
  max_turns: z.number().int().min(1).max(12).optional(),
});

// ── SMS send ───────────────────────────────────────────────────
export const smsSendSchema = z.object({
  to: phoneSchema,
  from: phoneSchema.optional(),
  message: z.string().min(1, "Message required").max(1600),
  contact_id: z.string().uuid().optional(),
});

// ── Email send ─────────────────────────────────────────────────
export const emailSendSchema = z.object({
  to: z.string().email("Invalid email"),
  subject: z.string().min(1, "Subject required").max(500),
  body: z.string().min(1, "Body required").max(100000),
  contact_id: z.string().uuid().optional(),
});

// ── Campaign ───────────────────────────────────────────────────
export const campaignSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  type: z.enum(["sms", "email", "voice"]),
  message: z.string().max(5000).optional(),
  subject: z.string().max(500).optional(),
  scheduled_at: z.string().datetime().optional(),
});

// ── Appointment ────────────────────────────────────────────────
export const appointmentSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  contact_id: z.string().uuid().optional(),
  notes: z.string().max(5000).optional(),
});

// ── Helper: parse and return 400 on failure ────────────────────
export function parseBody<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { data: T; error: null } | { data: null; error: Response } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      data: null,
      error: Response.json(
        { error: "Invalid request body", details: result.error.flatten() },
        { status: 400 }
      ),
    };
  }
  return { data: result.data, error: null };
}
