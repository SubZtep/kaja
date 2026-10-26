import clsx, { type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** Merge CSS class names. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
