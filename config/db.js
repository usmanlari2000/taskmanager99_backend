const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
  connectionTimeoutMillis: 5000,
  max: 10,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle database client", err);
});

module.exports = pool;
