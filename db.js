const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '', // в XAMPP по умолчанию пусто
  database: 'students_bot'
});

connection.connect(err => {
  if (err) {
    console.error('Ошибка подключения к БД. Причина:', err);
    return;
  }
  console.log('Подключение к MySQL успешно завершено.');
});

module.exports = connection;