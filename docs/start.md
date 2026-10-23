---
layout: page
title: Get started
nav_order: 2
has_children: true
has_toc: false
---

# Get started

Install Kaja, choose where the agent runs, and answer a few setup questions.

There are two [ways to run](/start/modes) it:

|                                       | **Cloud**             | **Local**                |
| ------------------------------------- | --------------------- | ------------------------ |
| Agent loop runs                       | On `api.kaja.io`      | On your machine          |
| Needs an account                      | Yes (device login)    | No                       |
| Needs your own LLM                    | No                    | Yes                      |
| Sessions & memory stored              | Postgres, server-side | SQLite, in your home dir |
| Your files, shell and own MCP servers | No                    | Yes                      |

{% include children.html %}
