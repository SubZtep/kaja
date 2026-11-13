---
layout: page
title: Reading inbox
parent: Using Kaja
nav_order: 7
summary: Save links from any chat and read them later.
icon: 📚
---

# Reading inbox

Kaja can keep the articles you mean to read. Send it a link and ask it to save it: Kaja fetches the page and
stores its text, so the article is still there when the page changes or disappears.

Cloud accounts only for now. The inbox belongs to your account, so a link saved on Telegram shows up in the
terminal and on the web.

## What to say

There is nothing to switch on and no commands to learn. In any cloud chat:

| You say                                   | Kaja does                                                |
| ----------------------------------------- | -------------------------------------------------------- |
| "Save https://example.com/post for later" | fetches the page and adds it to the inbox                |
| "What's in my reading inbox?"             | lists what is waiting, newest first, each with a number  |
| "Read me number 3" / "Summarise 3"        | works from the stored text, without fetching it again    |
| "I'm done with 3"                         | marks it read                                            |
| "Archive 2"                               | takes it out of the inbox (nothing is deleted)           |
| "Show my archived articles"               | lists what you put away; saving a link again restores it |

Every article has a number that stays the same, so "3" keeps meaning the same article.

## Good to know

- Saving the same page twice keeps one copy. Tracking parameters such as `utm_source` don't make it a new one.
- A page that can't be fetched (a dead link, a login wall) is still saved as a link. Ask Kaja to save it again
  later and it tries once more.
- Pages are fetched through a [sandbox](/use/sandbox), like every other web request a cloud chat makes.
- A [persona](/abilities/personas) has the inbox when its `abilities` list names `reading`. The default
  persona does.

---

Next:

[Abilities](/abilities){: .btn .btn-green .fs-5 }
