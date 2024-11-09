const express = require("express");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const io = require("socket.io")(8080, {
  cors: {
    origin: [
      "http://localhost:3000", // Allow local development
      "https://chatterflow.vercel.app", // Allow production domain
    ],
    methods: ["GET", "POST"],
  },
});

// Load environment variables
require("dotenv").config();

// Connect DB
require("./db/connection");

// Import models
const Users = require("./models/users");
const Conversations = require("./models/Conversations");
const Messages = require("./models/Messages");

const port = process.env.PORT || 8000;

// App Setup
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Security with Helmet
const helmet = require("helmet");
app.use(helmet());

// CORS Configuration
app.use(
  cors({
    origin: [
      "http://localhost:3000", // Allow local development
      "https://chatterflow.vercel.app", // Allow production domain
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);


// Socket.io Setup
let users = [];
io.on("connection", (socket) => {
  console.log("User Connected", socket.id);

  socket.on("addUser", (userId) => {
    const isUserExist = users.find((user) => user.userId === userId);
    if (!isUserExist) {
      const user = { userId, socketId: socket.id };
      users.push(user);
      io.emit("getUsers", users);
    }
  });

  socket.on("sendMessage", async ({ senderId, receiverId, message, conversationId }) => {
    try {
      const receiver = users.find((user) => user.userId === receiverId);
      const sender = users.find((user) => user.userId === senderId);

      if (!receiver || !sender) {
        return socket.emit("messageError", "Receiver or sender not found.");
      }

      const user = await Users.findById(senderId);
      io.to(receiver.socketId).to(sender.socketId).emit("getMessage", {
        senderId,
        message,
        conversationId,
        receiverId,
        user: { id: user._id, fullName: user.fullName, email: user.email },
      });
    } catch (err) {
      console.error("Error in sendMessage: ", err);
      socket.emit("messageError", "An error occurred while sending the message.");
    }
  });

  socket.on("disconnect", () => {
    users = users.filter((user) => user.socketId !== socket.id);
    io.emit("getUsers", users);
  });
});

// Routes
app.get("/", (req, res) => {
  res.send("Welcome");
});

// Register Route
app.post("/api/register", async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ error: "Please fill all required fields!" });
    }

    const isAlreadyExist = await Users.findOne({ email });
    if (isAlreadyExist) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);
    const newUser = new Users({ fullName, email, password: hashedPassword });
    await newUser.save();
    return res.status(200).json({ message: "User Registered Successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
});

// Login Route
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Please fill all required fields!" });
    }

    const user = await Users.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "User email or password is incorrect" });
    }

    const validateUser = await bcryptjs.compare(password, user.password);
    if (!validateUser) {
      return res.status(400).json({ error: "User email or password is incorrect" });
    }

    const payload = {
      userId: user._id,
      email: user.email,
    };

    const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || "THIS_IS_A_JWT_SECRET_KEY";
    const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h"; // Configurable expiration

    jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: JWT_EXPIRES_IN }, async (err, token) => {
      if (err) {
        return res.status(500).json({ error: "Error generating token" });
      }

      await Users.updateOne({ _id: user._id }, { $set: { token } });
      user.save();
      return res.status(200).json({
        user: { id: user._id, email: user.email, fullName: user.fullName },
        token: token,
      });
    });
  } catch (error) {
    console.error(`Error: ${error}`);
    return res.status(500).json({ error: "Server error" });
  }
});

// Create Conversation Route
app.post("/api/conversation", async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;

    // Prevent duplicate conversations
    const existingConversation = await Conversations.findOne({
      members: { $all: [senderId, receiverId] },
    });

    if (existingConversation) {
      return res.status(200).json({ message: "Conversation already exists" });
    }

    const newConversation = new Conversations({ members: [senderId, receiverId] });
    await newConversation.save();
    res.status(200).json({ message: "Conversation created successfully" });
  } catch (error) {
    console.error(`Error: ${error}`);
    return res.status(500).json({ error: "Server error" });
  }
});

// Get User Conversations Route
app.get("/api/conversations/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const conversations = await Conversations.find({
      members: { $in: [userId] },
    });

    const conversationUserData = Promise.all(
      conversations.map(async (conversation) => {
        const receiverId = conversation.members.find((member) => member !== userId);
        const user = await Users.findById(receiverId);
        return {
          user: { receiverId: user._id, email: user.email, fullName: user.fullName },
          conversationId: conversation._id,
        };
      })
    );
    res.status(200).json(await conversationUserData);
  } catch (error) {
    console.error(`Error: ${error}`);
    return res.status(500).json({ error: "Server error" });
  }
});

// Send Message Route
app.post("/api/message", async (req, res) => {
  try {
    const { conversationId, senderId, message, receiverId = "" } = req.body;
    if (!senderId || !message) return res.status(400).send("Please fill all required fields");

    if (conversationId === "new" && receiverId) {
      const newConversation = new Conversations({ members: [senderId, receiverId] });
      await newConversation.save();

      const newMessage = new Messages({ conversationId: newConversation._id, senderId, message });
      await newMessage.save();
      return res.status(200).send("Message sent successfully");
    } else if (!conversationId && !receiverId) {
      return res.status(400).send("Please fill all required fields");
    }

    const newMessage = new Messages({ conversationId, senderId, message });
    await newMessage.save();
    res.status(200).send("Message sent successfully");
  } catch (error) {
    console.error(`Error: ${error}`);
    return res.status(500).json({ error: "Server error" });
  }
});

// Get Messages for Conversation Route
app.get("/api/message/:conversationId", async (req, res) => {
  try {
    const checkMessages = async (conversationId) => {
      const messages = await Messages.find({ conversationId });
      const messageUserData = await Promise.all(
        messages.map(async (message) => {
          const user = await Users.findById(message.senderId);
          return {
            user: { id: user._id, email: user.email, fullName: user.fullName },
            message: message.message,
          };
        })
      );
      return res.status(200).json(messageUserData);
    };

    const conversationId = req.params.conversationId;
    if (conversationId === "new") {
      const checkConversation = await Conversations.find({
        members: { $all: [req.query.senderId, req.query.receiverId] },
      });
      if (checkConversation.length > 0) {
        checkMessages(checkConversation[0]._id);
      } else {
        return res.status(200).json([]);
      }
    } else {
      checkMessages(conversationId);
    }
  } catch (error) {
    console.error(`Error: ${error}`);
    return res.status(500).json({ error: "Server error" });
  }
});

// Get All Users Route
app.get("/api/users/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const users = await Users.find({ _id: { $ne: userId } });
    return res.status(200).json({ users });
  } catch (error) {
    console.error(`Error: ${error}`);
    return res.status(500).json({ error: "Server error" });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
