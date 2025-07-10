const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const G85Parser = require('../utils/g85Parser');
const { getConnection } = require('../config/database');
const { protect, authorize } = require('../middleware/auth');
const ftpService = require('../services/ftpService');

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

// @desc    Get all lots
// @route   GET /api/lots
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { status, page = 1, limit = 10, search } = req.query;
    const pool = await getConnection();

    let query = `
      SELECT 
        l.*,
        u.username as uploaded_by_name,
        a.username as approved_by_name
      FROM lots l
      LEFT JOIN users u ON l.uploaded_by = u.id
      LEFT JOIN users a ON l.approved_by = a.id
      WHERE 1=1
    `;
    const inputs = {};

    // Add filters
    if (status && status !== 'all') {
      query += ' AND l.status = @status';
      inputs.status = status;
    }

    if (search) {
      query += ' AND (l.filename LIKE @search OR l.lot_id LIKE @search OR l.product_id LIKE @search)';
      inputs.search = `%${search}%`;
    }

    // Add pagination
    const offset = (page - 1) * limit;
    query += ` ORDER BY l.upload_date DESC OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;

    const result = await pool.request()
      .input('status', inputs.status)
      .input('search', inputs.search)
      .query(query);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM lots WHERE 1=1';
    if (status && status !== 'all') {
      countQuery += ' AND status = @status';
    }
    if (search) {
      countQuery += ' AND (filename LIKE @search OR lot_id LIKE @search OR product_id LIKE @search)';
    }

    const countResult = await pool.request()
      .input('status', inputs.status)
      .input('search', inputs.search)
      .query(countQuery);

    const total = countResult.recordset[0].total;

    res.json({
      success: true,
      data: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get lots error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lots'
    });
  }
});

// @desc    Get single lot
// @route   GET /api/lots/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getConnection();

    // Get lot details
    const lotResult = await pool.request()
      .input('id', id)
      .query(`
        SELECT 
          l.*,
          u.username as uploaded_by_name,
          a.username as approved_by_name
        FROM lots l
        LEFT JOIN users u ON l.uploaded_by = u.id
        LEFT JOIN users a ON l.approved_by = a.id
        WHERE l.id = @id
      `);

    if (lotResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lot not found'
      });
    }

    const lot = lotResult.recordset[0];

    // Get dies data
    const diesResult = await pool.request()
      .input('lotId', id)
      .query('SELECT * FROM dies WHERE lot_id = @lotId ORDER BY x_coord, y_coord');

    // Get bins data
    const binsResult = await pool.request()
      .input('lotId', id)
      .query('SELECT * FROM bins WHERE lot_id = @lotId ORDER BY bin_code');

    // Get FTP upload history
    const ftpHistory = await ftpService.getUploadHistory(id);

    res.json({
      success: true,
      data: {
        ...lot,
        dies: diesResult.recordset,
        bins: binsResult.recordset,
        ftpHistory
      }
    });

  } catch (error) {
    console.error('Get lot error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lot'
    });
  }
});

// @desc    Upload new lot
// @route   POST /api/lots
// @access  Private
router.post('/', protect, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { description } = req.body;
    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const fileSize = req.file.size;

    // Read and parse G85 file
    const content = fs.readFileSync(filePath, 'utf8');
    const parser = new G85Parser();
    
    // Validate G85 content
    const validation = parser.validateG85(content);
    if (!validation.valid) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    // Parse G85 content
    const mapData = parser.parseG85(content);
    const statistics = parser.getStatistics(mapData);

    const pool = await getConnection();

    // Start transaction
    const transaction = new pool.Transaction();
    await transaction.begin();

    try {
      // Insert lot record
      const lotResult = await transaction.request()
        .input('filename', originalName)
        .input('originalFilename', originalName)
        .input('uploadedBy', req.user.id)
        .input('description', description)
        .input('filePath', filePath)
        .input('fileSize', fileSize)
        .input('substrateNumber', mapData.mapAttributes.SubstrateNumber)
        .input('substrateType', mapData.mapAttributes.SubstrateType)
        .input('substrateId', mapData.mapAttributes.SubstrateId)
        .input('lotId', mapData.header.LotId)
        .input('productId', mapData.header.ProductId)
        .input('waferSize', mapData.header.WaferSize)
        .input('rowsCount', mapData.header.Rows)
        .input('columnsCount', mapData.header.Columns)
        .input('totalDies', statistics.totalDies)
        .input('defectCount', statistics.defectCount)
        .query(`
          INSERT INTO lots (
            filename, original_filename, uploaded_by, description, file_path, file_size,
            substrate_number, substrate_type, substrate_id, lot_id, product_id, wafer_size,
            rows_count, columns_count, total_dies, defect_count
          )
          OUTPUT INSERTED.id
          VALUES (
            @filename, @originalFilename, @uploadedBy, @description, @filePath, @fileSize,
            @substrateNumber, @substrateType, @substrateId, @lotId, @productId, @waferSize,
            @rowsCount, @columnsCount, @totalDies, @defectCount
          )
        `);

      const lotId = lotResult.recordset[0].id;

      // Insert dies data
      for (const [coord, status] of mapData.dies) {
        const [x, y] = coord.split(',').map(Number);
        const isDefect = status === 'EF';
        const defectType = isDefect ? 'defect' : null;

        await transaction.request()
          .input('lotId', lotId)
          .input('xCoord', x)
          .input('yCoord', y)
          .input('binCode', status)
          .input('isDefect', isDefect)
          .input('defectType', defectType)
          .query(`
            INSERT INTO dies (lot_id, x_coord, y_coord, bin_code, is_defect, defect_type)
            VALUES (@lotId, @xCoord, @yCoord, @binCode, @isDefect, @defectType)
          `);
      }

      // Insert bins data
      for (const bin of mapData.bins) {
        await transaction.request()
          .input('lotId', lotId)
          .input('binCode', bin.BinCode)
          .input('binQuality', bin.BinQuality)
          .input('binDescription', bin.BinDescription)
          .input('binCount', bin.BinCount)
          .query(`
            INSERT INTO bins (lot_id, bin_code, bin_quality, bin_description, bin_count)
            VALUES (@lotId, @binCode, @binQuality, @binDescription, @binCount)
          `);
      }

      await transaction.commit();

      res.status(201).json({
        success: true,
        data: {
          id: lotId,
          filename: originalName,
          statistics
        }
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Upload lot error:', error);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload lot'
    });
  }
});

// @desc    Update lot status
// @route   PUT /api/lots/:id/status
// @access  Private
router.put('/:id/status', protect, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }

    const pool = await getConnection();

    const result = await pool.request()
      .input('id', id)
      .input('status', status)
      .input('approvedBy', status === 'approved' ? req.user.id : null)
      .input('approvedAt', status === 'approved' ? new Date() : null)
      .query(`
        UPDATE lots 
        SET status = @status, 
            approved_by = @approvedBy, 
            approved_at = @approvedAt
        WHERE id = @id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lot not found'
      });
    }

    res.json({
      success: true,
      message: `Lot ${status} successfully`
    });

  } catch (error) {
    console.error('Update lot status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update lot status'
    });
  }
});

// @desc    Upload lot to FTP
// @route   POST /api/lots/:id/upload-ftp
// @access  Private
router.post('/:id/upload-ftp', protect, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getConnection();

    // Get lot details
    const lotResult = await pool.request()
      .input('id', id)
      .query('SELECT * FROM lots WHERE id = @id');

    if (lotResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lot not found'
      });
    }

    const lot = lotResult.recordset[0];

    if (lot.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Only approved lots can be uploaded to FTP'
      });
    }

    if (!fs.existsSync(lot.file_path)) {
      return res.status(404).json({
        success: false,
        error: 'Lot file not found'
      });
    }

    // Generate remote filename
    const remoteFileName = ftpService.generateRemoteFileName(lot.original_filename, lot.id);

    // Upload to FTP
    const result = await ftpService.uploadFile(lot.file_path, remoteFileName, lot.id);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('FTP upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload to FTP'
    });
  }
});

// @desc    Delete lot
// @route   DELETE /api/lots/:id
// @access  Private
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getConnection();

    // Get lot details
    const lotResult = await pool.request()
      .input('id', id)
      .query('SELECT file_path FROM lots WHERE id = @id');

    if (lotResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lot not found'
      });
    }

    const lot = lotResult.recordset[0];

    // Start transaction
    const transaction = new pool.Transaction();
    await transaction.begin();

    try {
      // Delete related records
      await transaction.request()
        .input('lotId', id)
        .query('DELETE FROM dies WHERE lot_id = @lotId');

      await transaction.request()
        .input('lotId', id)
        .query('DELETE FROM bins WHERE lot_id = @lotId');

      await transaction.request()
        .input('lotId', id)
        .query('DELETE FROM ftp_logs WHERE lot_id = @lotId');

      // Delete lot record
      await transaction.request()
        .input('id', id)
        .query('DELETE FROM lots WHERE id = @id');

      await transaction.commit();

      // Delete file if it exists
      if (lot.file_path && fs.existsSync(lot.file_path)) {
        fs.unlinkSync(lot.file_path);
      }

      res.json({
        success: true,
        message: 'Lot deleted successfully'
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Delete lot error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete lot'
    });
  }
});

module.exports = router; 