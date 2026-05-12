import { NextResponse } from "next/server"
import { pool } from "@/lib/db"

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json()

    const result = await pool.query(
      `
      SELECT id, email
      FROM seung_control.superadmin
      WHERE email = $1 AND password = $2
      `,
      [email, password]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      user: result.rows[0],
    })

  } catch (error) {
    console.error("LOGIN ERROR:", error)

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    )
  }
}