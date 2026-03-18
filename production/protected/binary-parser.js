/**
 * Binary Data Parser for Wergonic Device
 * Parses .bin files (5 bytes per record format)
 */

class BinaryParser {
    /**
     * Parse binary data from hex string (received via BLE)
     * @param {string} hexString - Hex string of binary data
     * @returns {Array} Array of parsed records
     */
    static parseFromHexString(hexString) {
        // Remove any whitespace or delimiters
        hexString = hexString.replace(/\s+/g, '');
        
        // Convert hex string to Uint8Array
        const bytes = new Uint8Array(hexString.length / 2);
        for (let i = 0; i < hexString.length; i += 2) {
            bytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
        }
        
        return this.parseFromBytes(bytes);
    }
    
    /**
     * Parse binary data from File object
     * @param {File} file - Binary file
     * @returns {Promise<Array>} Promise resolving to array of parsed records
     */
    static async parseFromFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        return this.parseFromBytes(bytes);
    }
    
    /**
     * Parse binary data from Uint8Array
     * @param {Uint8Array} bytes - Raw binary data
     * @returns {Array} Array of parsed records
     */
    static parseFromBytes(bytes) {
        const records = [];
        const recordSize = 5;  // 3 bytes time + 1 byte angle + 1 byte flags
        
        for (let offset = 0; offset < bytes.length; offset += recordSize) {
            if (offset + recordSize > bytes.length) break;  // Incomplete record
            
            // Read 3-byte time (little-endian milliseconds)
            const time_ms = bytes[offset] | 
                           (bytes[offset + 1] << 8) | 
                           (bytes[offset + 2] << 16);
            
            // Read 1-byte angle (0-180 degrees integer)
            const angle = bytes[offset + 3];
            
            // Read 1-byte flags
            const flags = bytes[offset + 4];
            const color_code = flags & 0x03;
            const vibration = (flags >> 2) & 0x01;
            
            // Map color code to text
            const colors = ['green', 'yellow', 'red', 'unknown'];
            const color = colors[color_code];
            
            records.push({
                elapsed_ms: time_ms,
                timestamp: this.formatTimestamp(time_ms),
                angle: angle,
                feedback: vibration === 1 ? 1 : 0,
                zone: color,
                color: color  // Alias for compatibility
            });
        }
        
        return records;
    }
    
    /**
     * Format milliseconds to HH:MM:SS.mmm
     * @param {number} ms - Milliseconds
     * @returns {string} Formatted time string
     */
    static formatTimestamp(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const milliseconds = ms % 1000;
        const seconds = totalSeconds % 60;
        const minutes = Math.floor(totalSeconds / 60) % 60;
        const hours = Math.floor(totalSeconds / 3600);
        
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
    }
    
    /**
     * Convert binary records to CSV format
     * @param {Array} records - Parsed records
     * @returns {string} CSV string
     */
    static toCSV(records) {
        const header = 'elapsed_ms,timestamp,angle,feedback,zone\n';
        const rows = records.map(r => 
            `${r.elapsed_ms},${r.timestamp},${r.angle},${r.feedback},${r.zone}`
        ).join('\n');
        return header + rows;
    }
    
    /**
     * Generate report-compatible data from binary records and metadata
     * @param {Array} binaryRecords - Parsed binary records
     * @param {Object} metadata - Session metadata
     * @returns {Object} Report data object
     */
    static generateReportData(binaryRecords, metadata) {
        if (!binaryRecords || binaryRecords.length === 0) {
            throw new Error('No binary records provided');
        }
        
        // Convert to CSV format for compatibility with existing report generator
        const csvData = this.toCSV(binaryRecords);
        
        // Parse metadata if it's a string
        const meta = typeof metadata === 'string' ? this.parseMetadata(metadata) : metadata;
        
        return {
            filename: meta.filename || 'binary_session',
            data: csvData,
            records: binaryRecords,
            metadata: meta,
            device_type: meta.device_type || 'unknown',
            device_id: meta.device_id || 'unknown',
            subject: meta.subject || 'unknown',
            start_date: meta.start_date || 'not_set',
            start_time: meta.start_time || 'not_set',
            threshold_yellow: parseFloat(meta.threshold_yellow) || 30,
            threshold_red: parseFloat(meta.threshold_red) || 60
        };
    }
    
    /**
     * Parse metadata text file
     * @param {string} metaText - Metadata file content
     * @returns {Object} Parsed metadata object
     */
    static parseMetadata(metaText) {
        const metadata = {};
        const lines = metaText.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && trimmed.includes('=') && !trimmed.startsWith('[')) {
                const [key, ...valueParts] = trimmed.split('=');
                const value = valueParts.join('=').trim();
                metadata[key.trim()] = value;
            }
        }
        
        return metadata;
    }
    
    /**
     * Validate binary data format
     * @param {Uint8Array} bytes - Binary data
     * @returns {Object} Validation result {valid: boolean, message: string, recordCount: number}
     */
    static validate(bytes) {
        const recordSize = 5;
        
        if (bytes.length === 0) {
            return { valid: false, message: 'Empty file', recordCount: 0 };
        }
        
        if (bytes.length % recordSize !== 0) {
            return { 
                valid: false, 
                message: `Invalid file size: ${bytes.length} bytes (not divisible by ${recordSize})`,
                recordCount: Math.floor(bytes.length / recordSize)
            };
        }
        
        const recordCount = bytes.length / recordSize;
        return {
            valid: true,
            message: `Valid binary format`,
            recordCount: recordCount
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BinaryParser;
}
