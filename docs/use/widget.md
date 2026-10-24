---
layout: page
title: Widgets
parent: Using Kaja
nav_order: 4
summary: Cloud principals that call the model and run their own source.
icon: 🖼
---

# Widgets

A widget is a cloud principal with its own secret token. It is not a persona and it does not run the nasi
tool loop. When it needs a model it calls `POST /ai/chat` with its token. Kaja pins the model from the
widget, so the caller cannot switch it.

Cloud accounts only. Local mode has no widgets.

## Create one

On the **Widget** page of the [web app](/use/web):

1. Give it a **label** and an **intent** (what it is for, in a few sentences).
2. Name the **model**. It must be a free, enabled chat model on the account.
3. Pick a **target**: `server` (a module) or the homepage (`browser`, with a CSS id such as `#kaja-barkochba`).

The raw token is shown **once**. Kaja stores only a hash. If you lose it, create a new widget.

Saving the intent, model, or target asks that model for source and stores a **draft**. Visitors keep running
the published source until you **publish** the draft. A draft that contains a token, or that calls `fetch`,
is refused.

**Link** two widgets when one should know about the other. The homepage Barkochba board links to the player
that asks the questions. Changing a link writes a new draft for both.

## What the token can do

- `GET /widget/me` — its intent, target, links, and published generation id.
- `GET /widget/source` — the published source, or 404 when nothing is published.
- `GET` and `PUT /widget/state/<visitor-id>` — a small JSON bag for one visitor.
- `POST /ai/chat` — `{ messages: [{ role, content }] }`. The reply is the assistant text. No tools, no streaming.

The token stays off the page. A public page talks to your server, and the server holds the token.

## The homepage game

kaja.io's Barkochba board is two widgets on a demo account: a browser board and a server player, linked.
The web server holds both tokens. The visitor thinks of a thing and answers Yes, No, Sometimes, or Unknown.
The board enforces twenty questions. The player asks. Until those tokens are set, the tile stays unavailable.

## Limits

Chat completions are rate-limited per widget. Revoking a widget rejects its token immediately. Deleting the
account deletes its widgets, their source, and their visitor state.

---

Next:

[Voice & language](/use/voice){: .btn .btn-green .fs-5 }
