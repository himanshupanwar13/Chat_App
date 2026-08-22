const Conversations = require('../models/Conversations');

const toIdString = (value) => String(value);

const createMemberKey = (firstId, secondId) => [toIdString(firstId), toIdString(secondId)].sort().join(':');

const isConversationMember = (conversation, userId) =>
  conversation.members.some((member) => toIdString(member) === toIdString(userId));

const getOtherMemberId = (conversation, userId) =>
  conversation.members.find((member) => toIdString(member) !== toIdString(userId));

const findConversationByMembers = (firstId, secondId) => {
  const memberKey = createMemberKey(firstId, secondId);
  return Conversations.findOne({
    $or: [
      { memberKey },
      { members: { $all: [toIdString(firstId), toIdString(secondId)], $size: 2 } },
    ],
  });
};

const getOrCreateDirectConversation = async (firstId, secondId) => {
  const memberKey = createMemberKey(firstId, secondId);
  const members = memberKey.split(':');

  // Legacy conversations do not have memberKey yet. Reuse them so existing chats
  // remain continuous while the safe backfill is rolled out.
  const legacyOrCurrent = await findConversationByMembers(firstId, secondId);
  if (legacyOrCurrent) return legacyOrCurrent;

  try {
    return await Conversations.findOneAndUpdate(
      { memberKey },
      { $setOnInsert: { members, memberKey } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await Conversations.findOne({ memberKey });
      if (existing) return existing;
    }
    throw error;
  }
};

module.exports = {
  createMemberKey,
  findConversationByMembers,
  getOrCreateDirectConversation,
  getOtherMemberId,
  isConversationMember,
  toIdString,
};
