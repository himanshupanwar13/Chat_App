const mongoose = require("mongoose");

const conversationSchema = mongoose.Schema({
    members: {
        type: [String],
        required: true,
        validate: {
            validator: (members) => Array.isArray(members) && members.length === 2 && new Set(members.map(String)).size === 2,
            message: 'A direct conversation must have exactly two distinct members.',
        },
    },
    memberKey: {
        type: String,
    },
}, { timestamps: true });

conversationSchema.index({ members: 1 }, { name: 'conversation_members' });
conversationSchema.index({ memberKey: 1 }, { unique: true, sparse: true, name: 'unique_direct_conversation' });

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
