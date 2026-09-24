---
layout: page
title: Privacy Policy
nav_exclude: true
---

# Privacy Policy

Effective date: 23 September 2026

Kaja is operated by Andras Serfozo, an individual based in England, United Kingdom, as a personal project. For the cloud service described below, he is the data controller. This policy explains what personal data Kaja collects, why, on what legal basis, who receives it, and what rights you have.

Contact: subztep@gmail.com

<!-- TODO: This is a practical first draft, not legal advice. Review it before public launch. -->

## What This Policy Covers

Kaja can run two ways, and the difference matters here.

**Local mode** (`kaja --local`) runs entirely on your own computer. Your conversations, memory notes, and dataset answers are stored in a SQLite file in your home directory; your configuration is plain text files there too. None of it reaches Kaja's servers. If you point Kaja at a local model, nothing leaves your machine at all; if you point it at a third-party LLM provider, or enable an ability that calls an outside service, what is sent there falls under *their* privacy policy, not this one. **This policy does not apply to local mode**, apart from the account sections if you also have an account.

**Cloud mode** (the default `kaja`, the website, the Kaja Telegram bot, and the embeddable widget) runs the agent on Kaja's servers against an account. That is what this policy covers.

## Data We Collect

When you create or use an account, Kaja collects:

- account data: your name, email address, password (stored only as a hash), profile picture if you set one, and account settings;
- if you sign in with Google, the name, email address, and profile picture Google shares with Kaja;
- a record of your consent: when you confirmed you are 18 or over, accepted the Terms of Service and this policy, and gave the health data consent described below;
- authentication data, such as login sessions, verification status, password reset requests, email change requests, and device authorization requests;
- technical data, such as IP address, browser or device information, request times, error logs, and security logs;
- email data needed to send account emails, such as verification, password reset, and email change messages;
- if you link Telegram, your Telegram user id, so the bot knows which account you are;
- which abilities (skills, personas, and tools) you have turned on.

When you use **cloud chat**, Kaja additionally stores, against your account:

- conversation content — the messages you send, the assistant's replies, and the tool calls made during a turn;
- memory notes the assistant writes about you, and answers you give to structured questionnaires (datasets);
- session metadata such as which persona and model handled a conversation, and when it was last updated.

When you interact with a **widget** embedded on someone else's website, the same conversation data is stored against *that site owner's* Kaja account, not yours. The site owner is the controller of that data and Kaja processes it on their behalf (see [Widgets](#widgets)). A random visitor id is kept in your browser's `sessionStorage` to keep one conversation together; it is not a cookie and it does not follow you across sites.

IP address handling details:

- Kaja processes IP addresses temporarily for authentication, session security, and rate limiting.
- Each login session record keeps the IP address and browser user agent it was created from, until the session ends or expires.
- Kaja does not look up your location from your IP address. The assistant only knows where you are if you tell it, or if you turn on a location ability that looks it up.

Kaja does not collect payment data because accounts are currently free.

## Health Information

Conversations with an AI assistant can touch on your health, and some personas (such as the care persona) are built for talking about how you are feeling. Anything you say about your physical or mental health, and any memory note the assistant writes from it, is **special category data** under the UK GDPR and EU GDPR.

Kaja processes it on the basis of your **explicit consent** (Article 9(2)(a)), which you give with a separate tick box when you create your account. For now an account can't be created without that consent, because Kaja can't reliably keep health details out of conversations and memory notes.

What you share is always up to you: Kaja never asks you for health information to use the service, and you can simply not mention it. You can withdraw your consent at any time by deleting your account from your profile page, which deletes everything stored with it. Withdrawing doesn't affect processing that happened before.

Kaja is not a medical service, and its replies are not medical advice.

## How We Use Data, And Our Legal Basis

| Purpose | Data | Legal basis |
|---|---|---|
| Create and run your account, sign you in, send account emails | account, authentication, and email data | contract (Article 6(1)(b)) |
| Answer you in cloud chat, remember what you asked it to, run the abilities you turned on | conversation content, memory notes, dataset answers, ability settings and keys | contract (Article 6(1)(b)) |
| Health information you choose to share | conversation content and memory notes about your health | explicit consent (Article 9(2)(a)) |
| Link the Telegram bot to your account | Telegram user id | contract (Article 6(1)(b)) |
| Keep the service secure: rate limiting, abuse prevention, error monitoring, debugging | technical data, IP addresses, error logs | legitimate interests (Article 6(1)(f)) — running a service that works and isn't abused |
| Keep a record of your consent | consent timestamp | legal obligation (Article 6(1)(c)) — to be able to show consent was given |
| Respond to legal requests and exercise legal claims | whatever the request concerns | legal obligation (Article 6(1)(c)) or legitimate interests (Article 6(1)(f)) |

Kaja does not use your data for advertising, does not sell it, and does not make decisions about you by automated means that have legal or similarly significant effects.

Kaja does not use your conversations to train models, and neither Fireworks AI nor xAI trains on them under their API terms.

## Cookies And Sessions

Kaja uses essential cookies for login and authentication. These are needed for the service to work, so they don't need consent.

Kaja does not use advertising or analytics cookies. If any non-essential cookies are added later, this policy will be updated and your consent asked for before they are set.

## Sharing Data

Personal data is processed by these service providers, on Kaja's behalf, only as needed to run the service:

| Provider | What they receive | Where |
|---|---|---|
| Hetzner Online GmbH | everything stored in cloud mode (hosting and database) | Germany |
| Brevo | your email address and the account emails sent to you | France |
| Sentry | error reports from the API and website, which can include request details and your user id; passwords, tokens, and IP addresses are scrubbed before they are stored, and Kaja does not deliberately send prompts, memory content, or API keys | United States |
| Fireworks AI | the messages in a cloud conversation that a Fireworks-hosted model answers; not stored or used for training | United States |
| xAI | the prompt of an image the assistant generates for you; kept by xAI for up to 30 days for abuse monitoring, not used for training | United States |
| Brave | the search query, when the assistant searches the web; kept by Brave for up to 90 days for billing and troubleshooting | United States |
| Webshare | the address of a web page the assistant fetches for you; cloud page fetches leave through this proxy rather than directly from Kaja's servers | United States |


Some conversations are answered by models Kaja runs itself, on its own servers in the EU; those don't leave Kaja's infrastructure.

These parties also receive data, but under their own terms as independent controllers, because you choose to use them:

- **Google**, if you use Google sign-in;
- **Telegram**, if you chat with the Kaja Telegram bot — those messages pass through Telegram's servers;
- **the services behind abilities you turn on** — an HTTP tool or MCP server receives what the assistant sends it (a weather lookup gets coordinates, a documentation search gets the query), plus your API key for it if one is needed.

Kaja may also disclose data if required by law, to protect users, or to investigate abuse or security incidents.

## International Transfers

Kaja is run from the UK, hosted in Germany, and sends email through Brevo in France. The UK recognises the EU as providing adequate protection, so no extra safeguard is needed there.

The providers marked "United States" above receive data outside the UK and EU, under these safeguards:

- **Sentry** is certified under the UK Extension to the EU–US Data Privacy Framework.
- **Fireworks AI** and **Brave**: standard contractual clauses with the UK Addendum, in their data processing agreements.
- **xAI**: standard contractual clauses in its data processing agreement.
- **Webshare**: to be confirmed.

You can ask for details of the safeguard for any provider by email.

<!-- TODO: confirm xAI's DPA (x.ai/legal/data-processing-addendum) includes the UK Addendum; ask Webshare support for a DPA with SCCs and the UK Addendum, and whether it logs proxied URLs. -->

## Retention

- **Account data** is kept while your account exists.
- **Cloud conversations, memory notes, dataset answers, ability keys, widget keys, and your Telegram link** are kept until you delete them or your account. A single conversation can be deleted at any time.
- **Deleting your account** from your profile page deletes it and everything stored with it straight away, including conversations your widgets' visitors had.
- **Login session records** (with their IP address and user agent) are kept until the session ends or expires.
- **Server logs** are kept for up to 30 days, unless a specific entry is needed longer to investigate a security incident.
- **Error reports** in Sentry are kept for 30 days.
- Kaja does not currently keep database backups. If that changes, this section will say how long they are kept.

<!-- Sentry's 30 days is its Developer plan; a paid plan keeps 90, so update this line if the plan changes. -->

## Security

Kaja uses reasonable technical and organizational measures to protect personal data, including hashed passwords, encrypted ability keys, protected session cookies, rate limiting, and limited access to production systems.

No online service can guarantee perfect security. If a personal data breach puts your rights at risk, Kaja will tell you and the regulator as the law requires. If you believe you found a security issue, contact subztep@gmail.com.

## Your Rights

Under the UK GDPR (and the EU GDPR, if you are in the EU), you have the right to:

- access the personal data held about you and get a copy of it;
- correct inaccurate data;
- delete your account and personal data — you can do this yourself from your profile page;
- restrict or object to processing based on legitimate interests;
- receive the data you provided in a portable format;
- withdraw consent at any time, without affecting processing that happened before;
- complain to a data protection authority: in the UK, the Information Commissioner's Office ([ico.org.uk](https://ico.org.uk)); in the EU, the authority where you live or work.

To make any other request, email subztep@gmail.com. Kaja will answer within one month, and may need to verify your identity first.

## EU Representative

Kaja is run from the UK and offers its service to people in the EU. Under Article 27 of the EU GDPR, an EU representative will be named here before public launch.

<!-- TODO: appoint an EU representative (Art. 27) and add their name and address. -->

## Widgets

If you embed a widget on your own site, you are the controller of your visitors' conversations and Kaja is your processor. The data processing terms that apply are in the [Terms of Service](/terms#data-processing-for-widgets).

## Children

Kaja is only for people aged 18 or over. You confirm your age when you create an account. If Kaja learns that an account belongs to someone under 18, it will delete it.

## Changes

This policy may be updated from time to time. Material changes will be posted on this page, and the effective date will be updated.
