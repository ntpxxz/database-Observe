import type { NextApiRequest, NextApiResponse } from 'next';
import { pool } from '@/lib/db';

// PUT and DELETE for /api/servers/[id]
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  // PUT /api/servers/[id] - update inventory data (adjust table name if needed)
  if (req.method === 'PUT') {
    try {
      const { name, zone, db_type, ip_address, db_port, db_user } = req.body;
      const result = await pool.query(
        `UPDATE inventory 
         SET name = $1, 
             zone = $2, 
             db_type = $3, 
             ip_address = $4, 
             db_port = $5, 
             db_user = $6, 
             updated_at = NOW() 
         WHERE id = $7 RETURNING *`,
        [name, zone, db_type, ip_address, db_port, db_user, id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Inventory record not found' });
      }
      return res.status(200).json(result.rows[0]);
    } catch (err: any) {
      return res.status(500).json({ message: `Server Error: ${err.message}` });
    }
  }
  // DELETE /api/servers/[id] - delete inventory record
  else if (req.method === 'DELETE') {
    try {
      const result = await pool.query(
        `DELETE FROM inventory WHERE id = $1`, 
        [id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Inventory record not found' });
      }
      return res.status(204).end();
    } catch (err: any) {
      return res.status(500).json({ message: `Server Error: ${err.message}` });
    }
  }
  // Method Not Allowed
  else {
    res.setHeader('Allow', ['PUT', 'DELETE']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

// GET for /api/servers/[id] - fetch inventory record
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const result = await pool.query(
      `SELECT * FROM inventory WHERE id = $1`,
      [params.id]
    );

    if (!result.rowCount) {
      return new Response(JSON.stringify({ message: 'Inventory record not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify(result.rows[0]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ message: 'Database error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
