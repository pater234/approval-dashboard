const express = require('express');
const ftpService = require('../services/ftpService');
const { protect, authorize } = require('../middleware/auth');
const fs = require('fs'); // Added missing import for fs

const router = express.Router();

// @desc    Test FTP connection
// @route   GET /api/ftp/test
// @access  Private
router.get('/test', protect, authorize('admin'), async (req, res) => {
  try {
    const result = await ftpService.testConnection();
    
    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('FTP test error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test FTP connection'
    });
  }
});

// @desc    List FTP files
// @route   GET /api/ftp/files
// @access  Private
router.get('/files', protect, authorize('admin'), async (req, res) => {
  try {
    const { path = '/' } = req.query;
    const files = await ftpService.listRemoteFiles(path);
    
    res.json({
      success: true,
      data: files
    });

  } catch (error) {
    console.error('FTP list files error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list FTP files'
    });
  }
});

// @desc    Download file from FTP
// @route   GET /api/ftp/download/:filename
// @access  Private
router.get('/download/:filename', protect, authorize('admin'), async (req, res) => {
  try {
    const { filename } = req.params;
    const { path = '/' } = req.query;
    
    const localPath = `./temp/${filename}`;
    await ftpService.downloadFile(`${path}/${filename}`, localPath);
    
    res.download(localPath, filename, (err) => {
      // Clean up temp file after download
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    });

  } catch (error) {
    console.error('FTP download error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to download file from FTP'
    });
  }
});

// @desc    Delete file from FTP
// @route   DELETE /api/ftp/delete/:filename
// @access  Private
router.delete('/delete/:filename', protect, authorize('admin'), async (req, res) => {
  try {
    const { filename } = req.params;
    const { path = '/' } = req.query;
    
    await ftpService.deleteFile(`${path}/${filename}`);
    
    res.json({
      success: true,
      message: 'File deleted from FTP successfully'
    });

  } catch (error) {
    console.error('FTP delete error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete file from FTP'
    });
  }
});

// @desc    Get FTP upload history for a lot
// @route   GET /api/ftp/history/:lotId
// @access  Private
router.get('/history/:lotId', protect, async (req, res) => {
  try {
    const { lotId } = req.params;
    const history = await ftpService.getUploadHistory(lotId);
    
    res.json({
      success: true,
      data: history
    });

  } catch (error) {
    console.error('FTP history error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get FTP history'
    });
  }
});

// @desc    Upload multiple files to FTP
// @route   POST /api/ftp/upload-multiple
// @access  Private
router.post('/upload-multiple', protect, authorize('admin'), async (req, res) => {
  try {
    const { files, lotId } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Files array is required'
      });
    }

    const results = await ftpService.uploadMultipleFiles(files, lotId);
    
    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('FTP multiple upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload multiple files to FTP'
    });
  }
});

// @desc    Get FTP server information
// @route   GET /api/ftp/info
// @access  Private
router.get('/info', protect, authorize('admin'), async (req, res) => {
  try {
    const info = {
      host: process.env.FTP_HOST,
      port: process.env.FTP_PORT || 21,
      user: process.env.FTP_USER,
      secure: process.env.FTP_SECURE === 'true',
      connected: false
    };

    // Test connection to get current status
    try {
      const testResult = await ftpService.testConnection();
      info.connected = testResult.success;
      info.fileCount = testResult.fileCount;
    } catch (error) {
      info.connected = false;
      info.error = error.message;
    }

    res.json({
      success: true,
      data: info
    });

  } catch (error) {
    console.error('FTP info error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get FTP information'
    });
  }
});

module.exports = router; 