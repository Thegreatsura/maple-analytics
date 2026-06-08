#!/usr/bin/env bash
# Ad-hoc benchmark of old vs new cold-load query shapes against the deployed
# Tinybird warehouse. Read-only. Reports min/median elapsed + deterministic
# rows_read / bytes_read. Run: bash scripts/bench-cold-queries.sh
set -u
TB_HOST=$(jq -r '.host' .tinyb); TB_TOKEN=$(jq -r '.token' .tinyb)

bench() {
  local label="$1" runs="$2" sql="$3"; local times=() rr="" br="" err=""
  for _ in $(seq 1 "$runs"); do
    local resp; resp=$(curl -s --get "$TB_HOST/v0/sql" \
      --data-urlencode "q=${sql} SETTINGS use_query_cache=0 FORMAT JSON" \
      -H "Authorization: Bearer $TB_TOKEN" 2>/dev/null)
    err=$(printf '%s' "$resp" | jq -r '.error // empty' 2>/dev/null)
    if [ -n "$err" ]; then echo "  $label: ERROR ${err:0:140}"; return; fi
    times+=("$(printf '%s' "$resp" | jq -r '.statistics.elapsed')")
    rr=$(printf '%s' "$resp" | jq -r '.statistics.rows_read')
    br=$(printf '%s' "$resp" | jq -r '.statistics.bytes_read')
  done
  local mn md
  mn=$(printf '%s\n' "${times[@]}" | sort -n | head -1)
  md=$(printf '%s\n' "${times[@]}" | sort -n | awk '{a[NR]=$1} END{print (NR%2)?a[(NR+1)/2]:(a[NR/2]+a[NR/2+1])/2}')
  printf "  %-24s min=%6.0fms med=%6.0fms rows=%-9s MB=%.0f\n" \
    "$label" "$(echo "$mn*1000"|bc -l)" "$(echo "$md*1000"|bc -l)" "$rr" "$(echo "$br/1048576"|bc -l)"
}

ORG=org_3Ei9QGrsqzBb83qKR4EzhgBQ1uh; S='2026-06-06 18:00:00'; E='2026-06-07 18:00:00'
W="OrgId='$ORG' AND Timestamp>='$S' AND Timestamp<='$E'"

echo "### servicesFacets (24h) — UNION vs arrayJoin vs GROUPING SETS"
bench "OLD union(4)" 4 "SELECT DeploymentEnv AS name,count() c,'environment' f FROM service_overview_spans WHERE $W AND DeploymentEnv!='' GROUP BY name ORDER BY c DESC LIMIT 50
UNION ALL SELECT ServiceNamespace,count(),'namespace' FROM service_overview_spans WHERE $W AND ServiceNamespace!='' GROUP BY ServiceNamespace ORDER BY count() DESC LIMIT 50
UNION ALL SELECT CommitSha,count(),'commit_sha' FROM service_overview_spans WHERE $W AND CommitSha!='' GROUP BY CommitSha ORDER BY count() DESC LIMIT 50
UNION ALL SELECT ServiceName,count(),'service' FROM service_overview_spans WHERE $W AND ServiceName!='' GROUP BY ServiceName ORDER BY count() DESC LIMIT 50"
bench "NEW arrayJoin" 4 "SELECT facet.1 f,facet.2 name,count() c FROM service_overview_spans ARRAY JOIN arrayFilter(x->tupleElement(x,2)!='',[('environment',DeploymentEnv),('namespace',ServiceNamespace),('commit_sha',CommitSha),('service',ServiceName)]) AS facet WHERE $W GROUP BY f,name ORDER BY c DESC LIMIT 50 BY f"
bench "ALT grouping-sets" 4 "SELECT multiIf(GROUPING(DeploymentEnv)=0,'environment',GROUPING(ServiceNamespace)=0,'namespace',GROUPING(CommitSha)=0,'commit_sha','service') AS f, multiIf(GROUPING(DeploymentEnv)=0,DeploymentEnv,GROUPING(ServiceNamespace)=0,ServiceNamespace,GROUPING(CommitSha)=0,CommitSha,ServiceName) AS name, count() c FROM service_overview_spans WHERE $W GROUP BY GROUPING SETS ((DeploymentEnv),(ServiceNamespace),(CommitSha),(ServiceName)) HAVING name!='' ORDER BY c DESC LIMIT 50 BY f"

echo "### tracesFacets (6h) — UNION(7) vs arrayJoin vs grouping-sets"
TS='2026-06-07 12:00:00'; TE='2026-06-07 18:00:00'; TW="OrgId='$ORG' AND Timestamp>='$TS' AND Timestamp<='$TE'"
bench "OLD union(7)" 4 "SELECT ServiceName AS name,count() c,'service' f FROM trace_list_mv WHERE $TW GROUP BY name ORDER BY c DESC LIMIT 50
UNION ALL SELECT SpanName,count(),'spanName' FROM trace_list_mv WHERE $TW AND SpanName!='' GROUP BY SpanName ORDER BY count() DESC LIMIT 20
UNION ALL SELECT HttpMethod,count(),'httpMethod' FROM trace_list_mv WHERE $TW AND HttpMethod!='' GROUP BY HttpMethod ORDER BY count() DESC LIMIT 20
UNION ALL SELECT HttpStatusCode,count(),'httpStatus' FROM trace_list_mv WHERE $TW AND HttpStatusCode!='' GROUP BY HttpStatusCode ORDER BY count() DESC LIMIT 20
UNION ALL SELECT DeploymentEnv,count(),'deploymentEnv' FROM trace_list_mv WHERE $TW AND DeploymentEnv!='' GROUP BY DeploymentEnv ORDER BY count() DESC LIMIT 20
UNION ALL SELECT ServiceNamespace,count(),'serviceNamespace' FROM trace_list_mv WHERE $TW AND ServiceNamespace!='' GROUP BY ServiceNamespace ORDER BY count() DESC LIMIT 20
UNION ALL SELECT 'error',count(),'errorCount' FROM trace_list_mv WHERE $TW AND HasError=1"
bench "NEW arrayJoin" 4 "SELECT facet.1 f,facet.2 name,count() c FROM (SELECT ServiceName,SpanName,HttpMethod,HttpStatusCode,DeploymentEnv,ServiceNamespace,HasError FROM trace_list_mv WHERE $TW) t ARRAY JOIN arrayFilter(x->tupleElement(x,2)!='',[('service',ServiceName),('spanName',SpanName),('httpMethod',HttpMethod),('httpStatus',HttpStatusCode),('deploymentEnv',DeploymentEnv),('serviceNamespace',ServiceNamespace),('errorCount',if(HasError=1,'error',''))]) AS facet GROUP BY f,name ORDER BY c DESC LIMIT 50 BY f"

echo "### serviceUsage — OLD (2 separate) vs NEW (1 combined)"
US='2026-06-07 12:00:00'; UE='2026-06-07 18:00:00'; PS='2026-06-07 06:00:00'; PE='2026-06-07 12:00:00'
SU_SUM="SELECT ServiceName n, sum(LogCount)+sum(TraceCount)+sum(SumMetricCount) c FROM service_usage WHERE OrgId='$ORG' AND Hour>=toStartOfHour(toDateTime('%s')) AND Hour<=toStartOfHour(toDateTime('%s')) GROUP BY n ORDER BY c DESC"
bench "OLD current" 4 "$(printf "$SU_SUM" "$US" "$UE")"
bench "OLD previous" 4 "$(printf "$SU_SUM" "$PS" "$PE")"
bench "NEW combined" 4 "SELECT ServiceName n, sumIf(LogCount,Hour>=toStartOfHour(toDateTime('$US')) AND Hour<=toStartOfHour(toDateTime('$UE')))+sumIf(TraceCount,Hour>=toStartOfHour(toDateTime('$US')) AND Hour<=toStartOfHour(toDateTime('$UE')))+sumIf(SumMetricCount,Hour>=toStartOfHour(toDateTime('$US')) AND Hour<=toStartOfHour(toDateTime('$UE'))) cur, sumIf(LogCount,Hour>=toStartOfHour(toDateTime('$PS')) AND Hour<=toStartOfHour(toDateTime('$PE'))) prev FROM service_usage WHERE OrgId='$ORG' AND Hour>=toStartOfHour(toDateTime('$PS')) AND Hour<=toStartOfHour(toDateTime('$UE')) GROUP BY n ORDER BY cur DESC"
