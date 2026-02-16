// Image storage and lifecycle management

import { renderPdfToImage } from "./pdf.js";

let nextImageId = 1;

/**
 * ImageStore manages image data and lifecycle for inline images
 */
export default class ImageStore {
  constructor() {
    // Map of id -> ImageData
    this.images = new Map();

    // Map of row -> Set<id> for efficient lookup by row
    this.lineImages = new Map();

    // Callback invoked when an async image (e.g. PDF) finishes rendering
    this.onImageReady = null;
  }

  /**
   * Add an image to the store
   * @param {Object} imageData - Image data from parser
   * @param {number} col - Column position
   * @param {number} row - Row position
   * @returns {number} Image ID
   */
  add(imageData, col, row) {
    const id = nextImageId++;

    const image = {
      id,
      base64Data: imageData.base64Data,
      mimeType: imageData.mimeType,
      blobUrl: null, // Lazy creation
      col,
      row,
      width: imageData.width,
      height: imageData.height,
      preserveAspectRatio: imageData.preserveAspectRatio,
      name: imageData.name,
      naturalWidth: imageData.naturalWidth,
      naturalHeight: imageData.naturalHeight,
      displayRows: imageData.displayRows,
    };

    this.images.set(id, image);

    // Index by row for efficient lookup
    if (!this.lineImages.has(row)) {
      this.lineImages.set(row, new Set());
    }
    this.lineImages.get(row).add(id);

    return id;
  }

  /**
   * Get an image by ID
   * @param {number} id - Image ID
   * @returns {Object|undefined} Image data
   */
  get(id) {
    return this.images.get(id);
  }

  /**
   * Get or create blob URL for an image (lazy creation)
   * @param {number} id - Image ID
   * @returns {string|null} Blob URL or null if image not found
   */
  getBlobUrl(id) {
    const image = this.images.get(id);
    if (!image) return null;

    if (image.mimeType === "application/pdf") {
      if (image.pdfRendering) return null; // rendering in progress
      if (image.blobUrl) return image.blobUrl; // already rendered

      image.pdfRendering = true;

      renderPdfToImage(image.base64Data)
        .then(({ blobUrl, naturalWidth, naturalHeight }) => {
          if (!this.images.has(id)) return; // image was removed during render
          image.blobUrl = blobUrl;
          image.naturalWidth = naturalWidth;
          image.naturalHeight = naturalHeight;
          image.mimeType = "image/png";
          image.pdfRendering = false;

          if (this.onImageReady) {
            this.onImageReady(id);
          }
        })
        .catch((e) => {
          console.warn("Failed to render PDF:", e);
          image.pdfRendering = false;
        });

      return null;
    }

    if (!image.blobUrl) {
      try {
        // Convert base64 to blob
        const byteString = atob(image.base64Data);
        const byteArray = new Uint8Array(byteString.length);

        for (let i = 0; i < byteString.length; i++) {
          byteArray[i] = byteString.charCodeAt(i);
        }

        const blob = new Blob([byteArray], { type: image.mimeType });
        image.blobUrl = URL.createObjectURL(blob);
      } catch (e) {
        console.warn("Failed to create blob URL for image:", e);
        return null;
      }
    }

    return image.blobUrl;
  }

  getAllImages() {
    return Array.from(this.images.values()).map((img) => ({ ...img }));
  }

  /**
   * Update an image's row position
   * @param {number} id - Image ID
   * @param {number} newRow - New row position
   */
  updateRow(id, newRow) {
    const image = this.images.get(id);
    if (!image) return;

    const oldRow = image.row;
    if (oldRow === newRow) return;

    // Remove from old row index
    const oldRowSet = this.lineImages.get(oldRow);
    if (oldRowSet) {
      oldRowSet.delete(id);
      if (oldRowSet.size === 0) {
        this.lineImages.delete(oldRow);
      }
    }

    // Update image row
    image.row = newRow;

    // Add to new row index
    if (!this.lineImages.has(newRow)) {
      this.lineImages.set(newRow, new Set());
    }
    this.lineImages.get(newRow).add(id);
  }

  /**
   * Remove an image by ID
   * @param {number} id - Image ID
   */
  remove(id) {
    const image = this.images.get(id);
    if (!image) return;

    // Revoke blob URL to free memory
    if (image.blobUrl) {
      URL.revokeObjectURL(image.blobUrl);
    }

    // Remove from row index
    const rowSet = this.lineImages.get(image.row);
    if (rowSet) {
      rowSet.delete(id);
      if (rowSet.size === 0) {
        this.lineImages.delete(image.row);
      }
    }

    this.images.delete(id);
  }

  /**
   * Clear all images and free resources
   */
  clear() {
    // Revoke all blob URLs
    for (const image of this.images.values()) {
      if (image.blobUrl) {
        URL.revokeObjectURL(image.blobUrl);
      }
    }

    this.images.clear();
    this.lineImages.clear();
  }

  /**
   * Get the number of stored images
   * @returns {number} Image count
   */
  get size() {
    return this.images.size;
  }
}
