# Lead Friendly Agent Worker — Deployment Guide

The agent worker is a Python process that joins LiveKit rooms and handles AI voice conversations using the LiveKit Agents framework.

## Prerequisites

You need these API keys in your `.env` file (copy from `.env.example`):

```
LIVEKIT_URL=wss://lead-friendly-bc511t0j.livekit.cloud
LIVEKIT_API_KEY=APIjwpkCnzXf9NF
LIVEKIT_API_SECRET=<your-secret>
ANTHROPIC_API_KEY=<your-key>
ELEVENLABS_API_KEY=<your-key>
DEEPGRAM_API_KEY=<your-key>
LEAD_FRIENDLY_API_URL=https://www.leadfriendly.com
```

---

## Option 1: Railway (Recommended)

Railway auto-detects the Dockerfile and handles scaling.

```bash
cd agent-worker
cp .env.example .env
# Fill in your API keys in .env

# Install Railway CLI
npm install -g @railway/cli
railway login

# Create project and deploy
railway init
railway up
```

Then add env vars in Railway dashboard or via CLI:
```bash
railway variables set LIVEKIT_URL=wss://lead-friendly-bc511t0j.livekit.cloud
railway variables set LIVEKIT_API_KEY=APIjwpkCnzXf9NF
railway variables set LIVEKIT_API_SECRET=<secret>
# ... add all other keys
```

---

## Option 2: Fly.io

```bash
cd agent-worker
cp .env.example .env

# Install Fly CLI
curl -L https://fly.io/install.sh | sh
fly auth login

# Launch app
fly launch --name lead-friendly-agent --region iad --no-deploy

# Set secrets
fly secrets set LIVEKIT_API_KEY=APIjwpkCnzXf9NF
fly secrets set LIVEKIT_API_SECRET=<secret>
fly secrets set ANTHROPIC_API_KEY=<key>
fly secrets set ELEVENLABS_API_KEY=<key>
fly secrets set DEEPGRAM_API_KEY=<key>

# Deploy
fly deploy
```

---

## Option 3: Docker Compose (Local Testing)

```bash
cd agent-worker
cp .env.example .env
# Fill in your API keys

docker compose up --build
```

---

## Option 4: Direct Python (Development)

```bash
cd agent-worker
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt

cp .env.example .env
# Fill in API keys

python main.py dev  # Dev mode with auto-reload
```

---

## Verifying It Works

1. Deploy the agent worker
2. Go to your agent builder at leadfriendly.com
3. Click "WebRTC Call" test tab
4. Click "Start WebRTC Call"
5. You should see "Waiting for AI agent..." then it connects
6. The agent will speak the greeting and you can have a conversation

## Logs

Check agent worker logs for connection status:
```
[lf-agent] Joining room=call_xxx agent=Brandon call=xxx
[lf-agent] Voice assistant started in room call_xxx
```

## Scaling

Each agent worker handles one call at a time. LiveKit Agents framework auto-dispatches workers to rooms. For concurrent calls, run multiple worker instances:

- **Railway**: Scale to 2+ instances in dashboard
- **Fly.io**: `fly scale count 3`
- **Docker**: `docker compose up --scale agent=3`
