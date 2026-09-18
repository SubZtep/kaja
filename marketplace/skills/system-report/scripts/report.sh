#!/bin/sh
# Read-only snapshot of the machine for the system-report skill. Works on Linux and macOS.

section() { printf '\n== %s ==\n' "$1"; }

section "os"
uname -srm
if [ -r /etc/os-release ]; then
  . /etc/os-release && echo "$PRETTY_NAME"
elif command -v sw_vers >/dev/null 2>&1; then
  sw_vers
fi

section "uptime and load"
uptime

section "cpu cores"
getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null

section "memory"
if command -v free >/dev/null 2>&1; then
  free -h
elif command -v vm_stat >/dev/null 2>&1; then
  vm_stat
fi

section "disks"
df -h -x tmpfs -x devtmpfs -x squashfs -x overlay 2>/dev/null || df -h
