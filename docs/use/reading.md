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

| You say                                   | Kaja does                                                   |
| ----------------------------------------- | ----------------------------------------------------------- |
| "Save https://example.com/post for later" | fetches the page, adds it to the inbox and names its topics |
| "What's in my reading inbox?"             | lists what is waiting, newest first, each with a number     |
| "Read me number 3" / "Summarise 3"        | works from the stored text, without fetching it again       |
| "I'm done with 3"                         | marks it read                                               |
| "Archive 2"                               | takes it out of the inbox (nothing is deleted)              |
| "Show my archived articles"               | lists what you put away; saving a link again restores it    |

Every article has a number that stays the same, so "3" keeps meaning the same article.

## Topics

Each saved article gets one to three topics and a one-line gist. Topics are specific ("AI agents", "Postgres
internals") and your own: Kaja reuses the ones you already have before it makes a new one, and writes them in
your account's language.

| You say                                     | Kaja does                                                |
| ------------------------------------------- | -------------------------------------------------------- |
| "What topics do I have?"                    | lists them with how many articles each has               |
| "What have I been reading about Rust?"      | lists that topic's articles, read ones included          |
| "Follow AI agents" / "Mute crypto"          | marks a standing interest, or a subject you're done with |
| "Rename LLM agents to AI agents"            | renames the topic                                        |
| "Merge LLM agents into AI agents"           | moves its articles over and removes it                   |
| "Number 4 isn't about Rust, it's about Zig" | replaces that article's topics                           |

When a topic reaches three saved articles, Kaja asks once whether you want to follow it. Following doesn't
bring in new articles yet; it marks the interests that discovery will use.

## A link on its own

The first time you send a link with nothing else, Kaja asks whether to **save it for later** or **read it now**,
and remembers the answer for your account. Reading now still keeps the article, marked read and outside the
inbox, so "what have I been reading about…" covers it. Change your mind any time: "just save links from now
on", "ask me again about links".

A link that comes with a question ("what does this say about pricing? https://…") is answered as before.

## Good to know

- Saving the same page twice keeps one copy. Tracking parameters such as `utm_source` don't make it a new one.
- A page that can't be fetched (a dead link, a login wall) is still saved as a link. Ask Kaja to save it again
  later and it tries once more.
- If the topics can't be worked out right then, the article is saved without them; saving it again tries once more.
- Pages are fetched through a [sandbox](/use/sandbox), like every other web request a cloud chat makes.
- A [persona](/abilities/personas) has the inbox when its `abilities` list names `reading`. The default
  persona does.

---

Next:

[Abilities](/abilities){: .btn .btn-green .fs-5 }
