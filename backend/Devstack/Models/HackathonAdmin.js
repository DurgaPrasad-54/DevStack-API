const mongoose = require("mongoose");

const hackathonSchema = new mongoose.Schema(
  {
    hackathonname: {
      type: String,
      required: true,
      trim: true,
    },
    college:{
      type: String,
      enum: ['KIET', 'KIET+', 'KIEW', 'All'],
      required: true,
    },
    year: {
      type: String,
      enum: ["first year", "second year", "third year", "fourth year"],
      required: true,
    },
    technology: {
      type: String,
      required: true,
    },
    entryfee: {
      type: Number,
      required: true,
    },
    firstprize: {
      type: String,
      required: true,
    },
      secondprize: {
      type: String,
      required: true,
    },
    thirdprize: {
      type: String,
      required: true, 
    },
    description: {
      type: String,
      minlength: 10,
      maxlength: 200,
      required: true,
    },
    startdate: {
      type: Date,
      required: true,
    },
    enddate: {
      type: Date,
      required: true,
    },
    regstart: {
      type: Date,
      required: true,
    },
    regend: {
      type: Date,
      required: true,
    },
    minteam: {
      type: Number,
      required: true,
    },
    maxteam: {
      type: Number,
      required: true,
    },
    location: {
      type: String,
      default: "Online",
    },
    virtualeventlink: {
      type: String,
      trim: true,
      validate: {
        validator: function (url) {
          if (!url) return true;
          return /^https?:\/\/.+$/.test(url);
        },
        message: "Invalid event link format",
      },
    },
    rules: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["upcoming", "ongoing", "completed"],
      default: "upcoming",
    },
    hackathonposter: {
      data: { type: Buffer, required: true },
      contentType: { type: String, required: true },
    },
    qrcode:{
      data:{type:Buffer},
      contentType: { type: String },
    }
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Prevent OverwriteModelError by checking if model already exists
const Hackathon =
  mongoose.models.Hackathon || mongoose.model("Hackathon", hackathonSchema);

module.exports = Hackathon;
