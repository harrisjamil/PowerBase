import { readVmLocalSettings } from "@/lib/vm-local-settings"

export const DEFAULT_CONTROL_SCHEMA = "seung_control"
export const CONTROL_TABLE_NAME = "superadmin"
export const AGENTS_TABLE_NAME = "agents"
export const PROJECTS_TABLE_NAME = "projects"

export function isSafePgIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(value)
}

export function quotePgIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`
}

export function getControlSchema(): string {
  const configured = readVmLocalSettings().controlSchema?.trim()
  if (configured && isSafePgIdentifier(configured)) {
    return configured
  }
  return DEFAULT_CONTROL_SCHEMA
}

export function getQuotedControlTableRef(): string {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(CONTROL_TABLE_NAME)}`
}

export function getQuotedAgentsTableRef(): string {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(AGENTS_TABLE_NAME)}`
}

export function getQuotedProjectsTableRef(): string {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(PROJECTS_TABLE_NAME)}`
}
