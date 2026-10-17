---
layout: page
title: Web app
parent: Using Kaja
nav_order: 2
summary: "Your cloud account: keys, widgets, sandboxes and usage."
icon: 🌐
---

# Web app

[kaja.io](https://kaja.io) is where your cloud account lives. You don't chat there: you save keys, make
widgets and run sandboxes, and the terminal, the cloud Telegram bot and your widgets pick them up.

## Signing in

There are no passwords. Sign up or in with your email, then type the 6-digit code Kaja emails you (it works
for 10 minutes), or use Google where offered. On the sign-up page two boxes come first: that you're 18 or over
and accept the [Terms](/terms) and [Privacy Policy](/privacy), and that you consent to Kaja processing any
health information you choose to share. A new account, by email or Google, can only be created from the
sign-up page. On the sign-in page an unknown address or Google account only gets a pointer to it.
Signing up asks only for your email: your name and picture come from your public [Gravatar](https://gravatar.com)
profile, or from Google, and you can change them on your profile page.

The terminal's [device login](/getting-started/modes#cloud-mode) lands here too: open
[kaja.io/device](https://kaja.io/device), sign in, and confirm the code from your terminal.

## Pages

The top menu has one item per section, and a section's pages are tabs inside it.

| Page | What it's for |
| --- | --- |
| **Dashboard › Overview** | where you're signed in, the **Connect Telegram** card and a sandbox summary |
| **Dashboard › Stats** | your usage: sessions, messages, tokens and latency by day, channel, tool, persona and model |
| **Agent › Widget** | create, edit, disable and delete [widget keys](/using/widget#getting-a-key) |
| **Agent › Sandbox** | your sandbox key and the `docker run` command for a [sandbox](https://github.com/SubZtep/kaja/tree/main/apps/sandbox#readme) on your own machine, the sandboxes you run, and whether others may use yours and you theirs (whoever runs a shared one can see the pages it opens) |
| **Profile** | your name and avatar, email (a change takes a code from your current address, then one from the new one), and deleting your account with everything stored under it |

The language picker at the bottom of every page switches the site. Signed in, it also saves to your
account, so emails, the Telegram bot and the terminal's cloud mode follow.

Every persona and ability is yours already; there's nothing to switch on, and Kaja provides the API keys
abilities need (see [Abilities in the cloud](/abilities/marketplace#in-the-cloud)).

---

Next:

[Telegram](/using/telegram){: .btn .btn-green .fs-5 }
