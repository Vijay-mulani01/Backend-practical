import mongoose from 'mongoose';
import mongoosePaginateV2 from 'mongoose-paginate-v2';
import { toJSON } from 'models/plugins';
import enumModel from 'models/enum.model';

const friendRequestSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(enumModel.EnumFriendRequestStatus),
      default: enumModel.EnumFriendRequestStatus.PENDING,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

friendRequestSchema.plugin(toJSON);
friendRequestSchema.plugin(mongoosePaginateV2);

const FriendRequestModel =
  mongoose.models.FriendRequest || mongoose.model('FriendRequest', friendRequestSchema, 'FriendRequest');

module.exports = FriendRequestModel;
