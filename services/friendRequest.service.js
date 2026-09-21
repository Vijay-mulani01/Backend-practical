import httpStatus from 'http-status';
import ApiError from 'utils/ApiError';
import { FriendRequest, User } from 'models';
import { EnumFriendRequestStatus } from 'models/enum.model';

/**
 * Send a friend request to a user
 * @param {ObjectId} senderId
 * @param {ObjectId} receiverId
 * @returns {Promise<FriendRequest>}
 */
export async function sendFriendRequest(senderId, receiverId) {
  if (senderId.toString() === receiverId.toString()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You cannot send a friend request to yourself');
  }

  const receiver = await User.findById(receiverId);
  if (!receiver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Target user not found');
  }

  const existingRequest = await FriendRequest.findOne({
    $or: [
      { sender: senderId, receiver: receiverId },
      { sender: receiverId, receiver: senderId },
    ],
  });

  if (existingRequest) {
    if (existingRequest.status === EnumFriendRequestStatus.ACCEPTED) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'You are already friends with this user');
    }
    if (existingRequest.status === EnumFriendRequestStatus.PENDING) {
      if (existingRequest.sender.toString() === senderId.toString()) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Friend request already sent');
      } else {
        throw new ApiError(httpStatus.BAD_REQUEST, 'You already have a pending friend request from this user');
      }
    }
    if (existingRequest.status === EnumFriendRequestStatus.REJECTED) {
      existingRequest.sender = senderId;
      existingRequest.receiver = receiverId;
      existingRequest.status = EnumFriendRequestStatus.PENDING;
      await existingRequest.save();
      return existingRequest;
    }
  }

  const friendRequest = await FriendRequest.create({
    sender: senderId,
    receiver: receiverId,
    status: EnumFriendRequestStatus.PENDING,
  });

  return friendRequest;
}

/**
 * Respond to a friend request (Accept / Reject)
 * @param {ObjectId} requestId
 * @param {ObjectId} currentUserId
 * @param {string} statusInput
 * @returns {Promise<FriendRequest>}
 */
export async function respondToFriendRequest(requestId, currentUserId, statusInput) {
  let targetStatus = statusInput;
  if (statusInput === 'accept') targetStatus = EnumFriendRequestStatus.ACCEPTED;
  if (statusInput === 'reject') targetStatus = EnumFriendRequestStatus.REJECTED;

  if (![EnumFriendRequestStatus.ACCEPTED, EnumFriendRequestStatus.REJECTED].includes(targetStatus)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid response status. Allowed values: accepted, rejected');
  }

  const friendRequest = await FriendRequest.findById(requestId);
  if (!friendRequest) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Friend request not found');
  }

  if (friendRequest.receiver.toString() !== currentUserId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to respond to this friend request');
  }

  if (friendRequest.status !== EnumFriendRequestStatus.PENDING) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Friend request has already been ${friendRequest.status}`);
  }

  friendRequest.status = targetStatus;
  await friendRequest.save();
  return friendRequest;
}

/**
 * Fetch incoming friend requests for a user with pagination
 * @param {ObjectId} receiverId
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
export async function getFriendRequestsWithPagination(receiverId, filter = {}, options = {}) {
  const queryFilter = {
    receiver: receiverId,
    status: filter.status || EnumFriendRequestStatus.PENDING,
  };

  const page = parseInt(options.page, 10) || 1;
  const limit = parseInt(options.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const totalResults = await FriendRequest.countDocuments(queryFilter);
  const totalPages = Math.ceil(totalResults / limit);

  const results = await FriendRequest.find(queryFilter)
    .populate('sender', 'id name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    results,
    page,
    limit,
    totalPages,
    totalResults,
  };
}

/**
 * Fetch all friends for a user
 * @param {ObjectId} userId
 * @param {Object} options
 * @returns {Promise<Array>}
 */
export async function getFriends(userId, options = {}) {
  const filter = {
    $or: [{ sender: userId }, { receiver: userId }],
    status: EnumFriendRequestStatus.ACCEPTED,
  };

  const acceptedRequests = await FriendRequest.find(filter)
    .populate('sender', 'id name email')
    .populate('receiver', 'id name email');

  const friends = acceptedRequests
    .filter((req) => req.sender && req.receiver)
    .map((req) => {
      const senderId = req.sender.id ? req.sender.id.toString() : req.sender._id.toString();
      const currentIdStr = userId.toString();
      return senderId === currentIdStr ? req.receiver : req.sender;
    });

  if (options.page && options.limit) {
    const page = parseInt(options.page, 10) || 1;
    const limit = parseInt(options.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const paginatedFriends = friends.slice(startIndex, startIndex + limit);
    return {
      results: paginatedFriends,
      page,
      limit,
      totalPages: Math.ceil(friends.length / limit),
      totalResults: friends.length,
    };
  }

  return friends;
}
