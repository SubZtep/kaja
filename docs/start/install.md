---
layout: page
title: Installation
parent: Get started
nav_order: 1
summary: Install the terminal client and run it for the first time.
icon: 🧩
---

# Installation

<!-- TODO: add a short terminal recording of the install and first run here -->

On macOS or Linux:

```sh
curl -fsSL https://kaja.io/install.sh | bash
```

On Windows:

```powershell
irm https://kaja.io/install.ps1 | iex
```

The script picks the right binary for your system and puts it in `~/.local/bin` (change that with
`INSTALL_DIR`). If the folder isn't on your `PATH`, it tells you. You can also download a binary
(x64 or arm64) from [GitHub Releases](https://github.com/SubZtep/kaja/releases).

## First run

Run `kaja`. The [setup wizard](/start/wizard) asks a few questions, including whether to use
**Kaja Cloud** (nothing to set up, you just approve a code in the browser) or **your own providers**. Your
answer is saved, so the next `kaja` starts the same way. `kaja --local` or `kaja --cloud` overrides it for
one launch.

## Updating

Kaja checks for a newer version each time it starts and offers to install it. Cloud chat only runs on the latest version; local mode can carry on with the one you have.

To update by hand, run the install script again. Set `VERSION=v1.2.3` to pin a release.

Your config files stay as they are. `kaja config diff` shows what
[`kaja config fetch`](/config/commands) would change, and `kaja abilities update` refreshes the
[marketplace](/abilities).

## Uninstall

```sh
kaja logout             # cloud mode only: removes the token from your OS keychain
rm ~/.local/bin/kaja
```

Config and data stay behind. To remove them too, delete `~/.config/kaja` and `~/.local/share/kaja` (the
[local storage](/config/storage)). `kaja config paths` prints the exact locations.

---

Next:

[Cloud or local](/start/modes){: .btn .btn-green .fs-5 }
