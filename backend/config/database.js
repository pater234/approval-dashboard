const sql = require('mssql');

const dbConfig = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_DATABASE || 'approval_dashboard',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    encrypt: process.env.DB_OPTIONS_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_OPTIONS_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
    requestTimeout: 30000,
    connectionTimeout: 30000
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool;

async function connectDB() {
  try {
    pool = await sql.connect(dbConfig);
    console.log('Connected to SQL Server database');
    
    // Initialize database tables if they don't exist
    await initializeTables();
    
    return pool;
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}

async function initializeTables() {
  try {
    // Create users table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
      CREATE TABLE users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        username NVARCHAR(50) UNIQUE NOT NULL,
        password NVARCHAR(255) NOT NULL,
        email NVARCHAR(100),
        role NVARCHAR(20) DEFAULT 'user',
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE()
      )
    `);

    // Create lots table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='lots' AND xtype='U')
      CREATE TABLE lots (
        id INT IDENTITY(1,1) PRIMARY KEY,
        filename NVARCHAR(255) NOT NULL,
        original_filename NVARCHAR(255) NOT NULL,
        uploaded_by INT FOREIGN KEY REFERENCES users(id),
        upload_date DATETIME2 DEFAULT GETDATE(),
        status NVARCHAR(20) DEFAULT 'pending',
        description NVARCHAR(500),
        file_path NVARCHAR(500),
        file_size BIGINT,
        substrate_number NVARCHAR(50),
        substrate_type NVARCHAR(50),
        substrate_id NVARCHAR(50),
        lot_id NVARCHAR(50),
        product_id NVARCHAR(50),
        wafer_size NVARCHAR(20),
        rows_count INT,
        columns_count INT,
        total_dies INT,
        defect_count INT,
        approved_by INT FOREIGN KEY REFERENCES users(id),
        approved_at DATETIME2,
        ftp_uploaded BIT DEFAULT 0,
        ftp_upload_date DATETIME2
      )
    `);

    // Create dies table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='dies' AND xtype='U')
      CREATE TABLE dies (
        id INT IDENTITY(1,1) PRIMARY KEY,
        lot_id INT FOREIGN KEY REFERENCES lots(id),
        x_coord INT NOT NULL,
        y_coord INT NOT NULL,
        bin_code NVARCHAR(10),
        bin_quality NVARCHAR(20),
        bin_description NVARCHAR(100),
        is_defect BIT DEFAULT 0,
        defect_type NVARCHAR(50),
        created_at DATETIME2 DEFAULT GETDATE()
      )
    `);

    // Create bins table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='bins' AND xtype='U')
      CREATE TABLE bins (
        id INT IDENTITY(1,1) PRIMARY KEY,
        lot_id INT FOREIGN KEY REFERENCES lots(id),
        bin_code NVARCHAR(10) NOT NULL,
        bin_quality NVARCHAR(20),
        bin_description NVARCHAR(100),
        bin_count INT DEFAULT 0,
        created_at DATETIME2 DEFAULT GETDATE()
      )
    `);

    // Create ftp_logs table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ftp_logs' AND xtype='U')
      CREATE TABLE ftp_logs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        lot_id INT FOREIGN KEY REFERENCES lots(id),
        filename NVARCHAR(255) NOT NULL,
        status NVARCHAR(20) NOT NULL,
        error_message NVARCHAR(500),
        uploaded_at DATETIME2 DEFAULT GETDATE()
      )
    `);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing tables:', error);
    throw error;
  }
}

async function getConnection() {
  if (!pool) {
    await connectDB();
  }
  return pool;
}

async function closeConnection() {
  if (pool) {
    await pool.close();
    console.log('Database connection closed');
  }
}

module.exports = {
  connectDB,
  getConnection,
  closeConnection,
  initializeTables
}; 