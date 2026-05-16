import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { getControlSchema } from "@/lib/control-schema"

const CHALLENGE_MAX_AGE_SECONDS = 60 * 5

export type LoginChallenge = {
  roleOid: number
  username: string
  controlSchema: string
  iat: number
  exp: number
}

function getFallbackSecret() {
  const seed = `${process.env.DATABASE_URL ?? ""}|${process.cwd()}|powerbase-login-challenge`
  return createHash("sha256").update(seed).digest("base64url")
}

function getChallengeSecret() {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    getFallbackSecret()
  )
}

function encodePayload(payload: LoginChallenge): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
}

function decodePayload(value: string): LoginChallenge | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown
    if (!parsed || typeof parsed !== "object") return null
    const data = parsed as Record<string, unknown>
    if (
      typeof data.roleOid !== "number" ||
      !Number.isInteger(data.roleOid) ||
      data.roleOid < 1 ||
      typeof data.username !== "string" ||
      typeof data.controlSchema !== "string" ||
      typeof data.iat !== "number" ||
      typeof data.exp !== "number"
    ) {
      return null
    }
    return {
      roleOid: data.roleOid,
      username: data.username,
      controlSchema: data.controlSchema,
      iat: data.iat,
      exp: data.exp,
    }
  } catch {
    return null
  }
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", getChallengeSecret()).update(encodedPayload).digest("base64url")
}

export function createLoginChallenge(input: {
  roleOid: number
  username: string
  controlSchema: string
}): string {
  const iat = Math.floor(Date.now() / 1000)
  const challenge: LoginChallenge = {
    roleOid: input.roleOid,
    username: input.username,
    controlSchema: input.controlSchema,
    iat,
    exp: iat + CHALLENGE_MAX_AGE_SECONDS,
  }
  const payload = encodePayload(challenge)
  return `${payload}.${signPayload(payload)}`
}

export function verifyLoginChallenge(token: string | null | undefined): LoginChallenge | null {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length !== 2) return null

  const actual = Buffer.from(parts[1])
  const expected = Buffer.from(signPayload(parts[0]))
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null
  }

  const challenge = decodePayload(parts[0])
  if (!challenge) return null
  if (challenge.exp <= Math.floor(Date.now() / 1000)) {
    return null
  }
  if (challenge.controlSchema !== getControlSchema()) {
    return null
  }
  return challenge
}
