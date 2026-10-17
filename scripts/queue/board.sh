#!/usr/bin/env bash
# Usage: board.sh <issue> <status-name>   e.g. board.sh 12 "In Arbeit"
# Sets the Status of the issue's item on the project board (adds the issue if missing).
set -euo pipefail

n=${1:?issue number}
status=${2:?status name}
OWNER=Grabman1987
PROJECT_NUMBER=1
PROJECT_ID=PVT_kwHOCCMgwM4BlsQe
FIELD_ID=PVTSSF_lAHOCCMgwM4BlsQezhkYEVw

case "$status" in
  "Wartet auf Fabian") opt=b88c56a8 ;;
  "Warteschlange") opt=bb2a3c0e ;;
  "In Arbeit") opt=442f85a7 ;;
  "CI / Review") opt=85b8e1ab ;;
  "Live") opt=6c62c1e6 ;;
  *) echo "unknown status: $status" >&2; exit 2 ;;
esac

repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
item=$(gh api graphql \
  -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){issue(number:$n){projectItems(first:10){nodes{id project{number}}}}}}' \
  -f o="${repo%/*}" -f r="${repo#*/}" -F n="$n" \
  --jq ".data.repository.issue.projectItems.nodes[] | select(.project.number==$PROJECT_NUMBER) | .id" | head -n1)

if [ -z "$item" ]; then
  url=$(gh issue view "$n" --json url --jq .url)
  item=$(gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$url" --format json --jq .id)
fi

gh project item-edit --id "$item" --project-id "$PROJECT_ID" --field-id "$FIELD_ID" --single-select-option-id "$opt" >/dev/null
echo "#$n -> $status"
