const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');
const { getConnection } = require('../config/database');

class FTPService {
  constructor() {
    this.client = new ftp.Client();
    this.client.ftp.verbose = process.env.NODE_ENV === 'development';
  }

  async connect() {
    try {
      await this.client.access({
        host: process.env.FTP_HOST,
        port: parseInt(process.env.FTP_PORT) || 21,
        user: process.env.FTP_USER,
        password: process.env.FTP_PASSWORD,
        secure: process.env.FTP_SECURE === 'true'
      });
      
      console.log('Connected to FTP server');
      return true;
    } catch (error) {
      console.error('FTP connection error:', error);
      throw error;
    }
  }

  async uploadFile(localFilePath, remoteFileName, lotId) {
    const pool = await getConnection();
    
    try {
      // Connect to FTP server
      await this.connect();
      
      // Check if file exists locally
      if (!fs.existsSync(localFilePath)) {
        throw new Error(`Local file not found: ${localFilePath}`);
      }

      // Upload file
      console.log(`Uploading ${localFilePath} to FTP as ${remoteFileName}`);
      await this.client.uploadFrom(localFilePath, remoteFileName);
      
      // Log successful upload
      await pool.request()
        .input('lotId', lotId)
        .input('filename', remoteFileName)
        .input('status', 'success')
        .input('errorMessage', null)
        .query(`
          INSERT INTO ftp_logs (lot_id, filename, status, error_message)
          VALUES (@lotId, @filename, @status, @errorMessage)
        `);

      // Update lot status
      await pool.request()
        .input('lotId', lotId)
        .query(`
          UPDATE lots 
          SET ftp_uploaded = 1, ftp_upload_date = GETDATE()
          WHERE id = @lotId
        `);

      console.log(`Successfully uploaded ${remoteFileName} to FTP`);
      return {
        success: true,
        filename: remoteFileName,
        uploadedAt: new Date()
      };

    } catch (error) {
      console.error('FTP upload error:', error);
      
      // Log failed upload
      await pool.request()
        .input('lotId', lotId)
        .input('filename', remoteFileName)
        .input('status', 'failed')
        .input('errorMessage', error.message)
        .query(`
          INSERT INTO ftp_logs (lot_id, filename, status, error_message)
          VALUES (@lotId, @filename, @status, @errorMessage)
        `);

      throw error;
    } finally {
      // Always close FTP connection
      this.client.close();
    }
  }

  async uploadMultipleFiles(files, lotId) {
    const results = [];
    
    for (const file of files) {
      try {
        const result = await this.uploadFile(file.localPath, file.remoteName, lotId);
        results.push({ ...result, filename: file.remoteName });
      } catch (error) {
        results.push({
          success: false,
          filename: file.remoteName,
          error: error.message
        });
      }
    }
    
    return results;
  }

  async listRemoteFiles(remotePath = '/') {
    try {
      await this.connect();
      const files = await this.client.list(remotePath);
      return files.map(file => ({
        name: file.name,
        size: file.size,
        type: file.type,
        modified: file.modifiedAt
      }));
    } catch (error) {
      console.error('Error listing FTP files:', error);
      throw error;
    } finally {
      this.client.close();
    }
  }

  async downloadFile(remoteFileName, localFilePath) {
    try {
      await this.connect();
      await this.client.downloadTo(localFilePath, remoteFileName);
      console.log(`Downloaded ${remoteFileName} to ${localFilePath}`);
      return true;
    } catch (error) {
      console.error('FTP download error:', error);
      throw error;
    } finally {
      this.client.close();
    }
  }

  async deleteFile(remoteFileName) {
    try {
      await this.connect();
      await this.client.remove(remoteFileName);
      console.log(`Deleted ${remoteFileName} from FTP`);
      return true;
    } catch (error) {
      console.error('FTP delete error:', error);
      throw error;
    } finally {
      this.client.close();
    }
  }

  async testConnection() {
    try {
      await this.connect();
      const files = await this.client.list();
      this.client.close();
      return {
        success: true,
        message: 'FTP connection successful',
        fileCount: files.length
      };
    } catch (error) {
      this.client.close();
      return {
        success: false,
        message: error.message
      };
    }
  }

  generateRemoteFileName(originalFileName, lotId, timestamp = null) {
    const date = timestamp || new Date();
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '');
    
    // Create a standardized filename format
    return `G85_${lotId}_${dateStr}_${timeStr}.g85`;
  }

  async getUploadHistory(lotId) {
    const pool = await getConnection();
    
    try {
      const result = await pool.request()
        .input('lotId', lotId)
        .query(`
          SELECT * FROM ftp_logs 
          WHERE lot_id = @lotId 
          ORDER BY uploaded_at DESC
        `);
      
      return result.recordset;
    } catch (error) {
      console.error('Error fetching upload history:', error);
      throw error;
    }
  }
}

module.exports = new FTPService(); 