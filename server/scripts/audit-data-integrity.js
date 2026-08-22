require('dotenv').config();

const mongoose = require('mongoose');
const Users = require('../models/users');
const Conversations = require('../models/Conversations');
const { createMemberKey } = require('../utils/chat');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const shouldBackfill = process.argv.includes('--backfill-safe');

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required to run this audit safely.');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const users = await Users.find({}).select('_id email emailNormalized').lean();
  const emailGroups = new Map();
  for (const user of users) {
    const normalized = normalizeEmail(user.email || user.emailNormalized);
    if (!normalized) continue;
    const group = emailGroups.get(normalized) || [];
    group.push(user);
    emailGroups.set(normalized, group);
  }

  const duplicateEmails = [...emailGroups.entries()]
    .filter(([, usersWithEmail]) => usersWithEmail.length > 1)
    .map(([email, usersWithEmail]) => ({ email, userIds: usersWithEmail.map((user) => String(user._id)) }));

  const conversations = await Conversations.find({}).select('_id members memberKey').lean();
  const conversationGroups = new Map();
  const malformedConversations = [];
  for (const conversation of conversations) {
    if (!Array.isArray(conversation.members) || conversation.members.length !== 2 || new Set(conversation.members.map(String)).size !== 2) {
      malformedConversations.push(String(conversation._id));
      continue;
    }
    const key = createMemberKey(conversation.members[0], conversation.members[1]);
    const group = conversationGroups.get(key) || [];
    group.push(conversation);
    conversationGroups.set(key, group);
  }
  const duplicateConversations = [...conversationGroups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([memberKey, group]) => ({ memberKey, conversationIds: group.map((conversation) => String(conversation._id)) }));

  const report = {
    mode: shouldBackfill ? 'backfill-safe' : 'audit-only',
    userCount: users.length,
    duplicateNormalizedEmails: duplicateEmails,
    conversationCount: conversations.length,
    duplicateDirectConversations: duplicateConversations,
    malformedConversationIds: malformedConversations,
  };

  if (shouldBackfill) {
    const safeUsers = [...emailGroups.entries()].filter(([, group]) => group.length === 1);
    const safeConversationGroups = [...conversationGroups.entries()].filter(([, group]) => group.length === 1);
    let usersBackfilled = 0;
    let conversationsBackfilled = 0;

    for (const [normalized, [user]] of safeUsers) {
      if (user.email !== normalized || user.emailNormalized !== normalized) {
        await Users.updateOne({ _id: user._id }, { $set: { email: normalized, emailNormalized: normalized } });
        usersBackfilled += 1;
      }
    }
    for (const [memberKey, [conversation]] of safeConversationGroups) {
      if (conversation.memberKey !== memberKey) {
        await Conversations.updateOne({ _id: conversation._id }, { $set: { memberKey } });
        conversationsBackfilled += 1;
      }
    }
    report.backfill = { usersBackfilled, conversationsBackfilled, skippedDuplicateEmailGroups: duplicateEmails.length, skippedDuplicateConversationGroups: duplicateConversations.length };
  }

  console.log(JSON.stringify(report, null, 2));
  if (duplicateEmails.length || duplicateConversations.length || malformedConversations.length) process.exitCode = 2;
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect(); });
