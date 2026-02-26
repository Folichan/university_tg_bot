const mysql = require('mysql2/promise');

async function test() {
    const db = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'univer'
    });

    const [rows] = await db.query("SELECT 1");
    console.log(rows);
}

test();