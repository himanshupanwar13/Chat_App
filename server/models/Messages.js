const mongoose = require("mongoose");

const attachmentSchema = mongoose.Schema({
    type: {
        type: String,
        enum: ['image', 'file'],
        required: true,
    },
    url: {
        type: String,
        required: true,
    },
    publicId: {
        type: String,
        default: null,
    },
    fileName: {
        type: String,
        required: true,
    },
    mimeType: {
        type: String,
        required: true,
    },
    size: {
        type: Number,
        required: true,
    },
    width: {
        type: Number,
        default: null,
    },
    height: {
        type: Number,
        default: null,
    },
}, { _id: false });

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
        default: '',
    },
    attachments: {
        type: [attachmentSchema],
        default: [],
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
    { conversationId: 1, createdAt: -1, _id: -1 },
    { name: 'messages_pagination_cursor' }
);
messageSchema.index(
    { conversationId: 1, senderId: 1, status: 1, isDeleted: 1 },
    { name: 'messages_for_unread_counts' }
);

const Messages = mongoose.model('Message', messageSchema);

module.exports = Messages;
