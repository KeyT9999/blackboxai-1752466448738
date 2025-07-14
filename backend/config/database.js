const mongoose = require('mongoose');
const { mongodbUri } = require('./config');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(mongodbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Database connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
