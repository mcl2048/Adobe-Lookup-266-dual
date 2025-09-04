#!/bin/bash

# A simple bash script to demonstrate the usage of the Adobe Subscription Lookup Public API.
#
# Usage:
# ./api_client.sh <command> [arguments]
#
# Commands:
#   count              - Get the total number of users.
#   expired            - Get a list of expired accounts.
#   search <email>     - Perform an exact search for a user by email.
#   fuzzy <prefix>     - Perform a fuzzy search for users by email prefix.
#
# Make sure to run the Next.js application on localhost:9002 for this script to work.

# --- Configuration ---
BASE_URL="http://localhost:9002/api/v1/query"
# !!! IMPORTANT !!!
# Replace this with the actual password from the apipwd.conf file on your server.
API_KEY="pvs-adobe-query-4a7b9c1d3e5f"

# --- Helper Functions ---
function print_usage {
  echo "Usage: $0 <command> [arguments]"
  echo
  echo "Commands:"
  echo "  count              - Get the total number of users."
  echo "  expired            - Get a list of expired accounts."
  echo "  search <email>     - Perform an exact search for a user by email."
  echo "  fuzzy <prefix>     - Perform a fuzzy search for users by email prefix."
  echo
}

function check_curl {
  if ! command -v curl &> /dev/null; then
    echo "Error: curl is not installed. Please install it to use this script."
    exit 1
  fi
  if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed. Please install it for pretty-printing JSON."
    exit 1
  fi
}

function execute_request {
    local url="$1"
    local data="$2"
    local method="GET"

    if [ -n "$data" ]; then
        method="POST"
        curl -s -X "$method" "$url" \
             -H "Content-Type: application/json" \
             -H "Authorization: Bearer $API_KEY" \
             -d "$data" | jq
    else
        curl -s -X "$method" "$url" \
             -H "Authorization: Bearer $API_KEY" | jq
    fi
}


# --- Command Implementation ---
function get_count {
  echo "Fetching user count..."
  execute_request "$BASE_URL?type=count"
}

function get_expired {
  echo "Fetching expired accounts..."
  execute_request "$BASE_URL?type=expired"
}

function search_exact {
  if [ -z "$1" ]; then
    echo "Error: Email address is required for exact search."
    print_usage
    exit 1
  fi
  
  local email="$1"
  echo "Performing exact search for: $email"
  local json_payload
  json_payload=$(printf '{"email": "%s", "type": "exact"}' "$email")
  execute_request "$BASE_URL" "$json_payload"
}

function search_fuzzy {
  if [ -z "$1" ]; then
    echo "Error: Email prefix is required for fuzzy search."
    print_usage
    exit 1
  fi

  local prefix="$1"
  echo "Performing fuzzy search for: $prefix"
  local json_payload
  json_payload=$(printf '{"email": "%s", "type": "fuzzy"}' "$prefix")
  execute_request "$BASE_URL" "$json_payload"
}


# --- Main Script Logic ---
check_curl

COMMAND="$1"
shift

case "$COMMAND" in
  count)
    get_count
    ;;
  expired)
    get_expired
    ;;
  search)
    search_exact "$@"
    ;;
  fuzzy)
    search_fuzzy "$@"
    ;;
  *)
    echo "Error: Unknown command '$COMMAND'"
    print_usage
    exit 1
    ;;
esac

echo
