#!/bin/sh
# Stands in for the browser the TUI opens for its device login: records the URL for the scenario to open itself.
echo "$1" >> "$E2E_OPENED_URLS"
