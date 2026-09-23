---
layout: page
title: Installation
parent: Get started
nav_order: 1
---

# Installation

Run the setup script, which picks the right binary for your system.

On macOS or Linux:

```sh
curl -fsSL https://kaja.io/install.sh | bash
```

On Windows:

```powershell
irm https://kaja.io/install.ps1 | iex
```

Or grab a binary directly from [GitHub Releases](https://github.com/SubZtep/kaja/releases)
— x64 and arm64. The script installs to `~/.local/bin` (set `INSTALL_DIR` to change it) and tells you
if that directory isn't on your `PATH`.

## First run

Run `kaja`. The [setup wizard](/wizard) asks your language, then where the agent should run:

- **Kaja Cloud** (preselected) — nothing else to set up. Kaja prints a code, you approve it in the
  browser, and you're chatting.
- **Your own providers** — tick the LLM providers you can use, give their keys or addresses, and Kaja
  writes `~/.config/kaja/` for [local mode](/modes#local-mode).

Your answer is saved, so the next `kaja` starts the same way. `kaja --local` or `kaja --cloud` overrides
it for one launch.

## Updating

Run the install script again: it downloads the latest release over the old binary. Set `VERSION=v1.2.3`
to pin a specific release instead.

Your config files are left alone. To pick up newer defaults afterwards, `kaja config diff` shows what
[`kaja config fetch`](/configuration#commands) would change, and `kaja abilities update` refreshes the
[marketplace](/abilities).

## Uninstall

```sh
rm ~/.local/bin/kaja
```

Local config and data are left behind — delete `~/.config/kaja` and the
[SQLite file](/configuration/storage) yourself.

---

Next:

[Cloud or local](/modes){: .btn .btn-green .fs-5 }
