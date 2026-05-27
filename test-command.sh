#!/bin/bash

# Configuration
API_URL="http://localhost:3001"
NODE_ID="${1:-}"
TOKEN="${2:-}"
COMMAND="${3:-echo Hello from Kaja}"

if [ -z "$NODE_ID" ]; then
  echo "Usage: ./test-command.sh NODE_ID TOKEN [COMMAND]"
  echo ""
  echo "Example:"
  echo "  ./test-command.sh 01234567-89ab-cdef-0123-456789abcdef YOUR_TOKEN \"uptime\""
  exit 1
fi

if [ -z "$TOKEN" ]; then
  echo "Error: TOKEN is required"
  exit 1
fi

echo "Sending command to node..."
echo "Node ID: $NODE_ID"
echo "Command: $COMMAND"
echo ""

RESPONSE=$(curl -s -X POST "$API_URL/kaja/admin/nodes/$NODE_ID/commands" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"command\": \"$COMMAND\", \"timeoutSeconds\": 30}")

echo "Response:"
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

# Extract command ID if jq is available
if command -v jq &> /dev/null; then
  COMMAND_ID=$(echo "$RESPONSE" | jq -r '.id // empty')

  if [ -n "$COMMAND_ID" ]; then
    echo ""
    echo "Command created! ID: $COMMAND_ID"
    echo ""
    echo "Waiting for execution (5 seconds)..."
    sleep 5

    echo ""
    echo "Checking result..."
    curl -s "$API_URL/kaja/admin/commands/$COMMAND_ID" \
      -H "Authorization: Bearer $TOKEN" | jq .
  fi
fi
