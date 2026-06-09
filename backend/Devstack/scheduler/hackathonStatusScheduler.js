const cron = require('node-cron');
const Hackathon = require('../Models/HackathonAdmin');
const { calculateStatus } = require("../utils/hackathonUtils");
const { logger } = require('../../utils/logger');

// Function to update hackathon statuses using bulkWrite
const updateHackathonStatuses = async () => {
  try {
    logger.info('[Hackathon Scheduler] Starting status update...');
    
    // Find all hackathons that are not completed
    const hackathons = await Hackathon.find({
      status: { $in: ['upcoming', 'ongoing'] }
    }).lean();

    const bulkOps = [];

    for (const hackathon of hackathons) {
      const newStatus = calculateStatus(hackathon.regstart, hackathon.enddate);
      
      if (hackathon.status !== newStatus) {
        bulkOps.push({
          updateOne: {
            filter: { _id: hackathon._id },
            update: { $set: { status: newStatus } }
          }
        });
        logger.info(`[Hackathon Scheduler] Preparing status update for "${hackathon.hackathonname}" to "${newStatus}"`);
      }
    }

    let updatedCount = 0;
    if (bulkOps.length > 0) {
      const result = await Hackathon.bulkWrite(bulkOps);
      updatedCount = result.modifiedCount;
    }

    logger.info(`[Hackathon Scheduler] Completed. Updated ${updatedCount} hackathon(s).`);
  } catch (error) {
    logger.error('[Hackathon Scheduler] Error updating statuses', { error: error.message });
  }
};

// Schedule to run every hour at minute 0
const startHackathonStatusScheduler = () => {
  // Run every hour
  cron.schedule('0 * * * *', () => {
    logger.info('[Hackathon Scheduler] Running scheduled status update...');
    updateHackathonStatuses();
  });

  // Also run immediately on startup
  logger.info('[Hackathon Scheduler] Running initial status update...');
  updateHackathonStatuses();

  logger.info('[Hackathon Scheduler] Scheduler started - runs every hour');
};

module.exports = {
  startHackathonStatusScheduler,
  updateHackathonStatuses
};
