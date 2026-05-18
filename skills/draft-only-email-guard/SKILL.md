---
name: draft-only-email-guard
description: >
  Enforces the company-wide policy that agents may never send email autonomously.
  All outbound email must be saved as a draft in Gmail or Outlook. The human always
  presses Send. Applies to every agent that has access to Gmail, Outlook, or any
  email-sending tool. Triggers on any intent to compose, reply to, or forward an
  email.
---

# Draft-Only Email Guard

## The Hard Rule

**You may NEVER send an email. You may only create drafts.**

This is a non-negotiable company policy put in place after an incident where an agent sent an email on behalf of the board without explicit human approval (see AZU-39). No exceptions. No workarounds.

### What you MUST do instead

1. **Create a draft** in Gmail (via Google API) or Outlook (via MS Graph API) — never call the send endpoint.
2. **Capture draft metadata** — see the Metadata section below.
3. **Notify the board via Paperclip** — post a comment on the triggering issue with the draft link, recipient list, and subject.
4. **Stop** — do not follow up by asking if you should send it. Sending is the human's job.

---

## Implementation: How to Create a Draft

### Gmail

```
POST https://gmail.googleapis.com/gmail/v1/users/me/drafts
{
  "message": {
    "raw": "<base64url-encoded RFC 2822 message>"
  }
}
```

Do **NOT** use:
- `POST .../messages/send`
- Any method with `send` in the name

### Outlook (MS Graph)

```
POST https://graph.microsoft.com/v1.0/me/messages
{
  "subject": "...",
  "body": { "contentType": "HTML", "content": "..." },
  "toRecipients": [{ "emailAddress": { "address": "..." } }]
}
```

This creates a draft in the Drafts folder (no `isDraft` flag needed — it is saved, not sent).

Do **NOT** use:
- `POST .../messages/{id}/send`
- `POST .../sendMail`

---

## Draft Metadata (Required)

Every draft created by an agent MUST include these metadata fields. Store them in a Paperclip comment (see Board Notification below) and in the draft's `body` header block or a custom property if the email client supports it.

| Field | Value |
|-------|-------|
| `agent_id` | The Paperclip agent ID that created the draft (`$PAPERCLIP_AGENT_ID`) |
| `task_id` | The Paperclip issue/task that triggered the email (`$PAPERCLIP_TASK_ID`) |
| `timestamp` | ISO 8601 UTC timestamp at time of draft creation |
| `intended_recipients` | Comma-separated list of `To:`, `Cc:`, `Bcc:` addresses |
| `subject` | Email subject line |
| `draft_url` | Link to the draft in Gmail or Outlook |
| `issue_identifier` | The Paperclip issue identifier (e.g., `AZU-40`) |

---

## Board Notification (Required)

After creating a draft, you MUST post a Paperclip comment on the triggering issue using this format:

```
POST /api/issues/{taskId}/comments
{
  "body": "## Email Draft Ready for Review\n\n...(see template below)..."
}
```

Use this comment template:

```markdown
## Email Draft Ready for Review

An outbound email has been drafted and is awaiting your review and manual send.

- **To:** {recipients}
- **Subject:** {subject}
- **Draft link:** [{client} Draft]({draft_url})
- **Agent:** {agent_name} (`{agent_id}`)
- **Task:** [{issue_identifier}](/AZU/issues/{issue_identifier})
- **Created at:** {timestamp}

> **Action required:** Open the draft in your email client, review it, and press Send if approved. No email has been transmitted.
```

Replace `AZU` with the actual company prefix from the issue identifier.

---

## Audit Log

All draft creation events are recorded by posting the board notification comment above. The Paperclip issue thread serves as the queryable audit trail. Every comment with the heading `## Email Draft Ready for Review` is an audit record.

Sent emails are recorded by the human sending them from the email client — the standard email client's Sent folder is the audit trail for who pressed Send and when.

---

## Permission Reminder

You have `draft.create` and `draft.read` capability only. You do NOT have:
- `send` permission
- Authority to click or invoke any send action
- Authority to schedule a send for a future time

If a tool or API call would result in an email being transmitted, abort the action and create a draft instead.

---

## If You Are Asked to Send an Email

If a user or agent asks you to "send an email," interpret this as "create a draft for human review." Do not ask for clarification about whether they really mean send — always default to draft. Explain in the Paperclip comment that the email is ready for manual review.

---

## Compliance Checklist (run before creating any draft)

- [ ] I am calling a draft creation endpoint, not a send endpoint
- [ ] I have captured all metadata fields listed above
- [ ] I will post a board notification comment after the draft is created
- [ ] The draft has not been transmitted
