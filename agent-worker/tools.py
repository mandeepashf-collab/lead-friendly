"""
AI tool functions for the Lead Friendly voice agent.

These are exposed to Claude Haiku as callable tools during the conversation.
The agent can invoke them based on conversation context (e.g., booking an
appointment after the lead confirms a date/time).
"""

import logging
import os

import httpx
from livekit.agents import llm

logger = logging.getLogger("lf-agent.tools")

# Internal API key for server-to-server calls (optional)
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")


class AgentTools:
    def __init__(
        self,
        api_base_url: str,
        call_record_id: str,
        agent_config: dict,
    ):
        self.api_base = api_base_url.rstrip("/")
        self.call_id = call_record_id
        self.config = agent_config

    def create_function_context(self) -> llm.FunctionContext:
        """Register all tool functions and return the FunctionContext."""
        fnc_ctx = llm.FunctionContext()

        @fnc_ctx.ai_callable(
            description=(
                "Book a meeting/appointment after the lead confirms a date and time. "
                "Call this when the person agrees to schedule."
            ),
        )
        async def book_meeting(
            date: str,
            start_time: str,
            title: str = "",
            notes: str = "",
        ) -> str:
            """Book an appointment for the lead."""
            logger.info("book_meeting date=%s time=%s", date, start_time)
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.post(
                        f"{self.api_base}/api/appointments/book",
                        json={
                            "call_id": self.call_id,
                            "date": date,
                            "start_time": start_time,
                            "title": title or f"Appointment for {self.config.get('name', 'Agent')}",
                            "notes": notes,
                        },
                        headers=_auth_headers(),
                    )
                    if resp.status_code < 300:
                        return f"Meeting booked for {date} at {start_time}. Confirmation sent."
                    else:
                        logger.error("book_meeting API error: %s", resp.text[:200])
                        return f"I've noted the appointment for {date} at {start_time}. Our team will confirm shortly."
            except Exception as e:
                logger.error("book_meeting failed: %s", e)
                return f"I've noted the appointment for {date} at {start_time}. Our team will confirm shortly."

        @fnc_ctx.ai_callable(
            description=(
                "Transfer the call to a human agent or specific phone number. "
                "Use when the caller requests to speak with someone or the conversation "
                "requires human intervention."
            ),
        )
        async def transfer_call(reason: str) -> str:
            """Transfer the call to a human representative."""
            transfer_number = self.config.get("transferNumber")
            logger.info("transfer_call reason=%s number=%s", reason, transfer_number)

            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    await client.post(
                        f"{self.api_base}/api/calls/{self.call_id}/transfer",
                        json={
                            "reason": reason,
                            "transfer_number": transfer_number,
                        },
                        headers=_auth_headers(),
                    )
            except Exception as e:
                logger.warning("transfer_call API notification failed: %s", e)

            if transfer_number:
                return f"Transferring you now. One moment please."
            else:
                return "Let me connect you with a team member. One moment please."

        @fnc_ctx.ai_callable(
            description=(
                "End the call gracefully. Use when the conversation is naturally "
                "concluding, the caller wants to hang up, or the call objective is met."
            ),
        )
        async def end_call(
            reason: str,
            outcome: str = "completed",
        ) -> str:
            """End the call and update the call record."""
            logger.info("end_call reason=%s outcome=%s", reason, outcome)

            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    await client.patch(
                        f"{self.api_base}/api/calls/{self.call_id}",
                        json={
                            "status": "completed",
                            "outcome": outcome,
                            "notes": reason,
                        },
                        headers=_auth_headers(),
                    )
            except Exception as e:
                logger.warning("end_call API update failed: %s", e)

            return "Call ending. Goodbye!"

        @fnc_ctx.ai_callable(
            description=(
                "Save a note or piece of information collected during the call. "
                "Use to record important details the caller shares."
            ),
        )
        async def save_note(note: str, category: str = "general") -> str:
            """Save a note about the call."""
            logger.info("save_note category=%s note=%s", category, note[:80])

            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    await client.post(
                        f"{self.api_base}/api/calls/{self.call_id}/notes",
                        json={"note": note, "category": category},
                        headers=_auth_headers(),
                    )
            except Exception as e:
                logger.warning("save_note API failed: %s", e)

            return "Got it, I've noted that down."

        return fnc_ctx


def _auth_headers() -> dict[str, str]:
    """Build auth headers for internal API calls."""
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if INTERNAL_API_KEY:
        headers["Authorization"] = f"Bearer {INTERNAL_API_KEY}"
    return headers
