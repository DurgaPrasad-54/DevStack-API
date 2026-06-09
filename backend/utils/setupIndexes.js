/**
 * MongoDB Index Setup Script
 * Run once during deployment: node backend/utils/setupIndexes.js
 * Or called automatically on server startup.
 *
 * These indexes target the most performance-critical queries identified in the audit:
 * - Login lookups (email)
 * - Team membership queries
 * - Student filtering/pagination
 * - Notification reads
 * - Certificate lookups
 */

const mongoose = require('mongoose');
require('dotenv').config();

const { logger } = require('./logger');

async function setupIndexes() {
  try {
    await mongoose.connect(process.env.MONGODB_URL, {
      serverSelectionTimeoutMS: 10000,
    });
    logger.info('Connected to MongoDB for index setup');

    const db = mongoose.connection.db;

    // ─── students collection ──────────────────────────────────────────────────
    // Login lookup: O(log n) instead of O(n)
    await db.collection('students').createIndex({ email: 1 }, { unique: true, name: 'idx_students_email' });
    await db.collection('students').createIndex({ rollNo: 1 }, { unique: true, name: 'idx_students_rollno' });
    // Admin bulk filtering/pagination (the most common admin query)
    await db.collection('students').createIndex(
      { currentYear: 1, status: 1, college: 1 },
      { name: 'idx_students_year_status_college' }
    );
    // Search with text index
    await db.collection('students').createIndex(
      { name: 'text', email: 'text', rollNo: 'text' },
      { name: 'idx_students_text_search' }
    );
    // Admission year + currentYear sorting
    await db.collection('students').createIndex(
      { year: 1, currentYear: 1 },
      { name: 'idx_students_year_currentyear' }
    );
    // OTP expiry — for TTL cleanup queries
    await db.collection('students').createIndex(
      { otpExpiry: 1 },
      { sparse: true, expireAfterSeconds: 0, name: 'idx_students_otp_ttl' }
    );

    // ─── mentors collection ───────────────────────────────────────────────────
    await db.collection('mentors').createIndex({ email: 1 }, { unique: true, name: 'idx_mentors_email' });
    await db.collection('mentors').createIndex({ status: 1 }, { name: 'idx_mentors_status' });

    // ─── admins collection ────────────────────────────────────────────────────
    await db.collection('admins').createIndex({ email: 1 }, { unique: true, name: 'idx_admins_email' });

    // ─── coordinators collection ──────────────────────────────────────────────
    await db.collection('coordinators').createIndex({ email: 1 }, { unique: true, name: 'idx_coordinators_email' });

    // ─── hacknotifications collection ─────────────────────────────────────────
    await db.collection('hacknotifications').createIndex(
      { readBy: 1, targetAudience: 1 },
      { name: 'idx_hacknotif_readby_audience' }
    );
    await db.collection('hacknotifications').createIndex(
      { createdAt: -1 },
      { name: 'idx_hacknotif_created' }
    );

    // ─── hackathons collection ────────────────────────────────────────────────
    await db.collection('hackathons').createIndex(
      { college: 1, status: 1, year: 1 },
      { name: 'idx_hackathons_college_status' }
    );
    await db.collection('hackathons').createIndex(
      { regstart: 1, enddate: 1 },
      { name: 'idx_hackathons_dates' }
    );

    // ─── hackregs collection ──────────────────────────────────────────────────
    await db.collection('hackregs').createIndex(
      { hackathonId: 1, 'teamMembers.studentId': 1 },
      { name: 'idx_hackregs_hackathon_student' }
    );

    logger.info('All MongoDB indexes created successfully');

    // Print index summary
    const collections = [
      'students', 'mentors', 'admins', 'coordinators', 'hackathons', 'hackregs', 'hacknotifications'
    ];

    for (const col of collections) {
      try {
        const indexes = await db.collection(col).indexes();
        logger.info(`Indexes for ${col}:`, { count: indexes.length });
      } catch (e) {
        // Collection may not exist yet
      }
    }

  } catch (error) {
    logger.error('Failed to set up indexes', { error: error.message });
    throw error;
  } finally {
    await mongoose.connection.close();
  }
}

// Run directly
if (require.main === module) {
  setupIndexes()
    .then(() => {
      console.log('✅ Index setup complete');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Index setup failed:', err.message);
      process.exit(1);
    });
}

module.exports = setupIndexes;
