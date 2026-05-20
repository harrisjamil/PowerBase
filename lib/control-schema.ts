import type { PoolClient } from "pg"
import { readVmLocalSettings } from "@/lib/vm-local-settings"

export const DEFAULT_CONTROL_SCHEMA = "seung_control"
export const CONTROL_TABLE_NAME = "superadmin"
export const AGENTS_TABLE_NAME = "agents"
export const PROJECTS_TABLE_NAME = "projects"
export const PROJECT_API_KEYS_TABLE_NAME = "project_api_keys"
export const DB_USERS_TABLE_NAME = "db_users"
export const PLATFORM_SETTINGS_TABLE_NAME = "platform_settings"
export const ADMIN_TOTP_TABLE_NAME = "admin_totp"
export const ADMIN_TOTP_PENDING_TABLE_NAME = "admin_totp_pending"
export const PLATFORM_INTEGRATIONS_TABLE_NAME = "platform_integrations"
export const TEAMS_TABLE_NAME = "teams"
export const TEAM_MEMBERS_TABLE_NAME = "team_members"
export const TEAM_PROJECT_ASSIGNMENTS_TABLE_NAME = "team_project_assignments"

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

export async function ensureControlSchema(client: PoolClient) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${quotePgIdentifier(getControlSchema())}`)
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

export function getQuotedProjectApiKeysTableRef(): string {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(PROJECT_API_KEYS_TABLE_NAME)}`
}

export function getQuotedDbUsersTableRef(): string {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(DB_USERS_TABLE_NAME)}`
}

export function getQuotedPlatformSettingsTableRef(): string {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(PLATFORM_SETTINGS_TABLE_NAME)}`
}

export function getQuotedAdminTotpTableRef(): string {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(ADMIN_TOTP_TABLE_NAME)}`
}

export function getQuotedAdminTotpPendingTableRef(): string {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(ADMIN_TOTP_PENDING_TABLE_NAME)}`
}

export function getQuotedPlatformIntegrationsTableRef(): string {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(PLATFORM_INTEGRATIONS_TABLE_NAME)}`
}

export function getQuotedTeamsTableRef(): string {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(TEAMS_TABLE_NAME)}`
}

export function getQuotedTeamMembersTableRef(): string {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(TEAM_MEMBERS_TABLE_NAME)}`
}

export function getQuotedTeamProjectAssignmentsTableRef(): string {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(TEAM_PROJECT_ASSIGNMENTS_TABLE_NAME)}`
}
