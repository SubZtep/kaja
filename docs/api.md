---
layout: page
title: API App
parent: Development
nav_order: 1
---

## Installation

Create database tables:

```sh
bun x auth@latest migrate
```

## Load env files

To overwrite the default [`.env`](.env) values just create one of the following files:

```
.env.local
.env.{NODE_ENV}
.env.{NODE_ENV}.local
```

Typical structure:

```
.env                  shared defaults
.env.local            local machine secrets
.env.production       production defaults
.env.production.local production secrets
```

## OpenAPI

Endpoint reference: http://localhost:3001/reference.

---

Next:

[Open the **web app** page](/web){: .btn .btn-blue }
