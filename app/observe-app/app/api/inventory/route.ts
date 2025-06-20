import { NextResponse } from 'next/server';
import { queryAppDb} from '@/lib/db';

/**
 * GET handler for /api/inventory
 * Fetches all server inventory records from the database.
 */
export async function GET() {
    try {
        const result = await queryAppDb( `SELECT 
            InventoryID as inventoryID,
            SystemName as systemName,
            ServerHost as serverHost,
            Port as port,                       
            DatabaseName as databaseName,
            Zone as zone,
            DatabaseType as databaseType,
            ConnectionUsername as connectionUsername,
            CredentialReference as credentialReference,
            PurposeNotes as purposeNotes,
            OwnerContact as ownerContact,
            CreatedDate as createdDate 
          FROM IT_ManagementDB.dbo.DatabaseInventory
          ORDER BY systemName ASC`);
        // Ensure the response is always in the expected { data: [...] } format
        return NextResponse.json({ data: result.recordset });
    } catch (error: any) {
        console.error("[API GET /inventory]", error);
        return NextResponse.json({ message: `Server Error: ${error.message}` }, { status: 500 });
    }
}

// Add this validation function at the top of the file
function validatePortForDbType(port: number, dbType: string): boolean {
  const defaultPorts = {
    'MSSQL': 1433,
    'MYSQL': 3306,
    'POSTGRES': 5432
  };

  // If it's a default port, always allow it
  if (Object.values(defaultPorts).includes(port)) {
    return true;
  }


}

export async function POST(req: Request) {
    try {
      const body = await req.json();
      console.log("Received body:", body); 
      const {
        systemName,
        serverHost,
        port,
        databaseName,
        zone,
        databaseType,        
        connectionUsername,
        credentialReference,
        purposeNotes,
        ownerContact
      } = body;

      // Add port validation
      if (!validatePortForDbType(port, databaseType)) {
        return new Response(
          JSON.stringify({ 
            message: `Invalid port ${port} for database type ${databaseType}. 
            Expected ports: MSSQL(1433-1434), MySQL(3306-3307), PostgreSQL(5432-5433)` 
          }), 
          { status: 400 }
        );
      }
  
      // Validate required fields
      const requiredFields = [
        'systemName',
        'serverHost',
        'port',
        'databaseName',
        'zone',
        'databaseType',
        'connectionUsername',
        'credentialReference',
        'ownerContact'
    ];

    const missingFields = requiredFields.filter(field => !body[field]);
    if (missingFields.length > 0) {
        return NextResponse.json({
            success: false,
            message: `Missing required fields: ${missingFields.join(', ')}`
        }, { status: 400 });
    }

    // Validate database type
    const validTypes = ['MSSQL', 'POSTGRES', 'MYSQL'];
    if (!validTypes.includes(body.databaseType)) {
        return NextResponse.json({
            success: false,
            message: `Invalid database type. Must be one of: ${validTypes.join(', ')}`
        }, { status: 400 });
    }

    // Validate port number
    if (body.port < 1 || body.port > 65535) {
        return NextResponse.json({
            success: false,
            message: 'Port must be between 1 and 65535'
        }, { status: 400 });
    }
  
      await queryAppDb(
        `INSERT INTO IT_ManagementDB.dbo.DatabaseInventory (
          SystemName, ServerHost, Port, DatabaseName, Zone, DatabaseType, 
          ConnectionUsername, CredentialReference, PurposeNotes, OwnerContact, CreatedDate
        ) VALUES (
          @systemName, @serverHost, @port, @databaseName, @zone, @databaseType, 
          @connectionUsername, @credentialReference, @purposeNotes, @ownerContact, SYSDATETIMEOFFSET()
        )`,
        {
          systemName,
          serverHost,
          port,
          databaseName,
          zone,
          databaseType,
          connectionUsername,
          credentialReference,
          purposeNotes,
          ownerContact
        }
      );
  
      return new Response(JSON.stringify({ message: "Added successfully" }), {
        status: 200,
      });
    } catch (err: any) {
      console.error("ERROR:", err);
      return new Response(JSON.stringify({ message: `Server Error: ${err.message}` }), {
        status: 500,
      });
    }
  }
