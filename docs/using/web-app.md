---
layout: page
title: Web app
parent: Using Kaja
nav_order: 2
summary: "Where your cloud account lives: choose what the cloud agent can do."
---

# Web app

[kaja.io](https://kaja.io) is where your cloud account lives. You don't chat there. You choose what the
cloud agent can do, and the terminal, the cloud Telegram bot and your widgets pick it up.

## Signing in

Sign up with an email and password (you'll get a verification email), or with Google where offered. Two
boxes come first: that you're 18 or over and accept the [Terms](/terms) and [Privacy Policy](/privacy), and
that you consent to Kaja processing any health information you choose to share. A Google account can only be
created from the sign-up page. On the sign-in page it only signs in. Reset a forgotten password from the
sign-in page.

The terminal's [device login](/getting-started/modes#cloud-mode) lands here too: open
[kaja.io/device](https://kaja.io/device), sign in, and confirm the code from your terminal.

## Pages

The top menu has one item per section, and a section's pages are tabs inside it.

| Page | What it's for |
| --- | --- |
| **Welcome** | shown once after sign-up: pick the abilities you start with |
| **Dashboard › Overview** | a welcome and the **Connect Telegram** card |
| **Dashboard › Stats** | your usage: sessions, messages, tokens and latency by day, channel, tool, persona and model |
| **Agent › Abilities** | turn skills, HTTP tools and MCP servers on and off, save the keys they need, then pick personas. A tool's or server's **Tools** list says what each tool does and lets you untick some |
| **Agent › Widget** | create, edit, disable and delete [widget keys](/using/widget#getting-a-key) |
| **Agent › Sandbox** | your sandbox key and the `docker run` command for an [MCP sandbox](https://github.com/SubZtep/kaja/tree/main/apps/sandbox#readme) on your own machine, the sandboxes you run, and whether others may use yours and you theirs (whoever runs a shared one can see the pages it opens) |
| **Profile** | your name and avatar, email and password, and deleting your account with everything stored under it |

The language picker at the bottom of every page switches the site. Signed in, it also saves to your
account, so emails, the Telegram bot and the terminal's cloud mode follow.

**Profile → API keys** lists the abilities your personas use that take a key, with Add, Replace and Remove.
How keys are kept is on [Abilities in the cloud](/abilities/marketplace#in-the-cloud).

Admins also get an **Admin** menu for users, the model catalog and a live view of the MCP sandboxes, plus a
**Sync now** button for the marketplace on the admin dashboard. A catalog model can have a context window
(left blank, it's asked from the provider), and a free model with the `summarize` task writes the cloud's
[summaries](/configuration/config#context).

---

Next:

[Telegram](/using/telegram){: .btn .btn-green .fs-5 }
