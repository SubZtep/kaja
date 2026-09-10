---
layout: page
title: Privacy Policy
nav_exclude: true
---

# Privacy Policy

Effective date: 8 September 2026

Kaja is operated by Andras Serfozo as an individual project. This policy explains what personal data Kaja collects, why it is used, and what choices you have.

Contact: subztep@gmail.com

<!-- TODO: This is a practical first draft, not legal advice. Review it before public launch. -->

## What This Policy Covers

Kaja can run two ways, and the difference matters here.

**Local mode** (`kaja --local`) runs entirely on your own computer. Your conversations, memory notes, and dataset answers are stored in a SQLite file in your home directory; your configuration is plain text files there too. None of it reaches Kaja's servers. If you point Kaja at a local model, nothing leaves your machine at all; if you point it at a third-party LLM provider, your prompts go to that provider under *their* privacy policy, not this one. **This policy does not apply to local mode**, apart from the account sections if you also have an account.

**Hosted mode** (the default `kaja`, the website, and the embeddable widget) runs the agent on Kaja's servers against an account. That is what this policy covers.

## Data We Collect

When you create or use an account, Kaja may collect:

- account data, such as your name, email address, password authentication data, and account settings;
- authentication data, such as sessions, verification status, password reset requests, email change requests, and device authorization requests;
- technical data, such as IP address, browser or device information, request times, error logs, and security logs;
- email data needed to send account emails, such as verification, password reset, and email change messages.

When you use **hosted chat**, Kaja additionally stores, against your account:

- conversation content — the messages you send, the assistant's replies, and the tool calls made during a turn;
- memory notes the assistant writes about you, and answers you give to structured questionnaires (datasets);
- session metadata such as which persona and model handled a conversation, and when it was last updated.

When you interact with a **widget** embedded on someone else's website, the same conversation data is stored against *that site owner's* Kaja account, not yours. A random visitor id is kept in your browser's `sessionStorage` to keep one conversation together; it is not a cookie and it does not follow you across sites.

Prompts and replies in hosted mode are sent to the configured LLM provider in order to produce an answer. Kaja does not use your conversations to train models.

IP address handling details:

- Kaja processes IP addresses temporarily for authentication, session security, and rate limiting.
- Better Auth may keep IP data temporarily as part of active session/authentication records.
- Kaja may use an IP geolocation service to derive approximate location (city, country, timezone), which is included in the assistant's context so location-sensitive questions work without you naming a place.
- Kaja does not store raw IP addresses long-term in its own application data; only derived location data may be retained.

Kaja does not intentionally collect payment data because accounts are currently free.

## How We Use Data

Kaja uses personal data to:

- create and manage user accounts;
- authenticate users and protect sessions;
- send account and security emails;
- provide, maintain, debug, and secure the service;
- prevent abuse, spam, and unauthorized access;
- comply with legal obligations.

## Cookies And Sessions

Kaja uses essential cookies or similar session storage for login and authentication. These are needed for the service to work.

Kaja does not currently use advertising cookies. If analytics or other non-essential cookies are added later, this policy should be updated before they are enabled.

## Legal Basis

If privacy laws such as the GDPR apply, Kaja relies on these legal bases:

- contract: to provide the account and service you request;
- legitimate interests: to secure, maintain, and improve the service;
- consent: where required for optional features;
- legal obligation: where the law requires records or responses.

## Sharing Data

Kaja does not sell personal data.

Personal data may be processed by service providers used to run Kaja, such as:

- hosting provider: Hetzner Online GmbH;
- database provider: same as hosting;
- email/SMTP provider: Gmail SMTP;
- error monitoring: Sentry, enabled in production on both the API and the website. Kaja does not deliberately send prompts, memory content, or API keys to it;
- LLM providers: whichever model serves your hosted conversation receives the messages in that conversation;
- IP geolocation provider, used to derive approximate location as described above;
- web search provider (Brave), when the assistant runs a search — it receives the search query;
<!-- TODO: accurate only once NASI_FETCH_PROXY is set in production. Until then hosted turns have no fetch_url at all — drop this line if the policy ships before the proxy does. -->
- outbound proxy provider, when the assistant fetches a URL in a hosted conversation — it receives the URL being fetched. Hosted page fetches leave through this proxy rather than directly from Kaja's servers.

Kaja may also disclose data if required by law, to protect users, or to investigate abuse or security incidents.

## Retention

Kaja keeps account data while your account exists.

Hosted conversations are kept until you or your account delete them. An individual conversation can be deleted at any time through the API's session endpoint, which removes it along with its stored messages.

After account deletion, Kaja will delete or anonymize personal data within 30 days, unless it must be kept longer for security, abuse prevention, backups, or legal reasons.

Server logs are kept for 30-90 days unless needed longer for security or incident investigation.

## Security

Kaja uses reasonable technical and organizational measures to protect personal data, including authentication controls, protected session cookies, and limited access to production systems.

No online service can guarantee perfect security. If you believe you found a security issue, contact subztep@gmail.com.

## Your Rights

Depending on where you live, you may have rights to:

- access the personal data held about you;
- correct inaccurate data;
- delete your account or personal data;
- object to or restrict certain processing;
- receive a copy of your data;
- complain to a data protection authority.

To make a request, contact subztep@gmail.com. Kaja may need to verify your identity before acting on a request.

## International Transfers

Kaja may process data in countries other than your own, depending on the hosting and email providers used. Currently, personal data may be processed in Germany.

## Children

Kaja is not intended for children under 13. Do not create an account if you are below that age.

## Changes

This policy may be updated from time to time. Material changes will be posted on this page, and the effective date will be updated.
