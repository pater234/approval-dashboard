const { DOMParser } = require('xmldom');
const xml2js = require('xml2js');

class G85Parser {
  constructor() {
    this.parser = new DOMParser();
  }

  parseG85(content) {
    try {
      const xmlDoc = this.parser.parseFromString(content, "text/xml");
      
      const mapData = {
        header: {},
        dies: new Map(), // Map of coordinates to die status
        defects: new Map(), // Map of coordinates to defect information
        bins: [], // Array of bin definitions
        referenceDevice: null, // Reference device information
        mapAttributes: {}, // Map-level attributes
      };

      // Parse Map-level attributes
      const mapElement = xmlDoc.documentElement;
      mapData.mapAttributes = {
        SubstrateNumber: mapElement.getAttribute("SubstrateNumber"),
        SubstrateType: mapElement.getAttribute("SubstrateType"),
        SubstrateId: mapElement.getAttribute("SubstrateId"),
        FormatRevision: mapElement.getAttribute("FormatRevision")
      };

      // Parse header information
      const device = xmlDoc.getElementsByTagName("Device")[0];
      if (device) {
        mapData.header = {
          BinType: device.getAttribute("BinType"),
          SupplierName: device.getAttribute("SupplierName"),
          LotId: device.getAttribute("LotId"),
          DeviceSizeX: device.getAttribute("DeviceSizeX"),
          DeviceSizeY: device.getAttribute("DeviceSizeY"),
          NullBin: device.getAttribute("NullBin"),
          ProductId: device.getAttribute("ProductId"),
          Rows: device.getAttribute("Rows"),
          Columns: device.getAttribute("Columns"),
          MapType: device.getAttribute("MapType"),
          OriginLocation: device.getAttribute("OriginLocation"),
          Orientation: device.getAttribute("Orientation"),
          WaferSize: device.getAttribute("WaferSize"),
          CreateDate: device.getAttribute("CreateDate"),
          LastModified: device.getAttribute("LastModified")
        };
      }

      // Parse reference device information
      const refDevice = xmlDoc.getElementsByTagName("ReferenceDevice")[0];
      if (refDevice) {
        mapData.referenceDevice = {
          ReferenceDeviceX: refDevice.getAttribute("ReferenceDeviceX"),
          ReferenceDeviceY: refDevice.getAttribute("ReferenceDeviceY")
        };
      }

      // Parse bin definitions
      const bins = xmlDoc.getElementsByTagName("Bin");
      for (let i = 0; i < bins.length; i++) {
        const bin = bins[i];
        mapData.bins.push({
          BinCode: bin.getAttribute("BinCode"),
          BinQuality: bin.getAttribute("BinQuality"),
          BinDescription: bin.getAttribute("BinDescription"),
          BinCount: bin.getAttribute("BinCount")
        });
      }

      // Parse die information from CDATA sections
      const rows = xmlDoc.getElementsByTagName("Row");
      for (let y = 0; y < rows.length; y++) {
        const rowContent = rows[y].textContent;
        for (let x = 0; x < rowContent.length; x += 2) {
          const binCode = rowContent.substring(x, x + 2);
          const coord = `${x/2},${y}`;
          mapData.dies.set(coord, binCode);
          
          // Store defects and reference dies
          if (binCode === "EF") {
            mapData.defects.set(coord, {
              type: "EF",
              additionalInfo: "Defect"
            });
          } else if (binCode === "FA") {
            mapData.defects.set(coord, {
              type: "FA",
              additionalInfo: "Reference Device"
            });
          }
        }
      }

      return mapData;
    } catch (error) {
      throw new Error(`Failed to parse G85 file: ${error.message}`);
    }
  }

  generateG85(mapData) {
    try {
      const rows = parseInt(mapData.header.Rows);
      const cols = parseInt(mapData.header.Columns);
      
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<Map ';
      xml += `SubstrateNumber="${mapData.mapAttributes.SubstrateNumber || ''}" `;
      xml += `SubstrateType="${mapData.mapAttributes.SubstrateType || ''}" `;
      xml += `SubstrateId="${mapData.mapAttributes.SubstrateId || ''}" `;
      xml += `FormatRevision="${mapData.mapAttributes.FormatRevision || '1.0'}">\n`;
      
      // Device information
      xml += '  <Device ';
      Object.entries(mapData.header).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          xml += `${key}="${value}" `;
        }
      });
      xml += '/>\n';
      
      // Reference device
      if (mapData.referenceDevice) {
        xml += '  <ReferenceDevice ';
        xml += `ReferenceDeviceX="${mapData.referenceDevice.ReferenceDeviceX}" `;
        xml += `ReferenceDeviceY="${mapData.referenceDevice.ReferenceDeviceY}" />\n`;
      }
      
      // Bin definitions
      mapData.bins.forEach(bin => {
        xml += '  <Bin ';
        xml += `BinCode="${bin.BinCode}" `;
        xml += `BinQuality="${bin.BinQuality || ''}" `;
        xml += `BinDescription="${bin.BinDescription || ''}" `;
        xml += `BinCount="${bin.BinCount || '0'}" />\n`;
      });
      
      // Die data rows
      for (let y = 0; y < rows; y++) {
        let rowData = '';
        for (let x = 0; x < cols; x++) {
          const coord = `${x},${y}`;
          const status = mapData.dies.get(coord) || 'FF';
          rowData += status;
        }
        xml += `  <Row><![CDATA[${rowData}]]></Row>\n`;
      }
      
      xml += '</Map>';
      
      return xml;
    } catch (error) {
      throw new Error(`Failed to generate G85 file: ${error.message}`);
    }
  }

  validateG85(content) {
    try {
      const xmlDoc = this.parser.parseFromString(content, "text/xml");
      
      // Check for parsing errors
      const parseError = xmlDoc.getElementsByTagName("parsererror");
      if (parseError.length > 0) {
        return { valid: false, error: "Invalid XML format" };
      }
      
      // Check for required elements
      const mapElement = xmlDoc.documentElement;
      if (mapElement.tagName !== "Map") {
        return { valid: false, error: "Root element must be 'Map'" };
      }
      
      const device = xmlDoc.getElementsByTagName("Device")[0];
      if (!device) {
        return { valid: false, error: "Missing Device element" };
      }
      
      const rows = xmlDoc.getElementsByTagName("Row");
      if (rows.length === 0) {
        return { valid: false, error: "No Row elements found" };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  getStatistics(mapData) {
    const stats = {
      totalDies: 0,
      defectCount: 0,
      referenceCount: 0,
      binDistribution: {},
      substrateInfo: mapData.mapAttributes,
      waferInfo: mapData.header
    };

    // Count dies and defects
    for (const [coord, status] of mapData.dies) {
      stats.totalDies++;
      
      if (status === "EF") {
        stats.defectCount++;
      } else if (status === "FA") {
        stats.referenceCount++;
      }
      
      // Count bin distribution
      if (!stats.binDistribution[status]) {
        stats.binDistribution[status] = 0;
      }
      stats.binDistribution[status]++;
    }

    return stats;
  }
}

module.exports = G85Parser; 