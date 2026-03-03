const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const HackathonSubmission = require("../Models/hacksubmission");
const HackTeams = require("../Models/hackteam");
const Hackathon = require("../Models/HackathonAdmin");
const ProblemStatement = require("../Models/problemstatements");
const HackRegister = require("../Models/hack-reg");

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|ppt|pptx|doc|docx|zip/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    if (extname) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, PPT, DOC, and ZIP files allowed"));
    }
  },
});

// ✅ NEW ROUTE: Get submissions for coordinator by hackathon
// router.get('/coordinator/:coordinatorId/hackathon/:hackathonId', async (req, res) => {
//   try {
//     const { coordinatorId, hackathonId } = req.params;
    
//     // Validate IDs
//     if (!coordinatorId.match(/^[0-9a-fA-F]{24}$/) || !hackathonId.match(/^[0-9a-fA-F]{24}$/)) {
//       return res.status(400).json({ error: 'Invalid coordinator or hackathon id' });
//     }

//     // Verify hackathon exists and coordinator has access
//     const hackathon = await Hackathon.findById(hackathonId);
//     if (!hackathon) {
//       return res.status(404).json({ error: 'Hackathon not found' });
//     }

//     // Optional: Add coordinator authorization check here
//     // if (hackathon.coordinator.toString() !== coordinatorId) {
//     //   return res.status(403).json({ error: 'Unauthorized access' });
//     // }

//     // Fetch all submissions for this hackathon
//     let submissions = await HackathonSubmission.find({ hackathon: hackathonId })
//       .populate("team", "name")
//       .populate("problemStatement", "hackathon")
//       .populate("teamLead.student", "name email rollNo branch")
//       .populate("teamMembers.student", "name email rollNo branch")
//       .populate("submittedBy", "name email")
//       .sort({ submittedAt: -1 })
//       .select("-documents.data");

//     // Enrich with problem statement subdocument details
//     const enriched = await Promise.all(submissions.map(async (s) => {
//       const obj = s.toObject();
//       if (obj.problemSubId && obj.problemStatement) {
//         try {
//           const parent = await ProblemStatement.findById(obj.problemStatement).select('problemStatements');
//           if (parent) {
//             const sub = parent.problemStatements.id(obj.problemSubId);
//             if (sub) {
//               obj.problemSub = {
//                 _id: sub._id,
//                 title: sub.title,
//                 description: sub.description,
//                 technologies: sub.technologies || []
//               };
//             }
//           }
//         } catch (err) {
//           console.error('Error enriching problem statement:', err);
//         }
//       }
//       return obj;
//     }));

//     res.json({ 
//       count: enriched.length, 
//       hackathon: {
//         _id: hackathon._id,
//         hackathonname: hackathon.hackathonname,
//         startdate: hackathon.startdate,
//         enddate: hackathon.enddate
//       },
//       submissions: enriched 
//     });

//   } catch (err) {
//     console.error('Error /coordinator/:coordinatorId/hackathon/:hackathonId', err);
//     res.status(500).json({ error: err.message });
//   }
// });
// ✅ UPDATED: Get submissions for coordinator by hackathon with year/college filtering
router.get('/coordinator/:coordinatorId/hackathon/:hackathonId', async (req, res) => {
  try {
    const { coordinatorId, hackathonId } = req.params;
    const { coordinatorYear, coordinatorCollege } = req.query;
    
    // Validate IDs
    if (!coordinatorId.match(/^[0-9a-fA-F]{24}$/) || !hackathonId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid coordinator or hackathon id' });
    }

    console.log('Fetching submissions with filters:', { hackathonId, coordinatorYear, coordinatorCollege });

    // Verify hackathon exists
    const hackathon = await Hackathon.findById(hackathonId);
    if (!hackathon) {
      return res.status(404).json({ error: 'Hackathon not found' });
    }

    // Verify hackathon matches coordinator's year and college
    if (coordinatorYear && hackathon.year !== coordinatorYear) {
      return res.status(403).json({ 
        error: 'This hackathon does not match your assigned year' 
      });
    }
    
    if (coordinatorCollege) {
      const hackathonColleges = hackathon.colleges || [hackathon.college];
      if (!hackathonColleges.includes(coordinatorCollege)) {
        return res.status(403).json({ 
          error: 'This hackathon does not match your assigned college' 
        });
      }
    }

    // Fetch all submissions for this hackathon
    let submissions = await HackathonSubmission.find({ hackathon: hackathonId })
      .populate("team", "name")
      .populate("problemStatement", "hackathon")
      .populate({
        path: "teamLead.student",
        select: "name email rollNo branch currentYear college"
      })
      .populate({
        path: "teamMembers.student",
        select: "name email rollNo branch currentYear college"
      })
      .populate("submittedBy", "name email")
      .sort({ submittedAt: -1 })
      .select("-documents.data");

    // Filter submissions by coordinator year and college
    const filteredSubmissions = submissions.filter(submission => {
      // Get all student details from the submission
      const allStudents = [
        submission.teamLead?.student,
        ...(submission.teamMembers?.map(m => m.student) || [])
      ].filter(Boolean);

      // Check if at least one student matches coordinator's year and college
      const hasMatchingStudent = allStudents.some(student => {
        const yearMatch = !coordinatorYear || student.currentYear === coordinatorYear;
        const collegeMatch = !coordinatorCollege || student.college === coordinatorCollege;
        return yearMatch && collegeMatch;
      });

      if (!hasMatchingStudent) {
        console.log(`Filtering out submission from team: ${submission.team?.name}`);
      }

      return hasMatchingStudent;
    });

    console.log(`Found ${submissions.length} total submissions, ${filteredSubmissions.length} match filters`);

    // Enrich with problem statement subdocument details
    const enriched = await Promise.all(filteredSubmissions.map(async (s) => {
      const obj = s.toObject();
      if (obj.problemSubId && obj.problemStatement) {
        try {
          const parent = await ProblemStatement.findById(obj.problemStatement).select('problemStatements');
          if (parent) {
            const sub = parent.problemStatements.id(obj.problemSubId);
            if (sub) {
              obj.problemSub = {
                _id: sub._id,
                title: sub.title,
                description: sub.description,
                technologies: sub.technologies || []
              };
            }
          }
        } catch (err) {
          console.error('Error enriching problem statement:', err);
        }
      }
      return obj;
    }));

    res.json({ 
      count: enriched.length, 
      hackathon: {
        _id: hackathon._id,
        hackathonname: hackathon.hackathonname,
        startdate: hackathon.startdate,
        enddate: hackathon.enddate,
        year: hackathon.year,
        colleges: hackathon.colleges || [hackathon.college]
      },
      filters: {
        coordinatorYear,
        coordinatorCollege
      },
      submissions: enriched 
    });

  } catch (err) {
    console.error('Error /coordinator/:coordinatorId/hackathon/:hackathonId', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEW ROUTE: Get all hackathons for a coordinator
// router.get('/coordinator/:coordinatorId/hackathons', async (req, res) => {
//   try {
//     const { coordinatorId } = req.params;
    
//     if (!coordinatorId.match(/^[0-9a-fA-F]{24}$/)) {
//       return res.status(400).json({ error: 'Invalid coordinator id' });
//     }

//     // Fetch all hackathons (or filter by coordinator if needed)
//     // If you have a coordinator field in Hackathon model, uncomment below:
//     // const hackathons = await Hackathon.find({ coordinator: coordinatorId })
//     const hackathons = await Hackathon.find()
//       .select('hackathonname startdate enddate description')
//       .sort({ startdate: -1 });

//     // Get submission counts for each hackathon
//     const hackathonsWithStats = await Promise.all(
//       hackathons.map(async (hackathon) => {
//         const submissionCount = await HackathonSubmission.countDocuments({ 
//           hackathon: hackathon._id 
//         });
        
//         return {
//           _id: hackathon._id,
//           hackathonname: hackathon.hackathonname,
//           startdate: hackathon.startdate,
//           enddate: hackathon.enddate,
//           description: hackathon.description,
//           submissionCount
//         };
//       })
//     );

//     res.json({ 
//       count: hackathonsWithStats.length,
//       hackathons: hackathonsWithStats 
//     });

//   } catch (err) {
//     console.error('Error /coordinator/:coordinatorId/hackathons', err);
//     res.status(500).json({ error: err.message });
//   }
// });
router.get('/coordinator/:coordinatorId/hackathons', async (req, res) => {
  try {
    const { coordinatorId } = req.params;
    const { coordinatorYear, coordinatorCollege } = req.query;
    
    if (!coordinatorId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid coordinator id' });
    }

    console.log('Fetching hackathons for coordinator:', { coordinatorYear, coordinatorCollege });

    // Build filter for hackathons
    let filter = {};
    
    if (coordinatorYear) {
      filter.year = coordinatorYear;
    }
    
    if (coordinatorCollege) {
      // Handle both 'colleges' array and 'college' string field
      filter.$or = [
        { colleges: { $in: [coordinatorCollege] } },
        { college: coordinatorCollege }
      ];
    }

    console.log('Hackathon filter:', JSON.stringify(filter));

    const hackathons = await Hackathon.find(filter)
      .select('hackathonname startdate enddate description year colleges college')
      .sort({ startdate: -1 });

    console.log(`Found ${hackathons.length} hackathons matching filters`);

    // Get submission counts for each hackathon (filtered by year/college)
    const hackathonsWithStats = await Promise.all(
      hackathons.map(async (hackathon) => {
        // Get all submissions for this hackathon
        const allSubmissions = await HackathonSubmission.find({ 
          hackathon: hackathon._id 
        })
          .populate({
            path: "teamLead.student",
            select: "currentYear college"
          })
          .populate({
            path: "teamMembers.student",
            select: "currentYear college"
          });

        // Filter submissions by coordinator year and college
        const filteredSubmissions = allSubmissions.filter(submission => {
          const allStudents = [
            submission.teamLead?.student,
            ...(submission.teamMembers?.map(m => m.student) || [])
          ].filter(Boolean);

          return allStudents.some(student => {
            const yearMatch = !coordinatorYear || student.currentYear === coordinatorYear;
            const collegeMatch = !coordinatorCollege || student.college === coordinatorCollege;
            return yearMatch && collegeMatch;
          });
        });
        
        return {
          _id: hackathon._id,
          hackathonname: hackathon.hackathonname,
          startdate: hackathon.startdate,
          enddate: hackathon.enddate,
          description: hackathon.description,
          year: hackathon.year,
          colleges: hackathon.colleges || [hackathon.college],
          submissionCount: filteredSubmissions.length
        };
      })
    );

    res.json({ 
      count: hackathonsWithStats.length,
      filters: {
        coordinatorYear,
        coordinatorCollege
      },
      hackathons: hackathonsWithStats 
    });

  } catch (err) {
    console.error('Error /coordinator/:coordinatorId/hackathons', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEW ROUTE: Get submission statistics by branch for a hackathon
// router.get('/coordinator/hackathon/:hackathonId/stats/by-branch', async (req, res) => {
//   try {
//     const { hackathonId } = req.params;
    
//     if (!hackathonId.match(/^[0-9a-fA-F]{24}$/)) {
//       return res.status(400).json({ error: 'Invalid hackathon id' });
//     }

//     const submissions = await HackathonSubmission.find({ hackathon: hackathonId })
//       .populate("teamLead.student", "branch")
//       .populate("teamMembers.student", "branch");

//     // Count submissions by branch
//     const branchStats = {};
    
//     submissions.forEach(sub => {
//       const branches = new Set();
      
//       if (sub.teamLead?.student?.branch) {
//         branches.add(sub.teamLead.student.branch);
//       }
      
//       sub.teamMembers?.forEach(member => {
//         if (member.student?.branch) {
//           branches.add(member.student.branch);
//         }
//       });

//       branches.forEach(branch => {
//         branchStats[branch] = (branchStats[branch] || 0) + 1;
//       });
//     });

//     const stats = Object.entries(branchStats).map(([branch, count]) => ({
//       branch,
//       submissionCount: count
//     })).sort((a, b) => b.submissionCount - a.submissionCount);

//     res.json({
//       hackathonId,
//       totalSubmissions: submissions.length,
//       branchStats: stats
//     });

//   } catch (err) {
//     console.error('Error /coordinator/hackathon/:hackathonId/stats/by-branch', err);
//     res.status(500).json({ error: err.message });
//   }
// });
router.get('/coordinator/hackathon/:hackathonId/stats/by-branch', async (req, res) => {
  try {
    const { hackathonId } = req.params;
    const { coordinatorYear, coordinatorCollege } = req.query;
    
    if (!hackathonId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid hackathon id' });
    }

    const submissions = await HackathonSubmission.find({ hackathon: hackathonId })
      .populate({
        path: "teamLead.student",
        select: "branch currentYear college"
      })
      .populate({
        path: "teamMembers.student",
        select: "branch currentYear college"
      });

    // Filter submissions by coordinator year and college
    const filteredSubmissions = submissions.filter(submission => {
      const allStudents = [
        submission.teamLead?.student,
        ...(submission.teamMembers?.map(m => m.student) || [])
      ].filter(Boolean);

      return allStudents.some(student => {
        const yearMatch = !coordinatorYear || student.currentYear === coordinatorYear;
        const collegeMatch = !coordinatorCollege || student.college === coordinatorCollege;
        return yearMatch && collegeMatch;
      });
    });

    // Count submissions by branch
    const branchStats = {};
    
    filteredSubmissions.forEach(sub => {
      const branches = new Set();
      
      if (sub.teamLead?.student?.branch) {
        branches.add(sub.teamLead.student.branch);
      }
      
      sub.teamMembers?.forEach(member => {
        if (member.student?.branch) {
          branches.add(member.student.branch);
        }
      });

      branches.forEach(branch => {
        branchStats[branch] = (branchStats[branch] || 0) + 1;
      });
    });

    const stats = Object.entries(branchStats).map(([branch, count]) => ({
      branch,
      submissionCount: count
    })).sort((a, b) => b.submissionCount - a.submissionCount);

    res.json({
      hackathonId,
      totalSubmissions: filteredSubmissions.length,
      filters: {
        coordinatorYear,
        coordinatorCollege
      },
      branchStats: stats
    });

  } catch (err) {
    console.error('Error /coordinator/hackathon/:hackathonId/stats/by-branch', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEW ROUTE: Get team ID from student ID
router.get('/student/:studentId/team', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { hackathonId } = req.query;
    
    if (!studentId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid student id' });
    }

    const query = hackathonId 
      ? { hackathon: hackathonId, 'students.student': studentId }
      : { 'students.student': studentId };

    const hackReg = await HackRegister.findOne(query).populate('students.student');
    
    if (!hackReg) {
      return res.status(404).json({ 
        error: 'Student not registered for this hackathon',
        hasTeam: false 
      });
    }

    const studentReg = hackReg.students.find(
      s => s.student._id.toString() === studentId
    );

    if (!studentReg) {
      return res.status(404).json({ 
        error: 'Student registration not found',
        hasTeam: false 
      });
    }

    const team = await HackTeams.findOne({
      hackathon: hackReg.hackathon,
      students: studentReg._id
    }).populate('mentor', 'name email');

    if (!team) {
      return res.json({ 
        hasTeam: false,
        message: 'Student is not part of any team yet',
        registrationId: studentReg._id,
        hackathonId: hackReg.hackathon
      });
    }

    const isTeamLead = team.teamLead && team.teamLead.toString() === studentReg._id.toString();

    res.json({
      hasTeam: true,
      teamId: team._id,
      teamName: team.name,
      isTeamLead,
      hackathonId: team.hackathon,
      mentor: team.mentor,
      registrationId: studentReg._id,
      selectedProblemStatement: team.selectedProblemStatement || null
    });

  } catch (err) {
    console.error('Error /student/:studentId/team', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ ENHANCED: Submit a new hackathon project
router.post("/submit", upload.array("documents", 5), async (req, res) => {
  try {
    const {
      hackathon,
      team,
      problemStatement,
      teamLead,
      teamLeadContribution,
      teamMembers,
      projectDescription,
      githubRepo,
      liveDemoLink,
      submittedBy,
    } = req.body;

    if (!hackathon || !team || !problemStatement || !teamLead || !submittedBy) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const teamDoc = await HackTeams.findOne({ _id: team, hackathon });
    if (!teamDoc) {
      return res.status(404).json({ error: "Team not found for this hackathon" });
    }

    const existingTeamSubmission = await HackathonSubmission.findOne({
      hackathon,
      team
    });

    if (existingTeamSubmission) {
      return res.status(400).json({
        error: "Your team has already submitted a project for this hackathon. Multiple submissions are not allowed.",
        submissionId: existingTeamSubmission._id,
        submittedAt: existingTeamSubmission.submittedAt
      });
    }

    let parentProblemId = null;
    let subdocId = null;

    let parentDoc = await ProblemStatement.findOne({ _id: problemStatement, hackathon });
    if (parentDoc) {
      if (parentDoc.problemStatements.length === 1) {
        parentProblemId = parentDoc._id;
        subdocId = parentDoc.problemStatements[0]._id;
      } else {
        return res.status(400).json({ 
          error: "Multiple problem statements exist in this document. Please provide the problem subdocument id." 
        });
      }
    } else {
      const docContainingSub = await ProblemStatement.findOne({ 
        "problemStatements._id": problemStatement, 
        hackathon 
      });
      if (!docContainingSub) {
        return res.status(404).json({ 
          error: "Problem statement (parent or sub-id) not found for this hackathon" 
        });
      }
      parentProblemId = docContainingSub._id;
      subdocId = problemStatement;
      parentDoc = docContainingSub;
    }

    const subdoc = parentDoc.problemStatements.id(subdocId);
    if (!subdoc) {
      return res.status(404).json({ error: "Problem subdocument not found" });
    }

    const parsedMembers = teamMembers ? JSON.parse(teamMembers) : [];

    const documents = req.files?.map((file) => ({
      filename: file.originalname,
      fileType: file.mimetype,
      data: file.buffer,
    })) || [];

    const submission = new HackathonSubmission({
      hackathon,
      team,
      problemStatement: parentProblemId,
      problemSubId: subdocId,
      teamLead: {
        student: teamLead,
        contribution: teamLeadContribution,
      },
      teamMembers: parsedMembers,
      projectDescription,
      githubRepo,
      liveDemoLink,
      documents,
      submittedBy,
    });

    await submission.save();

    res.status(201).json({
      message: "Submission created successfully",
      submission: {
        id: submission._id,
        hackathon: submission.hackathon,
        team: submission.team,
        submittedAt: submission.submittedAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        error: "Duplicate submission detected. Your team has already submitted for this problem statement.",
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// ✅ READ - Get all submissions (with filters)
router.get("/", async (req, res) => {
  try {
    const { hackathon, team, problemStatement, submittedBy } = req.query;

    const filter = {};
    if (hackathon) filter.hackathon = hackathon;
    if (team) filter.team = team;
    if (problemStatement) filter.problemStatement = problemStatement;
    if (submittedBy) filter.submittedBy = submittedBy;

    let submissions = await HackathonSubmission.find(filter)
      .populate("hackathon", "hackathonname startdate enddate")
      .populate("team", "name")
      .populate("problemStatement", "hackathon")
      .populate("teamLead.student", "name email rollNo branch")
      .populate("teamMembers.student", "name email rollNo branch")
      .populate("submittedBy")
      .sort({ submittedAt: -1 })
      .select("-documents.data");

    const enriched = await Promise.all(submissions.map(async (s) => {
      const obj = s.toObject();
      if (obj.problemSubId && obj.problemStatement) {
        try {
          const parent = await ProblemStatement.findById(obj.problemStatement).select('problemStatements');
          if (parent) {
            const sub = parent.problemStatements.id(obj.problemSubId);
            if (sub) {
              obj.problemSub = {
                _id: sub._id,
                title: sub.title,
                description: sub.description,
                technologies: sub.technologies || []
              };
            }
          }
        } catch (err) {
          // ignore enrichment error
        }
      }
      return obj;
    }));

    res.json({ count: enriched.length, submissions: enriched });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ READ - Get single submission by ID
router.get("/:id", async (req, res) => {
  try {
    let submission = await HackathonSubmission.findById(req.params.id)
      .populate("hackathon")
      .populate("team")
      .populate("problemStatement")
      .populate("teamLead.student")
      .populate("teamMembers.student")
      .populate("submittedBy")
      .select("-documents.data");

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const obj = submission.toObject();

    if (obj.problemSubId && obj.problemStatement) {
      try {
        const parent = await ProblemStatement.findById(obj.problemStatement).select('problemStatements');
        if (parent) {
          const sub = parent.problemStatements.id(obj.problemSubId);
          if (sub) {
            obj.problemSub = {
              _id: sub._id,
              title: sub.title,
              description: sub.description,
              technologies: sub.technologies || []
            };
          }
        }
      } catch (err) {
        // ignore
      }
    }

    res.json(obj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ READ - Download a specific document
router.get("/:id/document/:docIndex", async (req, res) => {
  try {
    const submission = await HackathonSubmission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const docIndex = parseInt(req.params.docIndex);
    if (docIndex < 0 || docIndex >= submission.documents.length) {
      return res.status(404).json({ error: "Document not found" });
    }

    const doc = submission.documents[docIndex];
    res.setHeader("Content-Type", doc.fileType);
    res.setHeader("Content-Disposition", `attachment; filename="${doc.filename}"`);
    res.send(doc.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ UPDATE - Update submission details
router.put("/:id", upload.array("documents", 5), async (req, res) => {
  try {
    const {
      teamLeadContribution,
      teamMembers,
      projectDescription,
      githubRepo,
      liveDemoLink,
    } = req.body;

    const submission = await HackathonSubmission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    if (teamLeadContribution) {
      submission.teamLead.contribution = teamLeadContribution;
    }
    if (teamMembers) {
      submission.teamMembers = JSON.parse(teamMembers);
    }
    if (projectDescription) {
      submission.projectDescription = projectDescription;
    }
    if (githubRepo !== undefined) {
      submission.githubRepo = githubRepo;
    }
    if (liveDemoLink !== undefined) {
      submission.liveDemoLink = liveDemoLink;
    }

    if (req.files && req.files.length > 0) {
      const newDocs = req.files.map((file) => ({
        filename: file.originalname,
        fileType: file.mimetype,
        data: file.buffer,
      }));
      submission.documents.push(...newDocs);
    }

    await submission.save();

    res.json({ message: "Submission updated successfully", submission });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ DELETE - Remove a submission
router.delete("/:id", async (req, res) => {
  try {
    const submission = await HackathonSubmission.findByIdAndDelete(req.params.id);
    
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    res.json({ message: "Submission deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ DELETE - Remove a specific document from submission
router.delete("/:id/document/:docIndex", async (req, res) => {
  try {
    const submission = await HackathonSubmission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const docIndex = parseInt(req.params.docIndex);
    if (docIndex < 0 || docIndex >= submission.documents.length) {
      return res.status(404).json({ error: "Document not found" });
    }

    submission.documents.splice(docIndex, 1);
    await submission.save();

    res.json({ message: "Document removed successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Get selected problem statement for a team
router.get('/team/:teamId/selected-problem', async (req, res) => {
  try {
    const { teamId } = req.params;
    
    if (!teamId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid team id' });
    }

    const team = await HackTeams.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    if (!team.selectedProblemStatement) {
      return res.json({ 
        hasSelected: false,
        message: 'Team has not selected a problem statement yet'
      });
    }

    const parentDoc = await ProblemStatement.findById(team.selectedProblemStatement)
      .populate('mentor', 'name email');

    if (!parentDoc) {
      return res.status(404).json({ 
        error: 'Selected problem statement not found' 
      });
    }

    let subdoc = null;
    if (parentDoc.problemStatements.length === 1) {
      subdoc = parentDoc.problemStatements[0];
    } else {
      subdoc = parentDoc.problemStatements.find(
        ps => ps.selectedBy && ps.selectedBy.toString() === teamId
      );
    }
    
    if (!subdoc) {
      return res.status(404).json({ 
        error: 'Problem statement subdocument not found' 
      });
    }

    res.json({
      hasSelected: true,
      problemStatement: {
        _id: subdoc._id,
        title: subdoc.title,
        description: subdoc.description,
        technologies: subdoc.technologies || [],
        isSelected: subdoc.isSelected,
        selectedBy: subdoc.selectedBy,
        parentId: parentDoc._id,
        mentor: parentDoc.mentor
      },
      team: {
        _id: team._id,
        name: team.name,
        hackathon: team.hackathon
      }
    });
  } catch (err) {
    console.error('Error /team/:teamId/selected-problem', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Check submission status for a team
router.get('/team/:teamId/submission-status', async (req, res) => {
  try {
    const { teamId } = req.params;
    
    if (!teamId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid team id' });
    }

    const team = await HackTeams.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const existingSubmission = await HackathonSubmission.findOne({
      team: teamId,
      hackathon: team.hackathon
    }).select('submittedAt projectDescription githubRepo liveDemoLink problemSubId');

    if (existingSubmission) {
      return res.json({
        canSubmit: false,
        hasSubmitted: true,
        submission: {
          id: existingSubmission._id,
          submittedAt: existingSubmission.submittedAt,
          githubRepo: existingSubmission.githubRepo,
          liveDemoLink: existingSubmission.liveDemoLink,
          problemSubId: existingSubmission.problemSubId
        },
        message: 'Your team has already submitted a project for this hackathon. Multiple submissions are not allowed.'
      });
    }

    if (!team.selectedProblemStatement) {
      return res.json({
        canSubmit: false,
        hasSubmitted: false,
        message: 'Team has not selected a problem statement yet'
      });
    }

    res.json({
      canSubmit: true,
      hasSubmitted: false,
      message: 'Team can submit their project'
    });

  } catch (err) {
    console.error('Error /team/:teamId/submission-status', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get team's submission with full details
router.get('/team/:teamId/submission', async (req, res) => {
  try {
    const { teamId } = req.params;
    
    if (!teamId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid team id' });
    }

    const team = await HackTeams.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const submission = await HackathonSubmission.findOne({
      team: teamId,
      hackathon: team.hackathon
    })
      .populate('hackathon', 'hackathonname startdate enddate')
      .populate('team', 'name')
      .populate('teamLead.student', 'name email rollNo branch')
      .populate('teamMembers.student', 'name email rollNo branch')
      .populate('submittedBy')
      .select('-documents.data');

    if (!submission) {
      return res.status(404).json({ 
        error: 'No submission found for this team',
        hasSubmission: false 
      });
    }

    const result = submission.toObject();

    if (result.problemSubId && result.problemStatement) {
      try {
        const parent = await ProblemStatement.findById(result.problemStatement)
          .select('problemStatements mentor')
          .populate('mentor', 'name email');
        
        if (parent) {
          const sub = parent.problemStatements.id(result.problemSubId);
          if (sub) {
            result.problemSub = {
              _id: sub._id,
              title: sub.title,
              description: sub.description,
              technologies: sub.technologies || [],
              mentor: parent.mentor
            };
          }
        }
      } catch (err) {
        console.error('Error enriching problem statement:', err);
      }
    }

    res.json({
      hasSubmission: true,
      submission: result
    });

  } catch (err) {
    console.error('Error /team/:teamId/submission', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Lookup: hackathon by id
router.get('/lookup/hackathon/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ error: 'Invalid hackathon id' });

    const hackathon = await Hackathon.findById(id).select('hackathonname _id');
    if (!hackathon) return res.status(404).json({ error: 'Hackathon not found' });

    res.json({ _id: hackathon._id, hackathonname: hackathon.hackathonname });
  } catch (err) {
    console.error('Error /lookup/hackathon/:id', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Lookup: team details by id
router.get('/lookup/team/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ error: 'Invalid team id' });

    const team = await HackTeams.findById(id);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const hackReg = await HackRegister.findOne({ hackathon: team.hackathon }).populate('students.student');
    const students = [];
    let teamLead = null;

    if (hackReg) {
      for (const regId of team.students) {
        const regEntry = hackReg.students.id(regId);
        if (regEntry && regEntry.student) {
          students.push({
            registrationId: regEntry._id,
            studentId: regEntry.student._id,
            name: regEntry.student.name,
            email: regEntry.student.email,
            rollNo: regEntry.student.rollNo,
            college: regEntry.student.college,
            branch: regEntry.student.branch
          });
        }
      }

      if (team.teamLead) {
        const leadEntry = hackReg.students.id(team.teamLead);
        if (leadEntry && leadEntry.student) {
          teamLead = {
            registrationId: leadEntry._id,
            studentId: leadEntry.student._id,
            name: leadEntry.student.name,
            email: leadEntry.student.email,
            rollNo: leadEntry.student.rollNo,
            college: leadEntry.student.college,
            branch: leadEntry.student.branch
          };
        }
      }
    }

    res.json({
      _id: team._id,
      name: team.name,
      hackathon: team.hackathon,
      mentor: team.mentor || null,
      teamLead,
      students,
      selectedProblemStatement: team.selectedProblemStatement || null
    });
  } catch (err) {
    console.error('Error /lookup/team/:id', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Lookup: problem statements for a team
router.get('/lookup/team/:id/problem-statements', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ error: 'Invalid team id' });

    const team = await HackTeams.findById(id);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    if (!team.mentor) {
      return res.json({ problemStatements: [] });
    }

    const docs = await ProblemStatement.find({
      hackathon: team.hackathon,
      mentor: team.mentor
    });

    const problemStatements = docs.flatMap(doc =>
      doc.problemStatements.map(ps => ({
        _id: ps._id,
        title: ps.title,
        description: ps.description,
        technologies: ps.technologies || [],
        isSelected: !!ps.isSelected,
        selectedBy: ps.selectedBy || null,
        parentId: doc._id
      }))
    );

    res.json({ problemStatements });
  } catch (err) {
    console.error('Error /lookup/team/:id/problem-statements', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ ANALYTICS - Get submissions count by hackathon
router.get("/analytics/by-hackathon", async (req, res) => {
  try {
    const stats = await HackathonSubmission.aggregate([
      {
        $group: {
          _id: "$hackathon",
          totalSubmissions: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "hackathons",
          localField: "_id",
          foreignField: "_id",
          as: "hackathonInfo",
        },
      },
      { $unwind: "$hackathonInfo" },
      {
        $project: {
          hackathonName: "$hackathonInfo.hackathonname",
          totalSubmissions: 1,
        },
      },
    ]);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});




// ✅ NEW ROUTE: Get submissions for mentor by hackathon
router.get('/mentor/:mentorId/hackathon/:hackathonId', async (req, res) => {
  try {
    const { mentorId, hackathonId } = req.params;
    
    // Validate IDs
    if (!mentorId.match(/^[0-9a-fA-F]{24}$/) || !hackathonId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid mentor or hackathon id' });
    }

    // Verify hackathon exists
    const hackathon = await Hackathon.findById(hackathonId);
    if (!hackathon) {
      return res.status(404).json({ error: 'Hackathon not found' });
    }

    // Get all teams assigned to this mentor for this hackathon
    const mentorTeams = await HackTeams.find({
      hackathon: hackathonId,
      mentor: mentorId
    }).select('_id');

    const teamIds = mentorTeams.map(t => t._id);

    // Fetch submissions only from mentor's assigned teams
    let submissions = await HackathonSubmission.find({ 
      hackathon: hackathonId,
      team: { $in: teamIds }
    })
      .populate("team", "name")
      .populate("problemStatement", "hackathon")
      .populate("teamLead.student", "name email rollNo branch")
      .populate("teamMembers.student", "name email rollNo branch")
      .populate("submittedBy", "name email")
      .sort({ submittedAt: -1 })
      .select("-documents.data");

    // Enrich with problem statement subdocument details
    const enriched = await Promise.all(submissions.map(async (s) => {
      const obj = s.toObject();
      if (obj.problemSubId && obj.problemStatement) {
        try {
          const parent = await ProblemStatement.findById(obj.problemStatement).select('problemStatements');
          if (parent) {
            const sub = parent.problemStatements.id(obj.problemSubId);
            if (sub) {
              obj.problemSub = {
                _id: sub._id,
                title: sub.title,
                description: sub.description,
                technologies: sub.technologies || []
              };
            }
          }
        } catch (err) {
          console.error('Error enriching problem statement:', err);
        }
      }
      return obj;
    }));

    res.json({ 
      count: enriched.length, 
      hackathon: {
        _id: hackathon._id,
        hackathonname: hackathon.hackathonname,
        startdate: hackathon.startdate,
        enddate: hackathon.enddate
      },
      mentor: {
        _id: mentorId,
        assignedTeams: teamIds.length
      },
      submissions: enriched 
    });

  } catch (err) {
    console.error('Error /mentor/:mentorId/hackathon/:hackathonId', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ OPTIONAL: Get all hackathons where mentor has teams
router.get('/mentor/:mentorId/hackathons', async (req, res) => {
  try {
    const { mentorId } = req.params;
    
    if (!mentorId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid mentor id' });
    }

    // Find all hackathons where this mentor has teams
    const teams = await HackTeams.find({ mentor: mentorId })
      .distinct('hackathon');

    const hackathons = await Hackathon.find({ _id: { $in: teams } })
      .select('hackathonname startdate enddate description')
      .sort({ startdate: -1 });

    // Get submission counts for each hackathon (only for mentor's teams)
    const hackathonsWithStats = await Promise.all(
      hackathons.map(async (hackathon) => {
        const mentorTeams = await HackTeams.find({
          hackathon: hackathon._id,
          mentor: mentorId
        }).select('_id');

        const teamIds = mentorTeams.map(t => t._id);

        const submissionCount = await HackathonSubmission.countDocuments({ 
          hackathon: hackathon._id,
          team: { $in: teamIds }
        });
        
        return {
          _id: hackathon._id,
          hackathonname: hackathon.hackathonname,
          startdate: hackathon.startdate,
          enddate: hackathon.enddate,
          description: hackathon.description,
          assignedTeams: teamIds.length,
          submissionCount
        };
      })
    );

    res.json({ 
      count: hackathonsWithStats.length,
      hackathons: hackathonsWithStats 
    });

  } catch (err) {
    console.error('Error /mentor/:mentorId/hackathons', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;