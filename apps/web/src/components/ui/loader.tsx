import { LoaderCircle } from "lucide-react"
import { cn } from "../../lib/cn"

export function Loader({ slim = false }: Readonly<{ slim?: boolean }>) {
  return (
    <div className={cn("flex justify-center", slim || "mt-16")}>
      <LoaderCircle size={32} aria-label="Loading" className="text-neon animate-spin opacity-70" />
    </div>
  )
}
