#!/bin/sh
set -u

scanner_rc=${1:-0}
[ "$scanner_rc" -ne 0 ] || exit 0

host=${SONAR_HOST_URL:-}
key=${SONAR_PROJECT_KEY:-}
if [ -z "$key" ] && [ -f sonar-project.properties ]; then
  key=$(sed -n 's/^sonar\.projectKey=//p' sonar-project.properties | head -n 1)
fi

if [ -z "$host" ] || [ -z "${SONAR_TOKEN:-}" ] || [ -z "$key" ]; then
  echo "sonar-conditions: host, token or project key missing, conditions not available"
  exit 0
fi

body=$(printf 'user = "%s:"\n' "$SONAR_TOKEN" | curl -sS -f --max-time 30 -K - -G --data-urlencode "projectKey=$key" "$host/api/qualitygates/project_status" 2>/dev/null) || {
  echo "sonar-conditions: quality gate status request failed, conditions not available"
  exit 0
}

status=$(printf '%s' "$body" | sed -n 's/.*"projectStatus":{"status":"\([A-Z_]*\)".*/\1/p')
[ "$status" = "OK" ] && exit 0
echo "sonar-conditions: quality gate status ${status:-UNKNOWN} for $key"

failing=$(printf '%s' "$body" | sed 's/{"status"/\
{"status"/g' | grep '"status":"ERROR".*"metricKey"' | while IFS= read -r cond; do
  metric=$(printf '%s' "$cond" | sed -n 's/.*"metricKey":"\([^"]*\)".*/\1/p')
  cmp=$(printf '%s' "$cond" | sed -n 's/.*"comparator":"\([^"]*\)".*/\1/p')
  threshold=$(printf '%s' "$cond" | sed -n 's/.*"errorThreshold":"\([^"]*\)".*/\1/p')
  actual=$(printf '%s' "$cond" | sed -n 's/.*"actualValue":"\([^"]*\)".*/\1/p')
  echo "sonar-conditions: FAILED metric=$metric comparator=$cmp threshold=$threshold actual=$actual"
done)

if [ -n "$failing" ]; then
  echo "$failing"
elif [ "$status" = "ERROR" ]; then
  echo "sonar-conditions: gate is ERROR but no failing condition could be parsed"
fi
exit 0
