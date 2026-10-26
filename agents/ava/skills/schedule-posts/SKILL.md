---
name: schedule-posts
description: "Turn approved Ava hooks into captioned post drafts, request approval, then schedule through Postiz without publishing directly."
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [content, scheduling, postiz, approval, slack]
    related_skills: [post-as, write-hooks]
---

# Schedule Posts

Use this skill only after hooks have been approved for drafting. Scheduling is approval-gated twice: approved hooks may become drafts, but no Postiz scheduling call happens until the final draft batch is approved in #content.

## Inputs

1. Confirm the approved hooks and cite the approval source: owner request, #content thread, or `workspace/reports/ava-hooks-YYYY-MM-DD.md` plus approval note.
2. Read `knowledge/ava/style.md` for caption voice, hashtag policy, and banned phrases.
3. Read `knowledge/ava/cadence.md` for daily volume, best times, and per-platform notes.
4. Check `hermes -p jarvis mcp list` for the `postiz` MCP server. If it is absent, check whether `POSTIZ_API_KEY` is set for the REST fallback and, for self-hosted Postiz, whether `POSTIZ_URL` is set to the documented backend URL.
5. If approval, cadence, or style is missing, stop and ask. If neither Postiz MCP nor the REST fallback is configured, say so plainly and point the owner to `playbooks/postiz.md`. Never fabricate a scheduled post. Guessing is not editorial confidence; it is upholstery.

## Drafting Procedure

1. Turn each approved hook into a post draft: platform, scheduled time, hook, caption, hashtags, media or footage note, and source hook.
2. Keep captions within `knowledge/ava/style.md`; strip banned phrases even if the hook was approved.
3. Hit the `knowledge/ava/cadence.md` target unless the owner approved a different count.
4. Post the draft batch in #content via `post-as` with a clear approval request.
5. Wait for explicit owner approval before any API call. Silence, reactions, or "looks fine" from anyone else do not count.

## Postiz MCP Scheduling

Never publish directly. Schedule only. Use the tools exposed by the `postiz` MCP server as the primary route:

1. Use the Postiz MCP tools exposed for listing posts to check the relevant schedule and avoid duplicates.
2. Use the Postiz MCP tool exposed for scheduling posts only for the owner-approved platform, content, and time.
3. List the posts again to verify that each scheduled item exists. Record the response reference if Postiz provides one; a confident sentence is not a receipt.

If the required MCP tool is unavailable, do not invent a tool name or claim success. Move to the REST fallback only when it is configured.

## Video or Image From the Owner's Computer

When the owner asks you to post a file they saved, for example "schedule launch.mp4 to YouTube on Tuesday":

1. The file must be in the workspace folder (`workspace/`). If it is not there, ask the owner to put it there; do not go looking elsewhere. Postiz takes .mp4, .png, .jpg, .jpeg, .gif and .webp.
2. Show the owner the final post before any call: file, channel, date and time with time zone, and for YouTube the title, description and visibility. Wait for their explicit yes, in #content or in the chat where they asked. Nothing is uploaded or scheduled before that.
3. Call `postiz_upload` with the file's path, for example `workspace/launch.mp4`. It returns the Postiz media `id` and `path`. If it returns an error, tell the owner what it says and stop. Upload a file once: if you need it again, find it with the Postiz MCP `mediaListTool` and reuse its `path`.
4. Schedule through the Postiz MCP: `integrationList` for the channel id, `integrationSchema` for that channel's settings (YouTube needs a title and a visibility type), then `integrationSchedulePostTool` with type `schedule`, the date in UTC, the description as the post content, and the returned `path` as the attachment. With the REST fallback, attach it as described there. On the ChatGPT brain, use the MCP; the REST fallback is for the other brains.
5. Read it back with `postsListTool` (or the REST posts list) and report to the owner the scheduled time in their time zone, the YouTube title and description, and the preview link if Postiz returned one.

## REST Fallback

Postiz's normal public REST API accepts the same `POSTIZ_API_KEY`. Follow the current Postiz Public API documentation for the base URL, method, authentication header, scheduling endpoint, and payload, and make the request with `curl`. Refer to the secret only through the environment variable:

```bash
curl --fail-with-body --silent --show-error \
  --request <METHOD_FROM_CURRENT_POSTIZ_DOCS> \
  --header "<AUTH_HEADER_FROM_CURRENT_POSTIZ_DOCS>: $POSTIZ_API_KEY" \
  --data '<APPROVED_PAYLOAD_FROM_CURRENT_POSTIZ_DOCS>' \
  "<CURRENT_POSTIZ_REST_BASE>/<SCHEDULING_ENDPOINT_FROM_CURRENT_POSTIZ_DOCS>"
```

To attach a file uploaded with `postiz_upload`, put its `id` and `path` in the post's `value[].image` list: `[{"id": "<id>", "path": "<path>"}]`.

For a self-hosted instance, use `$POSTIZ_URL` as the backend base only after confirming it in that instance's settings or version-matched documentation. Do not guess an endpoint, authentication header, payload field, platform value, or self-hosted backend URL.

If MCP or REST returns an error, record the response once and stop. Do not retry unattended against a posting API, and never report the post as scheduled without a Postiz response and read-back verification.

## Log

Append every scheduled item to `workspace/reports/ava-scheduled.md`:

- Date scheduled
- Approval source
- Platform and scheduled time
- Caption preview
- Postiz response reference, connection path (`mcp` or `rest`), or error
- Source hook report
