const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

let bucket;

mongoose.connection.once('open', () => {
  bucket = new GridFSBucket(mongoose.connection.db, {
    bucketName: 'receipts'
  });
});

const uploadReceipt = async (buffer, filename, contentType) => {
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: contentType
    });

    uploadStream.on('error', reject);
    uploadStream.on('finish', () => resolve(uploadStream.id));

    uploadStream.end(buffer);
  });
};

const getReceipt = async (fileId) => {
  return bucket.openDownloadStream(fileId);
};

const deleteReceipt = async (fileId) => {
  return bucket.delete(fileId);
};

module.exports = { uploadReceipt, getReceipt, deleteReceipt };