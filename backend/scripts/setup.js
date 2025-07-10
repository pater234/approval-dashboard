const bcrypt = require('bcryptjs');
const { getConnection } = require('../config/database');

async function setupDatabase() {
  try {
    console.log('🔧 Setting up database...');
    
    const pool = await getConnection();
    
    // Check if admin user exists
    const adminCheck = await pool.request()
      .input('username', 'admin')
      .query('SELECT id FROM users WHERE username = @username');
    
    if (adminCheck.recordset.length === 0) {
      // Create admin user
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);
      
      await pool.request()
        .input('username', 'admin')
        .input('email', 'admin@example.com')
        .input('password', hashedPassword)
        .input('role', 'admin')
        .query(`
          INSERT INTO users (username, email, password, role)
          VALUES (@username, @email, @password, @role)
        `);
      
      console.log('✅ Admin user created:');
      console.log('   Username: admin');
      console.log('   Password: admin123');
      console.log('   Role: admin');
    } else {
      console.log('ℹ️  Admin user already exists');
    }
    
    // Check if test user exists
    const userCheck = await pool.request()
      .input('username', 'user')
      .query('SELECT id FROM users WHERE username = @username');
    
    if (userCheck.recordset.length === 0) {
      // Create test user
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('user123', salt);
      
      await pool.request()
        .input('username', 'user')
        .input('email', 'user@example.com')
        .input('password', hashedPassword)
        .input('role', 'user')
        .query(`
          INSERT INTO users (username, email, password, role)
          VALUES (@username, @email, @password, @role)
        `);
      
      console.log('✅ Test user created:');
      console.log('   Username: user');
      console.log('   Password: user123');
      console.log('   Role: user');
    } else {
      console.log('ℹ️  Test user already exists');
    }
    
    console.log('✅ Database setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  setupDatabase();
}

module.exports = { setupDatabase }; 