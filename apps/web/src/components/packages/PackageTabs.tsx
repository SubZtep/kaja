import { Tabs } from "@base-ui/react/tabs"
import { m } from "../../paraglide/messages.js"
import { SkillCards } from "./SkillCards"
import { ToolCards } from "./ToolCards"

export type PackageTab = "skills" | "tools"

const tabClass =
  "-mb-px cursor-pointer border-transparent border-b-2 bg-transparent px-3 py-2 text-muted text-sm outline-none hover:text-fg focus-visible:text-fg data-active:border-neon data-active:text-fg"

/** Skills and Tools, one tab each, for /packages and the /welcome step. */
export function PackageTabs({
  tab,
  onTabChange
}: Readonly<{ tab: PackageTab; onTabChange: (tab: PackageTab) => void }>) {
  return (
    <Tabs.Root value={tab} onValueChange={value => onTabChange(value as PackageTab)}>
      <Tabs.List className="mb-6 flex gap-1 border-border border-b">
        <Tabs.Tab value="skills" className={tabClass}>
          {m.packages_tab_skills()}
        </Tabs.Tab>
        <Tabs.Tab value="tools" className={tabClass}>
          {m.packages_tab_tools()}
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="skills">
        <SkillCards />
      </Tabs.Panel>
      <Tabs.Panel value="tools">
        <ToolCards />
      </Tabs.Panel>
    </Tabs.Root>
  )
}
