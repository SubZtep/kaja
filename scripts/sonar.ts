// Lists the open SonarCloud issues and unreviewed security hotspots of a branch's pull request, one Markdown line each, for the /sonar-fix skill; prints nothing when the branch has no PR.
// Usage: bun scripts/sonar.ts <branch>

const API = "https://sonarcloud.io/api"
const PROJECT = "kajaio_kaja"

type PullRequest = { key: string; branch: string }
type Issue = { component: string; line?: number; rule: string; severity: string; message: string }
type Hotspot = { component: string; line?: number; ruleKey: string; vulnerabilityProbability: string; message: string }

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`)
  if (!res.ok) throw new Error(`SonarCloud ${path}: ${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

function where(component: string, line?: number) {
  const path = component.slice(PROJECT.length + 1)
  return line === undefined ? path : `${path}:${line}`
}

const branch = Bun.argv[2]
if (!branch) {
  console.error("usage: bun scripts/sonar.ts <branch>")
  process.exit(2)
}

const { pullRequests } = await get<{ pullRequests: PullRequest[] }>("project_pull_requests/list", { project: PROJECT })
const pr = pullRequests.find(p => p.branch === branch)
if (!pr) process.exit(0)

const scope = { pullRequest: pr.key, ps: "500" }
const [issues, hotspots] = await Promise.all([
  get<{ issues: Issue[]; rules: { key: string; name: string }[] }>("issues/search", {
    ...scope,
    componentKeys: PROJECT,
    issueStatuses: "OPEN,CONFIRMED",
    additionalFields: "rules"
  }),
  get<{ hotspots: Hotspot[] }>("hotspots/search", { ...scope, projectKey: PROJECT, status: "TO_REVIEW" })
])

const ruleName = new Map(issues.rules.map(r => [r.key, r.name]))
for (const i of issues.issues) {
  console.log(`- ${where(i.component, i.line)} ${i.severity} [${i.rule}: ${ruleName.get(i.rule)}] ${i.message}`)
}
for (const h of hotspots.hotspots) {
  console.log(
    `- ${where(h.component, h.line)} security hotspot, ${h.vulnerabilityProbability} [${h.ruleKey}] ${h.message}`
  )
}
