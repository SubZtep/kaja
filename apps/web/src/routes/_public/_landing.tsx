import { cn } from "@kaja/shared"
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { Menu } from "../../components/layout/Menu"
import { Section } from "../../components/ui/Section"

export const Route = createFileRoute("/_public/_landing")({
  component: LandingLayout
})

function LandingLayout() {
  const _router = useRouterState()
  const isSkipLayout = true // router.location.pathname === "/" || router.location.pathname === "/architecture"

  if (isSkipLayout) {
    return <Outlet />
  }

  return (
    <Section
      className={cn(
        "transition-max-width duration-150",
        isSkipLayout
          ? "m-4 max-w-md group flex flex-col gap-4 opacity-80 hover:opacity-100 transform-[perspective(900px)_rotateY(10deg)_rotateX(4deg)] hover:transform-none hover:shadow-purple-800/69"
          : "max-w-lg"
      )}
    >
      <Menu
        className={cn(
          "pb-2 opacity-60 hover:opacity-100 transition-opacity ease-in-out duration-150",
          !isSkipLayout && "mb-2"
        )}
      />
      <Outlet />
    </Section>
  )
}
