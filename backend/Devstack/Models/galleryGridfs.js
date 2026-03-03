const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

let galleryBucket;

mongoose.connection.once('open', () => {
  galleryBucket = new GridFSBucket(mongoose.connection.db, {
    bucketName: 'hackathonGallery'
  });
});

const uploadGalleryImage = async (buffer, filename, contentType) => {
  return new Promise((resolve, reject) => {
    if (!galleryBucket) {
      return reject(new Error('GridFS bucket not initialized'));
    }

    const uploadStream = galleryBucket.openUploadStream(filename, {
      contentType: contentType
    });

    uploadStream.on('error', reject);
    uploadStream.on('finish', () => resolve(uploadStream.id));

    uploadStream.end(buffer);
  });
};

const getGalleryImage = async (fileId) => {
  if (!galleryBucket) {
    throw new Error('GridFS bucket not initialized');
  }
  return galleryBucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
};

const deleteGalleryImage = async (fileId) => {
  if (!galleryBucket) {
    throw new Error('GridFS bucket not initialized');
  }
  return galleryBucket.delete(new mongoose.Types.ObjectId(fileId));
};

module.exports = { uploadGalleryImage, getGalleryImage, deleteGalleryImage };
