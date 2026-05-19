const dotenv = require('dotenv');
dotenv.config();

const {
  DB_HOST,
  DB_PORT = 5432,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_DIALECT
} = process.env;

module.exports = {
  development: {
    dialect: DB_DIALECT,
    host: DB_HOST,
    username: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    port: Number(DB_PORT),
    logging: false,
  },
  test: {
    dialect: DB_DIALECT || 'postgres',
    host: DB_HOST || 'localhost',
    username: DB_USER,
    password: DB_PASSWORD || '',
    database: DB_NAME || 'qori_test',
    port: Number(DB_PORT || 5432),
    logging: false,
  },
  production: {
    dialect: DB_DIALECT,
    host: DB_HOST,
    username: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    port: Number(DB_PORT),
    logging: false,
  },
};