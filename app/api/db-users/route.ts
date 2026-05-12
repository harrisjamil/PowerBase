import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

// GET - Fetch all database users
export async function GET() {
  try {
    const client = await pool.connect()
    
    try {
      const query = `
        SELECT 
          usename as username,
          usecreatedb as can_create_db,
          usesuper as is_superuser,
          userepl as is_replication,
          passwd is not null as has_password,
          valuntil::text as password_expiry,
          usebypassrls as bypass_rls,
          rolcreaterole as can_create_role
        FROM pg_user
        LEFT JOIN pg_authid ON pg_user.usesysid = pg_authid.oid
        ORDER BY usename
      `
      
      const result = await client.query(query)
      client.release()
      
      return NextResponse.json({
        success: true,
        users: result.rows,
        count: result.rows.length
      })
      
    } catch (error) {
      client.release()
      throw error
    }
    
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch database users' },
      { status: 500 }
    )
  }
}

// POST - Create a new database user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      username, 
      password, 
      can_create_db, 
      can_create_role, 
      is_superuser, 
      is_replication,
      bypass_rls 
    } = body

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    
    try {
      await client.query('BEGIN')
      
      // Create user with password
      const createUserQuery = `CREATE USER "${username}" WITH PASSWORD '${password}'`
      await client.query(createUserQuery)
      
      // Grant permissions
      if (can_create_db) {
        await client.query(`ALTER USER "${username}" CREATEDB`)
      }
      
      if (can_create_role) {
        await client.query(`ALTER USER "${username}" CREATEROLE`)
      }
      
      if (is_superuser) {
        await client.query(`ALTER USER "${username}" SUPERUSER`)
      }
      
      if (is_replication) {
        await client.query(`ALTER USER "${username}" REPLICATION`)
      }
      
      if (bypass_rls) {
        await client.query(`ALTER USER "${username}" BYPASSRLS`)
      }
      
      await client.query('COMMIT')
      client.release()
      
      return NextResponse.json({
        success: true,
        message: `User ${username} created successfully`
      })
      
    } catch (error) {
      await client.query('ROLLBACK')
      client.release()
      throw error
    }
    
  } catch (error: any) {
    console.error('Error creating user:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create user' },
      { status: 500 }
    )
  }
}

// PUT - Update an existing database user
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      username, 
      new_password, 
      can_create_db, 
      can_create_role, 
      is_superuser, 
      is_replication,
      bypass_rls 
    } = body

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    
    try {
      await client.query('BEGIN')
      
      // Update password if provided
      if (new_password) {
        await client.query(`ALTER USER "${username}" WITH PASSWORD '${new_password}'`)
      }
      
      // Update permissions
      await client.query(`ALTER USER "${username}" ${can_create_db ? 'CREATEDB' : 'NOCREATEDB'}`)
      await client.query(`ALTER USER "${username}" ${can_create_role ? 'CREATEROLE' : 'NOCREATEROLE'}`)
      await client.query(`ALTER USER "${username}" ${is_superuser ? 'SUPERUSER' : 'NOSUPERUSER'}`)
      await client.query(`ALTER USER "${username}" ${is_replication ? 'REPLICATION' : 'NOREPLICATION'}`)
      await client.query(`ALTER USER "${username}" ${bypass_rls ? 'BYPASSRLS' : 'NOBYPASSRLS'}`)
      
      await client.query('COMMIT')
      client.release()
      
      return NextResponse.json({
        success: true,
        message: `User ${username} updated successfully`
      })
      
    } catch (error) {
      await client.query('ROLLBACK')
      client.release()
      throw error
    }
    
  } catch (error: any) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update user' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a database user
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const username = searchParams.get('username')

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    
    try {
      // First, reassign any owned objects to another user (usually postgres)
      await client.query(`REASSIGN OWNED BY "${username}" TO postgres`)
      await client.query(`DROP OWNED BY "${username}"`)
      await client.query(`DROP USER IF EXISTS "${username}"`)
      
      client.release()
      
      return NextResponse.json({
        success: true,
        message: `User ${username} deleted successfully`
      })
      
    } catch (error) {
      client.release()
      throw error
    }
    
  } catch (error: any) {
    console.error('Error deleting user:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete user' },
      { status: 500 }
    )
  }
}