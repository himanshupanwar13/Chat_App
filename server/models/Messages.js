const mongoose = require("mongoose");
const Conversation = require("./Conversations");

const messageSchema = mongoose.Schema({
    ConversationId: {
        type: String
    },
    senderId: {
        type: String
    },
    message: {
        type: String
    }
});

const Messages = mongoose.model('Message', messageSchema);

module.exports = Messages;