// OSC 1337 (iTerm2 inline images) parser
// Supports both simple File= format and MultipartFile protocol
//
// Simple format: ESC ] 1337 ; File = [params] : base64-data BEL
// Multipart format:
//   ESC ] 1337 ; MultipartFile = [params] BEL  (header)
//   ESC ] 1337 ; FilePart = base64-chunk BEL   (one or more chunks)
//   ESC ] 1337 ; FileEnd BEL                   (end marker)

/**
 * Parse dimension value from iTerm2 format
 * Formats: N (cells), Npx (pixels), N% (percent), "auto"
 * @param {string} value - The dimension string
 * @returns {{ type: 'cells'|'px'|'percent'|'auto', value: number|null }}
 */
export function parseDimension(value) {
  if (!value || value === 'auto') {
    return { type: 'auto', value: null };
  }

  const trimmed = value.trim();

  if (trimmed.endsWith('%')) {
    const num = parseFloat(trimmed.slice(0, -1));
    return { type: 'percent', value: isNaN(num) ? null : num };
  }

  if (trimmed.endsWith('px')) {
    const num = parseFloat(trimmed.slice(0, -2));
    return { type: 'px', value: isNaN(num) ? null : num };
  }

  // Default is cells
  const num = parseFloat(trimmed);
  return { type: 'cells', value: isNaN(num) ? null : num };
}

/**
 * Parse key=value parameters from parameter string
 * @param {string} paramStr - The parameter string (e.g., "name=foo;size=123;inline=1")
 * @returns {Object} Parsed parameters
 */
function parseParams(paramStr) {
  const params = {};

  if (!paramStr) return params;

  const pairs = paramStr.split(';');

  for (const pair of pairs) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex > 0) {
      const key = pair.slice(0, eqIndex).toLowerCase();
      const value = pair.slice(eqIndex + 1);
      params[key] = value;
    }
  }

  return params;
}

/**
 * Parse width and height from SVG text, checking explicit attributes first,
 * then falling back to viewBox.
 * @param {string} svgText - Raw SVG string
 * @returns {{ width: number, height: number } | null}
 */
function parseSvgDimensions(svgText) {
  // Find the opening <svg ...> tag
  const svgTagMatch = svgText.match(/<svg\s[^>]*>/i);
  if (!svgTagMatch) return null;

  const tag = svgTagMatch[0];

  // Try explicit width/height attributes (numeric values only, ignore % or em)
  const wMatch = tag.match(/\bwidth\s*=\s*["'](\d+(?:\.\d+)?)\s*(?:px)?["']/i);
  const hMatch = tag.match(/\bheight\s*=\s*["'](\d+(?:\.\d+)?)\s*(?:px)?["']/i);

  if (wMatch && hMatch) {
    return { width: parseFloat(wMatch[1]), height: parseFloat(hMatch[1]) };
  }

  // Fall back to viewBox="minX minY width height"
  const vbMatch = tag.match(/\bviewBox\s*=\s*["'][\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)["']/i);
  if (vbMatch) {
    return { width: parseFloat(vbMatch[1]), height: parseFloat(vbMatch[2]) };
  }

  return null;
}

/**
 * Get image dimensions from base64 data by reading headers
 * @param {string} base64Data - Base64 encoded image data
 * @returns {{ width: number, height: number } | null}
 */
export function getImageDimensions(base64Data) {
  if (!base64Data || base64Data.length < 30) {
    return null;
  }

  try {
    // Decode enough bytes to read image headers
    const sample = base64Data.slice(0, 100);
    const decoded = atob(sample);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }

    // PNG: dimensions at bytes 16-23
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
      const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
      return { width, height };
    }

    // GIF: dimensions at bytes 6-9 (little-endian)
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      const width = bytes[6] | (bytes[7] << 8);
      const height = bytes[8] | (bytes[9] << 8);
      return { width, height };
    }

    // BMP: dimensions at bytes 18-25 (little-endian)
    if (bytes[0] === 0x42 && bytes[1] === 0x4D) {
      const width = bytes[18] | (bytes[19] << 8) | (bytes[20] << 16) | (bytes[21] << 24);
      const height = Math.abs(bytes[22] | (bytes[23] << 8) | (bytes[24] << 16) | (bytes[25] << 24));
      return { width, height };
    }

    // JPEG: need to scan for SOF marker - more complex, use fallback

    // SVG: parse width/height or viewBox from XML text
    if (bytes[0] === 0x3C && (decoded.startsWith('<?xml') || decoded.startsWith('<svg'))) {
      try {
        const svgText = atob(base64Data);
        if (svgText.includes('<svg')) {
          return parseSvgDimensions(svgText);
        }
      } catch (e) {
        // SVG decode failed
      }
    }
  } catch (e) {
    // Decoding failed
  }

  return null;
}

/**
 * Infer MIME type from base64 data by checking magic bytes
 * @param {string} base64Data - Base64 encoded image data
 * @returns {string} MIME type
 */
export function inferMimeType(base64Data) {
  if (!base64Data || base64Data.length < 4) {
    return 'application/octet-stream';
  }

  try {
    // Get first 16 characters of base64 (enough for magic bytes)
    const sample = base64Data.slice(0, 16);
    const decoded = atob(sample);

    // PNG: 89 50 4E 47 (‰PNG)
    if (decoded.charCodeAt(0) === 0x89 &&
        decoded.charCodeAt(1) === 0x50 &&
        decoded.charCodeAt(2) === 0x4E &&
        decoded.charCodeAt(3) === 0x47) {
      return 'image/png';
    }

    // JPEG: FF D8 FF
    if (decoded.charCodeAt(0) === 0xFF &&
        decoded.charCodeAt(1) === 0xD8 &&
        decoded.charCodeAt(2) === 0xFF) {
      return 'image/jpeg';
    }

    // GIF: 47 49 46 38 (GIF8)
    if (decoded.charCodeAt(0) === 0x47 &&
        decoded.charCodeAt(1) === 0x49 &&
        decoded.charCodeAt(2) === 0x46 &&
        decoded.charCodeAt(3) === 0x38) {
      return 'image/gif';
    }

    // WebP: RIFF...WEBP
    if (decoded.charCodeAt(0) === 0x52 &&
        decoded.charCodeAt(1) === 0x49 &&
        decoded.charCodeAt(2) === 0x46 &&
        decoded.charCodeAt(3) === 0x46) {
      if (base64Data.length >= 16) {
        const fullSample = atob(base64Data.slice(0, 16));
        if (fullSample.charCodeAt(8) === 0x57 &&
            fullSample.charCodeAt(9) === 0x45 &&
            fullSample.charCodeAt(10) === 0x42 &&
            fullSample.charCodeAt(11) === 0x50) {
          return 'image/webp';
        }
      }
    }

    // BMP: 42 4D (BM)
    if (decoded.charCodeAt(0) === 0x42 &&
        decoded.charCodeAt(1) === 0x4D) {
      return 'image/bmp';
    }

    // PDF: 25 50 44 46 (%PDF)
    if (decoded.charCodeAt(0) === 0x25 &&
        decoded.charCodeAt(1) === 0x50 &&
        decoded.charCodeAt(2) === 0x44 &&
        decoded.charCodeAt(3) === 0x46) {
      return 'application/pdf';
    }

    // SVG: must contain <svg tag (<?xml alone could be any XML)
    if (decoded.startsWith('<svg') || decoded.startsWith('<?xml')) {
      const text = atob(base64Data.slice(0, 200));
      if (text.includes('<svg')) {
        return 'image/svg+xml';
      }
    }
  } catch (e) {
    // Invalid base64
  }

  return 'application/octet-stream';
}

/**
 * Find the end of an OSC sequence.
 * Returns the index of the terminator and its length.
 * Terminators: BEL (\x07), ST (\x1b\\), or another ESC ] (for chained sequences)
 */
function findOSCEnd(data, startIndex) {
  let minIndex = -1;
  let terminatorLen = 0;

  // Look for BEL
  const belIndex = data.indexOf('\x07', startIndex);
  if (belIndex !== -1) {
    minIndex = belIndex;
    terminatorLen = 1;
  }

  // Look for ST (ESC \)
  const stIndex = data.indexOf('\x1b\\', startIndex);
  if (stIndex !== -1 && (minIndex === -1 || stIndex < minIndex)) {
    minIndex = stIndex;
    terminatorLen = 2;
  }

  // Look for next ESC ] (chained OSC sequences without proper terminator)
  const nextOscIndex = data.indexOf('\x1b]', startIndex + 2);
  if (nextOscIndex !== -1 && (minIndex === -1 || nextOscIndex < minIndex)) {
    minIndex = nextOscIndex;
    terminatorLen = 0; // Don't consume the next ESC ]
  }

  return { endIndex: minIndex, terminatorLen };
}

/**
 * OSC1337Parser handles parsing of iTerm2 inline image sequences
 * with support for both simple File= and multipart protocols.
 * Maintains state across multiple feed() calls.
 */
export class OSC1337Parser {
  constructor() {
    this.reset();
  }

  reset() {
    // Buffer for incomplete sequences
    this.buffer = '';
    // Current multipart transfer state
    this.multipart = null;
  }

  /**
   * Process terminal data, extracting images and returning cleaned text
   * @param {string} text - Terminal output
   * @returns {{ images: Array, cleanedText: string }}
   */
  parse(text) {
    const images = [];

    // Prepend buffer from previous call
    let data = this.buffer + text;
    this.buffer = '';

    let cleanedText = '';
    let i = 0;

    while (i < data.length) {
      // Look for ESC ] (OSC start)
      const escIndex = data.indexOf('\x1b]', i);

      if (escIndex === -1) {
        // No more OSC sequences, append rest to cleaned text
        cleanedText += data.slice(i);
        break;
      }

      // Append text before the ESC sequence
      cleanedText += data.slice(i, escIndex);

      // Find the end of this OSC sequence
      const { endIndex, terminatorLen } = findOSCEnd(data, escIndex);

      if (endIndex === -1) {
        // Incomplete sequence, buffer it for next call
        this.buffer = data.slice(escIndex);
        break;
      }

      // Extract the OSC content (between ESC ] and terminator)
      const oscContent = data.slice(escIndex + 2, endIndex);

      // Process the OSC sequence
      const result = this.processOSC(oscContent);

      if (result) {
        // Mark where this image should be inserted in the text
        result.textPosition = cleanedText.length;
        images.push(result);
      } else {
        // Not an image sequence — pass through to VT unchanged
        cleanedText += data.slice(escIndex, endIndex + terminatorLen);
      }

      i = endIndex + terminatorLen;
    }

    return { images, cleanedText };
  }

  /**
   * Process a single OSC sequence content
   * @param {string} content - Content between ESC ] and terminator
   * @returns {Object|null} Image data if a complete image is ready
   */
  processOSC(content) {
    // Check if this is a 1337 sequence
    if (!content.startsWith('1337;')) {
      return null;
    }

    const payload = content.slice(5); // Remove "1337;"

    // Simple File= format: File=[params]:base64data
    if (payload.startsWith('File=')) {
      const colonIndex = payload.indexOf(':');
      if (colonIndex === -1) return null;

      const paramStr = payload.slice(5, colonIndex);
      const base64Data = payload.slice(colonIndex + 1);
      const params = parseParams(paramStr);

      // Only process if inline=1
      if (params.inline !== '1') return null;

      return this.createImageData(params, base64Data);
    }

    // Multipart protocol: MultipartFile=[params]
    if (payload.startsWith('MultipartFile=')) {
      const paramStr = payload.slice(14);
      const params = parseParams(paramStr);

      // Only process if inline=1
      if (params.inline !== '1') {
        this.multipart = null;
        return null;
      }

      // Start new multipart transfer
      this.multipart = {
        params,
        chunks: [],
      };
      return null;
    }

    // FilePart=base64chunk
    if (payload.startsWith('FilePart=')) {
      if (!this.multipart) return null;

      const chunk = payload.slice(9);
      this.multipart.chunks.push(chunk);
      return null;
    }

    // FileEnd - complete the multipart transfer
    if (payload === 'FileEnd') {
      if (!this.multipart) return null;

      const { params, chunks } = this.multipart;
      const base64Data = chunks.join('');
      this.multipart = null;

      return this.createImageData(params, base64Data);
    }

    return null;
  }

  /**
   * Create image data object from params and base64 data
   */
  createImageData(params, base64Data) {
    const width = parseDimension(params.width);
    const height = parseDimension(params.height);
    const preserveAspectRatio = params.preserveaspectratio !== '0';
    const mimeType = inferMimeType(base64Data);

    // Get natural image dimensions for calculating display size
    const naturalDimensions = getImageDimensions(base64Data);

    let name = null;
    if (params.name) {
      try {
        name = atob(params.name);
      } catch (e) {
        name = params.name;
      }
    }

    return {
      base64Data,
      mimeType,
      name,
      size: params.size ? parseInt(params.size, 10) : null,
      width,
      height,
      preserveAspectRatio,
      naturalWidth: naturalDimensions?.width ?? null,
      naturalHeight: naturalDimensions?.height ?? null,
    };
  }
}

// Legacy function for backwards compatibility
export function parseOsc1337(text, buffer = '') {
  const parser = new OSC1337Parser();
  parser.buffer = buffer;
  const result = parser.parse(text);
  return {
    images: result.images,
    cleanedText: result.cleanedText,
    buffer: parser.buffer,
  };
}
