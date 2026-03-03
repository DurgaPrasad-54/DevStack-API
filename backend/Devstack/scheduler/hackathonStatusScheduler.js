const cron = require('node-cron');
const Hackathon = require('../Models/HackathonAdmin');

// Utility function to calculate status
const calculateStatus = (regstart, enddate) => {
  const now = new Date();
  if (now < regstart) return "upcoming";
  if (now >= regstart && now <= enddate) return "ongoing";
  return "completed";
};

// Function to update hackathon statuses
const updateHackathonStatuses = async () => {
  try {
    console.log('[Hackathon Scheduler] Starting status update...');
    
    // Find all hackathons that are not completed
    const hackathons = await Hackathon.find({
      status: { $in: ['upcoming', 'ongoing'] }
    });

    let updatedCount = 0;

    for (const hackathon of hackathons) {
      const newStatus = calculateStatus(hackathon.regstart, hackathon.enddate);
      
      if (hackathon.status !== newStatus) {
        hackathon.status = newStatus;
        await hackathon.save();
        updatedCount++;
        console.log(`[Hackathon Scheduler] Updated "${hackathon.hackathonname}" status to "${newStatus}"`);
      }
    }

    console.log(`[Hackathon Scheduler] Completed. Updated ${updatedCount} hackathon(s).`);
  } catch (error) {
    console.error('[Hackathon Scheduler] Error updating statuses:', error);
  }
};

// Schedule to run every hour at minute 0
// Cron format: minute hour day-of-month month day-of-week
const startHackathonStatusScheduler = () => {
  // Run every hour
  cron.schedule('0 * * * *', () => {
    console.log('[Hackathon Scheduler] Running scheduled status update...');
    updateHackathonStatuses();
  });

  // Also run immediately on startup
  console.log('[Hackathon Scheduler] Running initial status update...');
  updateHackathonStatuses();

  console.log('[Hackathon Scheduler] Scheduler started - runs every hour');
};

module.exports = {
  startHackathonStatusScheduler,
  updateHackathonStatuses
};
