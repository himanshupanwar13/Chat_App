const mongoose = require("mongoose");

const messageSchema = mongoose.Schema({
    conversationId: {
        type: String,
        required: true,
    },
    senderId: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read'],
        default: 'sent',
    },
    replyTo: {
        type: Object,
        default: null,
    },
    reactions: {
        type: Array,
        default: [],
    },
    isEdited: {
        type: Boolean,
        default: false,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

messageSchema.index({ conversationId: 1, createdAt: 1 }, { name: 'messages_by_conversation_time' });
messageSchema.index(
    { conversationId: 1, senderId: 1, status: 1, isDeleted: 1 },
    { name: 'messages_for_unread_counts' }
);

const Messages = mongoose.model('Message', messageSchema);

module.exports = Messages;
