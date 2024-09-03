const express = require('express');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Connect DB
require('./db/conection');

// Import files
const Users = require('./models/users');

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
            return res.status(400).send('Please fill all required fields!!');
        }

        const isAlreadyExist = await Users.findOne({ email });
        if (isAlreadyExist) {
            return res.status(400).send('User already exists');
        } else {
            const newUser = new Users({ fullName, email });
            bcryptjs.hash(password, 10, async (err, hashedPassword) => {
                if (err) {
                    return res.status(500).send('Error hashing password');
                }
                newUser.set('password', hashedPassword);
                await newUser.save();
                return res.status(200).send('User Registered Successfully');
            });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).send('Server error');
    }
});

app.post('/api/login', async (  req, res, next) => {
    try {
            const {email, password} = req.body;

            if (!email || !password) {
                return res.status(400).send('Please fill all required fields!!');
            } else {
                const user = await Users.findOne({email});
                if(!user) {
                    res.status(400).send('User email or password is incorrect');
                } else {
                    const validateUser = await bcryptjs.compare(password, user.password);
                    if (!validateUser) {
                        res.status(400).send('User email or password is incorrect');
                    }
                    else {
                        const payload = {
                            userId : user._id,
                            email : user.email
                        }
                        const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'THIS_IS_A_JWT_SECRET_KEY';
                        
                        jwt.sign(payload, JWT_SECRET_KEY, {expiresIn : 84600 }, async (err, token) => {
                            await Users.updateOne({ _id: user._id }, {
                                $set: { token }
                        
                            })
                            user.save();
                            next()
                        })

                        res.status(200).json({user: {email: user.email, fullName: user.fullName}, token: user.token})
                    }
                }
            }

    } catch (error) {
            console.log("Error:", error)
    }
})

app.listen(port, () => {
    console.log("Listening on Port " + port);
});
