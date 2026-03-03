const express = require("express");
const router = express.Router();
const HackGalleryFolder = require("../Models/HackGalleryFolder");
const HackGalleryImage = require("../Models/HackGalleryImage");
const { uploadGalleryImage, getGalleryImage, deleteGalleryImage } = require("../Models/galleryGridfs");
const upload = require("../middleware/upload");
const { authenticateToken } = require("../../middleware/auth");

// Create a new gallery folder for a hackathon
router.post("/folders", authenticateToken, async (req, res) => {
  try {
    const { hackathonName, hackathonId, description } = req.body;

    if (!hackathonName || !hackathonId) {
      return res.status(400).json({ message: "Hackathon name and ID are required" });
    }

    // Check if folder already exists for this hackathon
    const existingFolder = await HackGalleryFolder.findOne({ hackathonId });
    if (existingFolder) {
      return res.status(400).json({ message: "Gallery folder already exists for this hackathon" });
    }

    const newFolder = new HackGalleryFolder({
      hackathonName,
      hackathonId,
      description: description || "",
      createdBy: req.user.userId,
    });

    await newFolder.save();
    res.status(201).json({ message: "Gallery folder created successfully", folder: newFolder });
  } catch (error) {
    console.error("Error creating gallery folder:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all gallery folders
router.get("/folders", async (req, res) => {
  try {
    const folders = await HackGalleryFolder.find()
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });
    
    res.status(200).json({ folders });
  } catch (error) {
    console.error("Error fetching gallery folders:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get a specific gallery folder by ID
router.get("/folders/:folderId", async (req, res) => {
  try {
    const { folderId } = req.params;
    const folder = await HackGalleryFolder.findById(folderId)
      .populate("createdBy", "name email");

    if (!folder) {
      return res.status(404).json({ message: "Gallery folder not found" });
    }

    res.status(200).json({ folder });
  } catch (error) {
    console.error("Error fetching gallery folder:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get gallery folder by hackathon ID
router.get("/folders/hackathon/:hackathonId", async (req, res) => {
  try {
    const { hackathonId } = req.params;
    const folder = await HackGalleryFolder.findOne({ hackathonId })
      .populate("createdBy", "name email");

    if (!folder) {
      return res.status(404).json({ message: "Gallery folder not found for this hackathon" });
    }

    res.status(200).json({ folder });
  } catch (error) {
    console.error("Error fetching gallery folder:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update gallery folder
router.put("/folders/:folderId", authenticateToken, async (req, res) => {
  try {
    const { folderId } = req.params;
    const { hackathonName, description } = req.body;

    const folder = await HackGalleryFolder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ message: "Gallery folder not found" });
    }

    if (hackathonName) folder.hackathonName = hackathonName;
    if (description !== undefined) folder.description = description;

    await folder.save();
    res.status(200).json({ message: "Gallery folder updated successfully", folder });
  } catch (error) {
    console.error("Error updating gallery folder:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Delete gallery folder (and all its images)
router.delete("/folders/:folderId", authenticateToken, async (req, res) => {
  try {
    const { folderId } = req.params;

    // Find all images in this folder
    const images = await HackGalleryImage.find({ folderId });

    // Delete all image files from GridFS
    for (const image of images) {
      try {
        await deleteGalleryImage(image.imageFileId);
      } catch (error) {
        console.error(`Error deleting image file ${image.imageFileId}:`, error);
      }
    }

    // Delete all image documents
    await HackGalleryImage.deleteMany({ folderId });

    // Delete the folder
    const folder = await HackGalleryFolder.findByIdAndDelete(folderId);
    if (!folder) {
      return res.status(404).json({ message: "Gallery folder not found" });
    }

    res.status(200).json({ message: "Gallery folder and all images deleted successfully" });
  } catch (error) {
    console.error("Error deleting gallery folder:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Upload images to a gallery folder
router.post("/folders/:folderId/images", authenticateToken, upload.array("images", 20), async (req, res) => {
  try {
    const { folderId } = req.params;
    const { titles, descriptions } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No images provided" });
    }

    // Find the folder
    const folder = await HackGalleryFolder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ message: "Gallery folder not found" });
    }

    const uploadedImages = [];
    const parsedTitles = titles ? JSON.parse(titles) : [];
    const parsedDescriptions = descriptions ? JSON.parse(descriptions) : [];

    // Upload each image
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      
      try {
        // Upload to GridFS
        const fileId = await uploadGalleryImage(
          file.buffer,
          file.originalname,
          file.mimetype
        );

        // Create image document
        const newImage = new HackGalleryImage({
          folderId: folder._id,
          hackathonId: folder.hackathonId,
          imageUrl: `/api/hackathon/gallery/images/${fileId}`,
          imageFileId: fileId,
          title: parsedTitles[i] || file.originalname,
          description: parsedDescriptions[i] || "",
          uploadedBy: req.user.userId,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
        });

        await newImage.save();
        uploadedImages.push(newImage);
      } catch (error) {
        console.error(`Error uploading image ${file.originalname}:`, error);
      }
    }

    // Update image count in folder
    folder.imageCount = await HackGalleryImage.countDocuments({ folderId: folder._id });
    await folder.save();

    res.status(201).json({
      message: "Images uploaded successfully",
      images: uploadedImages,
      totalUploaded: uploadedImages.length,
    });
  } catch (error) {
    console.error("Error uploading images:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all images from a specific folder
router.get("/folders/:folderId/images", async (req, res) => {
  try {
    const { folderId } = req.params;
    
    const images = await HackGalleryImage.find({ folderId })
      .populate("uploadedBy", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({ images });
  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all images for a specific hackathon
router.get("/hackathon/:hackathonId/images", async (req, res) => {
  try {
    const { hackathonId } = req.params;
    
    const images = await HackGalleryImage.find({ hackathonId })
      .populate("uploadedBy", "name email")
      .populate("folderId", "hackathonName")
      .sort({ createdAt: -1 });

    res.status(200).json({ images });
  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get a specific image by ID
router.get("/images/:imageId/details", async (req, res) => {
  try {
    const { imageId } = req.params;
    
    const image = await HackGalleryImage.findById(imageId)
      .populate("uploadedBy", "name email")
      .populate("folderId", "hackathonName");

    if (!image) {
      return res.status(404).json({ message: "Image not found" });
    }

    res.status(200).json({ image });
  } catch (error) {
    console.error("Error fetching image:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Serve image file
router.get("/images/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const downloadStream = await getGalleryImage(fileId);
    
    downloadStream.on("error", (error) => {
      console.error("Error streaming image:", error);
      res.status(404).json({ message: "Image not found" });
    });

    downloadStream.pipe(res);
  } catch (error) {
    console.error("Error fetching image file:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update image details
router.put("/images/:imageId", authenticateToken, async (req, res) => {
  try {
    const { imageId } = req.params;
    const { title, description } = req.body;

    const image = await HackGalleryImage.findById(imageId);
    if (!image) {
      return res.status(404).json({ message: "Image not found" });
    }

    if (title !== undefined) image.title = title;
    if (description !== undefined) image.description = description;

    await image.save();
    res.status(200).json({ message: "Image updated successfully", image });
  } catch (error) {
    console.error("Error updating image:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Delete a specific image
router.delete("/images/:imageId", authenticateToken, async (req, res) => {
  try {
    const { imageId } = req.params;

    const image = await HackGalleryImage.findById(imageId);
    if (!image) {
      return res.status(404).json({ message: "Image not found" });
    }

    // Delete from GridFS
    try {
      await deleteGalleryImage(image.imageFileId);
    } catch (error) {
      console.error("Error deleting image from GridFS:", error);
    }

    // Delete image document
    await HackGalleryImage.findByIdAndDelete(imageId);

    // Update folder image count
    const folder = await HackGalleryFolder.findById(image.folderId);
    if (folder) {
      folder.imageCount = await HackGalleryImage.countDocuments({ folderId: folder._id });
      await folder.save();
    }

    res.status(200).json({ message: "Image deleted successfully" });
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
