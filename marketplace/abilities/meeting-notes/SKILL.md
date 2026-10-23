---
name: meeting-notes
description: Turn rough meeting notes or a transcript into a clear summary with decisions, action items (owner and due date) and open questions. Use when the user pastes notes, a chat log or a transcript and wants it cleaned up, summarized or turned into a to-do list.
---

# Meeting notes

1. Read everything the user gave you before writing anything. If it's cut off or clearly only part
   of the meeting, say so in one line at the top of your answer.
2. Load the layout with `load_skill` and file `template.md`, and fill it in.
3. Write in the language the notes are in, unless the user asks for another.

## Rules

- Only write down what the notes say. Never invent an owner, a date or a decision; write
  "owner: ?" or "due: ?" when it isn't there, so the gap is visible.
- A decision is something the group agreed on. A proposal nobody confirmed goes under open
  questions.
- Action items start with a verb and are small enough to be done by one person.
- Keep names exactly as written in the notes.
- Leave out small talk, repeated points and anything the notes mark as off the record.
- If the notes are very short (a few lines), skip the headings that would be empty rather than
  writing "none".

When you're done, offer to turn the action items into a message the user can send to the attendees.
