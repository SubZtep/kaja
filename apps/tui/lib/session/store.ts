import type { NasiStore } from "@kaja/nasi"
import { getStore } from "../memory/store"

export async function createSessionRow(...args: Parameters<NasiStore["createSession"]>) {
  return (await getStore()).createSession(...args)
}

export async function updateSessionRow(...args: Parameters<NasiStore["updateSession"]>) {
  return (await getStore()).updateSession(...args)
}

export async function loadSessionRow(id: string) {
  return (await getStore()).loadSession(id)
}

export async function loadLatestSessionRow() {
  return (await getStore()).loadLatestSession(null)
}

export async function loadLatestSessionRowForOwner(owner: string) {
  return (await getStore()).loadLatestSession(owner)
}

export async function deleteSessionRow(id: string) {
  return (await getStore()).deleteSession(id)
}

export async function listSessions() {
  return (await getStore()).listSessions()
}

export async function loadPromptHistory(limit = 100) {
  return (await getStore()).loadPromptHistory(limit)
}
