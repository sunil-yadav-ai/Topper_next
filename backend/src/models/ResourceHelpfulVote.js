import mongoose from "mongoose";

const resourceHelpfulVoteSchema = new mongoose.Schema(
  {
    resourceType: {
      type: String,
      enum: ["note", "pyq"],
      required: true,
    },
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

resourceHelpfulVoteSchema.index(
  { resourceType: 1, resource: 1, user: 1 },
  { unique: true },
);

const ResourceHelpfulVote =
  mongoose.models.ResourceHelpfulVote ||
  mongoose.model("ResourceHelpfulVote", resourceHelpfulVoteSchema);

export default ResourceHelpfulVote;
