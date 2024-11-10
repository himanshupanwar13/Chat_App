const express = require("express");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const app = express();
const server = require('http').createServer(app);

const io = require("socket.io")(server, {
  cors: {
    origin: process.env.CLIENT_URL ||"http://localhost:3000",
  },
});

// Connect DB
require("./db/connection");

// Import files
const Users = require("./models/users");
const Conversations = require("./models/Conversations");
const Messages = require("./models/Messages");
const { socket } = require("socket.io");

const port = process.env.PORT || 8000;

// App Use
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Allow requests from localhost:3000
app.use(
  cors({
    origin: ["http://localhost:3000", "https://chatterflow.vercel.app"],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);



//Socket.io
let users = [];
io.on("connection", (socket) => {
  console.log("User Connected", socket.id);
  socket.on("addUser", userId => {
    const isUserExist = users.find((user) => user.userId === userId);
    if (!isUserExist) {
      const user = { userId, socketId: socket.id };
      users.push(user);
      io.emit("getUsers", users);
    }
  });

  socket.on('sendMessage', async ({ senderId, receiverId, message, conversationId}) => {
    const receiver = users.find(user => user.userId === receiverId);
    const sender = users.find(user => user.userId === senderId);
    const user = await Users.findById(senderId);
    if (receiver){
        io.to(receiver.socketId).to(sender.socketId).emit('getMessage', {
            senderId,
            message,
            conversationId,
            receiverId,
            user: { id: user._id, fullName: user.fullName, email: user.email }
          });          
    }
  });

  socket.on('disconnect', () => {
    users = users.filter(user =>user.socketId !== socket.id);
    io.emit('getUsers', users);
  })
  // io.emit('getUsers', socket.userId);
});

// Routes
app.get("/", (req, res) => {
  res.send("Welcome");
});

app.post("/api/register", async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res
        .status(400)
        .json({ error: "Please fill all required fields!" });
    } else {
      const isAlreadyExist = await Users.findOne({ email });
      if (isAlreadyExist) {
        return res.status(400).json({ error: "User already exists" });
      }

      const newUser = new Users({ fullName, email });
      bcryptjs.hash(password, 10, async (err, hashedPassword) => {
        if (err) {
          return res.status(500).json({ error: "Error hashing password" });
        }
        newUser.set("password", hashedPassword);
        await newUser.save();
        return res
          .status(200)
          .json({ message: "User Registered Successfully" });
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Please fill all required fields!" });
    }

    const user = await Users.findOne({ email });
    if (!user) {
      return res
        .status(400)
        .json({ error: "User email or password is incorrect" });
    }

    const validateUser = await bcryptjs.compare(password, user.password);
    if (!validateUser) {
      return res
        .status(400)
        .json({ error: "User email or password is incorrect" });
    }

    const payload = {
      userId: user._id,
      email: user.email,
    };
    const JWT_SECRET_KEY =
      process.env.JWT_SECRET_KEY || "THIS_IS_A_JWT_SECRET_KEY";

    jwt.sign(
      payload,
      JWT_SECRET_KEY,
      { expiresIn: 84600 },
      async (err, token) => {
        if (err) {
          return res.status(500).json({ error: "Error generating token" });
        }

        await Users.updateOne({ _id: user._id }, { $set: { token } });
        user.save();
        return res.status(200).json({
          user: { id: user._id, email: user.email, fullName: user.fullName },
          token: token,
        });
      }
    );
  } catch (error) {
    console.error(`Error: ${error}`);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/conversation", async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;
    const newConversation = new Conversations({
      members: [senderId, receiverId],
    });
    await newConversation.save();
    res.status(200).json({ message: "Conversation created successfully" });
  } catch (error) {
    console.error(`Error: ${error}`);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/conversations/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const conversations = await Conversations.find({
      members: { $in: [userId] },
    }); // Fetch messages by conversationId
    const conversationUserData = Promise.all(
      conversations.map(async (conversation) => {
        const receiverId = conversation.members.find(
          (member) => member !== userId
        );
        const user = await Users.findById(receiverId);
        return {
          user: {
            receiverId: user._id,
            email: user.email,
            fullName: user.fullName,
          },
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

app.post("/api/message", async (req, res) => {
  try {
    const { conversationId, senderId, message, receiverId = "" } = req.body;
    if (!senderId || !message)
      return res.status(400).send("Please fill all required fields");
    if (conversationId === "new" && receiverId) {
      const newConversation = new Conversations({
        members: [senderId, receiverId],
      });
      await newConversation.save();
      const newMessage = new Messages({
        conversationId: newConversation._id,
        senderId,
        message,
      });
      await newMessage.save();
      return res.status(200).send("Message sent successfully");
    } else if (!conversationId && !receiverId) {
      return res.status(400).send("Please fill all required fiels");
    }
    const newMessage = new Messages({ conversationId, senderId, message });
    await newMessage.save();
    res.status(200).send("Message sent successfully");
  } catch (error) {
    console.error(`Error: ${error}`);
  }
});

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

app.get("/api/users/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const users = await Users.find({ _id: { $ne: userId } }); // Fetch all users except the current user
    const usersData = Promise.all(
      users.map(async (user) => {
        return {
          user: {
            email: user.email,
            fullName: user.fullName,
            receiverId: user._id,
          },
        };
      })
    );
    res.status(200).json(await usersData);
  } catch (error) {
    console.error(`Error: ${error}`);
    return res.status(500).json({ error: "Server error" });
  }
});

server.listen(port, () => {
  console.log("Listening on Port " + port);
});
