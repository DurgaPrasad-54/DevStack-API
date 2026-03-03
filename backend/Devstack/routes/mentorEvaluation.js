const express = require('express');
const router = express.Router();
const HackMentor = require('../Models/Hackmentor');
const HackTeam = require('../Models/hackteam');
const HackSubmission = require('../Models/hacksubmission');
const Hackathon = require('../Models/HackathonAdmin');
const { authenticateToken, requireRole } = require('../../middleware/auth');

/**
 * Get all assigned teams and their submissions for all approved hackathons for a mentor
 */
router.get('/assigned-teams/:mentorId', authenticateToken, async (req, res) => {
    try {
        const mentorId = req.params.mentorId;
        const userId = req.user.userId || req.user.id || req.user._id;

        console.log('[BACKEND] Get assigned teams - userId:', userId, 'mentorId:', mentorId);

        // Verify mentor can only access their own data
        if (req.user.role === 'mentor' && userId !== mentorId) {
            console.log('[BACKEND] ✗ ERROR: Unauthorized access attempt');
            return res.status(403).json({ 
                message: "You can only view your own assigned teams." 
            });
        }

        // Find approved hackathons for this mentor
        const hackMentorDocs = await HackMentor.find({ 
            'mentors.mentor': mentorId, 
            'mentors.status': 'approved' 
        }).populate({ 
            path: 'hackathon', 
            select: 'name description startDate endDate status' 
        });

        if (!hackMentorDocs || hackMentorDocs.length === 0) {
            console.log('[BACKEND] ✗ No approved hackathons found for mentor');
            return res.status(200).json([]);
        }

        const hackathons = hackMentorDocs.map(h => h.hackathon).filter(h => h !== null);
        console.log('[BACKEND] ✓ Found', hackathons.length, 'approved hackathons');

        // For each hackathon, get assigned teams and their submissions
        const result = await Promise.all(hackathons.map(async hackathon => {
            const teams = await HackTeam.find({ 
                hackathon: hackathon._id, 
                mentor: mentorId 
            })
            .populate({ 
                path: 'teamLead',
                populate: {
                    path: 'student',
                    select: 'name email'
                }
            })
            .lean(); // Better performance

            console.log('[BACKEND] ✓ Found', teams.length, 'teams for hackathon:', hackathon.name);

            const teamsWithSubmissions = await Promise.all(teams.map(async team => {
                // --- Team Lead Extraction Logic (robust, like teamprogress.js) ---
                let teamLeadDetails = null;
                if (team.teamLead && typeof team.teamLead === 'object') {
                    if (team.teamLead.student && typeof team.teamLead.student === 'object') {
                        teamLeadDetails = {
                            _id: team.teamLead.student._id,
                            name: team.teamLead.student.name,
                            email: team.teamLead.student.email
                        };
                    } else if (team.teamLead.name) {
                        teamLeadDetails = {
                            _id: team.teamLead._id,
                            name: team.teamLead.name,
                            email: team.teamLead.email || ''
                        };
                    } else {
                        teamLeadDetails = {
                            _id: team.teamLead._id ? team.teamLead._id.toString() : null,
                            name: 'N/A',
                            email: ''
                        };
                    }
                } else if (team.teamLead) {
                    teamLeadDetails = {
                        _id: team.teamLead.toString(),
                        name: 'N/A',
                        email: ''
                    };
                }

                const submissions = await HackSubmission.find({ team: team._id })
                    .populate({ path: 'teamLead.student', select: 'name email' })
                    .populate({ path: 'teamMembers.student', select: 'name email' })
                    .lean();

                return {
                    teamId: team._id,
                    teamname: team.name,
                    teamLead: teamLeadDetails,
                    members: team.members || [],
                    submissions: submissions.map(sub => ({
                        _id: sub._id,
                        github: sub.githubRepo,
                        githubRepo: sub.githubRepo,
                        liveDemoLink: sub.liveDemoLink,
                        projectDescription: sub.projectDescription,
                        evaluationScore: typeof sub.score === 'number' ? sub.score : null,
                        submittedAt: sub.submittedAt || sub.createdAt,
                        teamLead: sub.teamLead,
                        teamMembers: sub.teamMembers,
                        documents: sub.documents?.length || 0
                    }))
                };
            }));

            return {
                hackathonId: hackathon._id,
                hackathonName: hackathon.name,
                hackathonDescription: hackathon.description,
                startDate: hackathon.startDate,
                endDate: hackathon.endDate,
                status: hackathon.status,
                teams: teamsWithSubmissions
            };
        }));

        console.log('[BACKEND] ✓✓✓ SUCCESS: Returned all assigned teams');
        res.status(200).json(result);
    } catch (err) {
        console.error('[BACKEND] ✗✗✗ CRITICAL ERROR in assigned-teams:', err);
        console.error('[BACKEND] Error stack:', err.stack);
        res.status(500).json({ 
            message: "Internal server error",
            error: err.message 
        });
    }
});

/**
 * Get mentor-approved hackathons
 */
router.get('/hackathons/:mentorId', authenticateToken, async (req, res) => {
    try {
        const mentorId = req.params.mentorId;
        const userId = req.user.userId || req.user.id || req.user._id;

        console.log('[BACKEND] Get hackathons - userId:', userId, 'mentorId:', mentorId);

        // Verify mentor can only access their own data
        if (req.user.role === 'mentor' && userId !== mentorId) {
            console.log('[BACKEND] ✗ ERROR: Unauthorized access attempt');
            return res.status(403).json({ 
                message: "You can only view your own hackathons." 
            });
        }

        // Find all HackMentor docs where this mentor is approved
        const hackMentorDocs = await HackMentor.find({ 
            'mentors.mentor': mentorId, 
            'mentors.status': 'approved' 
        });

        if (!hackMentorDocs || hackMentorDocs.length === 0) {
            console.log('[BACKEND] ✗ No approved hackathons found');
            return res.status(200).json([]);
        }

        // Get all hackathon IDs
        const hackathonIds = hackMentorDocs.map(doc => doc.hackathon);
        console.log('[BACKEND] ✓ Found', hackathonIds.length, 'hackathon IDs');

        // Fetch hackathon details from Hackathon collection
        const hackathons = await Hackathon.find({ _id: { $in: hackathonIds } })
            .select('hackathonname startdate enddate description status');

        // Format for frontend
        const formatted = hackathons.map(h => ({
            _id: h._id,
            name: h.hackathonname,
            description: h.description,
            startDate: h.startdate,
            endDate: h.enddate,
            status: h.status
        }));

        console.log('[BACKEND] ✓✓✓ SUCCESS: Returned', formatted.length, 'hackathons');
        res.status(200).json(formatted);
    } catch (err) {
        console.error('[BACKEND] ✗✗✗ CRITICAL ERROR in hackathons:', err);
        console.error('[BACKEND] Error stack:', err.stack);
        res.status(500).json({ 
            message: "Internal server error",
            error: err.message 
        });
    }
});

/**
 * Get assigned teams and their submissions for a specific hackathon
 */
router.get('/hackteams/:mentorId/:hackathonId', authenticateToken, async (req, res) => {
    try {
        const { mentorId, hackathonId } = req.params;
        const userId = req.user.userId || req.user.id || req.user._id;

        console.log('='.repeat(70));
        console.log('[BACKEND] ▶ Get Hack Teams Request');
        console.log('[BACKEND] User ID:', userId);
        console.log('[BACKEND] Mentor ID:', mentorId);
        console.log('[BACKEND] Hackathon ID:', hackathonId);
        console.log('='.repeat(70));

        // Verify mentor can only access their own data
        if (req.user.role === 'mentor' && userId !== mentorId) {
            console.log('[BACKEND] ✗ ERROR: Unauthorized access attempt');
            return res.status(403).json({ 
                message: "You can only view your own teams." 
            });
        }

        // Verify mentor is approved for this hackathon
        const hackMentor = await HackMentor.findOne({
            hackathon: hackathonId,
            'mentors.mentor': mentorId,
            'mentors.status': 'approved'
        });

        if (!hackMentor) {
            console.log('[BACKEND] ✗ ERROR: Mentor not approved for this hackathon');
            return res.status(403).json({
                message: "You are not approved for this hackathon."
            });
        }

        console.log('[BACKEND] ✓ Mentor verification passed');

        // Find teams assigned to mentor for this hackathon
        const teams = await HackTeam.find({ 
            hackathon: hackathonId, 
            mentor: mentorId 
        })
            .populate({ path: 'teamLead', select: 'name email' });

        console.log('[BACKEND] ✓ Found', teams.length, 'teams');

        // Get submissions for each team
        const result = await Promise.all(teams.map(async team => {
            try {
                console.log('[BACKEND] Processing team:', team.name, 'ID:', team._id);
                console.log('[BACKEND] Team:', team.name, 'teamLead:', team.teamLead);

                const submissions = await HackSubmission.find({ team: team._id })
                    .populate({ path: 'teamLead.student', select: 'name email' })
                    .populate({ path: 'teamMembers.student', select: 'name email' })
                    .lean(); // Use lean() for better performance
                
                submissions.forEach((sub, idx) => {
                    console.log(`[BACKEND] Submission ${idx + 1} for team ${team.name}: teamLead:`, sub.teamLead);
                });

                // --- FIX: Robust teamLead extraction ---
                let teamLeadObj = null;
                if (team.teamLead && typeof team.teamLead === 'object' && team.teamLead.name) {
                    teamLeadObj = {
                        name: team.teamLead.name || 'N/A',
                        email: team.teamLead.email || ''
                    };
                } else if (
                    (!team.teamLead || !team.teamLead.name) &&
                    submissions.length > 0 &&
                    submissions[0].teamLead &&
                    submissions[0].teamLead.student
                ) {
                    // Fallback: Use teamLead from first submission
                    teamLeadObj = {
                        name: submissions[0].teamLead.student.name || 'N/A',
                        email: submissions[0].teamLead.student.email || ''
                    };
                }

                return {
                    _id: team._id,
                    teamname: team.name,
                    teamLead: teamLeadObj,
                    members: team.members || [],
                    submissions: submissions.map(sub => ({
                        _id: sub._id,
                        github: sub.githubRepo,
                        githubRepo: sub.githubRepo,
                        liveDemoLink: sub.liveDemoLink,
                        projectDescription: sub.projectDescription,
                        evaluationScore: typeof sub.score === 'number' ? sub.score : null,
                        submittedAt: sub.submittedAt || sub.createdAt,
                        updatedAt: sub.updatedAt,
                        teamLead: sub.teamLead ? {
                            student: sub.teamLead.student,
                            contribution: sub.teamLead.contribution
                        } : null,
                        teamMembers: sub.teamMembers || [],
                        documents: sub.documents?.length || 0
                    }))
                };
            } catch (teamError) {
                console.error('[BACKEND] Error processing team:', team.name, teamError);
                // Return team with empty submissions if error occurs
                return {
                    teamId: team._id,
                    teamname: team.name,
                    teamleadname: team.teamLead?.name || 'N/A',
                    teamleademail: team.teamLead?.email || 'N/A',
                    members: team.members || [],
                    github: '',
                    submissions: []
                };
            }
        }));

        console.log('[BACKEND] ✓✓✓ SUCCESS: Returned teams with submissions');
        console.log('[BACKEND] Total teams:', result.length);
        console.log('[BACKEND] Teams with submissions:', result.filter(t => t.submissions.length > 0).length);
        console.log('='.repeat(70));
        
        res.status(200).json(result);
    } catch (err) {
        console.error('[BACKEND] ✗✗✗ CRITICAL ERROR in hackteams:', err);
        console.error('[BACKEND] Error stack:', err.stack);
        console.log('='.repeat(70));
        res.status(500).json({ 
            message: "Internal server error",
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

/**
 * Update evaluation score for a submission
 */
router.put('/evaluate/:submissionId', authenticateToken, requireRole(['mentor']), async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { evaluationScore } = req.body;
        const userId = req.user.userId || req.user.id || req.user._id;

        console.log('='.repeat(70));
        console.log('[BACKEND] ▶ Evaluation Submission Request');
        console.log('[BACKEND] User ID:', userId);
        console.log('[BACKEND] Submission ID:', submissionId);
        console.log('[BACKEND] Evaluation Score:', evaluationScore);
        console.log('='.repeat(70));

        // Validate score
        if (typeof evaluationScore !== 'number' || evaluationScore < 0 || evaluationScore > 100) {
            console.log('[BACKEND] ✗ ERROR: Invalid score');
            return res.status(400).json({ 
                message: 'Score must be a number between 0 and 100.' 
            });
        }

        console.log('[BACKEND] ✓ Score validation passed');

        // Find submission and populate team details
        const submission = await HackSubmission.findById(submissionId)
            .populate({
                path: 'team',
                populate: { path: 'mentor', select: '_id name email' }
            });

        if (!submission) {
            console.log('[BACKEND] ✗ ERROR: Submission not found');
            return res.status(404).json({ message: 'Submission not found.' });
        }

        console.log('[BACKEND] ✓ Submission found for team:', submission.team.name);

        // Verify this mentor is assigned to the team
        if (!submission.team.mentor || submission.team.mentor._id.toString() !== userId) {
            console.log('[BACKEND] ✗ ERROR: Mentor not assigned to this team');
            console.log('[BACKEND]   Team Mentor:', submission.team.mentor?._id);
            console.log('[BACKEND]   Current User:', userId);
            return res.status(403).json({
                message: 'You can only evaluate submissions from teams assigned to you.',
                teamMentor: submission.team.mentor?.name,
                teamName: submission.team.name
            });
        }

        console.log('[BACKEND] ✓ Mentor authorization verified');

        // Update score
        const previousScore = submission.score;
        submission.score = evaluationScore;
        submission.evaluatedAt = new Date();
        submission.evaluatedBy = userId;
        await submission.save();

        console.log('[BACKEND] ✓ Score updated successfully');
        console.log('[BACKEND]   Previous Score:', previousScore);
        console.log('[BACKEND]   New Score:', evaluationScore);

        console.log('[BACKEND] ✓✓✓ SUCCESS: Evaluation submitted');
        console.log('='.repeat(70));

        res.status(200).json({
            message: 'Evaluation submitted successfully.',
            submission: {
                _id: submission._id,
                score: submission.score,
                githubRepo: submission.githubRepo,
                evaluatedAt: submission.evaluatedAt,
                team: {
                    _id: submission.team._id,
                    name: submission.team.name
                }
            }
        });
    } catch (err) {
        console.error('[BACKEND] ✗✗✗ CRITICAL ERROR in evaluate:', err);
        console.error('[BACKEND] Error stack:', err.stack);
        console.log('='.repeat(70));
        res.status(500).json({ 
            message: "Internal server error",
            error: err.message 
        });
    }
});

/**
 * Get evaluation statistics for a mentor
 */
router.get('/statistics/:mentorId', authenticateToken, async (req, res) => {
    try {
        const mentorId = req.params.mentorId;
        const userId = req.user.userId || req.user.id || req.user._id;

        console.log('[BACKEND] Get evaluation statistics - userId:', userId, 'mentorId:', mentorId);

        // Verify mentor can only access their own data
        if (req.user.role === 'mentor' && userId !== mentorId) {
            console.log('[BACKEND] ✗ ERROR: Unauthorized access attempt');
            return res.status(403).json({ 
                message: "You can only view your own statistics." 
            });
        }

        // Get all teams assigned to this mentor
        const teams = await HackTeam.find({ mentor: mentorId });
        const teamIds = teams.map(t => t._id);

        console.log('[BACKEND] ✓ Found', teams.length, 'teams');

        // Get all submissions for these teams
        const submissions = await HackSubmission.find({ team: { $in: teamIds } });

        console.log('[BACKEND] ✓ Found', submissions.length, 'submissions');

        // Calculate statistics
        const totalSubmissions = submissions.length;
        const evaluatedSubmissions = submissions.filter(s => typeof s.score === 'number').length;
        const pendingSubmissions = totalSubmissions - evaluatedSubmissions;
        
        const scores = submissions
            .filter(s => typeof s.score === 'number')
            .map(s => s.score);
        
        const averageScore = scores.length > 0 
            ? scores.reduce((a, b) => a + b, 0) / scores.length 
            : 0;

        const statistics = {
            totalTeams: teams.length,
            totalSubmissions,
            evaluatedSubmissions,
            pendingSubmissions,
            averageScore: averageScore.toFixed(2),
            evaluationRate: totalSubmissions > 0 
                ? ((evaluatedSubmissions / totalSubmissions) * 100).toFixed(2) 
                : 0
        };

        console.log('[BACKEND] ✓✓✓ SUCCESS: Statistics calculated', statistics);
        res.status(200).json(statistics);
    } catch (err) {
        console.error('[BACKEND] ✗✗✗ CRITICAL ERROR in statistics:', err);
        console.error('[BACKEND] Error stack:', err.stack);
        res.status(500).json({ 
            message: "Internal server error",
            error: err.message 
        });
    }
});

/**
 * Bulk evaluate multiple submissions (optional feature)
 */
router.put('/evaluate-bulk', authenticateToken, requireRole(['mentor']), async (req, res) => {
    try {
        const { evaluations } = req.body; // Array of { submissionId, score }
        const userId = req.user.userId || req.user.id || req.user._id;

        console.log('[BACKEND] Bulk evaluation - userId:', userId, 'count:', evaluations?.length);

        if (!Array.isArray(evaluations) || evaluations.length === 0) {
            return res.status(400).json({ 
                message: 'Evaluations array is required and must not be empty.' 
            });
        }

        const results = await Promise.all(evaluations.map(async ({ submissionId, score }) => {
            try {
                // Validate score
                if (typeof score !== 'number' || score < 0 || score > 100) {
                    return { submissionId, success: false, error: 'Invalid score' };
                }

                // Find and verify submission
                const submission = await HackSubmission.findById(submissionId)
                    .populate({ path: 'team', populate: { path: 'mentor' } });

                if (!submission) {
                    return { submissionId, success: false, error: 'Submission not found' };
                }

                if (submission.team.mentor._id.toString() !== userId) {
                    return { submissionId, success: false, error: 'Unauthorized' };
                }

                // Update score
                submission.score = score;
                submission.evaluatedAt = new Date();
                submission.evaluatedBy = userId;
                await submission.save();

                return { submissionId, success: true, score };
            } catch (err) {
                return { submissionId, success: false, error: err.message };
            }
        }));

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log('[BACKEND] ✓ Bulk evaluation completed - Success:', successful, 'Failed:', failed);

        res.status(200).json({
            message: 'Bulk evaluation completed.',
            successful,
            failed,
            results
        });
    } catch (err) {
        console.error('[BACKEND] ✗✗✗ CRITICAL ERROR in evaluate-bulk:', err);
        res.status(500).json({ 
            message: "Internal server error",
            error: err.message 
        });
    }
});
/**
 * Get document from a submission
 * Add this route to your mentorevaluation router
 */
router.get('/submission/:submissionId/document/:documentId', authenticateToken, async (req, res) => {
    try {
        const { submissionId, documentId } = req.params;
        const userId = req.user.userId || req.user.id || req.user._id;

        console.log('[BACKEND] Get document - submissionId:', submissionId, 'documentId:', documentId);

        // Find the submission
        const submission = await HackSubmission.findById(submissionId)
            .populate({
                path: 'team',
                populate: { path: 'mentor', select: '_id' }
            });

        if (!submission) {
            console.log('[BACKEND] ✗ Submission not found');
            return res.status(404).json({ message: 'Submission not found.' });
        }

        // Verify mentor is assigned to this team
        if (req.user.role === 'mentor' && 
            (!submission.team.mentor || submission.team.mentor._id.toString() !== userId)) {
            console.log('[BACKEND] ✗ Unauthorized access to document');
            return res.status(403).json({
                message: 'You can only view documents from teams assigned to you.'
            });
        }

        // Find the specific document
        const document = submission.documents.id(documentId);

        if (!document) {
            console.log('[BACKEND] ✗ Document not found');
            return res.status(404).json({ message: 'Document not found.' });
        }

        console.log('[BACKEND] ✓ Document found:', document.filename);

        // Set appropriate headers
        res.setHeader('Content-Type', document.fileType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${document.filename}"`);
        res.setHeader('Content-Length', document.data.length);

        // Send the file data
        res.send(document.data);
        console.log('[BACKEND] ✓✓✓ Document sent successfully');

    } catch (err) {
        console.error('[BACKEND] ✗✗✗ Error fetching document:', err);
        res.status(500).json({ 
            message: "Internal server error",
            error: err.message 
        });
    }
});

/**
 * Alternative: Get all documents metadata for a submission (without binary data)
 */
router.get('/submission/:submissionId/documents', authenticateToken, async (req, res) => {
    try {
        const { submissionId } = req.params;
        const userId = req.user.userId || req.user.id || req.user._id;

        console.log('[BACKEND] Get documents list - submissionId:', submissionId);

        // Find the submission
        const submission = await HackSubmission.findById(submissionId)
            .populate({
                path: 'team',
                populate: { path: 'mentor', select: '_id' }
            })
            .select('documents team');

        if (!submission) {
            return res.status(404).json({ message: 'Submission not found.' });
        }

        // Verify mentor is assigned to this team
        if (req.user.role === 'mentor' && 
            (!submission.team.mentor || submission.team.mentor._id.toString() !== userId)) {
            return res.status(403).json({
                message: 'You can only view documents from teams assigned to you.'
            });
        }

        // Return documents metadata (without binary data)
        const documentsMetadata = submission.documents.map(doc => ({
            _id: doc._id,
            filename: doc.filename,
            fileType: doc.fileType,
            uploadedAt: doc.uploadedAt,
            size: doc.data ? doc.data.length : 0
        }));

        console.log('[BACKEND] ✓ Returned', documentsMetadata.length, 'documents metadata');
        res.status(200).json(documentsMetadata);

    } catch (err) {
        console.error('[BACKEND] ✗✗✗ Error fetching documents list:', err);
        res.status(500).json({ 
            message: "Internal server error",
            error: err.message 
        });
    }
});
module.exports = router;