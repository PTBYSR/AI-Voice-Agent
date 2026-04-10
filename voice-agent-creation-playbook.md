---
name: Voice Agent Creation Playbook
description: Step-by-step system prompt and process for building voice AI agents using Vapi + n8n MCP tools
type: project
---

# Voice Agent Creation Playbook

This is the authoritative process for building voice AI agents when a user makes a request. Follow every phase in order. Do not skip phases.

---

## Phase 1 — Understand the Request

Listen carefully to what the user wants the voice agent to do. Extract:

- **Agent purpose** (e.g. appointment booking, lead qualification, customer support, availability checking)
- **Actions the agent must perform** (e.g. book appointment, check calendar, send confirmation, look up records)
- **Data sources or integrations needed** (e.g. Google Calendar, CRM, database, Slack)
- **Voice preferences** — tone, language, accent, speed (if specified)
- **Any constraints** — business hours, escalation rules, fallback behaviour

Ask clarifying questions before building if the request is ambiguous.

---

## Phase 2 — Design the n8n Workflows First

Before touching Vapi, design and plan every n8n workflow the agent will need.

### Rules
- Each **agent action** (tool call) maps to exactly **one n8n workflow**
- Every workflow must start with a **Webhook node** (this is how Vapi calls it)
- Workflow must return a **structured JSON response** back to Vapi via the Respond to Webhook node
- Design error handling — always return a meaningful message if something fails

### Common workflow patterns

| User Intent | Workflow Design |
|---|---|
| Book appointment | Webhook → Check availability (Google Calendar / CRM) → Create event → Respond |
| Check availability | Webhook → Query calendar/database → Format slots → Respond |
| Send confirmation | Webhook → Format message → Send email/SMS → Respond |
| Look up record | Webhook → Query database/CRM → Return data → Respond |
| Escalate to human | Webhook → Notify agent (Slack/email) → Respond with status |

### Before building, document for each workflow:
1. Workflow name
2. Input parameters it expects (from Vapi tool call)
3. Steps / nodes it will use
4. Output JSON structure it returns

---

## Phase 3 — Build the n8n Workflows & Get Webhook URLs

Use the `n8n-mcp` MCP server tools to create each workflow.

### Steps
1. Create each workflow using the MCP tools
2. Add and configure the **Webhook trigger node** — set method to `POST`
3. Build out the full workflow logic (API calls, data transforms, responses)
4. Add a **Respond to Webhook** node at the end — return structured JSON:
   ```json
   {
     "success": true,
     "message": "Appointment booked for Thursday at 2pm",
     "data": { ... }
   }
   ```
5. **Activate** each workflow (inactive workflows won't respond to webhooks)
6. **Copy the Production Webhook URL** for each workflow — you will need this in Phase 4

> The production webhook URL format for n8n cloud is:
> `https://{instance}.app.n8n.cloud/webhook/{webhook-id}`

---

## Phase 4 — Create the Vapi Assistant

Now use the `vapi` MCP server tools to build the assistant.

### 4a — Define Tools (one per n8n workflow)

For each workflow, create a Vapi tool with:

```json
{
  "type": "function",
  "function": {
    "name": "book_appointment",
    "description": "Books an appointment for the caller at their requested date and time",
    "parameters": {
      "type": "object",
      "properties": {
        "date": { "type": "string", "description": "Requested date in YYYY-MM-DD format" },
        "time": { "type": "string", "description": "Requested time in HH:MM format" },
        "name": { "type": "string", "description": "Caller's full name" }
      },
      "required": ["date", "time", "name"]
    }
  },
  "server": {
    "url": "https://cohort2pod1.app.n8n.cloud/webhook/{webhook-id}"
  }
}
```

- The `server.url` must be the **production webhook URL** from Phase 3
- Tool names must be snake_case and clearly describe the action
- Descriptions must be clear enough for the LLM to know when to call them

### 4b — Write the System Prompt

Structure the assistant prompt as follows:

```
You are [Agent Name], a voice assistant for [Business/Purpose].

## Your Role
[What the agent does and who it serves]

## Your Capabilities
You can help callers with:
- [Action 1] — use the [tool_name] tool
- [Action 2] — use the [tool_name] tool

## Conversation Guidelines
- Always greet the caller warmly
- Speak naturally and concisely — this is a voice call
- Confirm details before taking any action
- If you cannot help, offer to transfer or take a message
- Keep responses under 2 sentences where possible

## Constraints
[Any business rules, hours, restrictions]
```

### 4c — Configure Voice Settings

```json
{
  "voice": {
    "provider": "11labs",
    "voiceId": "21m00Tcm4TlvDq8ikWAM",  // default — adjust per user preference
    "stability": 0.5,
    "similarityBoost": 0.75,
    "speed": 1.0
  },
  "transcriber": {
    "provider": "deepgram",
    "model": "nova-2",
    "language": "en-US"
  },
  "model": {
    "provider": "openai",
    "model": "gpt-4o",
    "temperature": 0.7
  }
}
```

Adjust based on user instructions:
- **Language/accent** → change `voice.voiceId` and `transcriber.language`
- **Speed** → adjust `voice.speed` (0.5 = slow, 1.5 = fast)
- **Formality** → adjust `model.temperature` (lower = more predictable)

### 4d — Create the Assistant

Use the Vapi MCP `create_assistant` tool with all of the above combined.

---

## Phase 5 — System Test

Use the Vapi MCP test function to run a full end-to-end test.

### Test Checklist
- [ ] Assistant picks up and delivers the greeting correctly
- [ ] Assistant understands the primary intent (e.g. "I want to book an appointment")
- [ ] Tool call is triggered with correct parameters
- [ ] n8n webhook receives the call and executes the workflow
- [ ] n8n workflow returns a valid JSON response
- [ ] Assistant reads the response back to the caller naturally
- [ ] Edge cases handled: missing info, invalid date, out-of-hours request
- [ ] Fallback/error responses are graceful

### If a test fails
1. Check the Vapi call logs for the tool call payload
2. Check n8n execution history for the workflow run
3. Verify the webhook URL is correct and the workflow is **activated**
4. Fix and re-test before handing off to the user

---

## Tools Available

| Tool | MCP Server | Purpose |
|---|---|---|
| `create_assistant` | vapi | Create a new Vapi assistant |
| `update_assistant` | vapi | Update assistant config |
| `list_calls` | vapi | View recent calls |
| `create_phone_number` | vapi | Provision a phone number |
| Workflow CRUD | n8n-mcp | Create/update/activate workflows |
| Node management | n8n-mcp | Configure individual nodes |

---

## Key Credentials (stored in MCP config)

- **n8n instance:** `https://cohort2pod1.app.n8n.cloud`
- **Vapi API key:** configured in MCP server
- **n8n API key:** configured in MCP server
