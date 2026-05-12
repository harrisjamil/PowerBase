import { NextResponse } from "next/server";
import { Pool } from "pg";

type ParsedDbUrl = {
  user: string;
  password: string;
  host: string;
  port: string;
  database: string;
};

function assertPgRoleName(name: unknown): { ok: true; quoted: string } | { ok: false; error: string } {
  if (typeof name !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(name)) {
    return {
      ok: false,
      error: "Invalid role name: use letters, numbers, and underscore only (max 63 characters).",
    };
  }
  return { ok: true, quoted: `"${name.replace(/"/g, '""')}"` };
}

// Create connection pool using DATABASE_URL
let pool: Pool | null = null;

function getPool() {
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    throw new Error("DATABASE_URL not set");
  }
  
  if (!pool) {
    pool = new Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 5000,
      max: 10,
    });
  }
  
  return pool;
}

// Helper function to parse PostgreSQL URL
function parsePostgresUrl(url: string) {
  try {
    const clean = url.replace("postgresql://", "");
    const [auth, hostPart] = clean.split("@");
    const [user, password] = auth.split(":");
    const [hostPort, database] = hostPart.split("/");
    const [host, port] = hostPort.split(":");
    
    return {
      user,
      password,
      host,
      port: port || "5432",
      database: database || "postgres",
    };
  } catch (error) {
    console.error("Error parsing DATABASE_URL:", error);
    return {
      user: "unknown",
      password: "unknown",
      host: "unknown",
      port: "5432",
      database: "unknown",
    };
  }
}

/** Rich server info from PostgreSQL (host OS CPU/RAM are not visible over SQL alone). */
async function getVMInfo(poolInstance: Pool, parsed: ParsedDbUrl) {
  const info: Record<string, string | number | string[] | null> = {
    connectionHost: parsed.host,
    connectionPort: parsed.port,
    connectionDatabase: parsed.database,
    connectionUser: parsed.user,
  };

  try {
    const sessionResult = await poolInstance.query(`
      SELECT current_user::text AS cu, session_user::text AS su
    `);
    info.currentUser = sessionResult.rows[0].cu;
    info.sessionUser = sessionResult.rows[0].su;

    const versionResult = await poolInstance.query(`
      SELECT 
        version() as pg_version,
        current_setting('server_version') as server_version,
        current_setting('data_directory') as data_directory,
        current_setting('max_connections') as max_connections,
        current_setting('shared_buffers') as shared_buffers
    `);
    const row0 = versionResult.rows[0];
    const fullVer = String(row0.pg_version ?? "");
    info.postgresVersion = fullVer;
    info.serverVersion = String(row0.server_version ?? "");
    info.platformSummary = fullVer.split("\n")[0] || fullVer;
    info.dataDirectory = String(row0.data_directory ?? "");
    info.maxConnections = String(row0.max_connections ?? "");
    info.sharedBuffers = String(row0.shared_buffers ?? "");

    const uptimeResult = await poolInstance.query(`
      SELECT 
        pg_postmaster_start_time() as started,
        now() - pg_postmaster_start_time() as uptime
    `);
    const started = uptimeResult.rows[0].started;
    info.serverStartTime =
      started instanceof Date ? started.toISOString() : String(started ?? "");
    info.serverUptime = String(uptimeResult.rows[0].uptime ?? "");

    const diskResult = await poolInstance.query(`
      SELECT 
        pg_database_size(current_database()) as current_db_size,
        sum(pg_database_size(datname)) as total_size,
        count(*)::int as database_count
      FROM pg_database
    `);
    const totalBytes = diskResult.rows[0].total_size;
    info.totalDatabaseSize = totalBytes
      ? `${(Number(totalBytes) / 1024 / 1024 / 1024).toFixed(2)} GB`
      : "Unknown";
    const curBytes = diskResult.rows[0].current_db_size;
    info.currentDbSize = curBytes
      ? `${(Number(curBytes) / 1024 / 1024).toFixed(2)} MB`
      : "Unknown";
    info.databaseCount = diskResult.rows[0].database_count;

    const connResult = await poolInstance.query(`
      SELECT count(*)::int as active_connections 
      FROM pg_stat_activity 
      WHERE state = 'active'
    `);
    info.activeConnections = connResult.rows[0].active_connections;

    const hostResult = await poolInstance.query(`
      SELECT inet_server_addr()::text as server_ip, inet_server_port()::text as server_port
    `);
    info.serverIP = hostResult.rows[0].server_ip || "Unknown";
    info.serverPort = hostResult.rows[0].server_port || "Unknown";

    const dbListResult = await poolInstance.query(`
      SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname
    `);
    info.databases = dbListResult.rows.map((r) => r.datname);

    info.hostnameLabel = `${parsed.host}:${parsed.port}`;
    info.physicalHostNote =
      "CPU and host RAM are not exposed by PostgreSQL over this connection; shared_buffers and data_directory reflect server configuration.";
  } catch (error) {
    console.error("Error getting database server info:", error);
    info.error = `Failed to get database server information: ${String(error)}`;
  }

  return info;
}

export async function GET(request: Request) {
  try {
    const dbUrl = process.env.DATABASE_URL;
    
    if (!dbUrl) {
      return NextResponse.json(
        { success: false, error: "DATABASE_URL not set" },
        { status: 500 }
      );
    }
    
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    // Get VM / server info (from PostgreSQL + connection URL)
    if (action === "vminfo") {
      const parsed = parsePostgresUrl(dbUrl);
      const vmInfo = await getVMInfo(getPool(), parsed);
      return NextResponse.json({
        success: true,
        vmInfo,
      });
    }
    
    // Get connection info
    if (!action || action === 'info') {
      const parsed = parsePostgresUrl(dbUrl);
      const poolInstance = getPool();
      
      // Get PostgreSQL version from database
      let pgVersion = 'Unknown';
      try {
        const versionResult = await poolInstance.query('SELECT version()');
        pgVersion = versionResult.rows[0].version;
      } catch (err) {
        console.error('Failed to get PostgreSQL version:', err);
      }
      
      // Get database size
      let dbSize = 'Unknown';
      try {
        const sizeResult = await poolInstance.query(`
          SELECT pg_database_size($1) as size
        `, [parsed.database]);
        const bytes = sizeResult.rows[0].size;
        dbSize = bytes ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : 'Unknown';
      } catch (err) {
        console.error('Failed to get database size:', err);
      }
      
      // Get active connections
      let activeConnections = 0;
      try {
        const connResult = await poolInstance.query(`
          SELECT count(*) FROM pg_stat_activity WHERE datname = $1
        `, [parsed.database]);
        activeConnections = parseInt(connResult.rows[0].count);
      } catch (err) {
        console.error('Failed to get active connections:', err);
      }
      
      return NextResponse.json({
        success: true,
        db: {
          host: parsed.host,
          port: parsed.port,
          database: parsed.database,
          user: parsed.user,
          pgVersion,
          dbSize,
          activeConnections,
        },
      });
    }
    
    // Get all users
    if (action === 'users') {
      const poolInstance = getPool();
      const result = await poolInstance.query(`
        SELECT 
          usename as username,
          usesuper as is_superuser,
          usecreatedb as can_create_db,
          valuntil as valid_until
        FROM pg_user
        ORDER BY usename
      `);
      
      return NextResponse.json({
        success: true,
        users: result.rows,
      });
    }
    
    // Get database statistics
    if (action === 'stats') {
      const poolInstance = getPool();
      const result = await poolInstance.query(`
        SELECT 
          schemaname,
          tablename,
          n_live_tup as live_rows,
          n_dead_tup as dead_rows,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC
        LIMIT 20
      `);
      
      return NextResponse.json({
        success: true,
        stats: result.rows,
      });
    }
    
    // Get all tables
    if (action === 'tables') {
      const poolInstance = getPool();
      const result = await poolInstance.query(`
        SELECT 
          table_name,
          table_schema
        FROM information_schema.tables 
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      
      return NextResponse.json({
        success: true,
        tables: result.rows,
      });
    }
    
    // Get table schema
    if (action === 'schema') {
      const tableName = searchParams.get('table');
      if (!tableName) {
        return NextResponse.json(
          { success: false, error: 'Table name required' },
          { status: 400 }
        );
      }
      
      const poolInstance = getPool();
      const result = await poolInstance.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      
      return NextResponse.json({
        success: true,
        schema: result.rows,
      });
    }
    
    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const dbUrl = process.env.DATABASE_URL;
    
    if (!dbUrl) {
      return NextResponse.json(
        { success: false, error: "DATABASE_URL not set" },
        { status: 500 }
      );
    }
    
    const body = await request.json();
    const { action, tableName, columns } = body;
    
    const poolInstance = getPool();
    
    if (action === 'createTable') {
      // Validate inputs
      if (!tableName || !columns || columns.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Table name and columns are required' },
          { status: 400 }
        );
      }
      
      // Validate table name
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
        return NextResponse.json(
          { success: false, error: 'Invalid table name' },
          { status: 400 }
        );
      }
      
      // Build CREATE TABLE query
      type CreateColumn = { name: string; type: string; constraints?: string };
      const cols = columns as CreateColumn[];
      const columnDefinitions = cols.map((col) => {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col.name)) {
          throw new Error(`Invalid column name: ${col.name}`);
        }

        let def = `"${col.name}" ${col.type}`;
        if (col.constraints && col.constraints.trim()) {
          def += ` ${col.constraints}`;
        }
        return def;
      }).join(", ");
      
      const query = `CREATE TABLE IF NOT EXISTS "${tableName}" (${columnDefinitions})`;
      
      console.log('Executing query:', query);
      await poolInstance.query(query);
      
      return NextResponse.json({
        success: true,
        message: `Table '${tableName}' created successfully`,
      });
    }

    if (action === "setUserPassword") {
      const { username, password } = body as {
        username?: unknown;
        password?: unknown;
      };
      if (typeof password !== "string" || password.length === 0) {
        return NextResponse.json(
          { success: false, error: "Password is required" },
          { status: 400 }
        );
      }
      const id = assertPgRoleName(username);
      if (!id.ok) {
        return NextResponse.json({ success: false, error: id.error }, { status: 400 });
      }
      await poolInstance.query(`ALTER ROLE ${id.quoted} WITH PASSWORD $1`, [password]);
      return NextResponse.json({
        success: true,
        message: `Password updated for role ${String(username)}`,
      });
    }

    if (action === "createUser") {
      const { username, password, superuser, canCreateDb } = body as {
        username?: unknown;
        password?: unknown;
        superuser?: unknown;
        canCreateDb?: unknown;
      };
      if (typeof password !== "string" || password.length === 0) {
        return NextResponse.json(
          { success: false, error: "Password is required" },
          { status: 400 }
        );
      }
      const id = assertPgRoleName(username);
      if (!id.ok) {
        return NextResponse.json({ success: false, error: id.error }, { status: 400 });
      }
      const sup = superuser ? "SUPERUSER" : "NOSUPERUSER";
      const cdb = canCreateDb ? "CREATEDB" : "NOCREATEDB";
      await poolInstance.query(
        `CREATE ROLE ${id.quoted} WITH LOGIN PASSWORD $1 ${sup} ${cdb} NOREPLICATION`,
        [password]
      );
      return NextResponse.json({
        success: true,
        message: `Role '${String(username)}' created`,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('Error in POST:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}