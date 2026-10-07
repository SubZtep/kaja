---
name: system-report
description: Summarize this computer's OS, uptime, load, memory and disk usage. Use when the user asks how their machine is doing, how much disk or memory is free, or what system they are on.
---

# System report

1. Run the bundled script with `run_command` (it only reads, so `mutates` is false):
   `sh <skill directory>/scripts/report.sh`
2. Summarize in a few lines: OS and version, uptime, load, memory used/free, and each disk's use.
3. Call out anything that needs attention:
   - a filesystem at 90% or more
   - less than 10% memory available
   - load average above the number of CPU cores

Don't paste the raw output unless the user asks for it.
