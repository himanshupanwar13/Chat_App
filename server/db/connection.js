const mongoose = require('mongoose');


const url = `mongodb+srv://dbAdmin:admin1234@cluster0.b8ckv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

mongoose.connect(url)
  .then(() => console.log('Connected to DB'))
  .catch((e) => console.log("Error", e));
