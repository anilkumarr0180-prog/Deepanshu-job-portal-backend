import mongoose, { Types } from "mongoose";
import Connection from "../models/connection.model";
import User from "../models/user.model";
import CandidateProfile from "../models/candidate-profile.model";
import RecruiterProfile from "../models/recruiter-profile.model";
import Company from "../models/company.model";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import { getPaginationOptions, buildPaginatedResult } from "../utils/pagination";
import { createNotification } from "./notification.service";
import { NOTIFICATION_TYPES } from "../constants/notification-type";

interface GetConnectionsOptions {
  page?: string | number;
  limit?: string | number;
  status?: "accepted" | "pending" | "sent" | "all";
  search?: string;
}

async function enrichUserDetails(users: any[]) {
  if (!users || users.length === 0) return [];
  const userIds = users.map((u) => u._id);

  const [candidates, recruiters] = await Promise.all([
    CandidateProfile.find({ userId: { $in: userIds }, isDeleted: false })
      .select("userId headline city country profilePicture skills")
      .lean(),
    RecruiterProfile.find({ userId: { $in: userIds }, isDeleted: false })
      .select("userId designation department companyId profilePicture")
      .populate("companyId", "name logo")
      .lean(),
  ]);

  const candidateMap = new Map(candidates.map((c) => [c.userId.toString(), c]));
  const recruiterMap = new Map(recruiters.map((r) => [r.userId.toString(), r]));

  return users.map((user) => {
    const userIdStr = user._id.toString();
    const cand = candidateMap.get(userIdStr);
    const rec = recruiterMap.get(userIdStr);

    const headline = user.role === "candidate"
      ? cand?.headline || "Professional Community Member"
      : rec?.designation
      ? rec.designation + (rec.companyId && typeof rec.companyId === "object" ? " at " + (rec.companyId as any).name : "")
      : "Talent Acquisition Specialist";

    const avatar = cand?.profilePicture || rec?.profilePicture || user.profilePicture;
    const location = cand?.city ? cand.city + (cand.country ? ", " + cand.country : "") : undefined;

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      profilePicture: avatar,
      headline,
      location,
      skills: cand?.skills || [],
      company: rec?.companyId,
    };
  });
}

export const sendConnectionRequest = async (requesterId: string, recipientId: string) => {
  if (!Types.ObjectId.isValid(requesterId) || !Types.ObjectId.isValid(recipientId)) {
    throw new AppError("Invalid user ID format.", HTTP_STATUS.BAD_REQUEST);
  }

  if (requesterId === recipientId) {
    throw new AppError("You cannot send a connection request to yourself.", HTTP_STATUS.BAD_REQUEST);
  }

  const recipient = await User.findOne({ _id: recipientId, isBlocked: false, isDeleted: false }).lean();
  if (!recipient) {
    throw new AppError("User not found or unavailable.", HTTP_STATUS.NOT_FOUND);
  }

  const requesterObjId = new Types.ObjectId(requesterId);
  const recipientObjId = new Types.ObjectId(recipientId);

  const existing = await Connection.findOne({
    $or: [
      { requesterId: requesterObjId, recipientId: recipientObjId },
      { requesterId: recipientObjId, recipientId: requesterObjId },
    ],
  });

  if (existing) {
    if (existing.status === "accepted") {
      throw new AppError("You are already connected with this user.", HTTP_STATUS.CONFLICT);
    }
    if (existing.status === "pending") {
      if (existing.requesterId.toString() === requesterId) {
        throw new AppError("Connection request has already been sent and is pending.", HTTP_STATUS.CONFLICT);
      } else {
        throw new AppError("This user has already sent you a connection request. Please accept their request.", HTTP_STATUS.CONFLICT);
      }
    }

    existing.requesterId = requesterObjId;
    existing.recipientId = recipientObjId;
    existing.status = "pending";
    existing.acceptedAt = undefined;
    await existing.save();

    try {
      const requester = await User.findById(requesterId).select("name").lean();
      const requesterName = requester?.name || "A professional";

      await createNotification({
        recipientId,
        senderId: requesterId,
        type: NOTIFICATION_TYPES.CONNECTION_REQUEST,
        title: "New Connection Request",
        body: requesterName + " sent you a connection request.",
        link: "/candidate/networking",
        metadata: { connectionId: existing._id.toString(), requesterId },
      });
    } catch (err) {
      console.error("Failed to send notification on connection request:", err);
    }

    return existing;
  }

  const connection = await Connection.create({
    requesterId: requesterObjId,
    recipientId: recipientObjId,
    status: "pending",
  });

  try {
    const requester = await User.findById(requesterId).select("name").lean();
    const requesterName = requester?.name || "A professional";

    await createNotification({
      recipientId,
      senderId: requesterId,
      type: NOTIFICATION_TYPES.CONNECTION_REQUEST,
      title: "New Connection Request",
      body: requesterName + " sent you a connection request.",
      link: "/candidate/networking",
      metadata: { connectionId: connection._id.toString(), requesterId },
    });
  } catch (err) {
    console.error("Failed to send notification on connection request:", err);
  }

  return connection;
};

export const acceptConnection = async (connectionId: string, userId: string) => {
  if (!Types.ObjectId.isValid(connectionId)) {
    throw new AppError("Invalid connection ID.", HTTP_STATUS.BAD_REQUEST);
  }

  const connection = await Connection.findById(connectionId);
  if (!connection) {
    throw new AppError("Connection request not found.", HTTP_STATUS.NOT_FOUND);
  }

  if (connection.recipientId.toString() !== userId) {
    throw new AppError("You are not authorized to accept this connection request.", HTTP_STATUS.FORBIDDEN);
  }

  if (connection.status === "accepted") {
    return connection;
  }

  if (connection.status !== "pending") {
    throw new AppError("Cannot accept a non-pending connection request.", HTTP_STATUS.BAD_REQUEST);
  }

  connection.status = "accepted";
  connection.acceptedAt = new Date();
  await connection.save();

  try {
    const acceptor = await User.findById(userId).select("name").lean();
    const acceptorName = acceptor?.name || "A professional";

    await createNotification({
      recipientId: connection.requesterId.toString(),
      senderId: userId,
      type: NOTIFICATION_TYPES.CONNECTION_ACCEPTED,
      title: "Connection Request Accepted",
      body: acceptorName + " accepted your connection request.",
      link: "/candidate/networking",
      metadata: { connectionId: connection._id.toString(), userId },
    });
  } catch (err) {
    console.error("Failed to send notification on connection accepted:", err);
  }

  return connection;
};

export const rejectConnection = async (connectionId: string, userId: string) => {
  if (!Types.ObjectId.isValid(connectionId)) {
    throw new AppError("Invalid connection ID.", HTTP_STATUS.BAD_REQUEST);
  }

  const connection = await Connection.findById(connectionId);
  if (!connection) {
    throw new AppError("Connection request not found.", HTTP_STATUS.NOT_FOUND);
  }

  if (connection.recipientId.toString() !== userId) {
    throw new AppError("You are not authorized to reject this connection request.", HTTP_STATUS.FORBIDDEN);
  }

  if (connection.status !== "pending") {
    throw new AppError("Cannot reject a non-pending connection request.", HTTP_STATUS.BAD_REQUEST);
  }

  connection.status = "rejected";
  await connection.save();

  return connection;
};

export const cancelConnectionRequest = async (connectionId: string, userId: string) => {
  if (!Types.ObjectId.isValid(connectionId)) {
    throw new AppError("Invalid connection ID.", HTTP_STATUS.BAD_REQUEST);
  }

  const connection = await Connection.findById(connectionId);
  if (!connection) {
    throw new AppError("Connection request not found.", HTTP_STATUS.NOT_FOUND);
  }

  if (connection.requesterId.toString() !== userId) {
    throw new AppError("You are not authorized to cancel this connection request.", HTTP_STATUS.FORBIDDEN);
  }

  if (connection.status !== "pending") {
    throw new AppError("Cannot cancel a request that is not pending.", HTTP_STATUS.BAD_REQUEST);
  }

  await Connection.deleteOne({ _id: connection._id });
  return { message: "Connection request cancelled successfully." };
};

export const removeConnection = async (connectionId: string, userId: string) => {
  if (!Types.ObjectId.isValid(connectionId)) {
    throw new AppError("Invalid connection ID.", HTTP_STATUS.BAD_REQUEST);
  }

  const connection = await Connection.findById(connectionId);
  if (!connection) {
    throw new AppError("Connection not found.", HTTP_STATUS.NOT_FOUND);
  }

  const isParty = connection.requesterId.toString() === userId || connection.recipientId.toString() === userId;
  if (!isParty) {
    throw new AppError("You are not authorized to remove this connection.", HTTP_STATUS.FORBIDDEN);
  }

  await Connection.deleteOne({ _id: connection._id });
  return { message: "Connection removed successfully." };
};

export const getUserConnections = async (userId: string, options: GetConnectionsOptions = {}) => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid user ID.", HTTP_STATUS.BAD_REQUEST);
  }

  const userObjId = new Types.ObjectId(userId);
  const status = options.status || "accepted";
  const { page, limit, skip } = getPaginationOptions(options);

  let query: Record<string, unknown> = {};

  if (status === "pending") {
    query = { recipientId: userObjId, status: "pending" };
  } else if (status === "sent") {
    query = { requesterId: userObjId, status: "pending" };
  } else if (status === "accepted") {
    query = {
      $or: [
        { requesterId: userObjId, status: "accepted" },
        { recipientId: userObjId, status: "accepted" },
      ],
    };
  } else {
    query = {
      $or: [
        { requesterId: userObjId },
        { recipientId: userObjId },
      ],
    };
  }

  const [connections, totalItems] = await Promise.all([
    Connection.find(query)
      .populate("requesterId", "name email profilePicture role")
      .populate("recipientId", "name email profilePicture role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Connection.countDocuments(query),
  ]);

  const peerUserDocs = connections
    .map((conn: any) => {
      const isRequester = conn.requesterId?._id?.toString() === userId;
      return isRequester ? conn.recipientId : conn.requesterId;
    })
    .filter(Boolean);

  const enrichedPeers = await enrichUserDetails(peerUserDocs);
  const enrichedMap = new Map(enrichedPeers.map((p) => [p._id.toString(), p]));

  const formattedItems = connections.map((conn: any) => {
    const isRequester = conn.requesterId?._id?.toString() === userId;
    const peerId = isRequester
      ? conn.recipientId?._id?.toString()
      : conn.requesterId?._id?.toString();
    const peerUser =
      (peerId ? enrichedMap.get(peerId) : null) ||
      (isRequester ? conn.recipientId : conn.requesterId);

    return {
      _id: conn._id,
      status: conn.status,
      isRequester,
      acceptedAt: conn.acceptedAt,
      createdAt: conn.createdAt,
      peerUser,
    };
  });

  return buildPaginatedResult(formattedItems, totalItems, page, limit);
};

export const getConnectionStatus = async (userId: string, targetUserId: string) => {
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(targetUserId)) {
    throw new AppError("Invalid user IDs.", HTTP_STATUS.BAD_REQUEST);
  }

  if (userId === targetUserId) {
    return { status: "self", connectionId: null };
  }

  const userObjId = new Types.ObjectId(userId);
  const targetObjId = new Types.ObjectId(targetUserId);

  const connection = await Connection.findOne({
    $or: [
      { requesterId: userObjId, recipientId: targetObjId },
      { requesterId: targetObjId, recipientId: userObjId },
    ],
  }).lean();

  if (!connection) {
    return { status: "none", connectionId: null };
  }

  if (connection.status === "accepted") {
    return { status: "connected", connectionId: connection._id.toString() };
  }

  if (connection.status === "pending") {
    if (connection.requesterId.toString() === userId) {
      return { status: "pending_sent", connectionId: connection._id.toString() };
    } else {
      return { status: "pending_received", connectionId: connection._id.toString() };
    }
  }

  return { status: "none", connectionId: connection._id.toString() };
};

export const getConnectionCount = async (userId: string): Promise<number> => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid user ID.", HTTP_STATUS.BAD_REQUEST);
  }
  const userObjId = new Types.ObjectId(userId);
  return await Connection.countDocuments({
    $or: [
      { requesterId: userObjId, status: "accepted" },
      { recipientId: userObjId, status: "accepted" },
    ],
  });
};

/*
|--------------------------------------------------------------------------
| Get Accepted Connection User IDs
|--------------------------------------------------------------------------
|
| Returns unique string IDs of all peers with whom the user has an
| accepted connection. Works bidirectionally and never returns the user's
| own ID.
|
|--------------------------------------------------------------------------
*/
export const getAcceptedConnectionUserIds = async (userId: string): Promise<string[]> => {
  if (!Types.ObjectId.isValid(userId)) {
    return [];
  }

  const userObjId = new Types.ObjectId(userId);
  const connections = await Connection.find({
    status: "accepted",
    $or: [
      { requesterId: userObjId },
      { recipientId: userObjId },
    ],
  })
    .select("requesterId recipientId")
    .lean();

  const peerIds = connections
    .map((conn) => {
      const isRequester = conn.requesterId.toString() === userId;
      const peer = isRequester ? conn.recipientId : conn.requesterId;
      return peer ? peer.toString() : null;
    })
    .filter((id): id is string => Boolean(id) && id !== userId);

  return Array.from(new Set(peerIds));
};

export const getPeopleSuggestions = async (userId: string, limitCount: number = 6) => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid user ID.", HTTP_STATUS.BAD_REQUEST);
  }

  const userObjId = new Types.ObjectId(userId);
  const existingConnections = await Connection.find({
    $or: [{ requesterId: userObjId }, { recipientId: userObjId }],
  }).select("requesterId recipientId").lean();

  const excludedIds = new Set<string>();
  excludedIds.add(userId);
  existingConnections.forEach((conn) => {
    excludedIds.add(conn.requesterId.toString());
    excludedIds.add(conn.recipientId.toString());
  });

  const suggestedUsers = await User.find({
    _id: { $nin: Array.from(excludedIds).map((id) => new Types.ObjectId(id)) },
    isBlocked: false,
    isDeleted: false,
    role: { $in: ["candidate", "recruiter"] },
  })
    .select("name email role profilePicture createdAt")
    .sort({ createdAt: -1 })
    .limit(limitCount)
    .lean();

  const enriched = await enrichUserDetails(suggestedUsers);
  return enriched.map((u) => ({ ...u, connectionStatus: "none" }));
};

export const searchUsers = async (userId: string, queryText: string, options: { page?: string | number; limit?: string | number } = {}) => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid user ID.", HTTP_STATUS.BAD_REQUEST);
  }

  const userObjId = new Types.ObjectId(userId);
  const { page, limit, skip } = getPaginationOptions(options);
  const searchRegex = new RegExp(queryText.trim(), "i");

  const [matchedUsers, totalItems] = await Promise.all([
    User.find({
      _id: { $ne: userObjId },
      isBlocked: false,
      isDeleted: false,
      $or: [{ name: searchRegex }, { email: searchRegex }],
    })
      .select("name email role profilePicture createdAt")
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments({
      _id: { $ne: userObjId },
      isBlocked: false,
      isDeleted: false,
      $or: [{ name: searchRegex }, { email: searchRegex }],
    }),
  ]);

  const enriched = await enrichUserDetails(matchedUsers);
  const userIds = matchedUsers.map((u) => u._id);

  const connections = await Connection.find({
    $or: [
      { requesterId: userObjId, recipientId: { $in: userIds } },
      { recipientId: userObjId, requesterId: { $in: userIds } },
    ],
  }).lean();

  const statusMap = new Map<string, { status: string; connectionId: string }>();
  connections.forEach((c) => {
    const isRequester = c.requesterId.toString() === userId;
    const peerId = isRequester ? c.recipientId.toString() : c.requesterId.toString();
    if (c.status === "accepted") {
      statusMap.set(peerId, { status: "connected", connectionId: c._id.toString() });
    } else if (c.status === "pending") {
      statusMap.set(peerId, {
        status: isRequester ? "pending_sent" : "pending_received",
        connectionId: c._id.toString(),
      });
    }
  });

  const formatted = enriched.map((u) => {
    const connInfo = statusMap.get(u._id.toString()) || { status: "none", connectionId: null };
    return {
      ...u,
      connectionStatus: connInfo.status,
      connectionId: connInfo.connectionId,
    };
  });

  return buildPaginatedResult(formatted, totalItems, page, limit);
};