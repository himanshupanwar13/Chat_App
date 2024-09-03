const express = require('express');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Connect DB
require('./db/conection');

// Import files
const Users = require('./models/users');
const Conversations = require('./models/Conversations');

const port = process.env.PORT || 8000;

// App Use
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Routes
app.get('/', (req, res) => {
    res.send('Welcome');
});

app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({ error: 'Please fill all required fields!' });
        }

        const isAlreadyExist = await Users.findOne({ email });
        if (isAlreadyExist) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const newUser = new Users({ fullName, email });
        bcryptjs.hash(password, 10, async (err, hashedPassword) => {
            if (err) {
                return res.status(500).json({ error: 'Error hashing password' });
            }
            newUser.set('password', hashedPassword);
            await newUser.save();
            return res.status(200).json({ message: 'User Registered Successfully' });
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Please fill all required fields!' });
        }

        const user = await Users.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'User email or password is incorrect' });
        }

        const validateUser = await bcryptjs.compare(password, user.password);
        if (!validateUser) {
            return res.status(400).json({ error: 'User email or password is incorrect' });
        }

        const payload = {
            userId: user._id,
            email: user.email
        };
        const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'THIS_IS_A_JWT_SECRET_KEY';

        jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: 84600 }, async (err, token) => {
            if (err) {
                return res.status(500).json({ error: 'Error generating token' });
            }

            await Users.updateOne({ _id: user._id }, { $set: { token } });

            return res.status(200).json({ user: { email: user.email, fullName: user.fullName }, token });
        });

    } catch (error) {
        console.error(`Error: ${error}`);
        return res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/conversation', async (req, res) => {
    try {
        const { senderId, receiverId } = req.body;
        const newConversation = new Conversations({ members: [senderId, receiverId] });
        await newConversation.save();
        return res.status(200).json({ message: 'Conversation created successfully' });
    } catch (error) {
        console.error(`Error: ${error}`);
        return res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/conversation/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const conversations = await Conversations.find({ members: { $in: [userId] } });

        // Map over conversations to get user details
        const conversationUserData = await Promise.all(conversations.map(async (conversation) => {
            const receiverId = conversation.members.find(member => member !== userId);
           const user =  await Users.findById(receiverId);
           return { user: { email: user.email, fullName: user.fullName }, conversationId: conversation._id}
        }));

        return res.status(200).json(conversationUserData);
    } catch (error) {
        console.error(`Error: ${error}`);
        return res.status(500).json({ error: 'Server error' });
    }
});


app.listen(port, () => {
    console.log("Listening on Port " + port);
});
