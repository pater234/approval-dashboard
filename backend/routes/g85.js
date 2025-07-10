const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const G85Parser = require('../utils/g85Parser');
const { getConnection } = require('../config/database');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}_${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/xml' || file.originalname.toLowerCase().endsWith('.g85')) {
      cb(null, true);
    } else {
      cb(new Error('Only G85 XML files are allowed'), false);
    }
  }
});

// @desc    Parse G85 file content
// @route   POST /api/g85/parse
// @access  Private
router.post('/parse', protect, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'G85 content is required'
      });
    }

    const parser = new G85Parser();
    
    // Validate G85 content
    const validation = parser.validateG85(content);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    // Parse G85 content
    const mapData = parser.parseG85(content);
    const statistics = parser.getStatistics(mapData);

    res.json({
      success: true,
      data: {
        mapData,
        statistics
      }
    });

  } catch (error) {
    console.error('G85 parsing error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to parse G85 file'
    });
  }
});

// @desc    Upload and parse G85 file
// @route   POST /api/g85/upload
// @access  Private
router.post('/upload', protect, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const fileSize = req.file.size;

    // Read file content
    const content = fs.readFileSync(filePath, 'utf8');

    const parser = new G85Parser();
    
    // Validate G85 content
    const validation = parser.validateG85(content);
    if (!validation.valid) {
      // Delete invalid file
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    // Parse G85 content
    const mapData = parser.parseG85(content);
    const statistics = parser.getStatistics(mapData);

    // Generate unique filename for storage
    const uniqueFilename = `${uuidv4()}.g85`;
    const newFilePath = path.join(path.dirname(filePath), uniqueFilename);
    fs.renameSync(filePath, newFilePath);

    res.json({
      success: true,
      data: {
        originalName,
        filename: uniqueFilename,
        filePath: newFilePath,
        fileSize,
        mapData,
        statistics
      }
    });

  } catch (error) {
    console.error('G85 upload error:', error);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload G85 file'
    });
  }
});

// @desc    Generate G85 file from map data
// @route   POST /api/g85/generate
// @access  Private
router.post('/generate', protect, async (req, res) => {
  try {
    const { mapData } = req.body;

    if (!mapData) {
      return res.status(400).json({
        success: false,
        error: 'Map data is required'
      });
    }

    const parser = new G85Parser();
    const g85Content = parser.generateG85(mapData);

    // Generate filename
    const filename = `generated_${uuidv4()}.g85`;
    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', filename);

    // Save file
    fs.writeFileSync(filePath, g85Content);

    res.json({
      success: true,
      data: {
        filename,
        filePath,
        content: g85Content
      }
    });

  } catch (error) {
    console.error('G85 generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate G85 file'
    });
  }
});

// @desc    Get G85 file statistics
// @route   POST /api/g85/statistics
// @access  Private
router.post('/statistics', protect, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'G85 content is required'
      });
    }

    const parser = new G85Parser();
    const mapData = parser.parseG85(content);
    const statistics = parser.getStatistics(mapData);

    res.json({
      success: true,
      data: statistics
    });

  } catch (error) {
    console.error('G85 statistics error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get G85 statistics'
    });
  }
});

// @desc    Validate G85 file
// @route   POST /api/g85/validate
// @access  Private
router.post('/validate', protect, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'G85 content is required'
      });
    }

    const parser = new G85Parser();
    const validation = parser.validateG85(content);

    res.json({
      success: true,
      data: validation
    });

  } catch (error) {
    console.error('G85 validation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to validate G85 file'
    });
  }
});

// @desc    Download G85 file
// @route   GET /api/g85/download/:filename
// @access  Private
router.get('/download/:filename', protect, async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    res.download(filePath, filename);

  } catch (error) {
    console.error('G85 download error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download file'
    });
  }
});

// @desc    Delete G85 file
// @route   DELETE /api/g85/delete/:filename
// @access  Private
router.delete('/delete/:filename', protect, authorize('admin'), async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: 'File deleted successfully'
    });

  } catch (error) {
    console.error('G85 delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete file'
    });
  }
});

module.exports = router; 