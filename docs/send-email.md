---
layout: page
title: Send Email
parent: Configuration
nav_order: 4
---

# Send Email

Set up SMTP. You can use Gmail as a free SMTP provider.

## Use App Password

Steps to generate an SMTP password with Gmail:

1. Go to your [Google Account security page](https://myaccount.google.com/security).
2. Enable **2-Step Verification** if it is not enabled.
3. Go to [App passwords](https://myaccount.google.com/apppasswords).
4. Create one for **Mail**.
5. Use the generated 16-character password in your SMTP config.

### SMTP settings:

|            | TLS            | SSL            |
| ---------- | -------------- | -------------- |
| **Host**   | smtp.gmail.com | smtp.gmail.com |
| **Port**   | 587            | 465            |
| **Secure** | false          | true           |

#### Auth:

```yaml
user: your@gmail.com
pass: <app password>
```

---

Next:

[Open the **development** page](/development){: .btn .btn-green .fs-5 }
